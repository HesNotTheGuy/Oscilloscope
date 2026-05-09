import { describe, it, expect, beforeEach } from 'vitest';
import { Oscilloscope } from '../src/oscilloscope.js';

// ─────────────────────────────────────────────────────────────
//  Filter tests — regression coverage for the XY-mode bug where
//  the biquad filter reset its state to zero on every call,
//  causing transient ringing at the start of each buffer that
//  manifested as wild geometric artifacts in Lissajous mode.
// ─────────────────────────────────────────────────────────────

// Build a partial Oscilloscope instance without invoking the
// constructor (which needs a canvas + engine). We only need
// the filter methods, which are pure functions of state.
function makeScope({ filterLow = 200, filterHigh = 3000, sampleRate = 48000 } = {}) {
  const scope = Object.create(Oscilloscope.prototype);
  scope.engine = { sampleRate };
  scope.filterLow = filterLow;
  scope.filterHigh = filterHigh;
  return scope;
}

function makeSine(samples, freqHz, sampleRate, amp = 0.5) {
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    data[i] = amp * Math.sin(2 * Math.PI * freqHz * i / sampleRate);
  }
  return data;
}

function makeSilence(samples) {
  return new Float32Array(samples);
}

function maxAbs(arr) {
  let m = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = Math.abs(arr[i]);
    if (v > m) m = v;
  }
  return m;
}

describe('frequency filter (biquad bandpass) — XY artifact regression', () => {
  it('persists state across consecutive calls (does not reset to zero each frame)', () => {
    // The original bug: state was reset every call, producing transient ringing
    // at the start of each buffer. With persistence, the first samples of a
    // SECOND call should differ from a FIRST (cold-start) call on the same data.
    const scope1 = makeScope();
    const scope2 = makeScope();
    const data = makeSine(1024, 1000, 48000);

    const coldOut = scope1.applyFilter(data, 'L');
    // scope2: warm it up first by running the filter once
    scope2.applyFilter(data, 'L');
    const warmOut = scope2.applyFilter(data, 'L');

    // First sample of cold output is just b0*x[0] (state is all zeros)
    // First sample of warm output uses persisted state from the previous call
    // — they MUST differ for the bug fix to be working.
    expect(coldOut[0]).not.toBe(warmOut[0]);
  });

  it('produces no large transient spikes after warmup on a steady sine input', () => {
    // The original bug created huge spikes in the first ~100 samples of each
    // buffer because the filter's stored x1/x2/y1/y2 history was zero while
    // the input was suddenly non-zero. After warmup, output should track the
    // input smoothly without overshoot beyond reasonable filter gain.
    const scope = makeScope({ filterLow: 200, filterHigh: 3000 });
    const sr = 48000;
    const sine = makeSine(2048, 1000, sr, 0.5);  // 1 kHz inside passband

    // Run a few buffers to let the filter settle
    for (let i = 0; i < 5; i++) scope.applyFilter(sine, 'L');

    const out = scope.applyFilter(sine, 'L');
    // After warmup, peak should be near the input amplitude (within filter
    // gain tolerance — bandpass at center has roughly unity gain).
    // Before the fix, peaks could spike to 2-5× the input amplitude in the
    // first samples of each buffer.
    expect(maxAbs(out)).toBeLessThan(1.5);
  });

  it('resets state when filter parameters change', () => {
    // When the user moves the freq filter sliders, state should reset to
    // avoid mixing old-coefficient history with new coefficients.
    const scope = makeScope({ filterLow: 200, filterHigh: 3000 });
    const data = makeSine(1024, 1000, 48000);

    scope.applyFilter(data, 'L');
    const stateBefore = scope._filterStates.L;
    const paramKeyBefore = stateBefore.paramKey;

    // Change filter range
    scope.filterLow = 500;
    scope.filterHigh = 2000;
    scope.applyFilter(data, 'L');
    const stateAfter = scope._filterStates.L;

    expect(stateAfter.paramKey).not.toBe(paramKeyBefore);
    // State arrays should be NEW objects (reset), not the same instance
    expect(stateAfter.hp).not.toBe(stateBefore.hp);
  });

  it('keeps independent state for L and R channels (XY mode)', () => {
    // Critical for XY mode: the bug's worst symptom was geometric artifacts
    // because L and R buffers were filtered with the same shared state mock,
    // OR with both starting from zero each frame. Each channel must have
    // its own state so they evolve independently.
    const scope = makeScope();
    const sr = 48000;
    // Two different signals — L is 500 Hz, R is 1500 Hz
    const dataL = makeSine(1024, 500, sr);
    const dataR = makeSine(1024, 1500, sr);

    scope.applyFilter(dataL, 'L');
    scope.applyFilter(dataR, 'R');

    // The states should be different objects with different histories
    expect(scope._filterStates.L).toBeDefined();
    expect(scope._filterStates.R).toBeDefined();
    expect(scope._filterStates.L).not.toBe(scope._filterStates.R);
    // And their stored history values should differ since the inputs differed
    expect(Array.from(scope._filterStates.L.hp)).not.toEqual(
      Array.from(scope._filterStates.R.hp)
    );
  });

  it('does not produce out-of-range spikes for music-like input (XY artifact reproduction)', () => {
    // Reproduces the visual bug scenario: filter applied to L and R buffers
    // simulating stereo audio. In XY mode each (L[i], R[i]) becomes a pixel
    // coordinate. Wild spikes plot as out-of-bounds geometric shapes.
    const scope = makeScope({ filterLow: 2000, filterHigh: 6000 });  // Treble preset
    const sr = 48000;

    // Music-like: sum of multiple frequencies across the spectrum
    const make = () => {
      const data = new Float32Array(2048);
      for (let i = 0; i < 2048; i++) {
        data[i] = 0.3 * Math.sin(2*Math.PI*200*i/sr)
                + 0.2 * Math.sin(2*Math.PI*1000*i/sr)
                + 0.2 * Math.sin(2*Math.PI*4000*i/sr)
                + 0.1 * Math.sin(2*Math.PI*8000*i/sr);
      }
      return data;
    };

    // Simulate ~10 frames of rendering
    let maxL = 0, maxR = 0;
    for (let frame = 0; frame < 10; frame++) {
      const outL = scope.applyFilter(make(), 'L');
      const outR = scope.applyFilter(make(), 'R');
      // After warmup (skip first 2 frames), check no wild spikes
      if (frame >= 2) {
        maxL = Math.max(maxL, maxAbs(outL));
        maxR = Math.max(maxR, maxAbs(outR));
      }
    }

    // Input peak amplitude is 0.8 (sum of all sines).
    // With a properly-stateful biquad bandpass, output should not exceed
    // ~1.5× the input. Before the fix, the first samples of each buffer
    // routinely exceeded 3× due to state-reset transients.
    expect(maxL).toBeLessThan(1.5);
    expect(maxR).toBeLessThan(1.5);
  });

  it('decays cleanly to zero on silent input after a previous loud signal', () => {
    // After loud signal then silence, the filter's stored state should decay
    // toward zero. The bug-free implementation should reach near-zero within
    // a few buffers (filter has finite memory ~ a few samples).
    const scope = makeScope();
    const loud = makeSine(1024, 1000, 48000, 0.8);
    const silence = makeSilence(1024);

    // Warm up with loud signal
    for (let i = 0; i < 3; i++) scope.applyFilter(loud, 'L');

    // Now feed silence — output should decay
    let lastPeak = Infinity;
    for (let i = 0; i < 5; i++) {
      const out = scope.applyFilter(silence, 'L');
      const peak = maxAbs(out);
      // Each silent buffer's peak should be smaller than the previous
      // (or already very small)
      if (i > 0) expect(peak).toBeLessThanOrEqual(lastPeak + 1e-6);
      lastPeak = peak;
    }
    // Final peak should be essentially zero
    expect(lastPeak).toBeLessThan(0.01);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  splitFrequencyBands,
  OnsetDetector,
  mapTimeToSpiral,
  sampleSpiralPath,
  layoutBranch,
  getPlaybackTimeline,
  DEFAULT_BAND_COUNT,
  DEFAULT_SPIRAL_TURNS,
  DEFAULT_LOOP_SECONDS,
} from '../src/neon-viz.js';

function fakeSpectrum(nBins, sampleRate, peaks) {
  const data = new Float32Array(nBins);
  data.fill(-100);
  const nyquist = sampleRate / 2;
  for (const p of peaks) {
    const bin = Math.max(0, Math.min(nBins - 1, Math.floor((p.hz / nyquist) * nBins)));
    data[bin] = p.db;
    if (bin + 1 < nBins) data[bin + 1] = p.db - 4;
    if (bin - 1 >= 0) data[bin - 1] = Math.max(data[bin - 1], p.db - 8);
  }
  return data;
}

describe('splitFrequencyBands', () => {
  const sr = 44100;
  const nBins = 2048;

  it('returns the requested band count with bass as index 0', () => {
    const data = fakeSpectrum(nBins, sr, [{ hz: 24, db: -12 }]);
    const out = splitFrequencyBands(data, sr, { bandCount: 16 });
    expect(out.energies).toHaveLength(16);
    expect(out.loHz[0]).toBeLessThan(out.loHz[15]);
    expect(out.hiHz[0]).toBeGreaterThan(24);
    expect(out.energies[0]).toBeGreaterThan(out.energies[15]);
    expect(out.energies[0]).toBeGreaterThan(0.5);
  });

  it('puts high-frequency energy in the top bands', () => {
    const data = fakeSpectrum(nBins, sr, [{ hz: 16000, db: -8 }]);
    const out = splitFrequencyBands(data, sr, { bandCount: 16 });
    expect(out.loHz[15]).toBeLessThan(16000);
    expect(out.energies[15]).toBeGreaterThan(out.energies[0]);
    expect(out.energies[15]).toBeGreaterThan(0.5);
  });

  it('uses log-spaced edges so the bass band is narrower in Hz than the top band', () => {
    const data = new Float32Array(nBins);
    data.fill(-90);
    const out = splitFrequencyBands(data, sr, { bandCount: 20 });
    const bassW = out.hiHz[0] - out.loHz[0];
    const highW = out.hiHz[19] - out.loHz[19];
    expect(bassW).toBeGreaterThan(0);
    expect(highW).toBeGreaterThan(bassW * 4);
  });

  it('clamps empty or invalid input to zeros', () => {
    expect(splitFrequencyBands(null, sr).energies[0]).toBe(0);
    expect(splitFrequencyBands(new Float32Array(0), sr).energies).toHaveLength(DEFAULT_BAND_COUNT);
    expect(splitFrequencyBands(new Float32Array(8), 0).energies[3]).toBe(0);
  });

  it('normalises dB into 0..1', () => {
    const silent = new Float32Array(nBins);
    silent.fill(-90);
    const loud = new Float32Array(nBins);
    loud.fill(-10);
    const a = splitFrequencyBands(silent, sr, { bandCount: 8 });
    const b = splitFrequencyBands(loud, sr, { bandCount: 8 });
    for (let i = 0; i < 8; i++) {
      expect(a.energies[i]).toBeGreaterThanOrEqual(0);
      expect(a.energies[i]).toBeLessThanOrEqual(0.05);
      expect(b.energies[i]).toBeGreaterThan(0.95);
      expect(b.energies[i]).toBeLessThanOrEqual(1);
    }
  });
});

describe('OnsetDetector', () => {
  let det;

  beforeEach(() => {
    det = new OnsetDetector({ bandCount: 8, cooldownFrames: 6 });
  });

  function vec(fill, spikeIndex, spikeVal) {
    const e = new Float32Array(8);
    e.fill(fill);
    if (spikeIndex != null) e[spikeIndex] = spikeVal;
    return e;
  }

  it('does not fire on the first fill or on silence', () => {
    expect(det.detect(vec(0)).any).toBe(false);
    expect(det.detect(vec(0)).any).toBe(false);
    expect(det.detect(vec(0.02)).any).toBe(false);
  });

  it('fires on a sudden rise in one band', () => {
    det.detect(vec(0.05));
    for (let i = 0; i < 12; i++) det.detect(vec(0.05));
    const r = det.detect(vec(0.05, 2, 0.85));
    expect(r.any).toBe(true);
    expect(r.hits[2]).toBe(1);
    expect(r.hits[0]).toBe(0);
    expect(r.flux[2]).toBeGreaterThan(0.5);
  });

  it('holds cooldown so the same band does not retrigger immediately', () => {
    det.detect(vec(0.05));
    for (let i = 0; i < 8; i++) det.detect(vec(0.05));
    expect(det.detect(vec(0.05, 1, 0.9)).hits[1]).toBe(1);
    for (let i = 0; i < 5; i++) {
      const r = det.detect(vec(0.05, 1, 0.95));
      expect(r.hits[1]).toBe(0);
    }
  });

  it('can hit two bands in the same frame independently', () => {
    det.detect(vec(0.04));
    for (let i = 0; i < 8; i++) det.detect(vec(0.04));
    const e = vec(0.04);
    e[0] = 0.8;
    e[7] = 0.8;
    const r = det.detect(e);
    expect(r.hits[0]).toBe(1);
    expect(r.hits[7]).toBe(1);
  });

  it('reset() clears history and cooldown', () => {
    det.detect(vec(0.1));
    det.detect(vec(0.9));
    det.reset();
    expect(det.detect(vec(0.9)).any).toBe(false);
  });
});

describe('mapTimeToSpiral', () => {
  const W = 800, H = 600;

  it('puts t=0 on the inner ring at the start angle', () => {
    const p = mapTimeToSpiral(0, 10, W, H, { innerRatio: 0.1, outerRatio: 0.4, startAngle: -Math.PI / 2 });
    expect(p.tNorm).toBe(0);
    expect(p.radius).toBeCloseTo(Math.min(W, H) * 0.1, 6);
    expect(p.x).toBeCloseTo(W / 2, 6);
    expect(p.y).toBeLessThan(H / 2);
  });

  it('puts t=duration on the outer ring', () => {
    const p = mapTimeToSpiral(10, 10, W, H, { innerRatio: 0.1, outerRatio: 0.4 });
    expect(p.tNorm).toBe(1);
    expect(p.radius).toBeCloseTo(Math.min(W, H) * 0.4, 6);
  });

  it('grows radius monotonically along the song', () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const p = mapTimeToSpiral(i / 2, 10, W, H);
      expect(p.radius).toBeGreaterThan(prev);
      prev = p.radius;
    }
  });

  it('clamps times outside 0..duration', () => {
    const a = mapTimeToSpiral(-4, 8, W, H);
    const b = mapTimeToSpiral(99, 8, W, H);
    expect(a.tNorm).toBe(0);
    expect(b.tNorm).toBe(1);
  });

  it('keeps sampled points inside the canvas for default ratios', () => {
    const pts = sampleSpiralPath(30, W, H, 80);
    expect(pts.length).toBe(81);
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(W);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(H);
    }
  });

  it('advances angle by turns * 2π over the full duration', () => {
    const start = mapTimeToSpiral(0, 1, W, H);
    const end = mapTimeToSpiral(1, 1, W, H);
    expect(end.theta - start.theta).toBeCloseTo(DEFAULT_SPIRAL_TURNS * Math.PI * 2, 8);
  });
});

describe('layoutBranch', () => {
  const W = 1000, H = 800;

  it('places bass at the bottom and highs at the top', () => {
    const bass = layoutBranch(0, 10, 0.5, W, H);
    const high = layoutBranch(9, 10, 0.5, W, H);
    expect(bass.spineY).toBeGreaterThan(high.spineY);
    expect(bass.spineX).toBeCloseTo(W / 2, 6);
  });

  it('lengthens the branch as energy rises', () => {
    const quiet = layoutBranch(2, 10, 0, W, H);
    const loud = layoutBranch(2, 10, 1, W, H);
    expect(loud.length).toBeGreaterThan(quiet.length);
  });

  it('alternates left and right of the spine', () => {
    const a = layoutBranch(0, 8, 0.5, W, H);
    const b = layoutBranch(1, 8, 0.5, W, H);
    expect(a.side).toBe(-1);
    expect(b.side).toBe(1);
    expect(a.nodeX).toBeLessThan(a.spineX);
    expect(b.nodeX).toBeGreaterThan(b.spineX);
  });
});

describe('getPlaybackTimeline', () => {
  it('uses the audio buffer duration when a file is loaded', () => {
    const engine = {
      buffer: { duration: 120 },
      getCurrentTime: () => 125,
    };
    const tl = getPlaybackTimeline(engine);
    expect(tl.source).toBe('buffer');
    expect(tl.duration).toBe(120);
    expect(tl.t).toBeCloseTo(5, 8);
  });

  it('falls back to a looping live window', () => {
    const tl = getPlaybackTimeline({ buffer: null }, 40);
    expect(tl.source).toBe('live');
    expect(tl.duration).toBe(DEFAULT_LOOP_SECONDS);
    expect(tl.t).toBeCloseTo(40 % DEFAULT_LOOP_SECONDS, 8);
  });
});

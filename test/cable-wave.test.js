import { describe, it, expect } from 'vitest';
import { cableWaveOffsets, tapStats, CABLE_WAVE_FLOOR } from '../src/patch/cable-wave.js';

function sine(len, cycles, phase) {
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) buf[i] = Math.sin(2 * Math.PI * (cycles * i / len + phase));
  return buf;
}

function rawMap(buf, n) {
  const out = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out[i] = buf[Math.floor(t * (buf.length - 1))] * Math.sin(Math.PI * t);
  }
  return out;
}

function maxAbs(buf) {
  let m = 0;
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  return m;
}

function maxAbsDiff(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

function settle(buf, opts) {
  let prev;
  for (let i = 0; i < 40; i++) prev = cableWaveOffsets(buf, 64, prev, opts);
  return prev;
}

describe('cableWaveOffsets', () => {
  it('treats silence as a dead cable after a few frames', () => {
    const live = settle(sine(512, 4, 0), { now: 0, kind: 'audio' });
    expect(maxAbs(live)).toBeGreaterThan(0.2);
    let prev = live;
    const quiet = new Float32Array(512);
    for (let i = 0; i < 24; i++) prev = cableWaveOffsets(quiet, 64, prev, { now: 0, kind: 'audio' });
    expect(maxAbs(prev)).toBeLessThan(0.02);
  });

  it('does not jump when an analyser snapshot flips phase', () => {
    const aBuf = sine(512, 8, 0);
    const bBuf = sine(512, 8, 0.5);
    const rawJump = maxAbsDiff(rawMap(aBuf, 64), rawMap(bBuf, 64));
    expect(rawJump).toBeGreaterThan(0.8);

    const settled = settle(aBuf, { now: 1000, kind: 'audio' });
    const before = Float32Array.from(settled);
    const after = cableWaveOffsets(bBuf, 64, settled, { now: 1000, kind: 'audio' });
    expect(maxAbsDiff(before, after)).toBeLessThan(0.35);
    expect(maxAbsDiff(before, after)).toBeLessThan(rawJump * 0.45);
  });

  it('pins the ends and bulges a DC CV cable', () => {
    const buf = new Float32Array(512);
    buf.fill(0.7);
    const wave = settle(buf, { now: 0, kind: 'cv' });
    expect(Math.abs(wave[0])).toBeLessThan(0.02);
    expect(Math.abs(wave[64])).toBeLessThan(0.02);
    expect(wave[32]).toBeGreaterThan(0.4);
  });

  it('decays under reduced motion instead of rippling', () => {
    const live = settle(sine(512, 3, 0), { now: 0, kind: 'audio' });
    let prev = live;
    for (let i = 0; i < 20; i++) {
      prev = cableWaveOffsets(sine(512, 3, 0), 64, prev, {
        now: i * 16, kind: 'audio', reducedMotion: true,
      });
    }
    expect(maxAbs(prev)).toBeLessThan(0.05);
  });

  it('reports analyser stats used for the noise floor', () => {
    const quiet = new Float32Array(512);
    quiet[10] = 0.004;
    expect(tapStats(quiet).peak).toBeLessThan(CABLE_WAVE_FLOOR);
    const loud = sine(512, 2, 0);
    expect(tapStats(loud).peak).toBeGreaterThan(0.9);
    expect(tapStats(loud).rms).toBeGreaterThan(0.6);
  });
});

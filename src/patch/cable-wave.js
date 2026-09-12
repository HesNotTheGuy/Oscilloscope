'use strict';

// Cable glow used to plot AnalyserNode time-domain samples along the bezier.
// Those snapshots are not phase-locked, so a 440 Hz tone (or analyser noise)
// jumped to a new spatial shape every frame — the cable looked like it was
// shaking. The live ripple is kept; the shape is driven by level (and a slow
// bulge for DC-like CV), then temporally smoothed.

export const CABLE_WAVE_FLOOR = 0.012;
export const CABLE_WAVE_SMOOTH = 0.28;
export const CABLE_WAVE_DECAY = 0.78;

export function tapStats(buf) {
  let peak = 0, acc = 0, sum = 0;
  const n = buf && buf.length ? buf.length : 0;
  for (let i = 0; i < n; i++) {
    const v = buf[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    acc += v;
    sum += v * v;
  }
  return { peak, mean: n ? acc / n : 0, rms: n ? Math.sqrt(sum / n) : 0 };
}

function decayOffsets(out) {
  for (let i = 0; i < out.length; i++) out[i] *= CABLE_WAVE_DECAY;
  return out;
}

/**
 * Perpendicular offsets for N segments (N+1 points), reused in `prev`.
 * Values are roughly -1..1; the drawer scales them to pixels.
 */
export function cableWaveOffsets(buf, n, prev, opts = {}) {
  const nPts = n + 1;
  const out = (prev && prev.length === nPts) ? prev : new Float32Array(nPts);
  if (!buf || !buf.length || opts.reducedMotion) return decayOffsets(out);

  const { peak, mean, rms } = tapStats(buf);
  if (peak < CABLE_WAVE_FLOOR) return decayOffsets(out);

  const now = opts.now || 0;
  const seed = opts.seed || 0;
  const travel = now / 1400 + seed * 0.37;
  const cycles = opts.kind === 'cv' ? 1.15 : 2;
  const dc = Math.abs(mean) > peak * 0.55;
  const amp = dc ? 1 : Math.min(1, rms * 2.2);
  const alpha = CABLE_WAVE_SMOOTH;

  for (let i = 0; i < nPts; i++) {
    const t = n ? i / n : 0;
    const window = Math.sin(Math.PI * t);
    const rip = Math.sin((t * cycles - travel) * Math.PI * 2);
    const target = dc
      ? (mean * 0.88 + rip * rms * 0.18) * window
      : rip * amp * window;
    out[i] += (target - out[i]) * alpha;
  }
  return out;
}

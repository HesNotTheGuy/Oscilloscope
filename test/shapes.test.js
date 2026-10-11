import { describe, it, expect } from 'vitest';
import { SHAPE_PRESETS, getShape, sampleShape, SHAPE_COUNT } from '../src/shapes/index.js';

const FAMILIES = ['lissajous', 'polar', 'gielis', 'epicycle', 'knot', 'parametric', 'conformal', 'ode', 'map', 'implicit', 'polylines'];

function peak(trace) {
  let m = 0;
  for (let i = 0; i < trace.L.length; i++) {
    m = Math.max(m, Math.abs(trace.L[i]), Math.abs(trace.R[i]));
  }
  return m;
}

function gap(trace) {
  const i = trace.L.length - 1;
  return Math.hypot(trace.L[0] - trace.L[i], trace.R[0] - trace.R[i]);
}

describe('shape registry', () => {
  it('has 50 named presets with unique ids', () => {
    expect(SHAPE_COUNT).toBe(50);
    expect(SHAPE_PRESETS).toHaveLength(50);
    const ids = new Set(SHAPE_PRESETS.map(p => p.id));
    expect(ids.size).toBe(50);
    SHAPE_PRESETS.forEach((p, i) => {
      expect(p.n).toBe(i + 1);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.formula.length).toBeGreaterThan(0);
      expect(FAMILIES).toContain(p.family);
      expect(getShape(p.id)).toBe(p);
    });
  });

  it.each(FAMILIES)('family %s is bounded and finite', (family) => {
    const presets = SHAPE_PRESETS.filter(p => p.family === family);
    expect(presets.length).toBeGreaterThan(0);
    for (const p of presets) {
      const n = family === 'ode' || family === 'implicit' ? 1024 : 512;
      const tr = sampleShape(p, n);
      expect(tr.L.length).toBeGreaterThanOrEqual(64);
      expect(tr.R.length).toBe(tr.L.length);
      expect(tr.lift.length).toBe(tr.L.length);
      expect(peak(tr)).toBeLessThanOrEqual(1);
      expect(Number.isFinite(peak(tr))).toBe(true);
      for (let i = 0; i < tr.L.length; i++) {
        expect(Number.isFinite(tr.L[i])).toBe(true);
        expect(Number.isFinite(tr.R[i])).toBe(true);
      }
    }
  });

  it('closes presets that declare a loop', () => {
    for (const p of SHAPE_PRESETS) {
      if (!p.closes) continue;
      const n = p.family === 'ode' ? 1024 : 512;
      const tr = sampleShape(p, n);
      expect(gap(tr), p.id).toBeLessThan(0.08);
    }
  });

  it('lissajous 9:13 and 7:11 match the requested ratios', () => {
    const a = getShape('lissajous-9-13').params;
    const b = getShape('lissajous-7-11').params;
    expect(a.a).toBe(9);
    expect(a.b).toBe(13);
    expect(a.phase).toBeCloseTo(Math.PI / 4, 10);
    expect(b.a).toBe(7);
    expect(b.b).toBe(11);
    expect(b.phase).toBeCloseTo(Math.PI / 5, 10);
  });

  it('map families lift the pen between iterates', () => {
    for (const id of ['ikeda', 'dejong', 'arnold-cat']) {
      const tr = sampleShape(id, 256);
      let lifts = 0;
      for (let i = 0; i < tr.lift.length; i++) lifts += tr.lift[i];
      expect(lifts).toBe(tr.lift.length);
    }
  });

  it('borromean and poincare emit multiple pen-up polylines', () => {
    for (const id of ['borromean', 'poincare']) {
      const tr = sampleShape(id, 1024);
      let lifts = 0;
      for (let i = 0; i < tr.lift.length; i++) lifts += tr.lift[i];
      expect(lifts).toBeGreaterThanOrEqual(2);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { computeVectorscopePoints } from '../src/vectorscope.js';

// ─────────────────────────────────────────────────────────────
//  Vectorscope tests — math correctness + reusable-buffer path
// ─────────────────────────────────────────────────────────────

const W = 800, H = 600;
const cx = W / 2, cy = H / 2;

describe('computeVectorscopePoints — math', () => {
  it('maps a mono signal (L === R) to a vertical line at center X', () => {
    const L = new Float32Array([0.5, -0.5, 0.25, -0.25]);
    const R = L.slice();
    const pts = computeVectorscopePoints(L, R, W, H, 1);
    // Mono → sx = (L-R)/√2 = 0 → all points sit on the vertical center line
    for (const [x] of pts) {
      expect(x).toBeCloseTo(cx, 6);
    }
  });

  it('maps a fully out-of-phase signal (L === -R) to a horizontal line at center Y', () => {
    const L = new Float32Array([0.5, -0.5, 0.25, -0.25]);
    const R = new Float32Array([-0.5, 0.5, -0.25, 0.25]);
    const pts = computeVectorscopePoints(L, R, W, H, 1);
    // Out-of-phase → sy = (L+R)/√2 = 0 → all points sit on the horizontal center line
    for (const [, y] of pts) {
      expect(y).toBeCloseTo(cy, 6);
    }
  });

  it('returns one point per input sample (min of L/R lengths)', () => {
    const L = new Float32Array(128);
    const R = new Float32Array(100);
    const pts = computeVectorscopePoints(L, R, W, H, 1);
    expect(pts.length).toBe(100);
  });
});

describe('computeVectorscopePoints — reusable buffer', () => {
  it('reuses the provided out array (same object identity) and grows it', () => {
    const out = [];
    const L = new Float32Array([0.1, 0.2, 0.3]);
    const R = new Float32Array([0.1, 0.2, 0.3]);
    const result = computeVectorscopePoints(L, R, W, H, 1, out);
    expect(result).toBe(out);           // same array instance
    expect(out.length).toBe(3);         // grown to sample count
    // Each entry is a reused [x,y] pair
    expect(out[0]).toHaveLength(2);
  });

  it('truncates the buffer when fewer samples arrive on a later call', () => {
    const out = [];
    computeVectorscopePoints(new Float32Array(10), new Float32Array(10), W, H, 1, out);
    expect(out.length).toBe(10);
    // Smaller second call
    computeVectorscopePoints(new Float32Array(4), new Float32Array(4), W, H, 1, out);
    expect(out.length).toBe(4);
  });

  it('produces identical results whether or not a reuse buffer is passed', () => {
    const L = new Float32Array([0.3, -0.7, 0.15]);
    const R = new Float32Array([0.1, -0.2, 0.9]);
    const fresh = computeVectorscopePoints(L, R, W, H, 1);
    const out = [];
    const reused = computeVectorscopePoints(L, R, W, H, 1, out);
    for (let i = 0; i < fresh.length; i++) {
      expect(reused[i][0]).toBeCloseTo(fresh[i][0], 9);
      expect(reused[i][1]).toBeCloseTo(fresh[i][1], 9);
    }
  });

  it('reused pair objects keep stable identity across calls of the same size', () => {
    const out = [];
    computeVectorscopePoints(new Float32Array(5), new Float32Array(5), W, H, 1, out);
    const firstPair = out[0];
    computeVectorscopePoints(new Float32Array(5), new Float32Array(5), W, H, 1, out);
    // Same [x,y] object is mutated in place, not replaced — confirms no per-frame alloc
    expect(out[0]).toBe(firstPair);
  });
});

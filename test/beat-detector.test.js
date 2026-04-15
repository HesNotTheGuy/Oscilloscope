import { describe, it, expect, beforeEach } from 'vitest';
import { BeatDetector } from '../src/beat-detector.js';

describe('BeatDetector', () => {
  let det;

  beforeEach(() => {
    det = new BeatDetector();
  });

  // ── Construction ──────────────────────────────────────────

  describe('constructor', () => {
    it('initializes with 60-sample history buffer', () => {
      expect(det._history).toBeInstanceOf(Float32Array);
      expect(det._history.length).toBe(60);
    });

    it('starts with zero head and cooldown', () => {
      expect(det._head).toBe(0);
      expect(det._cooldown).toBe(0);
    });

    it('starts with zero running sum', () => {
      expect(det._runSum).toBe(0);
    });

    it('has default sensitivity of 1.5', () => {
      expect(det.sensitivity).toBe(1.5);
    });
  });

  // ── detect() ──────────────────────────────────────────────

  describe('detect', () => {
    it('returns beat:false for silent input', () => {
      const result = det.detect(0);
      expect(result.beat).toBe(false);
      expect(result.energy).toBe(0);
    });

    it('returns beat:false for low-energy input below threshold', () => {
      const result = det.detect(0.01); // below 0.02 minimum
      expect(result.beat).toBe(false);
    });

    it('detects a beat on sudden energy spike', () => {
      // Fill history with low values
      for (let i = 0; i < 60; i++) det.detect(0.01);
      // Spike
      const result = det.detect(0.5);
      expect(result.beat).toBe(true);
      expect(result.energy).toBe(0.5);
    });

    it('applies cooldown after a beat (18 frames)', () => {
      // Fill + spike
      for (let i = 0; i < 60; i++) det.detect(0.01);
      det.detect(0.5); // triggers beat

      // Next 17 frames should not trigger even with high energy
      for (let i = 0; i < 17; i++) {
        const r = det.detect(0.5);
        expect(r.beat).toBe(false);
      }

      // Frame 18: cooldown expired, should trigger again
      const result = det.detect(0.5);
      expect(result.beat).toBe(true);
    });

    it('respects sensitivity multiplier', () => {
      // Fill with moderate values
      for (let i = 0; i < 60; i++) det.detect(0.1);

      // With default sensitivity (1.5), a value of 0.2 > 0.1 * 1.5 = 0.15 → beat
      const r1 = det.detect(0.2);
      expect(r1.beat).toBe(true);

      // Increase sensitivity — harder to trigger
      det.sensitivity = 3.0;
      det._cooldown = 0; // reset cooldown manually for test
      // Fill history again
      for (let i = 0; i < 60; i++) det.detect(0.1);
      // 0.2 < 0.1 * 3.0 = 0.3 → no beat
      const r2 = det.detect(0.2);
      expect(r2.beat).toBe(false);
    });

    it('tracks running sum correctly over time', () => {
      // Insert 60 values of 0.1
      for (let i = 0; i < 60; i++) det.detect(0.1);
      const expectedSum = 60 * 0.1;
      expect(det._runSum).toBeCloseTo(expectedSum, 5);
    });

    it('returns correct average in result', () => {
      for (let i = 0; i < 60; i++) det.detect(0.1);
      const result = det.detect(0.1);
      expect(result.avg).toBeCloseTo(0.1, 5);
    });

    it('handles circular buffer wrapping', () => {
      // Process more than 60 samples
      for (let i = 0; i < 120; i++) det.detect(0.05);
      expect(det._head).toBe(120);
      // Sum should still be correct after wrapping
      expect(det._runSum).toBeCloseTo(60 * 0.05, 5);
    });

    it('enforces minimum energy threshold of 0.02', () => {
      // Even with zero history average, energy below 0.02 shouldn't trigger
      const result = det.detect(0.019);
      expect(result.beat).toBe(false);
    });
  });
});

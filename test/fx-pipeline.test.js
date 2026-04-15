import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FXPipeline } from '../src/fx-pipeline.js';

// ── Helper: create FX state with defaults ───────────────────
function makeFX(overrides = {}) {
  return {
    reactive: false, beatFlash: false, bloom: false,
    mirrorX: false, mirrorY: false, rotation: false,
    beatInvert: false, afterglow: false, gradient: false,
    rotSpeed: 0.003, beatSens: 1.5,
    afterglowSpeed: 0, afterglowStr: 0.7,
    reactiveStr: 1.0, beatStr: 0.35, bloomStr: 1.0,
    gradientStart: '#00ff41', gradientEnd: '#ff00ff', gradientDir: 'h',
    _angle: 0, _flash: 0, _rms: 0, _lastRotT: 0,
    ...overrides,
  };
}

// ── Mock rgba parser (mimics WaveGLRenderer._rgba) ──────────
function mockRgba(hex) {
  if (hex === '#00ff41') return [0, 1, 0.255, 1];
  if (hex === '#ff00ff') return [1, 0, 1, 1];
  if (hex === '#ff0000') return [1, 0, 0, 1];
  if (hex === '#ffffff') return [1, 1, 1, 1];
  return [0, 0, 0, 1];
}

describe('FXPipeline', () => {
  let pipe;

  beforeEach(() => {
    pipe = new FXPipeline();
    vi.spyOn(performance, 'now').mockReturnValue(1000);
  });

  // ── update() ──────────────────────────────────────────────

  describe('update', () => {
    it('computes RMS from audio data', () => {
      const data = new Float32Array([0.5, -0.5, 0.5, -0.5]);
      const fx = makeFX();
      pipe.update(data, fx);
      expect(pipe.rms).toBeCloseTo(0.5, 5);
      expect(fx._rms).toBeCloseTo(0.5, 5);
    });

    it('computes RMS of zero for silent data', () => {
      const data = new Float32Array(100);
      const fx = makeFX();
      pipe.update(data, fx);
      expect(pipe.rms).toBe(0);
    });

    it('detects beats and sets flash', () => {
      const fx = makeFX({ beatFlash: true });
      // Fill beat detector history with low values
      const silent = new Float32Array(100);
      for (let i = 0; i < 60; i++) pipe.update(silent, fx);

      // Loud spike
      const loud = new Float32Array(100).fill(0.8);
      pipe.update(loud, fx);
      expect(pipe.lastBeat).toBe(true);
      // flash is set to 1.0 then immediately decayed *0.72 in same frame
      expect(pipe.flash).toBeCloseTo(0.72, 5);
      expect(fx._flash).toBeCloseTo(0.72, 5);
    });

    it('decays flash over frames', () => {
      const fx = makeFX({ beatFlash: true });
      for (let i = 0; i < 60; i++) pipe.update(new Float32Array(100), fx);
      pipe.update(new Float32Array(100).fill(0.8), fx); // trigger

      // Subsequent frame with low input
      pipe.update(new Float32Array(100), fx);
      // 0.72 (from trigger frame) * 0.72 = 0.5184
      expect(pipe.flash).toBeCloseTo(0.72 * 0.72, 5);
    });

    it('advances rotation angle when rotation enabled', () => {
      const fx = makeFX({ rotation: true, rotSpeed: 0.1 });
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1016.67); // ~1 frame at 60fps

      pipe.update(new Float32Array(10), fx);
      const angle1 = pipe.angle;

      pipe.update(new Float32Array(10), fx);
      expect(pipe.angle).toBeGreaterThan(angle1);
      expect(fx._angle).toBe(pipe.angle);
    });

    it('does not rotate when rotation disabled', () => {
      const fx = makeFX({ rotation: false });
      pipe.update(new Float32Array(10), fx);
      expect(pipe.angle).toBe(0);
    });
  });

  // ── computeGlow ───────────────────────────────────────────

  describe('computeGlow', () => {
    it('returns base glow when reactive is off', () => {
      const fx = makeFX({ reactive: false });
      expect(pipe.computeGlow(12, fx)).toBe(12);
    });

    it('scales glow with RMS when reactive is on', () => {
      const fx = makeFX({ reactive: true, reactiveStr: 1.0 });
      pipe.rms = 0.5;
      const glow = pipe.computeGlow(12, fx);
      expect(glow).toBe(12 + 0.5 * 60 * 1.0);
    });

    it('respects reactive strength multiplier', () => {
      const fx = makeFX({ reactive: true, reactiveStr: 2.0 });
      pipe.rms = 0.5;
      const glow = pipe.computeGlow(12, fx);
      expect(glow).toBe(12 + 0.5 * 60 * 2.0);
    });
  });

  // ── computeBeamWidth ──────────────────────────────────────

  describe('computeBeamWidth', () => {
    it('returns base width when reactive is off', () => {
      const fx = makeFX({ reactive: false });
      expect(pipe.computeBeamWidth(1.5, fx)).toBe(1.5);
    });

    it('scales width with RMS when reactive is on', () => {
      const fx = makeFX({ reactive: true, reactiveStr: 1.0 });
      pipe.rms = 0.5;
      const width = pipe.computeBeamWidth(1.5, fx);
      expect(width).toBeCloseTo(1.5 * (1 + 0.5 * 1.5 * 1.0), 5);
    });
  });

  // ── computeGradient ───────────────────────────────────────

  describe('computeGradient', () => {
    it('returns null when gradient disabled', () => {
      const fx = makeFX({ gradient: false });
      expect(pipe.computeGradient([[]], fx, 600, mockRgba)).toBeNull();
    });

    it('returns null for empty point sets', () => {
      const fx = makeFX({ gradient: true });
      expect(pipe.computeGradient([], fx, 600, mockRgba)).toBeNull();
    });

    it('computes horizontal gradient (interpolates along waveform)', () => {
      const fx = makeFX({ gradient: true, gradientDir: 'h' });
      const pts = [[0, 300], [100, 200], [200, 400]]; // 3 points
      const result = pipe.computeGradient([pts], fx, 600, mockRgba);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(3);

      // First point: t=0 → start color
      expect(result[0][0][0]).toBeCloseTo(0, 2);     // R from #00ff41
      expect(result[0][0][3]).toBe(1.0);               // alpha

      // Last point: t=1 → end color
      expect(result[0][2][0]).toBeCloseTo(1, 2);       // R from #ff00ff
    });

    it('computes vertical gradient (interpolates by Y position)', () => {
      const fx = makeFX({ gradient: true, gradientDir: 'v' });
      const H = 600;
      const pts = [[100, 0], [100, 300], [100, 600]]; // top, middle, bottom
      const result = pipe.computeGradient([pts], fx, H, mockRgba);

      // Top (y=0): t=0 → start color
      expect(result[0][0][0]).toBeCloseTo(0, 2);
      // Bottom (y=600): t=1 → end color
      expect(result[0][2][0]).toBeCloseTo(1, 2);
    });
  });

  // ── computeFlashRGB ───────────────────────────────────────

  describe('computeFlashRGB', () => {
    it('returns null when flash is near zero', () => {
      pipe.flash = 0;
      const fx = makeFX();
      expect(pipe.computeFlashRGB(fx, '#00ff41', mockRgba)).toBeNull();
    });

    it('returns flash color scaled by intensity', () => {
      pipe.flash = 1.0;
      const fx = makeFX({ beatStr: 0.35, beatInvert: false });
      const result = pipe.computeFlashRGB(fx, '#ff0000', mockRgba);
      expect(result).toHaveLength(3);
      expect(result[0]).toBeCloseTo(1 * 0.35, 5); // R * flash * beatStr
    });

    it('uses white when beatInvert is true', () => {
      pipe.flash = 1.0;
      const fx = makeFX({ beatStr: 1.0, beatInvert: true });
      const result = pipe.computeFlashRGB(fx, '#ff0000', mockRgba);
      // Should use #ffffff, not #ff0000
      expect(result[0]).toBeCloseTo(1, 5);
      expect(result[1]).toBeCloseTo(1, 5);
      expect(result[2]).toBeCloseTo(1, 5);
    });
  });

  // ── computeDecay ──────────────────────────────────────────

  describe('computeDecay', () => {
    it('returns persistence when afterglow is off', () => {
      const fx = makeFX({ afterglow: false });
      expect(pipe.computeDecay(0.15, fx)).toBe(0.15);
    });

    it('returns afterglow-derived decay when afterglow is on', () => {
      const fx = makeFX({ afterglow: true, afterglowStr: 0.7 });
      expect(pipe.computeDecay(0.15, fx)).toBeCloseTo(0.3, 5);
    });
  });

  // ── computeHaloStr ────────────────────────────────────────

  describe('computeHaloStr', () => {
    it('returns 0 when bloom is off', () => {
      const fx = makeFX({ bloom: false });
      expect(pipe.computeHaloStr(fx)).toBe(0);
    });

    it('returns scaled value when bloom is on', () => {
      const fx = makeFX({ bloom: true, bloomStr: 1.0 });
      expect(pipe.computeHaloStr(fx)).toBeCloseTo(0.35, 5);
    });

    it('scales with bloomStr', () => {
      const fx = makeFX({ bloom: true, bloomStr: 2.0 });
      expect(pipe.computeHaloStr(fx)).toBeCloseTo(0.7, 5);
    });
  });

  // ── computeHueShift ───────────────────────────────────────

  describe('computeHueShift', () => {
    it('returns 0 when afterglow is off', () => {
      const fx = makeFX({ afterglow: false });
      expect(pipe.computeHueShift(fx)).toBe(0);
    });

    it('returns afterglowSpeed when afterglow is on', () => {
      const fx = makeFX({ afterglow: true, afterglowSpeed: 0.05 });
      expect(pipe.computeHueShift(fx)).toBe(0.05);
    });
  });
});

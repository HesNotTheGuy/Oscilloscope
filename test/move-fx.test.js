import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyMoveFx } from '../src/move-fx.js';

// ─────────────────────────────────────────────────────────────
//  Movement FX tests — shared module extracted from the formerly
//  duplicated ObjScene/ImageScene _applyMoveFx implementations.
// ─────────────────────────────────────────────────────────────

const W = 1000, H = 800;

function makeScene(overrides = {}) {
  return {
    float: false, ripple: false, twist: false, explode: false,
    explodeLoop: false,
    motionAmt: 0.5, motionSpeed: 1.0,
    _floatPhX: 0, _floatPhY: 1.3,
    _ripplePh: 0, _twistPh: 0, _explodeT: 0, _lastFxT: 0,
    ...overrides,
  };
}

function makeSegs() {
  // Two segments away from center so radial FX displace them
  return [
    [[100, 100], [200, 150]],
    [[700, 600], [800, 650]],
  ];
}

// Controllable clock — applyMoveFx reads performance.now()/1000 (seconds).
let nowMs = 1000;
beforeEach(() => {
  nowMs = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
});

describe('applyMoveFx', () => {
  it('returns segs unchanged when no FX are enabled', () => {
    const scene = makeScene();
    const segs = makeSegs();
    const before = JSON.parse(JSON.stringify(segs));
    const out = applyMoveFx(scene, segs, W, H);
    expect(out).toBe(segs);
    expect(out).toEqual(before);
  });

  it('mutates segs in place (same outer array and endpoint pairs)', () => {
    const scene = makeScene({ float: true });
    const segs = makeSegs();
    const seg0 = segs[0], p0 = segs[0][0];
    const out = applyMoveFx(scene, segs, W, H);
    expect(out).toBe(segs);
    expect(out[0]).toBe(seg0);
    expect(out[0][0]).toBe(p0);   // endpoint pair object reused, not replaced
  });

  it('float translates every point by the same offset', () => {
    const scene = makeScene({ float: true, _floatPhX: Math.PI / 2, _floatPhY: Math.PI / 2 });
    const segs = makeSegs();
    const before = JSON.parse(JSON.stringify(segs));
    applyMoveFx(scene, segs, W, H);
    const dx0 = segs[0][0][0] - before[0][0][0];
    const dy0 = segs[0][0][1] - before[0][0][1];
    const dx1 = segs[1][1][0] - before[1][1][0];
    const dy1 = segs[1][1][1] - before[1][1][1];
    expect(dx1).toBeCloseTo(dx0, 9);
    expect(dy1).toBeCloseTo(dy0, 9);
    expect(Math.abs(dx0)).toBeGreaterThan(0);
  });

  it('explode pushes points away from canvas center', () => {
    const scene = makeScene({ explode: true, _explodeT: 0.4, motionSpeed: 0 });
    // motionSpeed 0 → _explodeT stays 0.4 (mid-burst), explodeF > 0
    const segs = makeSegs();
    const cx = W / 2, cy = H / 2;
    const distBefore = Math.hypot(segs[0][0][0] - cx, segs[0][0][1] - cy);
    applyMoveFx(scene, segs, W, H);
    const distAfter = Math.hypot(segs[0][0][0] - cx, segs[0][0][1] - cy);
    expect(distAfter).toBeGreaterThan(distBefore);
  });

  it('explode loops back to 0 when explodeLoop is set', () => {
    // now = 1.0s, last = 0.95s → dt = 0.05; speed 10 → +0.15 past 1.0
    const scene = makeScene({ explode: true, explodeLoop: true, _explodeT: 0.99, motionSpeed: 10, _lastFxT: 0.95 });
    applyMoveFx(scene, makeSegs(), W, H);
    expect(scene._explodeT).toBe(0);
  });

  it('explode clamps at 1 when explodeLoop is off', () => {
    const scene = makeScene({ explode: true, explodeLoop: false, _explodeT: 0.99, motionSpeed: 10, _lastFxT: 0.95 });
    applyMoveFx(scene, makeSegs(), W, H);
    expect(scene._explodeT).toBe(1);
  });

  it('keeps phase state independent between two scenes', () => {
    const a = makeScene({ float: true, _lastFxT: 0.95 });
    const b = makeScene({ float: true, _lastFxT: 0.95 });
    applyMoveFx(a, makeSegs(), W, H);   // A: dt = 0.05
    nowMs = 1050;
    applyMoveFx(a, makeSegs(), W, H);   // A again: dt = 0.05 → phase advanced twice
    applyMoveFx(b, makeSegs(), W, H);   // B once: dt = min(1.05-0.95, 0.05) = 0.05
    expect(a._floatPhX).not.toBeCloseTo(b._floatPhX, 12);
  });

  it('twist rotates points by an angle proportional to distance from center', () => {
    const scene = makeScene({ twist: true, motionSpeed: 0, _twistPh: 0 });
    const segs = [[[W / 2 + 100, H / 2], [W / 2 + 300, H / 2]]];
    applyMoveFx(scene, segs, W, H);
    const angNear = Math.atan2(segs[0][0][1] - H / 2, segs[0][0][0] - W / 2);
    const angFar  = Math.atan2(segs[0][1][1] - H / 2, segs[0][1][0] - W / 2);
    // Farther point rotates through a larger angle
    expect(Math.abs(angFar)).toBeGreaterThan(Math.abs(angNear));
    // Distance from center is preserved by pure rotation
    expect(Math.hypot(segs[0][0][0] - W / 2, segs[0][0][1] - H / 2)).toBeCloseTo(100, 6);
  });
});

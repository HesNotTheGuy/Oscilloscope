import { describe, it, expect } from 'vitest';
import { WaveField } from '../src/toys/wave-field.js';

describe('WaveField', () => {
  it('a fresh field has zero energy', () => {
    expect(new WaveField(16).energy(), 'fresh field energy is 0').toBe(0);
  });

  it('damping pulls energy under 15% of the step-2 reading within 80 further steps', () => {
    const field = new WaveField(16);
    field.impulse(8, 8, 1);
    const opts = { speed: 0.35, damping: 0.9 };
    field.step(opts);
    field.step(opts);
    const E2 = field.energy();
    for (let i = 0; i < 80; i++) field.step(opts);
    const e80 = field.energy();
    expect(e80, 'energy after 80 damped steps is under 15% of energy after step 2').toBeLessThan(E2 * 0.15);
    expect(e80, 'energy after 80 damped steps stays non-negative').toBeGreaterThanOrEqual(0);
  });

  it('a hard impulse stays inside the clamp and energy stays finite', () => {
    const field = new WaveField(16);
    field.impulse(8, 8, 3);
    const opts = { speed: 0.35, damping: 0.99 };
    for (let i = 0; i < 200; i++) field.step(opts);
    const n = field.size;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        expect(Math.abs(field.uAt(x, y)), `u at ${x},${y} stays within 4`).toBeLessThanOrEqual(4);
        expect(Math.abs(field.vAt(x, y)), `v at ${x},${y} stays within 4`).toBeLessThanOrEqual(4);
      }
    }
    const e = field.energy();
    expect(Number.isFinite(e), 'energy after a hard impulse is finite').toBe(true);
    expect(Number.isNaN(e), 'energy after a hard impulse is not NaN').toBe(false);
  });

  it('without damping the wave is still carrying energy five steps later', () => {
    const field = new WaveField(16);
    field.impulse(8, 8, 1);
    const opts = { speed: 0.35, damping: 1 };
    field.step(opts);
    const e1 = field.energy();
    for (let i = 0; i < 4; i++) field.step(opts);
    const e5 = field.energy();
    expect(e5, 'energy after step 5 stays above half the energy after step 1').toBeGreaterThan(0.5 * e1);
  });
});

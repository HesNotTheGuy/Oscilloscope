import { describe, it, expect } from 'vitest';
import { LookAheadScheduler } from '../src/toys/look-ahead-scheduler.js';

function scripted(pulses, speed, origin, lookAhead) {
  const clock = { t: 0, now() { return this.t; } };
  const hits = [];
  const sched = new LookAheadScheduler({
    clock,
    lookAhead,
    onSchedule: (i, time) => hits.push([i, time]),
  });
  sched.setPattern({ pulses, speed, origin });
  return { clock, hits, sched };
}

describe('look-ahead scheduler', () => {
  it('schedules the open window on the clock and does not repeat it', () => {
    const { clock, hits, sched } = scripted([4], 1, 0, 0.6);
    clock.t = 0;
    sched.tick();
    expect(hits, 't=0 covers [0, 0.6) and stops before 0.75').toEqual([
      [0, 0],
      [0, 0.25],
      [0, 0.5],
    ]);
    clock.t = 0.4;
    sched.tick();
    expect(hits, 't=0.4 adds 0.75 once').toEqual([
      [0, 0],
      [0, 0.25],
      [0, 0.5],
      [0, 0.75],
    ]);
  });

  it('spaces a 4:5:6 pattern at speed 1 by 0.25, 0.2, and 1/6', () => {
    const { clock, hits, sched } = scripted([4, 5, 6], 1, 0, 0.6);
    clock.t = 0;
    sched.tick();
    const rings = [[], [], []];
    for (const [ring, time] of hits) rings[ring].push(time);
    expect(rings[0], 'four pulses').toEqual([0, 0.25, 0.5]);
    expect(rings[1], 'five pulses').toEqual([0, 0.2, 0.4]);
    expect(rings[2], 'six pulses').toEqual([0, 1 / 6, 1 / 3, 0.5]);
  });

  it('reads clock.now after a jump and does not replay the gap', () => {
    const { clock, hits, sched } = scripted([4], 1, 0, 0.6);
    clock.t = 10;
    sched.tick();
    expect(hits, 'the window is [10, 10.6) on the same grid').toEqual([
      [0, 10],
      [0, 10.25],
      [0, 10.5],
    ]);
  });
});

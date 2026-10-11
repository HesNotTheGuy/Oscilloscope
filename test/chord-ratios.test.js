import { describe, it, expect } from 'vitest';
import {
  angleRadians,
  chordName,
  clampSpeed,
  formatHz,
  formatSpeed,
  headline,
  ratioById,
  ringRatesHz,
  slowestHz,
  voiceKind,
} from '../src/toys/chord-ratios.js';

describe('chord ratios', () => {
  it('names each table ratio from its pulse list', () => {
    expect(chordName([4, 5, 6]), '4:5:6 is a major triad').toBe('Major Triad');
    expect(chordName([3, 4, 5]), '3:4:5 is the same family').toBe('Major Triad');
    expect(chordName([5, 6, 8]), '5:6:8 is the same family').toBe('Major Triad');
    expect(chordName([4, 5, 6, 7]), '4:5:6:7 is the harmonic seventh').toBe('Harmonic Seventh');
    expect(chordName([10, 12, 15]), '10:12:15 is a minor triad').toBe('Minor Triad');
    expect(chordName([2, 3, 4]), '2:3:4 is a power chord').toBe('Power Chord');
    expect(chordName([6, 8, 9]), '6:8:9 is a suspended fourth').toBe('Suspended Fourth');
  });

  it('rejects a pulse list that is not in the table', () => {
    expect(() => chordName([9, 9, 9]), '9:9:9 has no row').toThrow('unknown ratio 9:9:9');
    expect(() => ratioById('1:1:1'), '1:1:1 has no row').toThrow('unknown ratio 1:1:1');
  });

  it('maps each pulse to n times speed', () => {
    expect(ringRatesHz([4, 5, 6], 0.3), 'x0.3 is the slow chord').toEqual([1.2, 1.5, 1.8]);
    expect(ringRatesHz([4, 5, 6], 100), 'x100 is the fast chord').toEqual([400, 500, 600]);
    expect(slowestHz([4, 5, 6], 0.3), 'the inner ring is slowest').toBe(1.2);
    expect(slowestHz([4, 5, 6], 100), 'the inner ring is still slowest').toBe(400);
  });

  it('switches title and voice at 20 Hz', () => {
    expect(headline(1.2, 'Major Triad'), 'below fusion the motion is the title').toBe('This polyrhythm is a chord');
    expect(headline(19.999, 'Major Triad'), 'just under 20 Hz stays low').toBe('This polyrhythm is a chord');
    expect(headline(20, 'Major Triad'), '20 Hz is the chord name').toBe('Major Triad');
    expect(voiceKind(1.2), 'below fusion the voice clicks').toBe('click');
    expect(voiceKind(19.999), 'just under 20 Hz still clicks').toBe('click');
    expect(voiceKind(20), '20 Hz is a tone').toBe('tone');
  });

  it('formats the rates and the speed the wheel prints', () => {
    expect(formatHz([1.2, 1.5, 1.8]), 'slow rates keep one decimal').toBe('1.2 / 1.5 / 1.8 Hz');
    expect(formatHz([400, 500, 600]), 'fast rates are integers').toBe('400 / 500 / 600 Hz');
    expect(formatSpeed(0.3), 'the slow endpoint').toBe('x0.3');
    expect(formatSpeed(1), 'unity speed').toBe('x1');
    expect(formatSpeed(100), 'the fast endpoint').toBe('x100');
  });

  it('clamps speed at the knob and keeps the hand on the audio clock', () => {
    expect(clampSpeed(0.3), 'the slow endpoint is legal').toBe(0.3);
    expect(clampSpeed(100), 'the fast endpoint is legal').toBe(100);
    expect(clampSpeed(1), 'unity speed is legal').toBe(1);
    expect(clampSpeed(-4), 'below the slow end clamps').toBe(0.3);
    expect(clampSpeed(1000), 'above the fast end clamps').toBe(100);
    expect(clampSpeed('nope'), 'a non-number clamps low').toBe(0.3);
    expect(angleRadians(0, 0, 1), 'the hand starts at the origin').toBe(0);
    expect(angleRadians(1, 0, 1), 'one second at speed 1 is one turn').toBe(Math.PI * 2);
    expect(angleRadians(0.5, 0.25, 2), 'half a second after origin at speed 2 is half a turn').toBe(Math.PI);
  });
});

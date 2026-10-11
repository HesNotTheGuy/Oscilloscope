import { describe, it, expect } from 'vitest';
import { midiInScale, frequencyForMidi } from '../src/toys/scale.js';

describe('scale quantizer', () => {
  it('leaves an in-scale note where it is', () => {
    expect(midiInScale(60, 'C', 'major'), 'C4 is already in C major').toBe(60);
    expect(midiInScale(64, 'C', 'major'), 'E4 stays in C major').toBe(64);
  });

  it('snaps an out-of-scale note to the nearer in-scale neighbor, lower on a tie', () => {
    expect(midiInScale(61, 'C', 'major'), 'C# snaps down to C').toBe(60);
    expect(midiInScale(63, 'C', 'major'), 'Eb is tied between D and E and snaps down to D').toBe(62);
    expect(midiInScale(61, 'C', 'pentatonic'), 'C# snaps down to C in C pentatonic').toBe(60);
    expect(midiInScale(60, 'D', 'major'), 'C is a semitone above B in D major').toBe(59);
  });

  it('maps midi to equal-tempered frequency from A4', () => {
    expect(frequencyForMidi(69), 'A4 is 440 Hz').toBe(440);
    expect(frequencyForMidi(81), 'A5 is 880 Hz').toBe(880);
  });
});

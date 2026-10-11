'use strict';

export const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALES = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

function pitchClass(midi, tonicPc) {
  return ((midi - tonicPc) % 12 + 12) % 12;
}

function inScale(midi, tonicPc, degrees) {
  return degrees.indexOf(pitchClass(midi, tonicPc)) !== -1;
}

export function midiInScale(midi, key, scaleId) {
  const degrees = SCALES[scaleId] || SCALES.major;
  const tonic = KEYS.indexOf(key);
  const tonicPc = tonic < 0 ? 0 : tonic;
  const m = Math.round(Number(midi));
  if (!Number.isFinite(m)) return 60;
  if (inScale(m, tonicPc, degrees)) return m;
  for (let d = 1; d <= 12; d++) {
    if (inScale(m - d, tonicPc, degrees)) return m - d;
    if (inScale(m + d, tonicPc, degrees)) return m + d;
  }
  return m;
}

export function frequencyForMidi(midi) {
  return 440 * 2 ** ((Number(midi) - 69) / 12);
}

export function midiForCell(x, y, key, scaleId) {
  const degrees = SCALES[scaleId] || SCALES.major;
  const span = degrees.length * 2;
  const slot = ((x + 2 * y) % span + span) % span;
  const oct = Math.floor(slot / degrees.length);
  const degree = degrees[slot % degrees.length];
  const tonic = KEYS.indexOf(key);
  const tonicPc = tonic < 0 ? 0 : tonic;
  return midiInScale(48 + tonicPc + oct * 12 + degree, key, scaleId);
}

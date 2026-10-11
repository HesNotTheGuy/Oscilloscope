'use strict';

export const SPEED_MIN = 0.3;
export const SPEED_MAX = 100;
export const FUSION_HZ = 20;
export const LOW_TITLE = 'This polyrhythm is a chord';

const TAU = Math.PI * 2;

export const RATIO_TABLE = Object.freeze([
  { id: '4:5:6', pulses: Object.freeze([4, 5, 6]), name: 'Major Triad', colors: Object.freeze(['#e8d44d', '#3dba5a', '#4a90e2']) },
  { id: '3:4:5', pulses: Object.freeze([3, 4, 5]), name: 'Major Triad', colors: Object.freeze(['#e8d44d', '#3dba5a', '#4a90e2']) },
  { id: '5:6:8', pulses: Object.freeze([5, 6, 8]), name: 'Major Triad', colors: Object.freeze(['#e8d44d', '#3dba5a', '#4a90e2']) },
  { id: '4:5:6:7', pulses: Object.freeze([4, 5, 6, 7]), name: 'Harmonic Seventh', colors: Object.freeze(['#e8d44d', '#3dba5a', '#4a90e2', '#9b59b6']) },
  { id: '10:12:15', pulses: Object.freeze([10, 12, 15]), name: 'Minor Triad', colors: Object.freeze(['#e8d44d', '#3dba5a', '#4a90e2']) },
  { id: '2:3:4', pulses: Object.freeze([2, 3, 4]), name: 'Power Chord', colors: Object.freeze(['#e8d44d', '#3dba5a', '#4a90e2']) },
  { id: '6:8:9', pulses: Object.freeze([6, 8, 9]), name: 'Suspended Fourth', colors: Object.freeze(['#e8d44d', '#3dba5a', '#4a90e2']) },
]);

export function ratioById(id) {
  const row = RATIO_TABLE.find(r => r.id === id);
  if (!row) throw new Error('unknown ratio ' + id);
  return row;
}

export function chordName(pulses) {
  return ratioById(pulses.join(':')).name;
}

export function ringRatesHz(pulses, speed) {
  const thousandths = Math.round(speed * 1000);
  return pulses.map(n => n * thousandths / 1000);
}

export function slowestHz(pulses, speed) {
  const rates = ringRatesHz(pulses, speed);
  let slow = rates[0];
  for (let i = 1; i < rates.length; i++) {
    if (rates[i] < slow) slow = rates[i];
  }
  return slow;
}

export function headline(slowest, name) {
  return slowest >= FUSION_HZ ? name : LOW_TITLE;
}

export function voiceKind(slowest) {
  return slowest >= FUSION_HZ ? 'tone' : 'click';
}

export function formatHz(rates) {
  return rates.map(formatRate).join(' / ') + ' Hz';
}

export function formatSpeed(speed) {
  return 'x' + (Math.round(speed * 1000) / 1000);
}

export function clampSpeed(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < SPEED_MIN) return SPEED_MIN;
  if (n > SPEED_MAX) return SPEED_MAX;
  return n;
}

export function angleRadians(audioTime, origin, speed) {
  return (audioTime - origin) * speed * TAU;
}

function formatRate(n) {
  return String(Math.round(n * 1000) / 1000);
}

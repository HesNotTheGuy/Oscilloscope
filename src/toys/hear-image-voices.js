'use strict';

export const SAMPLE_RGB = Object.freeze({
  black: Object.freeze({ r: 0, g: 0, b: 0 }),
  white: Object.freeze({ r: 255, g: 255, b: 255 }),
  magenta: Object.freeze({ r: 255, g: 0, b: 255 }),
});

const BIN_COUNT = 13;
const THZ_RED = 400;
const THZ_VIOLET = 789;
const SPECTRAL_HUE = 270;
const BLACK_MAX = 30;
const GRAY_SAT = 0.12;
const WHITE_MIN = 230;

export function hzFromThz(thz) {
  return thz * 1e12 / 2 ** 40;
}

export const HUE_BINS = buildHueBins();

function buildHueBins() {
  if (BIN_COUNT % 2 !== 1) throw new Error('hue bin count must be odd');
  const last = BIN_COUNT - 1;
  const bins = [];
  for (let key = 0; key <= last; key++) {
    const thz = THZ_RED + key * (THZ_VIOLET - THZ_RED) / last;
    const hue = key * SPECTRAL_HUE / last;
    const [r, g, b] = rgbFromHue(hue);
    bins.push(Object.freeze({
      key,
      thz,
      hz: hzFromThz(thz),
      css: cssFromRgb(r, g, b),
      r,
      g,
      b,
    }));
  }
  return Object.freeze(bins);
}

const SILENT = Object.freeze({ kind: 'silent' });

const TONE_ROLES = HUE_BINS.map((bin) => Object.freeze({
  kind: 'tone',
  key: bin.key,
  thz: bin.thz,
  hz: bin.hz,
  css: bin.css,
}));

function pitchesFor(keys) {
  return Object.freeze(keys.map((key) => {
    const bin = HUE_BINS[key];
    return Object.freeze({ key: bin.key, thz: bin.thz, hz: bin.hz, css: bin.css });
  }));
}

const lastKey = HUE_BINS.length - 1;
const midKey = lastKey / 2;
const WHITE_ROLE = Object.freeze({
  kind: 'chord',
  id: 'white',
  tones: pitchesFor([0, midKey, lastKey]),
});
const MAGENTA_ROLE = Object.freeze({
  kind: 'chord',
  id: 'magenta',
  tones: pitchesFor([0, lastKey]),
});

export function colorToVoice(rgb) {
  const r = channel(rgb && rgb.r);
  const g = channel(rgb && rgb.g);
  const b = channel(rgb && rgb.b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max <= BLACK_MAX) return SILENT;
  const sat = (max - min) / max;
  if (sat < GRAY_SAT && min >= WHITE_MIN) return WHITE_ROLE;
  if (sat < GRAY_SAT) return SILENT;
  const index = Math.round(hsvHue(r, g, b) / (SPECTRAL_HUE / lastKey));
  if (index >= BIN_COUNT) return MAGENTA_ROLE;
  return TONE_ROLES[index];
}

for (const bin of HUE_BINS) {
  const role = colorToVoice(bin);
  if (role.kind !== 'tone' || role.key !== bin.key) throw new Error('bin does not round-trip');
}

export function voicesForColumn(buffer, x) {
  if (!buffer || !positiveInt(buffer.width) || !positiveInt(buffer.height) || !buffer.data
      || buffer.data.length !== buffer.width * buffer.height * 4) {
    throw new Error('bad image buffer');
  }
  if (!Number.isInteger(x) || x < 0 || x >= buffer.width) throw new Error('column out of range');
  const { data, width, height } = buffer;
  const count = new Uint32Array(HUE_BINS.length);
  for (let y = 0; y < height; y++) {
    const i = (y * width + x) * 4;
    const role = colorToVoice({ r: data[i], g: data[i + 1], b: data[i + 2] });
    if (role.kind === 'silent') continue;
    if (role.kind === 'tone') {
      count[role.key] += 1;
      continue;
    }
    if (role.kind === 'chord') {
      for (const tone of role.tones) count[tone.key] += 1;
      continue;
    }
    throw new Error('bad role');
  }
  const voices = [];
  for (let key = 0; key < HUE_BINS.length; key++) {
    if (count[key] === 0) continue;
    const bin = HUE_BINS[key];
    voices.push(Object.freeze({
      key: bin.key,
      thz: bin.thz,
      hz: bin.hz,
      gain: count[key] / height,
      css: bin.css,
    }));
  }
  return Object.freeze(voices);
}

export function voiceLabel(voice) {
  return 'b' + voice.key + ' ' + formatThz(voice.thz) + ' THz ' + formatHz(voice.hz) + ' Hz ' + Math.round(voice.gain * 100) + '%';
}

export function formatVoices(voices) {
  if (voices.length === 0) return 'silence';
  return voices.map(voiceLabel).join(', ');
}

export function paintSwatches() {
  const rows = HUE_BINS.map((bin) => Object.freeze({
    id: 'b' + bin.key,
    r: bin.r,
    g: bin.g,
    b: bin.b,
    css: bin.css,
  }));
  rows.push(
    Object.freeze({ id: 'black', r: SAMPLE_RGB.black.r, g: SAMPLE_RGB.black.g, b: SAMPLE_RGB.black.b, css: '#000000' }),
    Object.freeze({ id: 'white', r: SAMPLE_RGB.white.r, g: SAMPLE_RGB.white.g, b: SAMPLE_RGB.white.b, css: '#ffffff' }),
    Object.freeze({ id: 'magenta', r: SAMPLE_RGB.magenta.r, g: SAMPLE_RGB.magenta.g, b: SAMPLE_RGB.magenta.b, css: '#ff00ff' }),
  );
  return Object.freeze(rows);
}

function channel(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 255) return 255;
  return n;
}

function hsvHue(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue;
  if (max === r) hue = (g - b) / d;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return hue;
}

function rgbFromHue(hue) {
  const hp = hue / 60;
  const x = 1 - Math.abs(hp % 2 - 1);
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) { r = 1; g = x; b = 0; }
  else if (hp < 2) { r = x; g = 1; b = 0; }
  else if (hp < 3) { r = 0; g = 1; b = x; }
  else if (hp < 4) { r = 0; g = x; b = 1; }
  else if (hp < 5) { r = x; g = 0; b = 1; }
  else { r = 1; g = 0; b = x; }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function cssFromRgb(r, g, b) {
  return '#' + byteHex(r) + byteHex(g) + byteHex(b);
}

function byteHex(n) {
  return n.toString(16).padStart(2, '0');
}

function formatThz(thz) {
  const tenth = Math.round(thz * 10) / 10;
  if (Number.isInteger(tenth)) return String(tenth);
  return tenth.toFixed(1);
}

function formatHz(hz) {
  return (Math.round(hz * 10) / 10).toFixed(1);
}

function positiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

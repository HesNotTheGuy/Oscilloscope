'use strict';

import { HUE_BINS, SAMPLE_RGB } from './hear-image-voices.js';

export const FRAME = Object.freeze({ width: 480, height: 270 });

export function paintPreset(id, width, height) {
  const row = PRESETS.find((preset) => preset.id === id);
  if (!row) throw new Error('Unknown preset: ' + id);
  return row.paint(width, height);
}

export function exhibitColumn(id, width) {
  const row = PRESETS.find((preset) => preset.id === id);
  if (!row) throw new Error('Unknown preset: ' + id);
  return row.center ? Math.round(width / 2) : 0;
}

export function stampDisc(buffer, cx, cy, radius, rgb) {
  const r2 = radius * radius;
  const x0 = Math.floor(cx - radius);
  const y0 = Math.floor(cy - radius);
  const x1 = Math.ceil(cx + radius);
  const y1 = Math.ceil(cy + radius);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) putPixel(buffer, x, y, rgb);
    }
  }
}

export function stampBand(buffer, y, thickness, rgb) {
  const row0 = Math.floor(y);
  const rows = Math.floor(thickness);
  if (rows < 1) return;
  for (let row = row0; row < row0 + rows; row++) {
    for (let x = 0; x < buffer.width; x++) putPixel(buffer, x, row, rgb);
  }
}

export function stampStripe(buffer, x, width, rgb) {
  const col0 = Math.floor(x);
  const cols = Math.floor(width);
  if (cols < 1) return;
  for (let col = col0; col < col0 + cols; col++) {
    for (let y = 0; y < buffer.height; y++) putPixel(buffer, col, y, rgb);
  }
}

function putPixel(buffer, x, y, rgb) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return;
  if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return;
  const i = (y * buffer.width + x) * 4;
  buffer.data[i] = rgb.r;
  buffer.data[i + 1] = rgb.g;
  buffer.data[i + 2] = rgb.b;
  buffer.data[i + 3] = 255;
}

function emptyBuffer(width, height) {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

function fillBuffer(width, height, rgb) {
  const buffer = emptyBuffer(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) putPixel(buffer, x, y, rgb);
  }
  return buffer;
}

function band3(pos, span) {
  return Math.min(2, Math.floor(pos * 3 / span));
}

function paintVerticalStripes(width, height) {
  const buffer = emptyBuffer(width, height);
  for (let x = 0; x < width; x++) {
    const rgb = HUE_BINS[Math.min(12, Math.floor(x * 13 / width))];
    for (let y = 0; y < height; y++) putPixel(buffer, x, y, rgb);
  }
  return buffer;
}

function paintHorizontalStripes(width, height) {
  const buffer = emptyBuffer(width, height);
  const bands = [HUE_BINS[0], HUE_BINS[6], HUE_BINS[12]];
  for (let y = 0; y < height; y++) {
    const rgb = bands[band3(y, height)];
    for (let x = 0; x < width; x++) putPixel(buffer, x, y, rgb);
  }
  return buffer;
}

function paintCircle(width, height) {
  const buffer = fillBuffer(width, height, SAMPLE_RGB.black);
  stampDisc(
    buffer,
    Math.round(width / 2),
    Math.round(height / 2),
    Math.floor(Math.min(width, height) * 0.38),
    HUE_BINS[5],
  );
  return buffer;
}

function paintDots(width, height) {
  const buffer = fillBuffer(width, height, SAMPLE_RGB.black);
  const cy = Math.round(height / 2);
  const xs = [Math.round(width / 5), Math.round(width / 2), Math.round(4 * width / 5)];
  const keys = [0, 6, 12];
  for (let i = 0; i < xs.length; i++) stampDisc(buffer, xs[i], cy, 10, HUE_BINS[keys[i]]);
  return buffer;
}

function paintFrance(width, height) {
  const buffer = emptyBuffer(width, height);
  const bands = [HUE_BINS[11], SAMPLE_RGB.white, HUE_BINS[0]];
  for (let x = 0; x < width; x++) {
    const rgb = bands[band3(x, width)];
    for (let y = 0; y < height; y++) putPixel(buffer, x, y, rgb);
  }
  return buffer;
}

function paintGermany(width, height) {
  const buffer = emptyBuffer(width, height);
  const bands = [SAMPLE_RGB.black, HUE_BINS[0], HUE_BINS[2]];
  for (let y = 0; y < height; y++) {
    const rgb = bands[band3(y, height)];
    for (let x = 0; x < width; x++) putPixel(buffer, x, y, rgb);
  }
  return buffer;
}

function paintJapan(width, height) {
  const buffer = fillBuffer(width, height, SAMPLE_RGB.white);
  stampDisc(
    buffer,
    Math.round(width / 2),
    Math.round(height / 2),
    Math.floor(height * 0.3),
    HUE_BINS[0],
  );
  return buffer;
}

export const PRESETS = Object.freeze([
  Object.freeze({ id: 'vertical-stripes', label: 'Vertical stripes', paint: paintVerticalStripes }),
  Object.freeze({ id: 'horizontal-stripes', label: 'Horizontal stripes', paint: paintHorizontalStripes }),
  Object.freeze({ id: 'circle', label: 'Circle', center: true, paint: paintCircle }),
  Object.freeze({ id: 'dots', label: 'Dots', paint: paintDots }),
  Object.freeze({ id: 'france', label: 'France', paint: paintFrance }),
  Object.freeze({ id: 'germany', label: 'Germany', paint: paintGermany }),
  Object.freeze({ id: 'japan', label: 'Japan', center: true, paint: paintJapan }),
]);

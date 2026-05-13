'use strict';

// ─────────────────────────────────────────────────────────────
//  Spectrum — compute screen-space points for frequency spectrum
//
//  Returns an array of [x,y] point arrays (one per bar), each
//  forming a vertical bar as a 4-point polyline:
//    bottom-left → top-left → top-right → bottom-right
//
//  This format feeds directly into glr.frame(sets, …) like the
//  YT/XY/VS point arrays.
// ─────────────────────────────────────────────────────────────

/**
 * Compute screen-space points for a frequency spectrum display.
 *
 * @param {Float32Array} freqDataDb  dB values from analyser.getFloatFrequencyData
 *                                   (fftSize/2 bins, roughly -100..0 dB)
 * @param {number}       W           Canvas width in pixels
 * @param {number}       H           Canvas height in pixels
 * @param {object}       [opts]      Options
 * @param {number}       [opts.bars=64]      Number of frequency bars
 * @param {number}       [opts.minDb=-90]    dB floor (maps to y=H)
 * @param {number}       [opts.maxDb=-10]    dB ceiling (maps to y=0)
 * @param {number}       [opts.sampleRate=48000]  Audio sample rate
 * @returns {Array<Array<[number,number]>>}  Array of point-arrays (one per bar)
 */
export function computeSpectrumPoints(freqDataDb, W, H, opts = {}) {
  const {
    bars       = 64,
    minDb      = -90,
    maxDb      = -10,
    sampleRate = 48000,
  } = opts;

  const minFreq    = 20;
  const maxFreq    = 20000;
  const logMin     = Math.log10(minFreq);
  const logMax     = Math.log10(maxFreq);
  const freqPerBin = (sampleRate / 2) / freqDataDb.length;

  const dbRange  = maxDb - minDb;   // always positive
  const barW     = W / bars;
  const gap      = Math.max(1, barW * 0.15);  // small gap between bars

  const sets = [];

  for (let i = 0; i < bars; i++) {
    // Logarithmic frequency edges for this bar
    const lo = Math.pow(10, logMin + (i       / bars) * (logMax - logMin));
    const hi = Math.pow(10, logMin + ((i + 1) / bars) * (logMax - logMin));

    const binLo = Math.max(0,                    Math.floor(lo / freqPerBin));
    const binHi = Math.min(freqDataDb.length - 1, Math.ceil(hi  / freqPerBin));

    // Max dB over the bin range (loudest partial wins)
    let maxVal = -Infinity;
    for (let b = binLo; b <= binHi; b++) {
      if (freqDataDb[b] > maxVal) maxVal = freqDataDb[b];
    }

    // Clamp and normalise to 0..1
    const clamped    = Math.max(minDb, Math.min(maxDb, maxVal));
    const normalised = (clamped - minDb) / dbRange;

    // Canvas coordinates — bar occupies [x0, x1], height from bottom
    const x0     = i * barW + gap * 0.5;
    const x1     = (i + 1) * barW - gap * 0.5;
    const barTop = H * (1 - normalised);   // y=0 is top of canvas

    // 4-point polyline: bottom-left → top-left → top-right → bottom-right
    // (draws the outline of each bar; GL beam renderer will trace it)
    sets.push([
      [x0, H],
      [x0, barTop],
      [x1, barTop],
      [x1, H],
    ]);
  }

  return sets;
}

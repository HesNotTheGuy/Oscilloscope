'use strict';

// ─────────────────────────────────────────────────────────────
//  Spectrogram — scrolling frequency-over-time waterfall
//
//  Maintains a circular offscreen canvas (width=bins, height=history).
//  Each call to push() shifts the image up 1 px and paints a new row
//  at the bottom.  draw() blits the offscreen scaled to (W, H).
//
//  Heat ramp: black → beam-color (0..0.7 range) → white (0.7..1).
//  Color LUT is 256-entry, cached per hex string — no per-frame alloc.
// ─────────────────────────────────────────────────────────────

export class Spectrogram {
  /**
   * @param {number} bins    – horizontal resolution (frequency bins)
   * @param {number} history – vertical resolution (time rows)
   */
  constructor(bins = 96, history = 240) {
    this._bins    = bins;
    this._history = history;

    // Pre-allocated bin accumulator (reused each push)
    this._binBuf = new Float32Array(bins);

    // Offscreen canvas: width=bins, height=history
    this._oc  = document.createElement('canvas');
    this._oc.width  = bins;
    this._oc.height = history;
    this._octx = this._oc.getContext('2d');

    // Pre-allocated ImageData for the bottom row
    this._rowData = this._octx.createImageData(bins, 1);

    // Color LUT cache: hex → Uint8Array(256*3)
    this._lutCache    = null;
    this._lutCacheKey = '';
  }

  // ── Color LUT ────────────────────────────────────────────────
  // Returns a 256*3 flat array [r0,g0,b0, r1,g1,b1, …] mapping
  // 0–255 heat value to RGB.  black→color for 0..0.7, color→white
  // for 0.7..1.
  _getLUT(colorHex) {
    if (colorHex === this._lutCacheKey && this._lutCache) return this._lutCache;

    let cr = 0, cg = 255, cb = 65;  // fallback green
    if (colorHex && colorHex.startsWith('#') && colorHex.length >= 7) {
      cr = parseInt(colorHex.slice(1, 3), 16);
      cg = parseInt(colorHex.slice(3, 5), 16);
      cb = parseInt(colorHex.slice(5, 7), 16);
    }

    const lut = new Uint8Array(256 * 3);
    const PIVOT = 0.7;  // fraction at which beam color peaks

    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let r, g, b;
      if (t <= PIVOT) {
        // black → beam color
        const f = t / PIVOT;
        r = Math.round(cr * f);
        g = Math.round(cg * f);
        b = Math.round(cb * f);
      } else {
        // beam color → white
        const f = (t - PIVOT) / (1 - PIVOT);
        r = Math.round(cr + (255 - cr) * f);
        g = Math.round(cg + (255 - cg) * f);
        b = Math.round(cb + (255 - cb) * f);
      }
      lut[i * 3]     = r;
      lut[i * 3 + 1] = g;
      lut[i * 3 + 2] = b;
    }

    this._lutCache    = lut;
    this._lutCacheKey = colorHex;
    return lut;
  }

  // ── push ─────────────────────────────────────────────────────
  /**
   * Ingest one frame of frequency data and append a new row.
   *
   * @param {Float32Array} freqDataDb  – output of getFloatFrequencyData (dB)
   * @param {number}       sampleRate
   */
  push(freqDataDb, sampleRate) {
    const bins       = this._bins;
    const binBuf     = this._binBuf;
    const minFreq    = 20;
    const maxFreq    = 20000;
    const logMin     = Math.log10(minFreq);
    const logMax     = Math.log10(maxFreq);
    const freqPerBin = (sampleRate / 2) / freqDataDb.length;
    const minDb      = -90;
    const maxDb      = -10;
    const dbRange    = maxDb - minDb;

    // Log-spaced binning: same approach as spectrum.js but writing into binBuf
    for (let i = 0; i < bins; i++) {
      const lo    = Math.pow(10, logMin + (i       / bins) * (logMax - logMin));
      const hi    = Math.pow(10, logMin + ((i + 1) / bins) * (logMax - logMin));
      const binLo = Math.max(0, Math.floor(lo / freqPerBin));
      const binHi = Math.min(freqDataDb.length - 1, Math.ceil(hi / freqPerBin));

      let maxVal = -Infinity;
      for (let b = binLo; b <= binHi; b++) {
        if (freqDataDb[b] > maxVal) maxVal = freqDataDb[b];
      }
      // Clamp and normalise to 0..1
      const clamped    = maxVal < minDb ? minDb : (maxVal > maxDb ? maxDb : maxVal);
      binBuf[i]        = (clamped - minDb) / dbRange;
    }

    // Shift offscreen canvas up by 1 px, paint new row at bottom
    const octx    = this._octx;
    const history = this._history;

    // drawImage(self, …) shifts the existing content up 1 pixel
    octx.drawImage(this._oc, 0, -1);

    // Write new row into the pre-allocated ImageData
    const rowData = this._rowData;
    const px      = rowData.data;
    // Use a temporary LUT key — will be resolved in draw(); store nothing here.
    // We don't have colorHex at push time, so store the raw normalised values
    // into the ImageData as grayscale (0-255) and apply the LUT in draw().
    // HOWEVER: the spec says push() writes heat-mapped pixels, draw() just blits.
    // We handle this correctly: the LUT is applied here, so we need the color.
    // Since push() doesn't have colorHex, we store heat values as greyscale and
    // remap in draw(). But that would require a second pass every frame.
    //
    // Better approach: store normalised 0-255 in the R channel only; draw() does
    // the LUT remap before blitting. This avoids needing colorHex at push time
    // while keeping the ImageData pre-allocated.
    //
    // Encoding: px[i*4+0] = heat byte (0-255), G=B=0, A=255 (sentinel).
    // draw() scans for A==255 sentinel and applies LUT.
    //
    // Actually: simplest approach — push() takes colorHex too, OR we store the
    // normalised byte and do the LUT in draw().  We'll store normalised bytes
    // (A=255) and remap in draw() so push() stays colorHex-free.
    for (let i = 0; i < bins; i++) {
      const heat = Math.round(binBuf[i] * 255);
      const o    = i * 4;
      px[o]     = heat;
      px[o + 1] = 0;
      px[o + 2] = 0;
      px[o + 3] = 255;
    }
    octx.putImageData(rowData, 0, history - 1);
  }

  // ── draw ─────────────────────────────────────────────────────
  /**
   * Blit the waterfall onto an arbitrary 2D context.
   * Applies the heat-color LUT on the fly before blitting.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} W
   * @param {number} H
   * @param {string} colorHex  – beam color, e.g. '#00ff41'
   */
  draw(ctx, W, H, colorHex) {
    // Read back raw pixels from offscreen, remap via LUT, write to a
    // temporary ImageData, then blit that scaled to (W,H).
    // We use a second offscreen for the LUT-mapped output so we don't
    // destroy the greyscale heat data in this._oc.
    if (!this._mappedOc || this._mappedOc.width !== this._bins || this._mappedOc.height !== this._history) {
      this._mappedOc    = document.createElement('canvas');
      this._mappedOc.width  = this._bins;
      this._mappedOc.height = this._history;
      this._mappedOctx  = this._mappedOc.getContext('2d');
      this._mappedID    = this._mappedOctx.createImageData(this._bins, this._history);
    }

    const lut    = this._getLUT(colorHex);
    const src    = this._octx.getImageData(0, 0, this._bins, this._history);
    const srcPx  = src.data;
    const dstPx  = this._mappedID.data;
    const total  = this._bins * this._history;

    for (let i = 0; i < total; i++) {
      const heat = srcPx[i * 4];      // 0-255 stored in R channel
      const li   = heat * 3;
      dstPx[i * 4]     = lut[li];
      dstPx[i * 4 + 1] = lut[li + 1];
      dstPx[i * 4 + 2] = lut[li + 2];
      dstPx[i * 4 + 3] = 255;
    }

    this._mappedOctx.putImageData(this._mappedID, 0, 0);

    // Blit scaled to (W, H) with smooth interpolation
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._mappedOc, 0, 0, W, H);
    ctx.restore();
  }

  // ── clear ────────────────────────────────────────────────────
  /**
   * Wipe all history. Call when entering SG mode.
   */
  clear() {
    this._octx.clearRect(0, 0, this._bins, this._history);
    if (this._mappedOctx) {
      this._mappedOctx.clearRect(0, 0, this._bins, this._history);
    }
  }
}

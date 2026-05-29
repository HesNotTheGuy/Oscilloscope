'use strict';

// ─────────────────────────────────────────────────────────────
//  Vectorscope — L/R correlation as a polar pattern
//
//  Convention (standard broadcast vectorscope):
//    sx = (L - R) / sqrt(2)   → horizontal (out-of-phase = horizontal line)
//    sy = (L + R) / sqrt(2)   → vertical   (mono L=R   = vertical line)
//
//  Returns canvas-space [x, y] points given the canvas dimensions.
// ─────────────────────────────────────────────────────────────

const SQRT2 = Math.SQRT2;

/**
 * Compute vectorscope canvas points from L/R sample arrays.
 *
 * @param {Float32Array} dataL   Left channel samples (-1..1)
 * @param {Float32Array} dataR   Right channel samples (-1..1)
 * @param {number}       W       Canvas width in pixels
 * @param {number}       H       Canvas height in pixels
 * @param {number}       scale   Zoom scale (1 = full range fills half-canvas)
 * @param {Array<[number,number]>} [out]  Optional reusable output array.
 *        When provided it is grown/truncated to length n and its [x,y]
 *        pairs are mutated in place — avoids per-frame allocation.
 * @returns {Array<[number,number]>}  Canvas-space [x, y] point array
 */
export function computeVectorscopePoints(dataL, dataR, W, H, scale = 1, out = null) {
  const n  = Math.min(dataL.length, dataR.length);
  const cx = W / 2;
  const cy = H / 2;
  // Use the smaller half-dimension so the pattern fits in both axes
  const r  = Math.min(cx, cy) * scale;

  const pts = out || new Array(n);
  if (out) {
    while (pts.length < n) pts.push([0, 0]);
    if (pts.length > n) pts.length = n;
  }
  for (let i = 0; i < n; i++) {
    const l = dataL[i];
    const r2 = dataR[i];
    // Rotate XY plane 45° clockwise: mono → vertical, side → horizontal
    const sx =  (l - r2) / SQRT2;   // horizontal axis
    const sy =  (l + r2) / SQRT2;   // vertical axis (positive = up)
    const x = cx + sx * r, y = cy - sy * r;
    if (out) { const p = pts[i]; p[0] = x; p[1] = y; }
    else pts[i] = [x, y];
  }
  return pts;
}

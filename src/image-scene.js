'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  ImageScene  —  samples image pixels into phosphor trace points.
//  Transforms + music-reactivity properties mirror ObjScene for uniform UI.
// ─────────────────────────────────────────────────────────────────────────────
export class ImageScene {
  constructor() {
    this.loaded    = false;
    this.name      = '';
    this._img      = new Image();

    // Transforms — normalized coords matching ObjScene
    this.rotZ      = 0;    // spin, degrees
    this.tiltX     = 0;    // perspective squash Y axis (degrees)
    this.tiltY     = 0;    // perspective squash X axis (degrees)
    this.scale     = 0.8;
    this.posX      = 0;    // normalized [-0.8, 0.8] — same scale as ObjScene
    this.posY      = 0;

    // Trace settings
    this.traceMode = 'edges';   // 'outline' | 'edges' | 'lum'
    this.threshold = 40;
    this.sampleRes = 96;

    // Shared music-reactivity (property names match ObjScene)
    this.autoSpin  = false;
    this.rotSpeed  = 0.5;   // deg/frame
    this.beatPulse = true;
    this.showAudio = false;

    // True 3D rotation of image plane (degrees) — replaces tiltX/tiltY approx
    this.rotX3d      = 0;     // rotation around X axis
    this.rotY3d      = 0;     // rotation around Y axis
    // Per-axis auto-rotation
    this.autoRotX3d  = false;
    this.rotSpeedX3d = 0.5;   // deg/frame for X3D
    this.autoRotY3d  = false;
    this.rotSpeedY3d = 0.5;   // deg/frame for Y3D
    // rotSpeed (existing) drives Z spin (autoSpin)

    // Music-sync animation modes
    this.breathe   = false;
    this.shake     = false;
    this.warp      = false;
    this.warpAmt   = 0.1;
    this.audioSketch = false;  // audio amplitude modulates trace density (loud=dense, quiet=sparse)

    // Tiling & radial symmetry (shared with ObjScene)
    this.tileX     = 1;   // grid columns (1-5)
    this.tileY     = 1;   // grid rows (1-5)
    this.radialN   = 1;   // rotated copies arranged in a ring (1-8)

    // Infinite scroll (tile steps per second; wraps seamlessly with tiling)
    this.scrollX   = 0;
    this.scrollY   = 0;

    // Draw power — 0: blank, 1: fully drawn (slices trace point array)
    this.power      = 1;
    this.autoPower  = false;
    this.powerSpeed = 0.004;
    this.powerLoop  = false;

    // Movement FX (applied post-projection; shared amt/speed controls all active effects)
    this.float       = false;  // sinusoidal XY drift
    this.ripple      = false;  // expanding ring wave displaces points radially
    this.twist       = false;  // rotate points by amount proportional to distance from center
    this.explode     = false;  // push points outward; loops back to center
    this.motionAmt   = 0.2;   // shared intensity (0–1)
    this.motionSpeed = 1.0;   // shared speed multiplier
    this.explodeLoop = false;  // auto-restart explosion

    // Internal state
    this._pulse      = 0;
    this._breatheSc  = 1;
    this._shakeX     = 0;
    this._shakeY     = 0;
    this._traceNorm  = [];
    this._scrollOffX = 0;
    this._scrollOffY = 0;
    this._lastScrollT = 0;
    this._lastRotT   = 0;   // for time-based rotation
    // Movement FX phases
    this._floatPhX   = 0;
    this._floatPhY   = 1.3;
    this._ripplePh   = 0;
    this._twistPh    = 0;
    this._explodeT   = 0;
    this._lastFxT    = 0;
  }

  load(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = ev => {
        this._img.onload  = () => {
          this.loaded = true;
          this.name   = file.name;
          this._computeTrace();
          resolve(true);
        };
        this._img.onerror = () => resolve(false);
        this._img.src = ev.target.result;
      };
      reader.onerror = () => resolve(false);
      reader.readAsDataURL(file);
    });
  }

  _computeTrace() {
    if (!this.loaded) return;
    const iW = this._img.naturalWidth;
    const iH = this._img.naturalHeight;
    if (!iW || !iH) return;

    const sW = this.sampleRes;
    const sH = Math.max(1, Math.round(sW * iH / iW));

    let data;
    try {
      const oc  = new OffscreenCanvas(sW, sH);
      const ctx = oc.getContext('2d');
      ctx.drawImage(this._img, 0, 0, sW, sH);
      data = ctx.getImageData(0, 0, sW, sH).data;
    } catch (e) {
      console.warn('ImageScene._computeTrace failed:', e);
      return;
    }

    const getAlpha = (x, y) => {
      if (x < 0 || x >= sW || y < 0 || y >= sH) return 0;
      return data[(y * sW + x) * 4 + 3];
    };
    const getLum = (x, y) => {
      if (x < 0 || x >= sW || y < 0 || y >= sH) return 0;
      const i = (y * sW + x) * 4;
      const a = data[i + 3] / 255;
      return (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * a;
    };

    const pts = [];
    const thr = this.threshold;

    if (this.traceMode === 'outline') {
      // Alpha-boundary trace — opaque pixels with ≥1 transparent 8-neighbour
      const alphaThr = Math.max(10, thr);
      for (let y = 0; y < sH; y++) {
        for (let x = 0; x < sW; x++) {
          if (getAlpha(x, y) >= alphaThr) {
            if (getAlpha(x-1, y)   < alphaThr || getAlpha(x+1, y)   < alphaThr ||
                getAlpha(x,   y-1) < alphaThr || getAlpha(x,   y+1) < alphaThr ||
                getAlpha(x-1, y-1) < alphaThr || getAlpha(x+1, y-1) < alphaThr ||
                getAlpha(x-1, y+1) < alphaThr || getAlpha(x+1, y+1) < alphaThr) {
              pts.push([(x / (sW - 1)) - 0.5, (y / (sH - 1)) - 0.5]);
            }
          }
        }
      }
    } else if (this.traceMode === 'lum') {
      for (let y = 0; y < sH; y++) {
        for (let x = 0; x < sW; x++) {
          if (getLum(x, y) >= thr) {
            pts.push([(x / (sW - 1)) - 0.5, (y / (sH - 1)) - 0.5]);
          }
        }
      }
    } else {
      // Sobel edge detection
      for (let y = 1; y < sH - 1; y++) {
        for (let x = 1; x < sW - 1; x++) {
          const gx = -getLum(x-1, y-1) + getLum(x+1, y-1)
                    - 2*getLum(x-1, y)  + 2*getLum(x+1, y)
                    - getLum(x-1, y+1)  + getLum(x+1, y+1);
          const gy = -getLum(x-1, y-1) - 2*getLum(x, y-1) - getLum(x+1, y-1)
                    + getLum(x-1, y+1)  + 2*getLum(x, y+1) + getLum(x+1, y+1);
          if (Math.sqrt(gx * gx + gy * gy) >= thr) {
            pts.push([(x / (sW - 1)) - 0.5, (y / (sH - 1)) - 0.5]);
          }
        }
      }
    }

    // Lum mode: points are scattered across filled areas, not contours.
    // Nearest-neighbor sort would create jagged cross-image jumps.
    // Scan order (row-by-row) naturally produces clean horizontal runs —
    // adjacent bright pixels connect, dark gaps break the path correctly.
    if (this.traceMode === 'lum') {
      this._traceNorm = pts;
      return;
    }

    // Outline / Edges: sort points into a continuous path via greedy nearest-neighbor
    // This turns scattered edge pixels into connected lines
    if (pts.length > 1) {
      const sorted = [pts[0]];
      const used = new Uint8Array(pts.length);
      used[0] = 1;
      let cur = pts[0];

      // Build spatial grid for fast neighbor lookup
      const cellSize = 3.0 / Math.sqrt(pts.length);  // adaptive cell size
      const grid = new Map();
      const toKey = (x, y) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
      for (let i = 0; i < pts.length; i++) {
        const key = toKey(pts[i][0], pts[i][1]);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }

      for (let n = 1; n < pts.length; n++) {
        const cx = cur[0], cy = cur[1];
        const gx = Math.floor(cx / cellSize), gy = Math.floor(cy / cellSize);
        let bestD = Infinity, bestIdx = -1;

        // Search 3x3 neighborhood of grid cells
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const key = `${gx + dx},${gy + dy}`;
            const cell = grid.get(key);
            if (!cell) continue;
            for (const idx of cell) {
              if (used[idx]) continue;
              const ddx = pts[idx][0] - cx, ddy = pts[idx][1] - cy;
              const d = ddx * ddx + ddy * ddy;
              if (d < bestD) { bestD = d; bestIdx = idx; }
            }
          }
        }

        // Fallback: if no neighbor found in nearby cells, scan all
        if (bestIdx === -1) {
          for (let i = 0; i < pts.length; i++) {
            if (used[i]) continue;
            const ddx = pts[i][0] - cx, ddy = pts[i][1] - cy;
            const d = ddx * ddx + ddy * ddy;
            if (d < bestD) { bestD = d; bestIdx = i; }
          }
        }

        if (bestIdx === -1) break;
        used[bestIdx] = 1;
        cur = pts[bestIdx];
        sorted.push(cur);
      }

      this._traceNorm = sorted;
    } else {
      this._traceNorm = pts;
    }
  }

  // Returns [[sx0,sy0],[sx1,sy1]] segments for the GL/2D renderer.
  // audioBuf: Float32Array time-domain samples from the analyser (for Warp mode)
  getTracePoints(W, H, rms = 0, beat = false, audioBuf = null) {
    if (!this.loaded || !this._traceNorm.length) return [];

    // Auto-ramp draw power
    if (this.autoPower) {
      this.power += this.powerSpeed;
      if (this.power >= 1) this.power = this.powerLoop ? 0 : 1;
    }

    // Time-based auto-rotation (independent of frame rate)
    const _now = performance.now() / 1000;
    const _dt  = this._lastRotT > 0 ? Math.min(_now - this._lastRotT, 0.05) : 1/60;
    this._lastRotT = _now;
    const _dps = _dt * 60;  // normalize: speed values were tuned for ~60fps
    if (this.autoRotX3d) this.rotX3d = (this.rotX3d + this.rotSpeedX3d * _dps) % 360;
    if (this.autoRotY3d) this.rotY3d = (this.rotY3d + this.rotSpeedY3d * _dps) % 360;
    if (this.autoSpin) this.rotZ = (this.rotZ + this.rotSpeed * _dps) % 360;

    // Beat pulse
    if (beat && this.beatPulse) this._pulse = 0.3;
    if (this._pulse > 0.001)    this._pulse *= 0.82;

    // Breathe
    this._breatheSc = this._breatheSc * 0.88 + (this.breathe ? 1 + rms * 2.5 : 1) * 0.12;

    // Shake
    if (beat && this.shake) {
      const h = Math.min(W, H) * 0.45;
      this._shakeX = (Math.random() - 0.5) * h * 0.12;
      this._shakeY = (Math.random() - 0.5) * h * 0.12;
    }
    this._shakeX *= 0.7;
    this._shakeY *= 0.7;

    const sc   = this.scale * (1 + this._pulse) * this._breatheSc;
    const cosR = Math.cos(this.rotZ * Math.PI / 180);
    const sinR = Math.sin(this.rotZ * Math.PI / 180);
    const half = Math.min(W, H) * 0.45;
    const cx   = W / 2 + this.posX * half + this._shakeX;
    const cy   = H / 2 - this.posY * half + this._shakeY;

    const iW   = this._img.naturalWidth  || 1;
    const iH   = this._img.naturalHeight || 1;
    const fit  = Math.min(W * 0.85 / iW, H * 0.85 / iH);
    const fitX = iW * fit * sc;
    const fitY = iH * fit * sc;

    // True 3D rotation — rotate the image plane around X and Y axes
    const cosX3 = Math.cos(this.rotX3d * Math.PI / 180);
    const sinX3 = Math.sin(this.rotX3d * Math.PI / 180);
    const cosY3 = Math.cos(this.rotY3d * Math.PI / 180);
    const sinY3 = Math.sin(this.rotY3d * Math.PI / 180);
    const fov3d = 2.0;   // perspective depth (normalized units)

    const bufLen    = audioBuf ? audioBuf.length : 0;
    const drawCount = Math.floor(Math.max(0, Math.min(1, this.power)) * this._traceNorm.length);

    // Transform all visible trace points to screen space
    const _xform = (nx, ny) => {
      // Warp
      if (this.warp && bufLen > 0) {
        const angle = Math.atan2(ny, nx);
        const sIdx  = Math.floor(((angle / (Math.PI * 2)) + 0.5) * bufLen) % bufLen;
        const d     = audioBuf[sIdx] * this.warpAmt;
        const dist  = Math.sqrt(nx * nx + ny * ny) || 0.001;
        nx += (nx / dist) * d;
        ny += (ny / dist) * d;
      }

      // 3D rotation of image plane (Y-axis then X-axis, then perspective divide)
      let x3 = nx, y3 = ny, z3 = 0;
      const x3r = x3 * cosY3 + z3 * sinY3;
      z3 = -x3 * sinY3 + z3 * cosY3;  x3 = x3r;
      const y3r = y3 * cosX3 - z3 * sinX3;
      z3 = y3 * sinX3 + z3 * cosX3;   y3 = y3r;
      if (z3 <= -(fov3d - 0.01)) return null;   // behind camera
      const persp = fov3d / (fov3d + z3);
      nx = x3 * persp;
      ny = y3 * persp;

      // Scale → spin rotation → screen
      const px = nx * fitX;
      const py = ny * fitY;
      return [cx + (px * cosR - py * sinR), cy + (px * sinR + py * cosR)];
    };

    // Build connected line segments between consecutive sorted points
    // Break the path when the gap between points is too large (separate strokes)
    const maxGap = Math.min(fitX, fitY) * 0.08;  // max pixel gap before breaking
    const maxGapSq = maxGap * maxGap;

    // Audio Sketch: use audio waveform to modulate which sections of the trace are drawn
    // Loud audio → draw that section, quiet → skip it (creates organic reveal effect)
    const useSketch = this.audioSketch && bufLen > 0;

    const result = [];
    let prev = null;
    for (let i = 0; i < drawCount; i++) {
      // Audio sketch: map trace position to audio buffer, skip if amplitude is low
      if (useSketch) {
        const aIdx = Math.floor((i / drawCount) * bufLen) % bufLen;
        const amp = Math.abs(audioBuf[aIdx]);
        if (amp < 0.05) { prev = null; continue; }  // skip quiet segments
      }

      const [nx, ny] = this._traceNorm[i];
      const pt = _xform(nx, ny);
      if (!pt) { prev = null; continue; }
      if (prev) {
        const dx = pt[0] - prev[0], dy = pt[1] - prev[1];
        if (dx * dx + dy * dy < maxGapSq) {
          result.push([prev, pt]);
        }
      }
      prev = pt;
    }

    // Radial symmetry — N rotated copies arranged in a ring
    if (this.radialN > 1) {
      const sym = [];
      for (let i = 0; i < this.radialN; i++) {
        const a = (i / this.radialN) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        for (const [[x0,y0],[x1,y1]] of result) {
          const dx0=x0-cx, dy0=y0-cy, dx1=x1-cx, dy1=y1-cy;
          sym.push([
            [cx + dx0*ca - dy0*sa, cy + dx0*sa + dy0*ca],
            [cx + dx1*ca - dy1*sa, cy + dx1*sa + dy1*ca]
          ]);
        }
      }
      return this._applyMoveFx(sym, W, H);
    }

    // Tiling + infinite scroll (scroll wraps seamlessly within the tile period)
    const hasScroll = this.scrollX !== 0 || this.scrollY !== 0;
    const hasTile   = this.tileX > 1 || this.tileY > 1;
    if (hasTile || hasScroll) {
      const stepX = fitX * 1.08;
      const stepY = fitY * 1.08;

      if (hasScroll) {
        const now = performance.now() / 1000;
        const dt  = this._lastScrollT > 0 ? Math.min(now - this._lastScrollT, 0.05) : 0;
        this._lastScrollT = now;
        this._scrollOffX = ((this._scrollOffX + this.scrollX * stepX * dt) % stepX + stepX) % stepX;
        this._scrollOffY = ((this._scrollOffY + this.scrollY * stepY * dt) % stepY + stepY) % stepY;
      }

      const extraX = this.scrollX !== 0 ? 1 : 0;
      const extraY = this.scrollY !== 0 ? 1 : 0;
      const totalX = Math.max(this.tileX, 1) + extraX * 2;
      const totalY = Math.max(this.tileY, 1) + extraY * 2;
      const tileCount = totalX * totalY;

      // Cap total segments to avoid lag — downsample source if needed
      const MAX_SEGS = 80000;
      const srcLen = result.length;
      const stride = Math.max(1, Math.ceil(srcLen * tileCount / MAX_SEGS));

      const tiled = [];
      for (let ty = 0; ty < totalY; ty++) {
        for (let tx = 0; tx < totalX; tx++) {
          const offX = (tx - (totalX - 1) / 2) * stepX + this._scrollOffX;
          const offY = (ty - (totalY - 1) / 2) * stepY + this._scrollOffY;
          for (let si = 0; si < srcLen; si += stride) {
            const [[x0,y0],[x1,y1]] = result[si];
            tiled.push([[x0+offX, y0+offY], [x1+offX, y1+offY]]);
          }
        }
      }
      return this._applyMoveFx(tiled, W, H);
    }

    return this._applyMoveFx(result, W, H);
  }

  // ── Movement FX — applied to final screen-space segments ─────────────
  // Identical implementation to ObjScene._applyMoveFx (both share motionAmt/motionSpeed).
  _applyMoveFx(segs, W, H) {
    const hasAny = this.float || this.ripple || this.twist || this.explode;
    if (!hasAny || !segs.length) return segs;

    const now = performance.now() / 1000;
    const dt  = this._lastFxT > 0 ? Math.min(now - this._lastFxT, 0.05) : 1/60;
    this._lastFxT = now;

    const cx   = W / 2, cy = H / 2;
    const half = Math.min(W, H) * 0.45;
    const amt  = this.motionAmt;
    const spd  = this.motionSpeed;

    // ── Float: advance dual-phase oscillator ──
    if (this.float) {
      this._floatPhX += spd * 0.5  * dt * Math.PI * 2;
      this._floatPhY += spd * 0.31 * dt * Math.PI * 2;
    }
    const floatX = this.float ? Math.sin(this._floatPhX) * amt * 0.3 * half : 0;
    const floatY = this.float ? Math.sin(this._floatPhY) * amt * 0.3 * half : 0;

    // ── Ripple: expanding ring wave ──
    if (this.ripple) this._ripplePh += spd * dt;

    // ── Twist: wind/unwind angle ──
    if (this.twist) this._twistPh += spd * 0.4 * dt;

    // ── Explode: push outward then reset ──
    let explodeF = 0;
    if (this.explode) {
      this._explodeT += spd * 0.3 * dt;
      if (this._explodeT >= 1) {
        if (this.explodeLoop) this._explodeT = 0;
        else this._explodeT = 1;
      }
      const t = this._explodeT;
      explodeF = (t < 0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2) * amt * 1.5 * half;
    }

    const rippleWaves = 3;

    return segs.map(([[x0,y0],[x1,y1]]) => {
      let ax = x0, ay = y0, bx = x1, by = y1;

      if (this.ripple) {
        const rp = (x, y) => {
          const dx = x - cx, dy = y - cy;
          const dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
          const phase = (dist / half) * rippleWaves * Math.PI * 2 - this._ripplePh * Math.PI * 2;
          const disp  = Math.sin(phase) * amt * 0.25 * half;
          return [x + (dx/dist) * disp, y + (dy/dist) * disp];
        };
        [ax, ay] = rp(ax, ay);
        [bx, by] = rp(bx, by);
      }

      if (this.twist) {
        const tp = (x, y) => {
          const dx = x - cx, dy = y - cy;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const angle = (dist / half) * amt * Math.PI * 1.5 + this._twistPh;
          const cos = Math.cos(angle), sin = Math.sin(angle);
          return [cx + dx*cos - dy*sin, cy + dx*sin + dy*cos];
        };
        [ax, ay] = tp(ax, ay);
        [bx, by] = tp(bx, by);
      }

      ax += floatX; ay += floatY;
      bx += floatX; by += floatY;

      if (explodeF > 0) {
        const ep = (x, y) => {
          const dx = x - cx, dy = y - cy;
          const dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
          return [x + (dx/dist) * explodeF, y + (dy/dist) * explodeF];
        };
        [ax, ay] = ep(ax, ay);
        [bx, by] = ep(bx, by);
      }

      return [[ax, ay], [bx, by]];
    });
  }
}

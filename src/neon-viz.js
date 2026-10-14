'use strict';

// Neon tree visualizer — band energy, onset hits, and a spiral playhead.
// Math only plus Canvas 2D. No third-party drawing libraries.

export const DEFAULT_BAND_COUNT = 20;
export const DEFAULT_SPIRAL_TURNS = 4;
export const DEFAULT_MIN_HZ = 20;
export const DEFAULT_MAX_HZ = 20000;
export const DEFAULT_MIN_DB = -90;
export const DEFAULT_MAX_DB = -10;
export const DEFAULT_LOOP_SECONDS = 32;

function clamp01(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function hzToBin(hz, binCount, sampleRate) {
  if (binCount <= 0 || sampleRate <= 0) return 0;
  const nyquist = sampleRate / 2;
  const bin = Math.floor((hz / nyquist) * binCount);
  if (bin < 0) return 0;
  if (bin > binCount - 1) return binCount - 1;
  return bin;
}

/**
 * Split analyser dB bins into log-spaced bands.
 * Index 0 is bass (lowest Hz); the last index is the highs.
 *
 * @param {Float32Array|number[]} freqDataDb
 * @param {number} sampleRate
 * @param {object} [opts]
 * @returns {{ energies: Float32Array, loHz: Float32Array, hiHz: Float32Array }}
 */
export function splitFrequencyBands(freqDataDb, sampleRate, opts = {}) {
  const bandCount = opts.bandCount || DEFAULT_BAND_COUNT;
  const minHz = opts.minHz ?? DEFAULT_MIN_HZ;
  const maxHz = opts.maxHz ?? DEFAULT_MAX_HZ;
  const minDb = opts.minDb ?? DEFAULT_MIN_DB;
  const maxDb = opts.maxDb ?? DEFAULT_MAX_DB;
  const dbRange = maxDb - minDb;

  const energies = new Float32Array(bandCount);
  const loHz = new Float32Array(bandCount);
  const hiHz = new Float32Array(bandCount);

  if (!freqDataDb || freqDataDb.length < 1 || !(sampleRate > 0) || dbRange <= 0) {
    return { energies, loHz, hiHz };
  }

  const nBins = freqDataDb.length;
  const logMin = Math.log10(Math.max(1, minHz));
  const logMax = Math.log10(Math.max(minHz + 1, maxHz));

  for (let i = 0; i < bandCount; i++) {
    const lo = Math.pow(10, logMin + (i / bandCount) * (logMax - logMin));
    const hi = Math.pow(10, logMin + ((i + 1) / bandCount) * (logMax - logMin));
    loHz[i] = lo;
    hiHz[i] = hi;

    const binLo = hzToBin(lo, nBins, sampleRate);
    const binHi = Math.max(binLo, hzToBin(hi, nBins, sampleRate));

    let peak = -Infinity;
    let sum = 0;
    let count = 0;
    for (let b = binLo; b <= binHi; b++) {
      const v = freqDataDb[b];
      if (v > peak) peak = v;
      sum += v;
      count++;
    }
    if (count === 0 || peak === -Infinity) {
      energies[i] = 0;
      continue;
    }
    const mixed = peak * 0.7 + (sum / count) * 0.3;
    energies[i] = clamp01((mixed - minDb) / dbRange);
  }

  return { energies, loHz, hiHz };
}

/**
 * Per-band onset detector: half-wave spectral flux vs a running mean,
 * with a short cooldown so one hit does not spray forever.
 */
export class OnsetDetector {
  constructor(opts = {}) {
    this.bandCount = opts.bandCount || DEFAULT_BAND_COUNT;
    this.sensitivity = opts.sensitivity ?? 1.65;
    this.minFlux = opts.minFlux ?? 0.045;
    this.minEnergy = opts.minEnergy ?? 0.08;
    this.cooldownFrames = opts.cooldownFrames ?? 10;
    this._prev = new Float32Array(this.bandCount);
    this._mean = new Float32Array(this.bandCount);
    this._cool = new Uint8Array(this.bandCount);
    this._filled = false;
  }

  reset() {
    this._prev.fill(0);
    this._mean.fill(0);
    this._cool.fill(0);
    this._filled = false;
  }

  /**
   * @param {Float32Array|number[]} energies  0..1 per band
   * @returns {{ hits: Uint8Array, flux: Float32Array, any: boolean }}
   */
  detect(energies) {
    const n = this.bandCount;
    const hits = new Uint8Array(n);
    const flux = new Float32Array(n);
    let any = false;

    if (!energies || energies.length < n) {
      return { hits, flux, any };
    }

    if (!this._filled) {
      for (let i = 0; i < n; i++) {
        this._prev[i] = energies[i];
        this._mean[i] = energies[i];
      }
      this._filled = true;
      return { hits, flux, any };
    }

    for (let i = 0; i < n; i++) {
      if (this._cool[i] > 0) this._cool[i]--;
      const e = energies[i];
      const rise = e - this._prev[i];
      const f = rise > 0 ? rise : 0;
      flux[i] = f;
      this._mean[i] = this._mean[i] * 0.88 + f * 0.12;
      const thresh = Math.max(this.minFlux, this._mean[i] * this.sensitivity);
      if (f > thresh && e > this.minEnergy && this._cool[i] === 0) {
        hits[i] = 1;
        any = true;
        this._cool[i] = this.cooldownFrames;
      }
      this._prev[i] = e;
    }

    return { hits, flux, any };
  }
}

/**
 * Map a playback time onto an Archimedean spiral (r grows with time).
 * t = 0 sits on the inner ring; t = duration sits on the outer ring.
 *
 * @returns {{ x: number, y: number, theta: number, radius: number, tNorm: number }}
 */
export function mapTimeToSpiral(time, duration, width, height, opts = {}) {
  const turns = opts.turns ?? DEFAULT_SPIRAL_TURNS;
  const innerRatio = opts.innerRatio ?? 0.06;
  const outerRatio = opts.outerRatio ?? 0.42;
  const startAngle = opts.startAngle ?? -Math.PI / 2;
  const dur = duration > 0 ? duration : 1;
  const tNorm = clamp01(time / dur);
  const theta = startAngle + tNorm * turns * Math.PI * 2;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const minDim = Math.min(width, height);
  const r0 = minDim * innerRatio;
  const r1 = minDim * outerRatio;
  const radius = r0 + (r1 - r0) * tNorm;
  return {
    x: cx + radius * Math.cos(theta),
    y: cy + radius * Math.sin(theta),
    theta,
    radius,
    tNorm,
  };
}

export function sampleSpiralPath(duration, width, height, steps, opts = {}) {
  const n = Math.max(2, steps | 0);
  const pts = new Array(n + 1);
  const dur = duration > 0 ? duration : 1;
  for (let i = 0; i <= n; i++) {
    pts[i] = mapTimeToSpiral(dur * (i / n), dur, width, height, opts);
  }
  return pts;
}

/**
 * Horizontal branch from a vertical spine. Bass (index 0) is at the bottom.
 */
export function layoutBranch(index, bandCount, energy, width, height, opts = {}) {
  const n = Math.max(1, bandCount);
  const marginY = opts.marginY ?? height * 0.1;
  const marginX = opts.marginX ?? width * 0.1;
  const spineX = width * 0.5;
  const usableH = Math.max(1, height - marginY * 2);
  const t = n <= 1 ? 0 : index / (n - 1);
  const spineY = height - marginY - t * usableH;
  const side = index % 2 === 0 ? -1 : 1;
  const minLen = (width / 2 - marginX) * 0.3;
  const maxLen = (width / 2 - marginX) * 0.94;
  const e = clamp01(energy);
  const length = minLen + (maxLen - minLen) * e;
  return {
    spineX,
    spineY,
    nodeX: spineX + side * length,
    nodeY: spineY,
    side,
    length,
  };
}

/**
 * Playback cursor for the spiral. A loaded buffer uses its duration;
 * live sources (mic, idle, generator) loop a fixed window.
 */
export function getPlaybackTimeline(engine, nowSec) {
  const fallbackNow = (typeof nowSec === 'number')
    ? nowSec
    : (engine && engine.actx ? engine.actx.currentTime : 0);

  if (engine && engine.buffer && engine.buffer.duration > 0) {
    const duration = engine.buffer.duration;
    let t = 0;
    if (typeof engine.getCurrentTime === 'function') t = engine.getCurrentTime();
    t = t % duration;
    if (t < 0) t += duration;
    return { t, duration, looping: true, source: 'buffer' };
  }

  const duration = DEFAULT_LOOP_SECONDS;
  let t = fallbackNow % duration;
  if (t < 0) t += duration;
  return { t, duration, looping: true, source: 'live' };
}

function hueRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
}

function bandColor(index, bandCount, flash) {
  const t = bandCount <= 1 ? 0 : index / (bandCount - 1);
  // Cyan (bass) → magenta (highs)
  const h = 188 - t * 128;
  const s = 0.95;
  const l = 0.54 + flash * 0.28;
  const [r, g, b] = hueRgb(h, s, l);
  return `rgb(${r},${g},${b})`;
}

function formatTime(sec) {
  if (!(sec >= 0)) return '–';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}

/**
 * Canvas renderer for branch + spiral views, with a downsampled bloom pass.
 */
export class NeonViz {
  constructor(opts = {}) {
    this.bandCount = opts.bandCount || DEFAULT_BAND_COUNT;
    this.view = 'branch';
    this.markerA = null;
    this.markerB = null;
    this.onset = new OnsetDetector({ bandCount: this.bandCount });
    this._smooth = new Float32Array(this.bandCount);
    this._flash = new Float32Array(this.bandCount);
    this._particles = [];
    this._trail = [];
    this._bands = null;
    this._onset = null;
    this._timeline = { t: 0, duration: DEFAULT_LOOP_SECONDS, looping: true, source: 'live' };
    this._lastMs = 0;
    this._scene = null;
    this._sctx = null;
    this._bloom = null;
    this._bctx = null;
  }

  setView(view) {
    this.view = view === 'spiral' ? 'spiral' : 'branch';
    if (this.view === 'branch') this._trail.length = 0;
  }

  markA(time) { this.markerA = time; }
  markB(time) { this.markerB = time; }

  step(freqDataDb, sampleRate, timeline, nowMs) {
    const now = typeof nowMs === 'number'
      ? nowMs
      : (typeof performance !== 'undefined' ? performance.now() : 0);
    const dt = this._lastMs ? Math.min(0.05, (now - this._lastMs) / 1000) : 0.016;
    this._lastMs = now;
    if (timeline) this._timeline = timeline;

    const bands = splitFrequencyBands(freqDataDb, sampleRate, { bandCount: this.bandCount });
    this._bands = bands;
    const onset = this.onset.detect(bands.energies);
    this._onset = onset;

    for (let i = 0; i < this.bandCount; i++) {
      const e = bands.energies[i];
      this._smooth[i] += (e - this._smooth[i]) * 0.38;
      this._flash[i] *= 0.82;
      if (onset.hits[i]) this._flash[i] = 1;
    }

    // Age particles
    const parts = this._particles;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.life -= dt * 1.35;
      if (p.life <= 0) parts.splice(i, 1);
    }

    return { bands, onset, dt };
  }

  _spawnHits(width, height) {
    const onset = this._onset;
    if (!onset || !onset.any) return;
    const n = this.bandCount;
    for (let i = 0; i < n; i++) {
      if (!onset.hits[i]) continue;
      const loc = layoutBranch(i, n, this._smooth[i], width, height);
      const count = 7 + Math.round(this._smooth[i] * 8);
      const t = n <= 1 ? 0 : i / (n - 1);
      const hue = 188 - t * 128;
      for (let k = 0; k < count; k++) {
        if (this._particles.length >= 360) return;
        const ang = (Math.random() - 0.5) * Math.PI + (loc.side < 0 ? Math.PI : 0);
        const sp = 70 + Math.random() * 220;
        this._particles.push({
          x: loc.nodeX,
          y: loc.nodeY,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp * 0.55 - 40,
          life: 0.7 + Math.random() * 0.5,
          hue,
          size: 1.4 + Math.random() * 2.4,
        });
      }
    }
  }

  _ensureBufs(width, height) {
    if (!this._scene || this._scene.width !== width || this._scene.height !== height) {
      this._scene = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
      if (!this._scene) return false;
      this._scene.width = width;
      this._scene.height = height;
      this._sctx = this._scene.getContext('2d');
    }
    const bw = Math.max(1, width >> 2);
    const bh = Math.max(1, height >> 2);
    if (!this._bloom || this._bloom.width !== bw || this._bloom.height !== bh) {
      this._bloom = document.createElement('canvas');
      this._bloom.width = bw;
      this._bloom.height = bh;
      this._bctx = this._bloom.getContext('2d');
    }
    return true;
  }

  draw(ctx, width, height) {
    if (!ctx || width < 8 || height < 8) return;
    if (!this._ensureBufs(width, height)) return;

    if (this.view === 'branch') this._spawnHits(width, height);

    const s = this._sctx;
    s.clearRect(0, 0, width, height);
    s.fillStyle = '#03050a';
    s.fillRect(0, 0, width, height);

    if (this.view === 'spiral') this._drawSpiral(s, width, height);
    else this._drawBranch(s, width, height);

    this._drawParticles(s);

    // Bloom: downscale + blur, then add back under the sharp scene.
    const b = this._bctx;
    b.clearRect(0, 0, this._bloom.width, this._bloom.height);
    b.drawImage(this._scene, 0, 0, this._bloom.width, this._bloom.height);

    ctx.fillStyle = '#03050a';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    try {
      ctx.filter = 'blur(10px)';
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this._bloom, 0, 0, width, height);
      ctx.filter = 'blur(22px)';
      ctx.globalAlpha = 0.45;
      ctx.drawImage(this._bloom, 0, 0, width, height);
    } catch (_) {
      ctx.filter = 'none';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this._bloom, 0, 0, width, height);
    }
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this._scene, 0, 0);
    ctx.restore();
  }

  _drawBranch(s, width, height) {
    const n = this.bandCount;
    const top = layoutBranch(n - 1, n, 0, width, height);
    const bot = layoutBranch(0, n, 0, width, height);

    // Spine
    s.save();
    s.strokeStyle = 'rgba(120, 255, 230, 0.85)';
    s.lineWidth = 3.2;
    s.shadowColor = 'rgba(80, 255, 220, 0.9)';
    s.shadowBlur = 18;
    s.lineCap = 'round';
    s.beginPath();
    s.moveTo(bot.spineX, bot.spineY + 10);
    s.lineTo(top.spineX, top.spineY - 10);
    s.stroke();
    s.restore();

    for (let i = 0; i < n; i++) {
      const e = this._smooth[i] || 0;
      const flash = this._flash[i] || 0;
      const loc = layoutBranch(i, n, e, width, height);
      const color = bandColor(i, n, flash);

      s.save();
      s.strokeStyle = color;
      s.lineWidth = 1.4 + e * 2.2;
      s.shadowColor = color;
      s.shadowBlur = 10 + flash * 16;
      s.globalAlpha = 0.55 + e * 0.45;
      s.beginPath();
      s.moveTo(loc.spineX, loc.spineY);
      s.lineTo(loc.nodeX, loc.nodeY);
      s.stroke();
      s.restore();

      const r = 4 + e * 14 + flash * 8;
      s.save();
      s.fillStyle = color;
      s.shadowColor = color;
      s.shadowBlur = 16 + flash * 24;
      s.globalAlpha = 0.9;
      s.beginPath();
      s.arc(loc.nodeX, loc.nodeY, r, 0, Math.PI * 2);
      s.fill();
      if (flash > 0.12) {
        s.fillStyle = `rgba(255,255,255,${0.35 + flash * 0.45})`;
        s.shadowBlur = 8;
        s.beginPath();
        s.arc(loc.nodeX, loc.nodeY, r * 0.45, 0, Math.PI * 2);
        s.fill();
      }
      s.restore();
    }
  }

  _drawSpiral(s, width, height) {
    const tl = this._timeline || { t: 0, duration: DEFAULT_LOOP_SECONDS };
    const path = sampleSpiralPath(tl.duration, width, height, 280);
    const meanE = this._meanEnergy();

    s.save();
    s.lineCap = 'round';
    s.lineJoin = 'round';
    s.beginPath();
    for (let i = 0; i < path.length; i++) {
      if (i === 0) s.moveTo(path[i].x, path[i].y);
      else s.lineTo(path[i].x, path[i].y);
    }
    s.strokeStyle = 'rgba(90, 220, 255, 0.35)';
    s.lineWidth = 2 + meanE * 2;
    s.shadowColor = 'rgba(80, 220, 255, 0.7)';
    s.shadowBlur = 12;
    s.stroke();
    s.restore();

    const pos = mapTimeToSpiral(tl.t, tl.duration, width, height);
    this._trail.push({ x: pos.x, y: pos.y, life: 1 });
    if (this._trail.length > 110) this._trail.shift();
    for (const p of this._trail) p.life *= 0.955;

    s.save();
    s.lineCap = 'round';
    for (let i = 1; i < this._trail.length; i++) {
      const a = this._trail[i - 1];
      const b = this._trail[i];
      const alpha = Math.min(a.life, b.life);
      s.strokeStyle = `rgba(160, 255, 255, ${alpha * 0.85})`;
      s.lineWidth = 2 + alpha * 4;
      s.shadowColor = 'rgba(140, 255, 255, 0.9)';
      s.shadowBlur = 12;
      s.beginPath();
      s.moveTo(a.x, a.y);
      s.lineTo(b.x, b.y);
      s.stroke();
    }
    s.restore();

    this._drawMarker(s, tl, width, height, this.markerA, 'A', '#ffd56a');
    this._drawMarker(s, tl, width, height, this.markerB, 'B', '#ff7ad9');

    const pr = 6 + meanE * 8;
    s.save();
    s.fillStyle = '#e8ffff';
    s.shadowColor = '#7cf6ff';
    s.shadowBlur = 28;
    s.beginPath();
    s.arc(pos.x, pos.y, pr, 0, Math.PI * 2);
    s.fill();
    s.fillStyle = 'rgba(255,255,255,0.9)';
    s.shadowBlur = 6;
    s.beginPath();
    s.arc(pos.x, pos.y, pr * 0.4, 0, Math.PI * 2);
    s.fill();
    s.restore();

    s.save();
    s.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
    s.fillStyle = 'rgba(180, 240, 255, 0.7)';
    s.textAlign = 'center';
    s.fillText(formatTime(tl.t) + ' / ' + formatTime(tl.duration), width / 2, height - 18);
    s.restore();
  }

  _drawMarker(s, tl, width, height, time, label, color) {
    if (time == null || !(time >= 0)) return;
    const p = mapTimeToSpiral(time, tl.duration, width, height);
    s.save();
    s.fillStyle = color;
    s.shadowColor = color;
    s.shadowBlur = 16;
    s.beginPath();
    s.arc(p.x, p.y, 7, 0, Math.PI * 2);
    s.fill();
    s.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
    s.textAlign = 'center';
    s.textBaseline = 'bottom';
    s.fillText(label + ' ' + formatTime(time), p.x, p.y - 10);
    s.restore();
  }

  _drawParticles(s) {
    for (const p of this._particles) {
      const [r, g, b] = hueRgb(p.hue, 0.95, 0.62);
      s.save();
      s.globalAlpha = Math.max(0, p.life);
      s.fillStyle = `rgb(${r},${g},${b})`;
      s.shadowColor = `rgb(${r},${g},${b})`;
      s.shadowBlur = 10;
      s.beginPath();
      s.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      s.fill();
      s.restore();
    }
  }

  _meanEnergy() {
    const e = this._smooth;
    if (!e || !e.length) return 0;
    let s = 0;
    for (let i = 0; i < e.length; i++) s += e[i];
    return s / e.length;
  }
}

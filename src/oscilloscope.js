'use strict';

import { WaveGLRenderer } from './wave-gl-renderer.js';
import { BeatDetector } from './beat-detector.js';
import { ObjScene } from './obj-scene.js';
import { ImageScene } from './image-scene.js';
import { TIMEBASE, TB_DEFAULT, VDIV, VD_DEFAULT } from './constants.js';

// ─────────────────────────────────────────────────────────────
//  Oscilloscope renderer
// ─────────────────────────────────────────────────────────────
export class Oscilloscope {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.engine = engine;
    this.rafId  = null;
    this.running = false;

    // Try WebGL renderer; fall back to Canvas 2D
    try {
      this._glr = new WaveGLRenderer(canvas);
      this.ctx  = null;
    } catch(e) {
      console.warn('WebGL unavailable, using Canvas 2D fallback:', e);
      this._glr = null;
      // canvas.getContext('2d') returns null if a WebGL context was partially
      // acquired before the error — in that case swap in a fresh canvas.
      this.ctx = canvas.getContext('2d');
      if (!this.ctx) {
        const replacement = document.createElement('canvas');
        replacement.id     = canvas.id;
        replacement.width  = canvas.width;
        replacement.height = canvas.height;
        replacement.style.cssText = canvas.style.cssText;
        canvas.parentElement.replaceChild(replacement, canvas);
        this.canvas = replacement;
        this.ctx    = replacement.getContext('2d');
      }
    }

    // ── Scope state ──
    this.isRunning  = true;
    this.frozenData = null;
    this.mode       = 'YT';

    // Channels
    this.ch1 = { coupling: 'AC', vdiv: VDIV[VD_DEFAULT], vdivIdx: VD_DEFAULT, pos: 0 };
    this.ch2 = { coupling: 'AC', vdiv: VDIV[VD_DEFAULT], vdivIdx: VD_DEFAULT, pos: 0 };

    // Horizontal
    this.tbIdx = TB_DEFAULT; this.tb = TIMEBASE[TB_DEFAULT]; this.hPos = 0;

    // Trigger
    this.trigSource = 1; this.trigEdge = 'rising';
    this.trigMode = 'auto'; this.trigLevel = 0;
    this._singleArmed = false;

    // Display
    this.color       = '#00ff41';
    this.sceneColor  = '';         // '' = use main beam color; '#rrggbb' = independent
    this.beamWidth   = 1.5;
    this.glowAmount  = 12;
    this.persistence = 0.15;
    this.showGrid    = true;
    this.crtCurve    = true;
    this.showMeasure = true;
    this.smooth      = false;
    this.filterEnabled = false;
    this.filterLow   = 200;
    this.filterHigh  = 3000;

    // OBJ 3D mode
    this.objMode = false;
    this._obj    = new ObjScene();
    this.obj3dMode   = true;   // true = OBJ wireframe, false = image overlay
    this._imgScene   = new ImageScene();

    // ── Visual FX state ──
    this.fx = {
      reactive:   false,  // glow/beam scale with amplitude
      beatFlash:  false,  // color flash on beat
      bloom:      false,  // wide glow halo
      mirrorX:    false,  // horizontal flip copy
      mirrorY:    false,  // vertical flip copy
      rotation:   false,  // slow rotation
      beatInvert: false,  // invert colors on beat
      afterglow:  false,  // afterimage color trails — hue-shifts the phosphor trail

      rotSpeed:   0.003,  // radians/frame
      beatSens:   1.5,    // beat sensitivity
      afterglowSpeed: 0,     // hue shift per frame (0–1 wraps full spectrum)
      afterglowStr:   0.7,   // trail persistence (0.3–0.95)

      reactiveStr: 1.0,   // reactive glow/width multiplier
      beatStr:     0.35,  // beat flash intensity
      bloomStr:    1.0,   // bloom glow multiplier

      // Gradient beam
      gradient:      false,
      gradientStart: '#00ff41',
      gradientEnd:   '#ff00ff',
      gradientDir:   'h',   // 'h' = along waveform, 'v' = vertical (by amplitude)

      // Internal animation state
      _angle: 0,
      _flash: 0,
      _rms:   0,
      _lastRotT: 0,
    };

    // Measurements
    this._meas    = null;
    this._freqTimer = 0;
    this.measFreq = 0;

    this._beatDet = new BeatDetector();

    // Phosphor buffer (2D fallback only — WebGL handles this internally)
    if (!this._glr) {
      this._phBuf = document.createElement('canvas');
      this._phBuf.width  = canvas.width;
      this._phBuf.height = canvas.height;
      this._phCtx = this._phBuf.getContext('2d');
      this._phCtx.fillStyle = '#000';
      this._phCtx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // ── Coupling ─────────────────────────────────────────────────────────
  applyCoupling(data, coupling) {
    if (coupling === 'GND') return new Float32Array(data.length);
    if (coupling === 'DC')  return data;
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const mean = sum / data.length;
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data[i] - mean;
    return out;
  }

  // ── Frequency bandpass filter (biquad HP + LP chain) ─────────────────
  _biquadCoeffs(type, fc, sr) {
    const w0    = 2 * Math.PI * Math.max(1, Math.min(fc, sr / 2 - 1)) / sr;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * 0.707);
    const a0    = 1 + alpha;
    if (type === 'lp') return {
      b0: (1 - cosw0) / (2 * a0), b1: (1 - cosw0) / a0, b2: (1 - cosw0) / (2 * a0),
      a1: -2 * cosw0 / a0, a2: (1 - alpha) / a0
    };
    // hp
    return {
      b0:  (1 + cosw0) / (2 * a0), b1: -(1 + cosw0) / a0, b2: (1 + cosw0) / (2 * a0),
      a1: -2 * cosw0 / a0, a2: (1 - alpha) / a0
    };
  }

  _runBiquad(data, c) {
    const out = new Float32Array(data.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < data.length; i++) {
      const x0 = data[i];
      const y0 = c.b0*x0 + c.b1*x1 + c.b2*x2 - c.a1*y1 - c.a2*y2;
      out[i] = y0;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    }
    return out;
  }

  applyFilter(data) {
    const sr  = this.engine.sampleRate;
    const lo  = Math.min(this.filterLow,  this.filterHigh - 1);
    const hi  = Math.max(this.filterHigh, lo + 1);
    const hp  = this._runBiquad(data, this._biquadCoeffs('hp', lo, sr));
    return this._runBiquad(hp, this._biquadCoeffs('lp', hi, sr));
  }

  // ── Trigger ──────────────────────────────────────────────────────────
  findTrigger(data) {
    const lvl = this.trigLevel, edge = this.trigEdge;
    const end = Math.floor(data.length * 0.65);
    for (let i = 8; i < end; i++) {
      if (edge === 'rising'  && data[i-1] < lvl && data[i] >= lvl) return i;
      if (edge === 'falling' && data[i-1] > lvl && data[i] <= lvl) return i;
    }
    return this.trigMode === 'auto' ? 0 : -1;
  }

  // ── Frequency estimation ─────────────────────────────────────────────
  estimateFreq(data) {
    const sr = this.engine.sampleRate;
    let crossings = 0, last = -1, totalGap = 0;
    for (let i = 1; i < Math.min(data.length, 4096); i++) {
      if (data[i-1] < 0 && data[i] >= 0) {
        if (last >= 0) { totalGap += i - last; crossings++; }
        last = i;
      }
    }
    if (crossings < 2) return 0;
    return sr / (totalGap / crossings);
  }

  // ── Measurements ────────────────────────────────────────────────────
  calcMeasurements(data, trigIdx, sampPx, W) {
    const samples = [];
    for (let px = 0; px < W; px++) {
      const si = trigIdx + Math.round(px * sampPx);
      if (si < data.length) samples.push(data[si]);
    }
    if (!samples.length) return null;
    let vmax = -Infinity, vmin = Infinity, sumSq = 0, sum = 0;
    for (const v of samples) {
      if (v > vmax) vmax = v; if (v < vmin) vmin = v;
      sum += v; sumSq += v * v;
    }
    return { vmax, vmin, vpp: vmax - vmin, vrms: Math.sqrt(sumSq / samples.length), vavg: sum / samples.length };
  }

  // ── Scale helpers ────────────────────────────────────────────────────
  getSamplesPerPixel() {
    return (this.tb.s * this.engine.sampleRate) / (this.canvas.width / 10);
  }
  getVoltScale(ch) { return 1 / (4 * ch.vdiv.v); }

  // ── FX: compute runtime color + glow ─────────────────────────────────
  _updateFX(data) {
    const fx  = this.fx;
    const len = data.length;

    // RMS — computed once, shared with beat detector
    let sumSq = 0;
    for (let i = 0; i < len; i++) sumSq += data[i] * data[i];
    fx._rms = Math.sqrt(sumSq / len);

    // Beat detection — pass pre-computed RMS (avoids recomputing over 8192 samples)
    this._beatDet.sensitivity = fx.beatSens;
    const { beat } = this._beatDet.detect(fx._rms);
    this._lastBeat = beat;

    if (beat && fx.beatFlash) fx._flash = 1.0;
    if (fx._flash > 0) fx._flash *= 0.72;

    // Rotation (time-based)
    if (fx.rotation) {
      const _now = performance.now() / 1000;
      const _dt  = fx._lastRotT > 0 ? Math.min(_now - fx._lastRotT, 0.05) : 1/60;
      fx._lastRotT = _now;
      fx._angle = (fx._angle + fx.rotSpeed * _dt * 60) % (Math.PI * 2);
    }
  }

  _renderColor() {
    return this.color;
  }

  _renderGlow() {
    return this.fx.reactive
      ? this.glowAmount + this.fx._rms * 60 * this.fx.reactiveStr
      : this.glowAmount;
  }

  _renderBeamWidth() {
    return this.fx.reactive
      ? this.beamWidth * (1 + this.fx._rms * 1.5 * this.fx.reactiveStr)
      : this.beamWidth;
  }

  // ── Grid ─────────────────────────────────────────────────────────────
  drawGrid(ctx) {
    const W = this.canvas.width, H = this.canvas.height;
    ctx.save();

    // Fine grid — single batched path (was 91 individual strokes)
    ctx.strokeStyle = 'rgba(70,70,70,0.22)'; ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i <= 50; i++) { const x = i * W / 50; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let i = 0; i <= 40; i++) { const y = i * H / 40; ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // Major grid — single batched path (was 19 individual strokes)
    ctx.strokeStyle = 'rgba(90,90,90,0.4)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) { const x = i * W / 10; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let i = 0; i <= 8;  i++) { const y = i * H / 8;  ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // Center crosshair
    ctx.strokeStyle = 'rgba(110,110,110,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
    ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
    ctx.stroke();

    // Trigger level marker
    const vs   = this.getVoltScale(this.trigSource === 1 ? this.ch1 : this.ch2);
    const trigY = H / 2 - this.trigLevel * vs * (H / 2);
    const rgb  = this._hexToRgb(this._renderColor());
    ctx.fillStyle = `rgba(${rgb},0.7)`;
    ctx.beginPath(); ctx.moveTo(W - 9, trigY - 4); ctx.lineTo(W, trigY); ctx.lineTo(W - 9, trigY + 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ── Core beam drawing — shared by YT and mirror passes ───────────────
  _drawBeamPath(ctx, points, color, glow, width, alpha = 1) {
    if (!points.length) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.globalAlpha = alpha;
    ctx.shadowBlur  = glow;
    ctx.shadowColor = color;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.beginPath();
    points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.stroke();
    ctx.restore();
  }

  // ── Build point array for YT ─────────────────────────────────────────
  _buildYTPoints(data, ch, trigIdx, sampPx, yOffset = 0) {
    const W    = this.canvas.width, H = this.canvas.height;
    const midY = H/2 + ch.pos * (H/2) + yOffset;
    const vs   = this.getVoltScale(ch);
    const start = Math.max(0, trigIdx + this.hPos);
    const pts  = [];
    const spx  = Math.max(0.01, sampPx);
    for (let px = 0; px < W; px++) {
      const t  = start + px * spx;
      let val;
      if (this.smooth) {
        const i0   = Math.floor(t);
        const i1   = i0 + 1;
        if (i0 >= data.length) break;
        const s0   = data[i0];
        const s1   = i1 < data.length ? data[i1] : s0;
        val = s0 + (t - i0) * (s1 - s0);
      } else {
        const si = Math.round(t);
        if (si >= data.length) break;
        val = data[si];
      }
      pts.push([px, midY - Math.max(-2, Math.min(2, val)) * vs * (H/2)]);
    }
    return pts;
  }

  // ── Draw YT waveform with bloom + FX ────────────────────────────────
  drawYT(ctx, data, ch, yOffset = 0) {
    const trigIdx = this.findTrigger(data);
    if (trigIdx < 0) return null;
    const sampPx = this.getSamplesPerPixel();
    const pts    = this._buildYTPoints(data, ch, trigIdx, sampPx, yOffset);
    if (!pts.length) return null;

    const color  = this._renderColor();
    const glow   = this._renderGlow();
    const bWidth = this._renderBeamWidth();

    // Bloom passes (only when bloom is on)
    if (this.fx.bloom) {
      this._drawBeamPath(ctx, pts, color, 0, bWidth * 12, 0.025);
      this._drawBeamPath(ctx, pts, color, 0, bWidth * 6,  0.06);
      this._drawBeamPath(ctx, pts, color, glow * 0.5, bWidth * 3, 0.12);
    }

    // Glow pass
    this._drawBeamPath(ctx, pts, color, glow * 2, bWidth + 1.5, 0.22);
    // Core beam
    this._drawBeamPath(ctx, pts, color, glow * 0.6, bWidth * 0.65, 1.0);

    return { trigIdx, sampPx };
  }

  // ── Draw XY / Lissajous ──────────────────────────────────────────────
  drawXY(ctx, dataL, dataR) {
    const W = this.canvas.width, H = this.canvas.height;
    const cx = W/2, cy = H/2;
    const sx = (W/2) * this.getVoltScale(this.ch1) * 4;
    const sy = (H/2) * this.getVoltScale(this.ch2) * 4;
    const n  = Math.min(dataL.length, dataR.length);
    const color  = this._renderColor();
    const glow   = this._renderGlow();
    const bWidth = this._renderBeamWidth();

    const pts = Array.from({ length: n }, (_, i) => [cx + dataL[i] * sx, cy - dataR[i] * sy]);

    if (this.fx.bloom) {
      this._drawBeamPath(ctx, pts, color, 0, bWidth * 12, 0.025);
      this._drawBeamPath(ctx, pts, color, 0, bWidth * 6,  0.06);
      this._drawBeamPath(ctx, pts, color, glow * 0.5, bWidth * 3, 0.12);
    }
    this._drawBeamPath(ctx, pts, color, glow * 2, bWidth + 1.5, 0.22);
    this._drawBeamPath(ctx, pts, color, glow * 0.6, bWidth * 0.65, 1.0);
  }

  // ── Mirror passes ────────────────────────────────────────────────────
  _drawMirrored(ctx, drawFn) {
    const W = this.canvas.width, H = this.canvas.height;
    const { mirrorX, mirrorY } = this.fx;
    if (!mirrorX && !mirrorY) return;

    const transforms = [];
    if (mirrorX)              transforms.push([[-1, 1], [W, 0]]);
    if (mirrorY)              transforms.push([[1, -1], [0, H]]);
    if (mirrorX && mirrorY)   transforms.push([[-1,-1], [W, H]]);

    transforms.forEach(([scale, trans]) => {
      ctx.save();
      ctx.translate(trans[0], trans[1]);
      ctx.scale(scale[0], scale[1]);
      drawFn(ctx);
      ctx.restore();
    });
  }

  // ── Measurement overlay on main canvas ──────────────────────────────
  drawMeasurements(ctx) {
    if (!this._meas || !this.showMeasure) return;
    const m = this._meas, W = this.canvas.width, H = this.canvas.height;
    const rgb = this._hexToRgb(this._renderColor());
    const fHz = this.measFreq;
    const freqStr = fHz > 0 ? (fHz >= 1000 ? `${(fHz/1000).toFixed(3)}kHz` : `${fHz.toFixed(2)}Hz`) : '---';
    const perStr  = fHz > 0 ? (fHz >= 1000 ? `${(1000/fHz).toFixed(3)}ms` : `${(1000/fHz).toFixed(2)}ms`) : '---';
    const items = [`Vpp=${m.vpp.toFixed(3)}V`, `Vmax=${m.vmax.toFixed(3)}V`, `Vmin=${m.vmin.toFixed(3)}V`,
                   `Vrms=${m.vrms.toFixed(3)}V`, `Vavg=${m.vavg.toFixed(3)}V`, `f=${freqStr}`, `T=${perStr}`];
    ctx.save();
    ctx.fillStyle = `rgba(${rgb},0.1)`; ctx.fillRect(0, H-22, W, 22);
    ctx.strokeStyle = `rgba(${rgb},0.2)`; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, H-22); ctx.lineTo(W, H-22); ctx.stroke();
    ctx.fillStyle = `rgba(${rgb},0.75)`; ctx.font = '10px Courier New';
    items.forEach((t, i) => ctx.fillText(t, i * (W/items.length) + 5, H - 8));
    ctx.restore();
  }

  // ── CRT vignette ─────────────────────────────────────────────────────
  applyCRTCurve(ctx = this.ctx) {
    const W = this.canvas.width, H = this.canvas.height;
    const vig = ctx.createRadialGradient(W/2,H/2,H*0.3, W/2,H/2,H*0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }

  // Cache: avoids re-parsing the same hex string 3-5 times per frame
  _hexRgbCache = '';
  _hexRgbCacheKey = '';
  _hexToRgb(hex) {
    if (hex === this._hexRgbCacheKey) return this._hexRgbCache;
    this._hexRgbCacheKey = hex;
    if (hex.startsWith('hsl')) {
      const [h, s, l] = hex.match(/[\d.]+/g).map(Number);
      const a = s/100 * Math.min(l/100, 1 - l/100);
      const f = n => { const k = (n + h/30) % 12; return Math.round((l/100 - a*Math.max(-1, Math.min(k-3, 9-k, 1))) * 255); };
      this._hexRgbCache = `${f(0)},${f(8)},${f(4)}`;
    } else if (!hex.startsWith('#') || hex.length < 7) {
      this._hexRgbCache = '0,255,65';
    } else {
      this._hexRgbCache = `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
    }
    return this._hexRgbCache;
  }

  // ── Main render loop ─────────────────────────────────────────────────
  render() {
    if (!this.running) return;
    if (this._glr) this._renderGL(); else this._render2D();
    this.rafId = requestAnimationFrame(() => this.render());
  }

  // ── WebGL render path ────────────────────────────────────────────────
  _renderGL() {
    const W = this.canvas.width, H = this.canvas.height;
    const glr = this._glr;

    // ① Get + process data
    let rawL = this.engine.getDataL(), rawR = this.engine.getDataR();
    let dataL, dataR;
    if (this.isRunning) {
      dataL = this.applyCoupling(rawL, this.ch1.coupling);
      dataR = this.applyCoupling(rawR, this.ch2.coupling);
      if (this.filterEnabled) { dataL = this.applyFilter(dataL); dataR = this.applyFilter(dataR); }
      if (this._singleArmed) {
        this.frozenData = { L: dataL, R: dataR };
        this._singleArmed = false; this.isRunning = false;
      } else { this.frozenData = { L: dataL, R: dataR }; }
    } else {
      dataL = this.frozenData?.L || rawL;
      dataR = this.frozenData?.R || rawR;
    }

    // ② FX update
    this._updateFX(dataL);
    const color  = this._renderColor();
    const glow   = this._renderGlow();
    const bWidth = this._renderBeamWidth();

    // ③ Build point arrays (primary + mirrors)
    let allPts = [];
    let measResult = null;

    if (this.mode === 'YT') {
      const trigIdx = this.findTrigger(dataL);
      if (trigIdx >= 0) {
        const sampPx = this.getSamplesPerPixel();
        measResult = { trigIdx, sampPx };
        let pts = this._buildYTPoints(dataL, this.ch1, trigIdx, sampPx, 0);
        // Rotation: rotate points around canvas center
        if (this.fx.rotation && this.fx._angle !== 0) {
          const cos = Math.cos(this.fx._angle), sin = Math.sin(this.fx._angle);
          const cx = W/2, cy = H/2;
          pts = pts.map(([x,y]) => {
            const dx=x-cx, dy=y-cy;
            return [cx+dx*cos-dy*sin, cy+dx*sin+dy*cos];
          });
        }
        allPts.push(pts);
        if (this.fx.mirrorX) allPts.push(pts.map(([x,y]) => [W-x, y]));
        if (this.fx.mirrorY) allPts.push(pts.map(([x,y]) => [x, H-y]));
        if (this.fx.mirrorX && this.fx.mirrorY) allPts.push(pts.map(([x,y]) => [W-x, H-y]));
      }
    } else {
      // XY / Lissajous
      const sx = (W/2) * this.getVoltScale(this.ch1) * 4;
      const sy = (H/2) * this.getVoltScale(this.ch2) * 4;
      const cx = W/2, cy = H/2;
      const n  = Math.min(dataL.length, dataR.length);
      const pts = [];
      for (let i = 0; i < n; i++) pts.push([cx + dataL[i]*sx, cy - dataR[i]*sy]);
      allPts.push(pts);
      if (this.fx.mirrorX) allPts.push(pts.map(([x,y]) => [W-x, y]));
      if (this.fx.mirrorY) allPts.push(pts.map(([x,y]) => [x, H-y]));
      if (this.fx.mirrorX && this.fx.mirrorY) allPts.push(pts.map(([x,y]) => [W-x, H-y]));
    }

    // ③b OBJ / image overlay
    let scenePts = [];   // separate list when scene has its own color
    const hasSceneColor = this.sceneColor && this.sceneColor !== '';
    if (this.objMode && this.obj3dMode) {
      if (this._obj.loaded) {
        const edges = this._obj.getScreenEdges(W, H, this.fx._rms, this._lastBeat || false, rawL);
        if (this._obj.showAudio) {
          if (hasSceneColor) scenePts = edges;
          else allPts = [...allPts, ...edges];
        } else {
          if (hasSceneColor) { scenePts = edges; }
          else allPts = edges;
        }
      }
    } else if (this.objMode && !this.obj3dMode) {
      if (this._imgScene.loaded) {
        const imgPts = this._imgScene.getTracePoints(W, H, this.fx._rms, this._lastBeat || false, rawL);
        if (this._imgScene.showAudio) {
          if (hasSceneColor) scenePts = imgPts;
          else allPts = [...allPts, ...imgPts];
        } else {
          if (hasSceneColor) { scenePts = imgPts; }
          else allPts = imgPts;
        }
      }
    }

    // ③c Draw sound — oscilloscope hum tied to draw power
    if (this.objMode) {
      const scene = this.obj3dMode ? this._obj : this._imgScene;
      const p = scene.power;
      if (scene.autoPower || p < 1) {
        this.engine.startDrawSound();           // no-op if already running
        this.engine.updateDrawSound(p);
      } else {
        this.engine.stopDrawSound();
      }
    } else {
      this.engine.stopDrawSound();
    }

    // ④ Beat flash
    let flashRGB = null;
    if (this.fx._flash > 0.01) {
      const rgba = glr._rgba(this.fx.beatInvert ? '#ffffff' : color);
      const i = this.fx._flash * this.fx.beatStr;
      flashRGB = [rgba[0]*i, rgba[1]*i, rgba[2]*i];
    }

    // ⑤ GL frame: beam → blur → composite → blit
    const glowStr = 0.7;
    const glowPx  = glow;
    const haloStr = this.fx.bloom ? 0.35 * this.fx.bloomStr : 0;
    const hueShift = this.fx.afterglow ? this.fx.afterglowSpeed : 0;
    // Afterglow overrides persistence with its own trail value
    const decay = this.fx.afterglow ? (1 - this.fx.afterglowStr) : this.persistence;
    const extraGroups = scenePts.length && hasSceneColor
      ? [{ pts: scenePts, color: this.sceneColor }] : null;

    // Gradient beam — build per-point color arrays for each pointSet
    let gradientColors = null;
    if (this.fx.gradient && allPts.length) {
      const _s0 = glr._rgba(this.fx.gradientStart, 1.0);
      const r0=_s0[0],g0=_s0[1],b0=_s0[2];
      const _s1 = glr._rgba(this.fx.gradientEnd, 1.0);
      const r1=_s1[0],g1=_s1[1],b1=_s1[2];
      const vertical = this.fx.gradientDir === 'v';
      gradientColors = allPts.map(pts => {
        const n = pts.length;
        const colors = new Array(n);
        for (let i = 0; i < n; i++) {
          const t = vertical ? (pts[i][1] / H) : (n > 1 ? i / (n - 1) : 0);
          colors[i] = [r0+(r1-r0)*t, g0+(g1-g0)*t, b0+(b1-b0)*t, 1.0];
        }
        return colors;
      });
    }

    glr.frame(allPts, color, glowPx, bWidth, decay, glowStr, flashRGB, hueShift, extraGroups, gradientColors, haloStr);

    // ⑥ Overlay: grid + CRT + measurements
    const octx = glr.octx;
    octx.clearRect(0, 0, W, H);
    if (this.showGrid)  this.drawGrid(octx);
    if (this.crtCurve)  this.applyCRTCurve(octx);

    // ⑦ Measurements
    this._freqTimer++;
    if (this._freqTimer >= 10 && measResult) {
      this._freqTimer = 0;
      this._meas    = this.calcMeasurements(dataL, measResult.trigIdx, measResult.sampPx, W);
      this.measFreq = this.estimateFreq(dataL);
    }
    this.drawMeasurements(octx);
  }

  // ── Canvas 2D fallback render path (original logic) ──────────────────
  _render2D() {
    const pctx = this._phCtx;
    const W = this.canvas.width, H = this.canvas.height;

    // ① Phosphor decay — afterglow overrides persistence with its own trail value
    const decay2D = this.fx.afterglow ? (1 - this.fx.afterglowStr) : this.persistence;
    pctx.globalAlpha = decay2D;
    pctx.fillStyle   = '#000';
    pctx.fillRect(0, 0, W, H);
    pctx.globalAlpha = 1.0;

    if (this.fx.afterglow && this.fx.afterglowSpeed > 0) {
      // Hue-rotate the phosphor buffer via a composited tint overlay
      this._afterglowHue2D = ((this._afterglowHue2D || 0) + this.fx.afterglowSpeed * 360) % 360;
      pctx.save();
      pctx.globalCompositeOperation = 'hue';
      pctx.fillStyle = `hsl(${this._afterglowHue2D}, 100%, 50%)`;
      pctx.globalAlpha = 0.15;
      pctx.fillRect(0, 0, W, H);
      pctx.restore();
      pctx.globalAlpha = 1.0;
    }

    // ② Grid
    if (this.showGrid) this.drawGrid(pctx);

    // ③ Get data
    let rawL = this.engine.getDataL(), rawR = this.engine.getDataR();
    let dataL, dataR;
    if (this.isRunning) {
      dataL = this.applyCoupling(rawL, this.ch1.coupling);
      dataR = this.applyCoupling(rawR, this.ch2.coupling);
      if (this.filterEnabled) { dataL = this.applyFilter(dataL); dataR = this.applyFilter(dataR); }
      if (this._singleArmed) {
        this.frozenData = { L: dataL, R: dataR };
        this._singleArmed = false; this.isRunning = false;
      } else { this.frozenData = { L: dataL, R: dataR }; }
    } else {
      dataL = this.frozenData?.L || rawL;
      dataR = this.frozenData?.R || rawR;
    }

    // ④ FX update
    this._updateFX(dataL);

    // ⑤ Rotation
    const rotActive = this.fx.rotation && this.fx._angle !== 0;
    if (rotActive) {
      pctx.save();
      pctx.translate(W/2, H/2); pctx.rotate(this.fx._angle); pctx.translate(-W/2, -H/2);
    }

    // ⑥ Draw waveform
    let measResult = null;
    if (this.mode === 'YT') {
      const res = this.drawYT(pctx, dataL, this.ch1, 0);
      if (res) measResult = res;
      this._drawMirrored(pctx, ctx => this.drawYT(ctx, dataL, this.ch1, 0));
    } else {
      this.drawXY(pctx, dataL, dataR);
      this._drawMirrored(pctx, ctx => this.drawXY(ctx, dataL, dataR));
    }
    if (rotActive) pctx.restore();

    // ⑦ Beat flash overlay
    const fx = this.fx;
    if (fx._flash > 0.01) {
      pctx.save();
      pctx.globalAlpha = fx._flash * fx.beatStr;
      pctx.fillStyle   = fx.beatInvert ? '#ffffff' : this._renderColor();
      pctx.fillRect(0, 0, W, H);
      pctx.restore();
    }

    // ⑧ Measurements
    this._freqTimer++;
    if (this._freqTimer >= 10 && measResult) {
      this._freqTimer = 0;
      this._meas    = this.calcMeasurements(dataL, measResult.trigIdx, measResult.sampPx, W);
      this.measFreq = this.estimateFreq(dataL);
    }

    // ⑨ Blit phosphor
    this.ctx.clearRect(0, 0, W, H);
    this.ctx.drawImage(this._phBuf, 0, 0);

    // ⑩ Post-effects
    if (this.crtCurve) this.applyCRTCurve();
    this.drawMeasurements(this.ctx);

    // ⑪ Image trace (2D fallback path) — draw phosphor dots for each trace point
    if (this.objMode && !this.obj3dMode && this._imgScene.loaded) {
      const tracePts = this._imgScene.getTracePoints(W, H, this.fx._rms, this._lastBeat || false, rawL);
      if (tracePts.length) {
        const color = (this.sceneColor && this.sceneColor !== '') ? this.sceneColor : this._renderColor();
        const glow  = this._renderGlow() * 0.5;
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth   = this._renderBeamWidth();
        this.ctx.shadowBlur  = glow;
        this.ctx.shadowColor = color;
        this.ctx.lineCap     = 'round';
        this.ctx.beginPath();
        for (const [[sx, sy], [ex, ey]] of tracePts) {
          this.ctx.moveTo(sx, sy);
          this.ctx.lineTo(ex, ey);
        }
        this.ctx.stroke();
        this.ctx.restore();
      }
    }
  }

  start() { if (this.running) return; this.running = true; this.render(); }
  stop()  { this.running = false; if (this.rafId) cancelAnimationFrame(this.rafId); }

  autoSet() {
    const data = this.applyCoupling(this.engine.getDataL(), this.ch1.coupling);
    const freq = this.estimateFreq(data);
    if (freq > 0) {
      const target = (1/freq) * 3 / 10;
      let best = 0, bestD = Infinity;
      TIMEBASE.forEach((tb, i) => { const d = Math.abs(tb.s - target); if (d < bestD) { bestD = d; best = i; } });
      this.tb = TIMEBASE[best]; this.tbIdx = best;
    }
    let vmax = -Infinity, vmin = Infinity;
    for (const v of data) { if (v > vmax) vmax = v; if (v < vmin) vmin = v; }
    const vpp = vmax - vmin;
    if (vpp > 0) {
      const tv = vpp / 6;
      let best = 0, bestD = Infinity;
      VDIV.forEach((vd, i) => { const d = Math.abs(vd.v - tv); if (d < bestD) { bestD = d; best = i; } });
      this.ch1.vdiv = VDIV[best]; this.ch1.vdivIdx = best;
    }
    this.ch1.pos = 0; this.hPos = 0; this.trigLevel = 0;
  }
}

'use strict';

// ─────────────────────────────────────────────────────────────
//  Step tables — standard oscilloscope values
// ─────────────────────────────────────────────────────────────
const TIMEBASE = [
  // ── μs range ──────────────────────────────────────────────
  { label: '1μs',   s: 1e-6    }, { label: '2μs',   s: 2e-6    },
  { label: '2.5μs', s: 2.5e-6  }, { label: '5μs',   s: 5e-6    },
  { label: '7.5μs', s: 7.5e-6  }, { label: '10μs',  s: 10e-6   },
  { label: '20μs',  s: 20e-6   }, { label: '25μs',  s: 25e-6   },
  { label: '50μs',  s: 50e-6   }, { label: '75μs',  s: 75e-6   },
  { label: '100μs', s: 100e-6  }, { label: '200μs', s: 200e-6  },
  { label: '250μs', s: 250e-6  }, { label: '500μs', s: 500e-6  },
  { label: '750μs', s: 750e-6  },
  // ── ms range ──────────────────────────────────────────────
  { label: '1ms',   s: 1e-3    }, { label: '2ms',   s: 2e-3    },
  { label: '2.5ms', s: 2.5e-3  }, { label: '5ms',   s: 5e-3    },
  { label: '7.5ms', s: 7.5e-3  }, { label: '10ms',  s: 10e-3   },
  { label: '20ms',  s: 20e-3   }, { label: '25ms',  s: 25e-3   },
  { label: '50ms',  s: 50e-3   }, { label: '75ms',  s: 75e-3   },
  { label: '100ms', s: 100e-3  }, { label: '200ms', s: 200e-3  },
  { label: '250ms', s: 250e-3  }, { label: '500ms', s: 500e-3  },
  { label: '750ms', s: 750e-3  },
  // ── s range ───────────────────────────────────────────────
  { label: '1s',    s: 1       }, { label: '2s',    s: 2       },
  { label: '2.5s',  s: 2.5     }, { label: '5s',    s: 5       },
  { label: '10s',   s: 10      },
];
const TB_DEFAULT = 15; // 1ms

const VDIV = [
  { label: '50mV',  v: 0.05 }, { label: '100mV', v: 0.1  },
  { label: '200mV', v: 0.2  }, { label: '500mV', v: 0.5  },
  { label: '1V',    v: 1.0  }, { label: '2V',    v: 2.0  },
  { label: '5V',    v: 5.0  },
];
const VD_DEFAULT = 3; // 500mV

// Lissajous frequency ratios (L:R)
const LISSAJOUS_RATIOS = [
  { label: '1:1', r: 1     },
  { label: '1:2', r: 2     },
  { label: '2:3', r: 1.5   },
  { label: '3:4', r: 4/3   },
  { label: '3:5', r: 5/3   },
  { label: '5:6', r: 6/5   },
  { label: '5:8', r: 8/5   },
];

// ─────────────────────────────────────────────────────────────
//  Knob — stepped or continuous rotary control
// ─────────────────────────────────────────────────────────────
class Knob {
  constructor(el, steps, defaultIdx, onChange) {
    this.el       = el;
    this.mark     = el.querySelector('.knob-mark');
    this.steps    = steps;
    this.index    = defaultIdx;
    this.onChange = onChange;
    this._dragY   = null;
    this._dragIdx = 0;
    this._setupEvents();
    this._updateAngle();
  }

  setIndex(i) {
    if (!this.steps) return;
    this.index = Math.max(0, Math.min(this.steps.length - 1, i));
    this._updateAngle();
    this.onChange(this.steps[this.index], this.index);
  }

  _updateAngle() {
    const max   = this.steps ? this.steps.length - 1 : 10;
    const t     = this.steps ? this.index / max : 0.5;
    this.mark.style.transform = `rotate(${-135 + t * 270}deg)`;
  }

  _setupEvents() {
    this.el.addEventListener('wheel', e => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      if (this.steps) this.setIndex(this.index + dir);
      else this.onChange(dir * 0.05);
    }, { passive: false });

    this.el.addEventListener('mousedown', e => {
      this._dragY   = e.clientY;
      this._dragIdx = this.index;
      e.preventDefault();
      const onMove = ev => {
        const delta = Math.round((this._dragY - ev.clientY) / 10);
        if (this.steps) {
          const ni = Math.max(0, Math.min(this.steps.length - 1, this._dragIdx + delta));
          if (ni !== this.index) { this.index = ni; this._updateAngle(); this.onChange(this.steps[ni], ni); }
        } else {
          const dy = this._dragY - ev.clientY;
          this._dragY = ev.clientY;
          this.onChange(dy * 0.005);
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    this.el.addEventListener('dblclick', () => {
      if (this.steps) this.setIndex(Math.floor(this.steps.length / 2));
      else this.onChange('reset');
    });
  }
}

// ─────────────────────────────────────────────────────────────
//  BeatDetector — energy-based onset detection
// ─────────────────────────────────────────────────────────────
class BeatDetector {
  constructor() {
    this._history  = new Float32Array(60);  // ~1s history at 60fps
    this._head     = 0;
    this._cooldown = 0;
    this.sensitivity = 1.5; // multiplier over average energy
  }

  detect(data) {
    // Compute RMS energy
    let e = 0;
    for (let i = 0; i < data.length; i++) e += data[i] * data[i];
    e = Math.sqrt(e / data.length);

    const avg = this._history.reduce((a, b) => a + b, 0) / this._history.length;
    this._history[this._head % this._history.length] = e;
    this._head++;
    this._cooldown = Math.max(0, this._cooldown - 1);

    if (e > avg * this.sensitivity && e > 0.02 && this._cooldown === 0) {
      this._cooldown = 18; // ~300ms at 60fps
      return { beat: true, energy: e, avg };
    }
    return { beat: false, energy: e, avg };
  }
}

// ─────────────────────────────────────────────────────────────
//  SignalGenerator — built-in oscillators for Lissajous shapes
// ─────────────────────────────────────────────────────────────
class SignalGenerator {
  constructor() {
    this.actx    = null;
    this._oscL   = null;
    this._oscR   = null;
    this._gainL  = null;
    this._gainR  = null;
    this.active  = false;
    this.waveform = 'sine';
    this.freqL   = 440;
    this.freqR   = 440;
    this.phase   = 90; // degrees
    this.amplitude = 0.8;
  }

  init(actx) { this.actx = actx; }

  start(analyserL, analyserR) {
    if (!this.actx) return;
    this.stop();

    this._gainL = this.actx.createGain(); this._gainL.gain.value = this.amplitude;
    this._gainR = this.actx.createGain(); this._gainR.gain.value = this.amplitude;

    this._oscL = this.actx.createOscillator();
    this._oscL.type = this.waveform;
    this._oscL.frequency.value = this.freqL;

    this._oscR = this.actx.createOscillator();
    this._oscR.type = this.waveform;
    this._oscR.frequency.value = this.freqR;

    this._oscL.connect(this._gainL);
    this._oscR.connect(this._gainR);
    this._gainL.connect(analyserL);
    this._gainR.connect(analyserR);

    const now = this.actx.currentTime;
    // Phase offset: R starts phaseDelay seconds after L
    const phaseDelay = (this.phase / 360) / Math.max(1, this.freqR);
    this._oscL.start(now);
    this._oscR.start(now + phaseDelay);
    this.active = true;
  }

  stop() {
    [this._oscL, this._oscR].forEach(o => {
      if (o) { try { o.stop(); } catch (_) {} }
    });
    [this._gainL, this._gainR].forEach(g => {
      if (g) { try { g.disconnect(); } catch (_) {} }
    });
    this._oscL = this._oscR = this._gainL = this._gainR = null;
    this.active = false;
  }

  setFreqL(f) { this.freqL = f; if (this._oscL) this._oscL.frequency.setTargetAtTime(f, this.actx.currentTime, 0.01); }
  setFreqR(f) { this.freqR = f; if (this._oscR) this._oscR.frequency.setTargetAtTime(f, this.actx.currentTime, 0.01); }
  setWaveform(w) { this.waveform = w; if (this._oscL) { this._oscL.type = w; this._oscR.type = w; } }
  setAmplitude(a) { this.amplitude = a; if (this._gainL) { this._gainL.gain.value = a; this._gainR.gain.value = a; } }
}

// ─────────────────────────────────────────────────────────────
//  VideoRecorder — canvas + audio → webm
// ─────────────────────────────────────────────────────────────
class VideoRecorder {
  constructor(canvas) {
    this.canvas = canvas;
    this._recorder = null;
    this._chunks   = [];
    this.isRecording = false;
    this._audioDest  = null;
  }

  start(actx, gainNode) {
    const videoStream = this.canvas.captureStream(60);

    // Capture audio via a MediaStreamDestination
    this._audioDest = actx.createMediaStreamDestination();
    gainNode.connect(this._audioDest);

    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...this._audioDest.stream.getAudioTracks(),
    ]);

    const mime = ['video/webm;codecs=vp9,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    this._chunks   = [];
    this._recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 8e6 });
    this._recorder.ondataavailable = e => { if (e.data.size > 0) this._chunks.push(e.data); };
    this._recorder.onstop = () => this._download();
    this._recorder.start(100);
    this.isRecording = true;
  }

  stop() {
    if (this._recorder && this.isRecording) {
      this._recorder.stop();
      this.isRecording = false;
      if (this._audioDest) { try { this._audioDest.disconnect(); } catch (_) {} }
    }
  }

  _download() {
    const blob = new Blob(this._chunks, { type: 'video/webm' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `osc_${Date.now()}.webm` });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// ─────────────────────────────────────────────────────────────
//  AudioEngine
// ─────────────────────────────────────────────────────────────
class AudioEngine {
  constructor() {
    this.actx        = null;
    this.analyserL   = null;
    this.analyserR   = null;
    this.gainNode    = null;
    this.source      = null;
    this.buffer      = null;
    this.micStream   = null;
    this.isPlaying   = false;
    this.pauseOffset = 0;
    this.startTime   = 0;
    this.FFT_SIZE    = 8192;
  }

  async init() {
    this.actx = new (window.AudioContext || window.webkitAudioContext)();
    this.gainNode = this.actx.createGain();
    this.gainNode.connect(this.actx.destination);

    const mkA = () => {
      const a = this.actx.createAnalyser();
      a.fftSize = this.FFT_SIZE;
      a.smoothingTimeConstant = 0;
      return a;
    };
    this.analyserL = mkA();
    this.analyserR = mkA();
  }

  _connect(node, channels = 1) {
    node.connect(this.gainNode);
    if (channels >= 2) {
      const split = this.actx.createChannelSplitter(2);
      node.connect(split);
      split.connect(this.analyserL, 0);
      split.connect(this.analyserR, 1);
    } else {
      node.connect(this.analyserL);
      node.connect(this.analyserR);
    }
  }

  async loadFile(file) {
    const ab = await file.arrayBuffer();
    this.buffer = await this.actx.decodeAudioData(ab);
    this.pauseOffset = 0;
    return this.buffer;
  }

  play() {
    if (!this.buffer) return;
    this._stopSrc();
    this.source = this.actx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;
    this._connect(this.source, this.buffer.numberOfChannels);
    this.source.start(0, this.pauseOffset % this.buffer.duration);
    this.startTime = this.actx.currentTime - this.pauseOffset;
    this.isPlaying = true;
    this.source.onended = () => { this.isPlaying = false; };
  }

  pause() {
    if (!this.isPlaying) return;
    this.pauseOffset = this.actx.currentTime - this.startTime;
    this._stopSrc();
    this.isPlaying = false;
  }

  stop() { this._stopSrc(); this.isPlaying = false; this.pauseOffset = 0; }

  _stopSrc() {
    if (this.source) {
      try { this.source.stop(); } catch (_) {}
      try { this.source.disconnect(); } catch (_) {}
      this.source = null;
    }
  }

  async startMic() {
    if (this.micStream) this.stopMic();
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this._connect(this.actx.createMediaStreamSource(this.micStream), 1);
  }

  stopMic() {
    if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null; }
  }

  getDataL() {
    const d = new Float32Array(this.FFT_SIZE);
    if (this.analyserL) this.analyserL.getFloatTimeDomainData(d);
    return d;
  }
  getDataR() {
    const d = new Float32Array(this.FFT_SIZE);
    if (this.analyserR) this.analyserR.getFloatTimeDomainData(d);
    return d;
  }

  getCurrentTime() {
    if (!this.actx || !this.isPlaying) return this.pauseOffset;
    return this.actx.currentTime - this.startTime;
  }

  setVolume(v) { if (this.gainNode) this.gainNode.gain.value = v; }
  get sampleRate() { return this.actx ? this.actx.sampleRate : 44100; }
}

// ─────────────────────────────────────────────────────────────
//  Oscilloscope renderer
// ─────────────────────────────────────────────────────────────
class Oscilloscope {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.engine = engine;
    this.rafId  = null;
    this.running = false;

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
    this.beamWidth   = 1.5;
    this.glowAmount  = 12;
    this.persistence = 0.15;
    this.showGrid    = true;
    this.crtCurve    = true;
    this.showMeasure = true;

    // ── Visual FX state ──
    this.fx = {
      reactive:   false,  // glow/beam scale with amplitude
      beatFlash:  false,  // color flash on beat
      colorCycle: false,  // hue animates over time
      bloom:      false,  // wide glow halo
      mirrorX:    false,  // horizontal flip copy
      mirrorY:    false,  // vertical flip copy
      rotation:   false,  // slow rotation
      beatInvert: false,  // invert colors on beat

      cycleSpeed: 0.5,    // hue degrees/frame
      rotSpeed:   0.003,  // radians/frame
      beatSens:   1.5,    // beat sensitivity

      // Internal animation state
      _hue:   120,
      _angle: 0,
      _flash: 0,
      _rms:   0,
    };

    // Measurements
    this._meas    = null;
    this._freqTimer = 0;
    this.measFreq = 0;

    this._beatDet = new BeatDetector();

    // Phosphor buffer
    this._phBuf = document.createElement('canvas');
    this._phBuf.width  = canvas.width;
    this._phBuf.height = canvas.height;
    this._phCtx = this._phBuf.getContext('2d');
    this._phCtx.fillStyle = '#000';
    this._phCtx.fillRect(0, 0, canvas.width, canvas.height);
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
    const fx = this.fx;

    // RMS
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
    fx._rms = Math.sqrt(sumSq / data.length);

    // Beat detection
    fx._beatSensCache = fx.beatSens;
    this._beatDet.sensitivity = fx.beatSens;
    const { beat } = this._beatDet.detect(data);
    this._lastBeat = beat;

    if (beat && fx.beatFlash) fx._flash = 1.0;
    if (fx._flash > 0) fx._flash *= 0.72;

    // Color cycle
    if (fx.colorCycle) {
      fx._hue = (fx._hue + fx.cycleSpeed) % 360;
    }

    // Rotation
    if (fx.rotation) {
      fx._angle = (fx._angle + fx.rotSpeed) % (Math.PI * 2);
    }
  }

  _renderColor() {
    return this.fx.colorCycle
      ? `hsl(${this.fx._hue}, 100%, 55%)`
      : this.color;
  }

  _renderGlow() {
    return this.fx.reactive
      ? this.glowAmount + this.fx._rms * 60
      : this.glowAmount;
  }

  _renderBeamWidth() {
    return this.fx.reactive
      ? this.beamWidth * (1 + this.fx._rms * 1.5)
      : this.beamWidth;
  }

  // ── Grid ─────────────────────────────────────────────────────────────
  drawGrid(ctx) {
    const W = this.canvas.width, H = this.canvas.height;
    ctx.save();
    ctx.strokeStyle = 'rgba(70,70,70,0.22)'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 50; i++) {
      ctx.beginPath(); ctx.moveTo(i * W/50, 0); ctx.lineTo(i * W/50, H); ctx.stroke();
    }
    for (let i = 0; i <= 40; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * H/40); ctx.lineTo(W, i * H/40); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(90,90,90,0.4)'; ctx.lineWidth = 0.8;
    for (let i = 0; i <= 10; i++) { ctx.beginPath(); ctx.moveTo(i*W/10, 0); ctx.lineTo(i*W/10, H); ctx.stroke(); }
    for (let i = 0; i <= 8;  i++) { ctx.beginPath(); ctx.moveTo(0, i*H/8);  ctx.lineTo(W, i*H/8);  ctx.stroke(); }
    ctx.strokeStyle = 'rgba(110,110,110,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();

    // Trigger level marker
    const vs   = this.getVoltScale(this.trigSource === 1 ? this.ch1 : this.ch2);
    const trigY = H/2 - this.trigLevel * vs * (H/2);
    const rgb  = this._hexToRgb(this._renderColor());
    ctx.fillStyle = `rgba(${rgb},0.7)`;
    ctx.beginPath(); ctx.moveTo(W-9, trigY-4); ctx.lineTo(W, trigY); ctx.lineTo(W-9, trigY+4); ctx.closePath(); ctx.fill();
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
    for (let px = 0; px < W; px++) {
      const si = start + Math.round(px * Math.max(0.01, sampPx));
      if (si >= data.length) break;
      pts.push([px, midY - Math.max(-2, Math.min(2, data[si])) * vs * (H/2)]);
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
  applyCRTCurve() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const vig = ctx.createRadialGradient(W/2,H/2,H*0.3, W/2,H/2,H*0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }

  _hexToRgb(hex) {
    // Handle hsl() strings too
    if (hex.startsWith('hsl')) {
      const [h, s, l] = hex.match(/[\d.]+/g).map(Number);
      const a = s/100 * Math.min(l/100, 1 - l/100);
      const f = n => { const k = (n + h/30) % 12; return Math.round((l/100 - a*Math.max(-1, Math.min(k-3, 9-k, 1))) * 255); };
      return `${f(0)},${f(8)},${f(4)}`;
    }
    if (!hex.startsWith('#') || hex.length < 7) return '0,255,65';
    return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
  }

  // ── Main render loop ─────────────────────────────────────────────────
  render() {
    if (!this.running) return;

    const pctx = this._phCtx;
    const W = this.canvas.width, H = this.canvas.height;

    // ① Phosphor decay
    pctx.globalAlpha = this.persistence;
    pctx.fillStyle   = '#000';
    pctx.fillRect(0, 0, W, H);
    pctx.globalAlpha = 1.0;

    // ② Grid
    if (this.showGrid) this.drawGrid(pctx);

    // ③ Get data
    let rawL = this.engine.getDataL(), rawR = this.engine.getDataR();
    let dataL, dataR;

    if (this.isRunning) {
      dataL = this.applyCoupling(rawL, this.ch1.coupling);
      dataR = this.applyCoupling(rawR, this.ch2.coupling);
      if (this._singleArmed) {
        this.frozenData = { L: dataL, R: dataR };
        this._singleArmed = false;
        this.isRunning = false;
      } else {
        this.frozenData = { L: dataL, R: dataR };
      }
    } else {
      dataL = this.frozenData?.L || rawL;
      dataR = this.frozenData?.R || rawR;
    }

    // ④ FX update (beat, hue, rotation, rms)
    this._updateFX(dataL);

    // ⑤ Apply rotation transform to phosphor ctx
    const rotActive = this.fx.rotation && this.fx._angle !== 0;
    if (rotActive) {
      pctx.save();
      pctx.translate(W/2, H/2);
      pctx.rotate(this.fx._angle);
      pctx.translate(-W/2, -H/2);
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
      pctx.globalAlpha  = fx._flash * 0.35;
      pctx.fillStyle    = fx.beatInvert ? '#ffffff' : this._renderColor();
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

    this.rafId = requestAnimationFrame(() => this.render());
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

// ─────────────────────────────────────────────────────────────
//  UIController
// ─────────────────────────────────────────────────────────────
class UIController {
  constructor(engine, scope, sigGen, recorder) {
    this.engine   = engine;
    this.scope    = scope;
    this.sigGen   = sigGen;
    this.recorder = recorder;
    this.knobs    = {};
  }

  init() {
    const e = this.engine, s = this.scope, sg = this.sigGen, rec = this.recorder;

    // ── CH1/CH2 V/div & position knobs ───────────────────────────────
    this.knobs.ch1vdiv = new Knob(document.getElementById('knob-ch1-vdiv'), VDIV, VD_DEFAULT, (step, idx) => {
      s.ch1.vdiv = step; s.ch1.vdivIdx = idx;
      document.getElementById('val-ch1-vdiv').textContent = step.label;
      this._updateStatus();
    });
    this.knobs.ch2vdiv = new Knob(document.getElementById('knob-ch2-vdiv'), VDIV, VD_DEFAULT, (step, idx) => {
      s.ch2.vdiv = step; s.ch2.vdivIdx = idx;
      document.getElementById('val-ch2-vdiv').textContent = step.label;
    });
    this.knobs.ch1pos = new Knob(document.getElementById('knob-ch1-pos'), null, 0, delta => {
      if (delta === 'reset') s.ch1.pos = 0;
      else s.ch1.pos = Math.max(-2, Math.min(2, s.ch1.pos + delta));
      document.getElementById('val-ch1-pos').textContent = s.ch1.pos.toFixed(2);
    });
    this.knobs.ch2pos = new Knob(document.getElementById('knob-ch2-pos'), null, 0, delta => {
      if (delta === 'reset') s.ch2.pos = 0;
      else s.ch2.pos = Math.max(-2, Math.min(2, s.ch2.pos + delta));
      document.getElementById('val-ch2-pos').textContent = s.ch2.pos.toFixed(2);
    });

    // ── Timebase & H-position knobs ───────────────────────────────────
    this.knobs.timebase = new Knob(document.getElementById('knob-timebase'), TIMEBASE, TB_DEFAULT, (step, idx) => {
      s.tb = step; s.tbIdx = idx;
      document.getElementById('val-timebase').textContent = step.label;
      this._updateStatus();
    });
    this.knobs.hpos = new Knob(document.getElementById('knob-hpos'), null, 0, delta => {
      if (delta === 'reset') s.hPos = 0;
      else s.hPos = Math.max(-2000, Math.min(2000, s.hPos + Math.round(delta * 400)));
      document.getElementById('val-hpos').textContent = s.hPos;
    });

    // ── Trigger level knob ────────────────────────────────────────────
    this.knobs.trigLevel = new Knob(document.getElementById('knob-trig-level'), null, 0, delta => {
      if (delta === 'reset') s.trigLevel = 0;
      else s.trigLevel = Math.max(-1, Math.min(1, s.trigLevel + delta));
      document.getElementById('val-trig-level').textContent = s.trigLevel.toFixed(2) + 'V';
      this._updateStatus();
    });

    // ── Coupling ──────────────────────────────────────────────────────
    document.querySelectorAll('.coup-row').forEach(row => {
      const ch = parseInt(row.dataset.ch);
      row.querySelectorAll('.coup-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          row.querySelectorAll('.coup-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (ch === 1) s.ch1.coupling = btn.dataset.coup;
          else          s.ch2.coupling = btn.dataset.coup;
        });
      });
    });

    // ── YT / XY mode ─────────────────────────────────────────────────
    document.getElementById('btn-yt').addEventListener('click', () => {
      s.mode = 'YT';
      document.getElementById('btn-yt').classList.add('active');
      document.getElementById('btn-xy').classList.remove('active');
      this._resetPhosphor();
    });
    document.getElementById('btn-xy').addEventListener('click', () => {
      s.mode = 'XY';
      document.getElementById('btn-xy').classList.add('active');
      document.getElementById('btn-yt').classList.remove('active');
      this._resetPhosphor();
    });

    // ── Trigger controls ──────────────────────────────────────────────
    document.getElementById('trig-source').addEventListener('change', e => { s.trigSource = +e.target.value; this._updateStatus(); });
    document.getElementById('trig-slope').addEventListener('change', e => { s.trigEdge = e.target.value; this._updateStatus(); });
    document.querySelectorAll('.trig-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.trig-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        s.trigMode = btn.dataset.mode;
        this._updateStatus();
      });
    });

    // ── RUN/STOP ──────────────────────────────────────────────────────
    const runBtn = document.getElementById('btn-run-stop');
    runBtn.addEventListener('click', () => {
      s.isRunning = !s.isRunning;
      runBtn.textContent = s.isRunning ? 'RUN' : 'STOP';
      runBtn.className   = 'run-stop-btn ' + (s.isRunning ? 'running' : 'stopped');
    });

    document.getElementById('btn-single').addEventListener('click', () => {
      s.isRunning = true; s._singleArmed = true;
      runBtn.textContent = 'RUN'; runBtn.className = 'run-stop-btn running';
    });

    document.getElementById('btn-auto-set').addEventListener('click', () => {
      s.autoSet();
      this.knobs.timebase.index = s.tbIdx; this.knobs.timebase._updateAngle();
      this.knobs.ch1vdiv.index  = s.ch1.vdivIdx; this.knobs.ch1vdiv._updateAngle();
      document.getElementById('val-timebase').textContent = s.tb.label;
      document.getElementById('val-ch1-vdiv').textContent = s.ch1.vdiv.label;
      document.getElementById('val-ch1-pos').textContent  = '0.00';
      document.getElementById('val-hpos').textContent     = '0';
      document.getElementById('val-trig-level').textContent = '0.00V';
      this._updateStatus();
    });

    document.getElementById('btn-measure').addEventListener('click', () => {
      s.showMeasure = !s.showMeasure;
      document.getElementById('btn-measure').classList.toggle('active', s.showMeasure);
      document.getElementById('meas-led').classList.toggle('on', s.showMeasure);
    });
    document.getElementById('btn-measure').classList.add('active');
    document.getElementById('meas-led').classList.add('on');

    document.getElementById('btn-reset-pos').addEventListener('click', () => {
      s.ch1.pos = 0; s.ch2.pos = 0; s.hPos = 0;
      ['val-ch1-pos','val-ch2-pos'].forEach(id => document.getElementById(id).textContent = '0.00');
      document.getElementById('val-hpos').textContent = '0';
    });

    document.getElementById('show-grid').addEventListener('change', e => s.showGrid = e.target.checked);
    document.getElementById('crt-curve').addEventListener('change', e => s.crtCurve = e.target.checked);
    document.getElementById('scanlines').addEventListener('change', e => {
      document.getElementById('crt-overlay').classList.toggle('scanlines', e.target.checked);
    });

    // ── Audio ─────────────────────────────────────────────────────────
    const fileDrop  = document.getElementById('file-drop');
    const fileLabel = document.getElementById('file-label');
    const fileInput = document.getElementById('audio-file');
    const btnPlay   = document.getElementById('btn-play');
    const btnStop   = document.getElementById('btn-stop-audio');
    const stSrc     = document.getElementById('st-src');

    fileDrop.addEventListener('click', () => fileInput.click());
    fileDrop.addEventListener('dragover', ev => { ev.preventDefault(); fileDrop.classList.add('drag-over'); });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));
    fileDrop.addEventListener('drop', ev => {
      ev.preventDefault(); fileDrop.classList.remove('drag-over');
      const f = ev.dataTransfer.files[0]; if (f) this._loadFile(f);
    });
    fileInput.addEventListener('change', ev => { const f = ev.target.files[0]; if (f) this._loadFile(f); });
    btnPlay.addEventListener('click', () => {
      if (!e.buffer) return;
      if (e.isPlaying) { e.pause(); btnPlay.textContent = '▶ PLAY'; }
      else             { e.play();  btnPlay.textContent = '⏸ PAUSE'; }
    });
    btnStop.addEventListener('click', () => { e.stop(); btnPlay.textContent = '▶ PLAY'; });
    document.getElementById('btn-mic').addEventListener('click', async () => {
      const btn = document.getElementById('btn-mic');
      if (e.micStream) { e.stopMic(); btn.classList.remove('active'); stSrc.textContent = 'No signal'; }
      else { try { await e.startMic(); btn.classList.add('active'); stSrc.textContent = 'Microphone'; } catch (_) { alert('Mic denied.'); } }
    });
    document.getElementById('volume').addEventListener('input', ev => e.setVolume(+ev.target.value));
    document.getElementById('progress-bg').addEventListener('click', ev => {
      if (!e.buffer) return;
      const r = ev.currentTarget.getBoundingClientRect();
      e.pauseOffset = ((ev.clientX - r.left) / r.width) * e.buffer.duration;
      if (e.isPlaying) e.play();
    });

    // ── Signal Generator ──────────────────────────────────────────────
    const genFreqL = document.getElementById('gen-freq-l');
    const genFreqR = document.getElementById('gen-freq-r');
    const genPhase = document.getElementById('gen-phase');
    const genWave  = document.getElementById('gen-wave');
    const genAmp   = document.getElementById('gen-amp');
    const btnGenStart = document.getElementById('btn-gen-start');
    const btnGenStop  = document.getElementById('btn-gen-stop');
    const genRatioRow = document.getElementById('gen-ratio-row');

    genFreqL.addEventListener('input', () => { sg.setFreqL(+genFreqL.value); this._syncRFreq(); });
    genFreqR.addEventListener('input', () => sg.setFreqR(+genFreqR.value));
    genPhase.addEventListener('input', () => {
      sg.phase = +genPhase.value;
      document.getElementById('gen-phase-val').textContent = genPhase.value + '°';
    });
    genWave.addEventListener('change', () => sg.setWaveform(genWave.value));
    genAmp.addEventListener('input', () => {
      sg.setAmplitude(+genAmp.value);
      document.getElementById('gen-amp-val').textContent = (+genAmp.value).toFixed(2);
    });

    // Ratio presets
    let activeRatio = 1;
    genRatioRow.querySelectorAll('.ratio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        genRatioRow.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeRatio = +btn.dataset.ratio;
        genFreqR.value = Math.round(sg.freqL * activeRatio);
        sg.setFreqR(sg.freqL * activeRatio);
      });
    });

    this._syncRFreq = () => {
      genFreqR.value = Math.round(sg.freqL * activeRatio);
      sg.setFreqR(sg.freqL * activeRatio);
    };

    btnGenStart.addEventListener('click', async () => {
      await this._ensureAudio();
      sg.freqL  = +genFreqL.value;
      sg.freqR  = +genFreqR.value;
      sg.phase  = +genPhase.value;
      sg.waveform = genWave.value;
      sg.init(e.actx);
      sg.start(e.analyserL, e.analyserR);
      btnGenStart.disabled = true;
      btnGenStop.disabled  = false;
      btnGenStart.classList.remove('accent');
      btnGenStop.classList.add('active');
      // Auto-switch to XY for shape creation
      if (s.mode !== 'XY') {
        s.mode = 'XY';
        document.getElementById('btn-xy').classList.add('active');
        document.getElementById('btn-yt').classList.remove('active');
        this._resetPhosphor();
      }
      document.getElementById('st-src').textContent = 'Signal Gen';
    });

    btnGenStop.addEventListener('click', () => {
      sg.stop();
      btnGenStart.disabled = false;
      btnGenStop.disabled  = true;
      btnGenStart.classList.add('accent');
      btnGenStop.classList.remove('active');
      document.getElementById('st-src').textContent = 'No signal';
    });

    // ── FX controls ───────────────────────────────────────────────────
    const fxBindCheck = (id, key) => {
      document.getElementById(id).addEventListener('change', e => { s.fx[key] = e.target.checked; });
    };
    fxBindCheck('fx-reactive',  'reactive');
    fxBindCheck('fx-beat',      'beatFlash');
    fxBindCheck('fx-cycle',     'colorCycle');
    fxBindCheck('fx-bloom',     'bloom');
    fxBindCheck('fx-mirror-x',  'mirrorX');
    fxBindCheck('fx-mirror-y',  'mirrorY');
    fxBindCheck('fx-rotate',    'rotation');
    fxBindCheck('fx-invert',    'beatInvert');

    this._bindRange('fx-cycle-speed', v => { s.fx.cycleSpeed = v; document.getElementById('fx-cs-val').textContent = v.toFixed(1); });
    this._bindRange('fx-rot-speed',   v => { s.fx.rotSpeed   = v; document.getElementById('fx-rs-val').textContent = v.toFixed(3); });
    this._bindRange('fx-beat-sens',   v => { s.fx.beatSens   = v; document.getElementById('fx-bs-val').textContent = v.toFixed(2); });

    // ── Record ────────────────────────────────────────────────────────
    const btnRec = document.getElementById('btn-record');
    btnRec.addEventListener('click', async () => {
      if (rec.isRecording) {
        rec.stop();
        btnRec.textContent = '● REC';
        btnRec.classList.remove('recording');
      } else {
        await this._ensureAudio();
        rec.start(e.actx, e.gainNode);
        btnRec.textContent = '■ STOP';
        btnRec.classList.add('recording');
      }
    });

    // ── Display customize ─────────────────────────────────────────────
    document.getElementById('toggle-display').addEventListener('click', () => {
      const dc   = document.getElementById('display-controls');
      const open = dc.style.display === 'none';
      dc.style.cssText = open ? 'display:flex;flex-direction:column;gap:6px' : 'display:none';
      document.getElementById('toggle-display').textContent = open ? 'DISPLAY ▾' : 'DISPLAY ▸';
    });

    document.getElementById('phosphor-color').addEventListener('input', ev => {
      s.color = ev.target.value;
      document.documentElement.style.setProperty('--p', ev.target.value);
    });
    this._bindRange('beam-width',  v => { s.beamWidth   = v; document.getElementById('beam-width-val').textContent  = v.toFixed(1); });
    this._bindRange('glow',        v => { s.glowAmount  = v; document.getElementById('glow-val').textContent         = Math.round(v); });
    this._bindRange('persistence', v => { s.persistence = v; document.getElementById('persistence-val').textContent = v.toFixed(2); });

    const PRESETS = {
      classic: { color: '#00ff41', glow: 12, persistence: 0.15, beam: 1.5 },
      amber:   { color: '#ffb000', glow: 14, persistence: 0.12, beam: 1.5 },
      blue:    { color: '#00aaff', glow: 16, persistence: 0.18, beam: 1.2 },
      white:   { color: '#e0e0e0', glow: 8,  persistence: 0.22, beam: 1.0 },
      neon:    { color: '#ff00ff', glow: 20, persistence: 0.08, beam: 2.0 },
    };
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = PRESETS[btn.dataset.preset]; if (!p) return;
        s.color = p.color; s.glowAmount = p.glow; s.persistence = p.persistence; s.beamWidth = p.beam;
        document.getElementById('phosphor-color').value = p.color;
        ['glow','persistence','beam-width'].forEach(id => {
          const el = document.getElementById(id);
          if (id === 'glow') el.value = p.glow;
          else if (id === 'persistence') el.value = p.persistence;
          else el.value = p.beam;
        });
        document.getElementById('glow-val').textContent         = p.glow;
        document.getElementById('persistence-val').textContent  = p.persistence.toFixed(2);
        document.getElementById('beam-width-val').textContent   = p.beam.toFixed(1);
        document.documentElement.style.setProperty('--p', p.color);
      });
    });

    // ── Progress & status polling ─────────────────────────────────────
    setInterval(() => {
      if (e.buffer) {
        const dur = e.buffer.duration;
        const cur = Math.min(e.getCurrentTime(), dur);
        document.getElementById('progress-fill').style.width = (cur/dur*100) + '%';
        const fmt = t => `${Math.floor(t/60)}:${Math.floor(t%60).toString().padStart(2,'0')}`;
        document.getElementById('time-lbl').textContent = `${fmt(cur)} / ${fmt(dur)}`;
      }
      const f = s.measFreq;
      document.getElementById('st-freq').textContent = f > 0
        ? (f >= 1000 ? `${(f/1000).toFixed(3)}kHz` : `${f.toFixed(2)}Hz`) : '---';
    }, 100);

    this._updateStatus();
    s.start();
  }

  _updateStatus() {
    const s = this.scope;
    document.getElementById('st-ch1').textContent  = `CH1: ${s.ch1.vdiv.label}/div`;
    document.getElementById('st-tb').textContent   = `${s.tb.label}/div`;
    const edge = s.trigEdge === 'rising' ? '↑' : '↓';
    document.getElementById('st-trig').textContent = `TRIG: ${s.trigMode.toUpperCase()} CH${s.trigSource} ${edge} ${s.trigLevel.toFixed(2)}V`;
  }

  async _loadFile(file) {
    const e = this.engine;
    document.getElementById('file-label').textContent = 'Loading…';
    try {
      await e.loadFile(file);
      const name = file.name.length > 20 ? file.name.slice(0,18)+'…' : file.name;
      document.getElementById('file-label').textContent = name;
      document.getElementById('file-drop').classList.add('loaded');
      document.getElementById('btn-play').disabled = false;
      document.getElementById('btn-stop-audio').disabled = false;
      document.getElementById('st-src').textContent = name;
      e.play();
      document.getElementById('btn-play').textContent = '⏸ PAUSE';
    } catch (err) {
      document.getElementById('file-label').textContent = 'Error';
      console.error(err);
    }
  }

  _bindRange(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', e => fn(parseFloat(e.target.value)));
    fn(parseFloat(el.value));
  }

  _resetPhosphor() {
    this.scope._phCtx.fillStyle = '#000';
    this.scope._phCtx.fillRect(0, 0, this.scope.canvas.width, this.scope.canvas.height);
  }

  async _ensureAudio() {
    if (this._audioReady) return;
    await this.engine.init();
    this.sigGen.init(this.engine.actx);
    this._audioReady = true;
  }
}

// ─────────────────────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────────────────────
(async () => {
  const canvas   = document.getElementById('scope');
  const engine   = new AudioEngine();
  const scope    = new Oscilloscope(canvas, engine);
  const sigGen   = new SignalGenerator();
  const recorder = new VideoRecorder(canvas);

  let audioReady = false;
  async function ensureAudio() {
    if (audioReady) return;
    await engine.init();
    sigGen.init(engine.actx);
    audioReady = true;
  }

  const origLoad = engine.loadFile.bind(engine);
  const origMic  = engine.startMic.bind(engine);
  engine.loadFile  = async f  => { await ensureAudio(); return origLoad(f); };
  engine.startMic  = async () => { await ensureAudio(); return origMic(); };
  document.addEventListener('click', ensureAudio, { once: true });

  const ui = new UIController(engine, scope, sigGen, recorder);
  ui._audioReady = false;
  ui._ensureAudio = ensureAudio;
  ui.init();
})();

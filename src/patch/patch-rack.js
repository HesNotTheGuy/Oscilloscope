'use strict';

import { BeatDetector } from '../beat-detector.js';

// ─────────────────────────────────────────────────────────────
//  PatchRack — modular patch bay inserted between the engine's
//  visual buses and its analysers. While enabled, everything the
//  app visualises AND plays flows through the rack, so the whole
//  visualiser stack (scope/spectrum/vectorscope/spectrogram, all
//  themes and beam FX) shows the processed signal.
//
//  Interaction model (validated in the PATCH-1 prototype):
//   - drag jack → jack to patch (either direction, forgiving drop)
//   - plain click on a jack PROBES it: the app's visualisers show
//     that point in the circuit until clicked again
//   - click a cable to unplug (PATCHING mode only)
//   - PATCHING / PLAYING modes: playing locks the cables
//   - feedback loops get an automatic 5 ms delay (Web Audio
//     silences delay-free cycles) — feedback is a feature
// ─────────────────────────────────────────────────────────────

const SENS = { 'vcf.cv': 3600, 'vco.fm': 120, 'echo.cv': 0.05, 'out.cv': 0.35, 'fold.cv': 3 };

const VERB = { 'lfo.out': 'wobbling', 'seq.out': 'stepping', 'sh.out': 'randomizing', 'tracer.out': 'riding', 'pulse.out': 'punching' };
const DEST_PHRASE = {
  'vcf.cv': 'the filter', 'vco.fm': 'the pitch', 'out.cv': 'the volume',
  'echo.cv': 'the echo time', 'vcf.in': 'into the filter', 'out.in': 'the speakers',
  'mix.a': 'into the mixer', 'mix.b': 'into the mixer',
  'echo.in': 'into the echo', 'drive.in': 'into the drive',
  'tracer.in': 'the tracer', 'ghost.in': 'into the ghost', 'fold.in': 'into the fold', 'fold.cv': 'the fold',
};
const JACK_NAME = {
  'input.out': 'the source', 'vco.out': 'the synth', 'lfo.out': 'the LFO',
  'seq.out': 'the sequencer', 'sh.out': 'the S&H', 'vcf.out': 'the filter',
  'mix.out': 'the mix', 'echo.out': 'the echo', 'drive.out': 'the drive',
  'tracer.out': 'the tracer', 'pulse.out': 'the pulse', 'ghost.out': 'the ghost', 'fold.out': 'the fold',
};

// Declarative module layout. knobs: [id, label, default]; jacks: [id, dir, kind, label]
const ROWS = [
  [
    { id: 'input', name: 'Input', sub: 'what the app is playing', w: 150,
      knobs: [['input.level', 'Level', 0.9]],
      jacks: [['input.out', 'out', 'audio', 'Out']], led: 'pk-led-input' },
    { id: 'vco', name: 'VCO', sub: 'test tone', w: 158,
      knobs: [['vco.freq', 'Freq', 0.5], ['vco.level', 'Level', 0]],
      jacks: [['vco.fm', 'in', 'cv', '▸ FM'], ['vco.out', 'out', 'audio', 'Out']] },
    { id: 'lfo', name: 'LFO', sub: 'slow wobble', subDyn: 'lfo', w: 170, waves: true,
      knobs: [['lfo.rate', 'Rate', 0.45], ['lfo.depth', 'Depth', 0.6]],
      jacks: [['lfo.out', 'out', 'cv', 'Out']] },
    { id: 'seq', name: 'Seq', sub: 'step melody', subDyn: 'seq', w: 352, seq: true,
      knobs: [['seq.rate', 'Rate', 0.5]],
      jacks: [['seq.out', 'out', 'cv', 'Out']] },
    { id: 'sh', name: 'S&H', sub: 'random steps', subDyn: 'sh', w: 128,
      knobs: [['sh.rate', 'Rate', 0.5]],
      jacks: [['sh.out', 'out', 'cv', 'Out']], led: 'pk-led-sh' },
  ],
  [
    { id: 'vcf', name: 'VCF', sub: 'tone filter', w: 176,
      knobs: [['vcf.cutoff', 'Cutoff', 0.62], ['vcf.res', 'Res', 0.2]],
      jacks: [['vcf.in', 'in', 'audio', '▸ In'], ['vcf.cv', 'in', 'cv', '▸ CV'], ['vcf.out', 'out', 'audio', 'Out']] },
    { id: 'mix', name: 'Mix', sub: 'blend two sounds', w: 150,
      knobs: [['mix.a', 'A', 0.7], ['mix.b', 'B', 0.7]],
      jacks: [['mix.a', 'in', 'audio', '▸ A'], ['mix.b', 'in', 'audio', '▸ B'], ['mix.out', 'out', 'audio', 'Out']] },
    { id: 'echo', name: 'Echo', sub: 'repeats & tape warble', w: 190,
      knobs: [['echo.time', 'Time', 0.4], ['echo.fdbk', 'Fdbk', 0.45]],
      jacks: [['echo.in', 'in', 'audio', '▸ In'], ['echo.cv', 'in', 'cv', '▸ Time'], ['echo.out', 'out', 'audio', 'Out']] },
    { id: 'drive', name: 'Drive', sub: 'grit & warmth', w: 140,
      knobs: [['drive.amt', 'Drive', 0.3]],
      jacks: [['drive.in', 'in', 'audio', '▸ In'], ['drive.out', 'out', 'audio', 'Out']] },
    { id: 'out', name: 'Out', sub: 'speakers + visualizers', w: 150,
      knobs: [['out.monitor', 'Monitor', 0.8]],
      jacks: [['out.in', 'in', 'audio', '▸ In'], ['out.cv', 'in', 'cv', '▸ Trem']] },
  ],
  [
    { id: 'tracer', name: 'Tracer', sub: 'the music moves the knobs', subDyn: 'tracer', w: 172,
      knobs: [['tracer.speed', 'Speed', 0.5], ['tracer.gain', 'Gain', 0.33]],
      jacks: [['tracer.in', 'in', 'audio', '▸ In'], ['tracer.out', 'out', 'cv', 'Out']] },
    { id: 'pulse', name: 'Pulse', sub: 'fires on the beat', subDyn: 'pulse', w: 140,
      knobs: [['pulse.decay', 'Decay', 0.3]],
      jacks: [['pulse.out', 'out', 'cv', 'Out']], led: 'pk-led-pulse' },
    { id: 'ghost', name: 'Ghost', sub: 'a second, blurrier you', w: 170,
      knobs: [['ghost.rate', 'Rate', 0.5], ['ghost.depth', 'Depth', 0.5]],
      jacks: [['ghost.in', 'in', 'audio', '▸ In'], ['ghost.out', 'out', 'audio', 'Out']] },
    { id: 'fold', name: 'Fold', sub: 'creases the wave', w: 172,
      knobs: [['fold.amt', 'Fold', 0.35]],
      jacks: [['fold.in', 'in', 'audio', '▸ In'], ['fold.cv', 'in', 'cv', '▸ CV'], ['fold.out', 'out', 'audio', 'Out']] },
  ],
];

export class PatchRack {
  constructor(engine) {
    this.engine = engine;
    this.enabled = false;
    this.playMode = false;
    this.probeId = null;
    this.cables = [];        // {from, to, kind, gain, src, delay}
    this.knobs = {};         // id -> 0..1
    this.taps = {};          // out-jack id -> {analyser, buf, node}
    this.inTargets = {};     // in-jack id -> AudioNode|AudioParam|array
    this.jackEls = {};
    this.jackPos = {};
    this.audio = null;       // node graph, built once
    this._drag = null;
    this._hoverIdx = -1;
    this._lastDragEnd = 0;
    this._raf = 0;
    this._lfoType = 'sine';
    this._seqStep = 0;
    this._built = false;
  }

  // ── DOM ─────────────────────────────────────────────────────
  build() {
    if (this._built) return;
    this._built = true;
    const el = document.createElement('div');
    el.id = 'pk-overlay';
    el.className = 'pk-hidden';
    el.innerHTML = `
      <div class="pk-top">
        <div class="pk-title">PATCH<em> MODE</em></div>
        <button class="pk-btn pk-active" id="pk-mode">PATCHING</button>
        <div class="pk-hint" id="pk-hint">drag <b>jack → jack</b> to patch &middot; click a jack to <b>probe</b> it on the scope &middot; click a cable to unplug</div>
        <button class="pk-btn pk-close" id="pk-close" title="Back to the scope (Esc)">✕ CLOSE</button>
      </div>
      <div class="pk-legend">
        <span><span class="pk-swatch pk-sw-audio"></span>sound</span>
        <span><span class="pk-swatch pk-sw-cv"></span>modulation (moves a knob for you)</span>
        <span>signal flows out → in &mdash; follow the moving dot</span>
      </div>
      <div class="pk-rack" id="pk-rack"><canvas id="pk-cables"></canvas></div>`;
    document.body.appendChild(el);
    this.overlay = el;
    this.rack = el.querySelector('#pk-rack');
    this.cablesCv = el.querySelector('#pk-cables');
    this.cctx = this.cablesCv.getContext('2d');
    this.hintEl = el.querySelector('#pk-hint');
    this._hintIdle = this.hintEl.innerHTML;
    this._hintLocked = 'cables locked &mdash; drag knobs, click jacks to probe';

    const rail = () => { const r = document.createElement('div'); r.className = 'pk-rail'; return r; };
    this.rack.insertBefore(rail(), this.cablesCv);
    for (const row of ROWS) {
      const rowEl = document.createElement('div');
      rowEl.className = 'pk-row';
      for (const m of row) rowEl.appendChild(this._buildModule(m));
      this.rack.insertBefore(rowEl, this.cablesCv);
      this.rack.insertBefore(rail(), this.cablesCv);
    }
    this._bindUI();
  }

  _buildModule(m) {
    const mod = document.createElement('div');
    mod.className = 'pk-module';
    mod.style.width = m.w + 'px';
    let html = `<div class="pk-name">${m.name}</div>` +
      `<div class="pk-sub"${m.subDyn ? ` data-pk-sub="${m.subDyn}"` : ''}${m.id === 'input' ? ' data-pk-sub-input' : ''}>${m.sub}</div>`;
    if (m.led) html += `<div class="pk-led" id="${m.led}"></div>`;
    if (m.waves) html += `<div class="pk-waves">` +
      ['sine', 'triangle', 'square', 'sawtooth'].map((w, i) =>
        `<button class="pk-btn pk-wave${i === 0 ? ' pk-active' : ''}" data-pk-wave="${w}">${['SIN', 'TRI', 'SQR', 'SAW'][i]}</button>`).join('') + `</div>`;
    html += `<div class="pk-knobs${m.seq ? ' pk-seq' : ''}">`;
    for (const [id, label, v] of m.knobs) {
      html += `<div class="pk-kwrap"><div class="pk-knob" data-pk-knob="${id}" data-v="${v}"><div class="pk-ptr"></div></div>` +
        `<label>${label}</label><div class="pk-val" data-pk-val="${id}"></div></div>`;
    }
    if (m.seq) {
      const defs = [0, 0.25, 0.5, 0.35, 0.7, 0.5, 0.9, 0.6];
      for (let i = 0; i < 8; i++) {
        html += `<div class="pk-kwrap"><div class="pk-led pk-seq-led"></div>` +
          `<div class="pk-knob pk-mini" data-pk-knob="seq.s${i}" data-v="${defs[i]}"><div class="pk-ptr"></div></div><label>${i + 1}</label></div>`;
      }
    }
    html += `</div><div class="pk-jacks">`;
    for (const [id, dir, kind, label] of m.jacks) {
      html += `<div class="pk-jwrap${dir === 'out' ? ' pk-out' : ''}">` +
        `<div class="pk-jack" data-pk-jack="${id}" data-dir="${dir}" data-kind="${kind}"></div><label>${label}</label></div>`;
    }
    html += `</div>`;
    mod.innerHTML = html;
    return mod;
  }

  // ── Formatting & knob application ───────────────────────────
  _fmt(id, v) {
    switch (id) {
      case 'vco.freq':  return (27.5 * Math.pow(16, v)).toFixed(0) + ' Hz';
      case 'lfo.rate': case 'lfo2.rate': return (0.05 * Math.pow(400, v)).toFixed(2) + ' Hz';
      case 'seq.rate':  return (0.5 * Math.pow(32, v)).toFixed(1) + ' Hz';
      case 'sh.rate':   return (0.5 * Math.pow(60, v)).toFixed(1) + ' Hz';
      case 'vcf.cutoff': { const f = 60 * Math.pow(200, v); return f >= 1000 ? (f / 1000).toFixed(1) + ' kHz' : f.toFixed(0) + ' Hz'; }
      case 'vcf.res':   return 'Q ' + (0.5 + v * 18).toFixed(1);
      case 'echo.time': return (0.05 + v * 0.75).toFixed(2) + ' s';
      case 'drive.amt': return Math.round(1 + v * 39) + 'x';
      case 'tracer.speed': return (2 * Math.pow(25, v)).toFixed(0) + ' Hz';
      case 'tracer.gain': return (1 + v * 3).toFixed(1) + 'x';
      case 'pulse.decay': return (0.05 + v * 0.95).toFixed(2) + ' s';
      case 'ghost.rate': return (0.1 * Math.pow(40, v)).toFixed(2) + ' Hz';
      default:          return Math.round(v * 100) + '%';
    }
  }

  setKnob(id, v) {
    v = Math.min(1, Math.max(0, v));
    this.knobs[id] = v;
    const ptr = this.overlay.querySelector(`[data-pk-knob="${id}"] .pk-ptr`);
    if (ptr) ptr.style.transform = `rotate(${-135 + v * 270}deg)`;
    const val = this.overlay.querySelector(`[data-pk-val="${id}"]`);
    if (val) val.textContent = this._fmt(id, v);
    const a = this.audio;
    if (!a) return;
    const t = this.engine.actx.currentTime;
    switch (id) {
      case 'input.level': a.inputGain.gain.setTargetAtTime(v, t, .02); break;
      case 'vco.freq': { const f = 27.5 * Math.pow(16, v);
        a.osc1.frequency.setTargetAtTime(f, t, .02); a.osc2.frequency.setTargetAtTime(f * 1.004, t, .02); break; }
      case 'vco.level': a.vcoOut.gain.setTargetAtTime(0.5 * v, t, .02); break;
      case 'lfo.rate':  a.lfo.frequency.setTargetAtTime(0.05 * Math.pow(400, v), t, .02); break;
      case 'lfo.depth': a.lfoDepth.gain.setTargetAtTime(v * v, t, .02); break;
      case 'vcf.cutoff': a.filter.frequency.setTargetAtTime(60 * Math.pow(200, v), t, .02); break;
      case 'vcf.res':   a.filter.Q.setTargetAtTime(0.5 + v * 18, t, .02); break;
      case 'mix.a':     a.mixA.gain.setTargetAtTime(v, t, .02); break;
      case 'mix.b':     a.mixB.gain.setTargetAtTime(v, t, .02); break;
      // slow time constant on purpose: gliding delay time = tape-style pitch warp
      case 'echo.time': a.echoDelay.delayTime.setTargetAtTime(0.05 + v * 0.75, t, .08); break;
      case 'echo.fdbk': a.echoFb.gain.setTargetAtTime(v * 0.85, t, .02); break;
      case 'drive.amt':
        a.drivePre.gain.setTargetAtTime(1 + v * 39, t, .02);
        a.drivePost.gain.setTargetAtTime(0.9 / (1 + v * 2.5), t, .02); break;
      case 'out.monitor': a.master.gain.setTargetAtTime(v * v, t, .02); break;
      case 'tracer.speed': a.tracerLP.frequency.setTargetAtTime(2 * Math.pow(25, v), t, .02); break;
      case 'tracer.gain': a.tracerGain.gain.setTargetAtTime(1 + v * 3, t, .02); break;
      case 'ghost.rate': a.ghostLfo.frequency.setTargetAtTime(0.1 * Math.pow(40, v), t, .02); break;
      case 'ghost.depth': a.ghostLfoGain.gain.setTargetAtTime(v * 0.005, t, .02); break;
      case 'fold.amt': a.foldShaper.curve = this._foldCurve(v); break;
    }
  }

  // ── Audio graph ─────────────────────────────────────────────
  _buildGraph() {
    if (this.audio) return;
    const actx = this.engine.actx;
    const a = this.audio = {};
    a.inputGain = new GainNode(actx, { gain: 0.9 });
    a.osc1 = new OscillatorNode(actx, { type: 'sawtooth' });
    a.osc2 = new OscillatorNode(actx, { type: 'sawtooth' });
    a.vcoOut = new GainNode(actx, { gain: 0 });
    a.osc1.connect(a.vcoOut); a.osc2.connect(a.vcoOut);
    a.lfo = new OscillatorNode(actx, { type: this._lfoType });
    a.lfoDepth = new GainNode(actx, { gain: 0 });
    a.lfo.connect(a.lfoDepth);
    a.seqSrc = new ConstantSourceNode(actx, { offset: 0 });
    a.shSrc = new ConstantSourceNode(actx, { offset: 0 });
    a.filter = new BiquadFilterNode(actx, { type: 'lowpass' });
    a.mixA = new GainNode(actx, { gain: 0 });
    a.mixB = new GainNode(actx, { gain: 0 });
    a.mixBus = new GainNode(actx, { gain: 1 });
    a.mixA.connect(a.mixBus); a.mixB.connect(a.mixBus);
    a.echoIn = new GainNode(actx, { gain: 1 });
    a.echoDelay = new DelayNode(actx, { delayTime: 0.35, maxDelayTime: 2 });
    a.echoFb = new GainNode(actx, { gain: 0 });
    a.echoWet = new GainNode(actx, { gain: 0.6 });
    a.echoOut = new GainNode(actx, { gain: 1 });
    a.echoIn.connect(a.echoOut);
    a.echoIn.connect(a.echoDelay);
    a.echoDelay.connect(a.echoWet).connect(a.echoOut);
    a.echoDelay.connect(a.echoFb).connect(a.echoDelay);
    a.drivePre = new GainNode(actx, { gain: 1 });
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(3 * x) / Math.tanh(3); }
    a.shaper = new WaveShaperNode(actx, { curve, oversample: '2x' });
    a.drivePost = new GainNode(actx, { gain: 0.9 });
    a.drivePre.connect(a.shaper).connect(a.drivePost);
    // TRACER: |x| -> lowpass = the loudness of the input, as audio-rate CV
    a.tracerIn = new GainNode(actx, { gain: 1 });
    const absCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) absCurve[i] = Math.abs(i / 511.5 - 1);
    a.tracerAbs = new WaveShaperNode(actx, { curve: absCurve });
    a.tracerLP = new BiquadFilterNode(actx, { type: 'lowpass', frequency: 10, Q: 0.5 });
    a.tracerGain = new GainNode(actx, { gain: 2 });
    a.tracerIn.connect(a.tracerAbs).connect(a.tracerLP).connect(a.tracerGain);
    // PULSE: beat-triggered decay envelope on a ConstantSource
    a.pulseSrc = new ConstantSourceNode(actx, { offset: 0 });
    // GHOST: dry + LFO-modulated short delay (chorus / CRT double image)
    a.ghostIn = new GainNode(actx, { gain: 1 });
    a.ghostDelay = new DelayNode(actx, { delayTime: 0.016, maxDelayTime: 0.06 });
    a.ghostLfo = new OscillatorNode(actx, { type: 'sine', frequency: 0.6 });
    a.ghostLfoGain = new GainNode(actx, { gain: 0.0025 });
    a.ghostLfo.connect(a.ghostLfoGain).connect(a.ghostDelay.delayTime);
    a.ghostWet = new GainNode(actx, { gain: 0.7 });
    a.ghostOut = new GainNode(actx, { gain: 1 });
    a.ghostIn.connect(a.ghostOut);
    a.ghostIn.connect(a.ghostDelay).connect(a.ghostWet).connect(a.ghostOut);
    // FOLD: sine-shaped wavefolder; knob rebuilds the curve, CV drives deeper
    a.foldPre = new GainNode(actx, { gain: 1 });
    a.foldShaper = new WaveShaperNode(actx, { curve: this._foldCurve(0.35), oversample: '4x' });
    a.foldOut = new GainNode(actx, { gain: 0.9 });
    a.foldPre.connect(a.foldShaper).connect(a.foldOut);
    this._beat = new BeatDetector();
    a.master = new GainNode(actx, { gain: 0 });
    // limiter so feedback patches and hot drives can't blast the speakers
    a.limiter = new DynamicsCompressorNode(actx, { threshold: -6, ratio: 12 });
    a.master.connect(a.limiter);
    a.osc1.start(); a.osc2.start(); a.lfo.start(); a.seqSrc.start(); a.shSrc.start();
    a.pulseSrc.start(); a.ghostLfo.start();

    const tap = (id, node) => {
      const an = actx.createAnalyser();
      an.fftSize = 512;
      node.connect(an);
      this.taps[id] = { analyser: an, buf: new Float32Array(an.fftSize), node };
    };
    tap('input.out', a.inputGain);
    tap('vco.out', a.vcoOut);
    tap('lfo.out', a.lfoDepth);
    tap('seq.out', a.seqSrc);
    tap('sh.out', a.shSrc);
    tap('vcf.out', a.filter);
    tap('mix.out', a.mixBus);
    tap('echo.out', a.echoOut);
    tap('drive.out', a.drivePost);
    tap('tracer.out', a.tracerGain);
    tap('pulse.out', a.pulseSrc);
    tap('ghost.out', a.ghostOut);
    tap('fold.out', a.foldOut);
    this.inTargets = {
      'vcf.in': a.filter, 'vcf.cv': a.filter.frequency,
      'vco.fm': [a.osc1.frequency, a.osc2.frequency],
      'mix.a': a.mixA, 'mix.b': a.mixB,
      'echo.in': a.echoIn, 'echo.cv': a.echoDelay.delayTime,
      'drive.in': a.drivePre,
      'tracer.in': a.tracerIn,
      'ghost.in': a.ghostIn,
      'fold.in': a.foldPre, 'fold.cv': a.foldPre.gain,
      'out.in': a.master, 'out.cv': a.master.gain,
    };
    for (const id in this.knobs) this.setKnob(id, this.knobs[id]);
    this._seqTick(); this._shTick();

    // Starter patch: whatever the app is playing, through a wobbling filter.
    this.connect('input.out', 'vcf.in');
    this.connect('lfo.out', 'vcf.cv');
    this.connect('vcf.out', 'out.in');
  }

  _foldCurve(v) {
    const c = new Float32Array(2048);
    const k = Math.PI * (0.5 + v * 5);
    for (let i = 0; i < 2048; i++) c[i] = Math.sin((i / 1023.5 - 1) * k);
    return c;
  }

  // One beat -> a snappy decay envelope on the PULSE output.
  _firePulse() {
    if (!this.audio) return;
    const t = this.engine.actx.currentTime;
    const dec = (0.05 + 0.95 * (this.knobs['pulse.decay'] ?? 0.3)) / 3;
    const o = this.audio.pulseSrc.offset;
    o.cancelScheduledValues(t);
    o.setTargetAtTime(1, t, 0.004);
    o.setTargetAtTime(0, t + 0.04, dec);
    this._pulseLedUntil = performance.now() + 120;
  }

  _seqTick() {
    if (this.audio) {
      const leds = this.overlay.querySelectorAll('.pk-seq-led');
      leds.forEach((l, i) => l.className = 'pk-led pk-seq-led' + (i === this._seqStep ? ' pk-on-amber' : ''));
      this.audio.seqSrc.offset.setTargetAtTime(this.knobs['seq.s' + this._seqStep] || 0, this.engine.actx.currentTime, 0.004);
      this._seqStep = (this._seqStep + 1) % 8;
    }
    setTimeout(() => this._seqTick(), 1000 / (0.5 * Math.pow(32, this.knobs['seq.rate'] ?? 0.5)));
  }

  _shTick() {
    if (this.audio) {
      const v = Math.random() * 2 - 1;
      this.audio.shSrc.offset.setTargetAtTime(v, this.engine.actx.currentTime, 0.004);
      const led = this.overlay.querySelector('#pk-led-sh');
      if (led) led.className = 'pk-led' + (v > 0 ? ' pk-on-amber' : '');
    }
    setTimeout(() => this._shTick(), 1000 / (0.5 * Math.pow(60, this.knobs['sh.rate'] ?? 0.5)));
  }

  // ── Patching ────────────────────────────────────────────────
  _closesCycle(fromId, toId) {
    const modOf = id => id.split('.')[0];
    const start = modOf(toId), goal = modOf(fromId);
    if (start === goal) return true;
    const seen = new Set([start]); const stack = [start];
    while (stack.length) {
      const m = stack.pop();
      for (const c of this.cables) {
        if (modOf(c.from) !== m) continue;
        const n = modOf(c.to);
        if (n === goal) return true;
        if (!seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    return false;
  }

  connect(fromId, toId) {
    if (this.cables.some(c => c.from === fromId && c.to === toId)) return;
    const old = this.cables.findIndex(c => c.to === toId);
    if (old >= 0) this.removeCable(old);                 // one plug per input
    const kind = this.jackEls[fromId].dataset.kind;
    const actx = this.engine.actx;
    const gain = new GainNode(actx, { gain: SENS[toId] || 1 });
    const src = this.taps[fromId].node;
    src.connect(gain);
    // Web Audio silences delay-free cycles — give feedback loops a few ms
    // instead so they scream rather than mute.
    let tail = gain, delay = null;
    if (this._closesCycle(fromId, toId)) {
      delay = new DelayNode(actx, { delayTime: 0.005, maxDelayTime: 0.05 });
      gain.connect(delay); tail = delay;
    }
    [].concat(this.inTargets[toId]).forEach(t => tail.connect(t));
    this.cables.push({ from: fromId, to: toId, kind, gain, src, delay });
    this._refreshJacks();
  }

  removeCable(i) {
    const c = this.cables[i];
    try { c.src.disconnect(c.gain); } catch (_) {}
    c.gain.disconnect();
    if (c.delay) c.delay.disconnect();
    this.cables.splice(i, 1);
    this._hoverIdx = -1; this.rack.style.cursor = '';
    this._refreshJacks();
  }

  _refreshJacks() {
    for (const id in this.jackEls) {
      const c = this.cables.find(cb => cb.from === id || cb.to === id);
      this.jackEls[id].className = 'pk-jack' + (c ? ' pk-lit-' + c.kind : '') + (id === this.probeId ? ' pk-probed' : '');
    }
    for (const outId in VERB) {
      const el = this.overlay.querySelector(`[data-pk-sub="${outId.split('.')[0]}"]`);
      if (!el) continue;
      const dests = this.cables.filter(c => c.from === outId).map(c => DEST_PHRASE[c.to] || c.to);
      const DEFAULTS = { lfo: 'slow wobble', seq: 'step melody', sh: 'random steps', tracer: 'the music moves the knobs', pulse: 'fires on the beat' };
      if (dests.length) { el.textContent = VERB[outId] + ' ' + dests.join(' + '); el.classList.add('pk-live'); }
      else { el.textContent = DEFAULTS[outId.split('.')[0]]; el.classList.remove('pk-live'); }
    }
  }

  // ── Probing: the app's visualisers show the probed point ────
  toggleProbe(id) {
    let target = id;
    if (this.jackEls[id].dataset.dir === 'in') {
      const c = this.cables.find(cb => cb.to === id);
      target = c ? c.from : null;
    }
    if (!target || !this.taps[target]) return;
    const e = this.engine, a = this.audio;
    // restore the previous feed
    if (this.probeId) { try { this.taps[this.probeId].node.disconnect(e.analyserL); } catch (_) {} try { this.taps[this.probeId].node.disconnect(e.analyserR); } catch (_) {} }
    else if (this.enabled) { try { a.master.disconnect(e.analyserL); } catch (_) {} try { a.master.disconnect(e.analyserR); } catch (_) {} }
    this.probeId = this.probeId === target ? null : target;
    if (this.probeId) {
      this.taps[this.probeId].node.connect(e.analyserL);
      this.taps[this.probeId].node.connect(e.analyserR);
    } else if (this.enabled) {
      a.master.connect(e.analyserL);
      a.master.connect(e.analyserR);
    }
    this._refreshJacks();
    const sub = this.overlay.querySelector('[data-pk-sub-input]');
    if (sub) {
      sub.textContent = this.probeId ? 'scope is probing ' + (JACK_NAME[this.probeId] || this.probeId) : 'what the app is playing';
      sub.classList.toggle('pk-live', !!this.probeId);
    }
  }

  // ── Enable / disable: reroute the engine through the rack ───
  enable() {
    if (this.enabled) return;
    const e = this.engine;
    this.build();
    this._buildGraph();
    const a = this.audio;
    // visual buses: analysers now hear the rack's master instead
    try { e.visBusL.disconnect(e.analyserL); } catch (_) {}
    try { e.visBusR.disconnect(e.analyserR); } catch (_) {}
    e.visBusL.connect(a.inputGain);
    e.visBusR.connect(a.inputGain);
    a.master.connect(e.analyserL);
    a.master.connect(e.analyserR);
    // audible path: master gain no longer feeds the speakers directly
    try { e.gainNode.disconnect(e.actx.destination); } catch (_) {}
    a.limiter.connect(e.actx.destination);
    // recording follows the processed signal
    if (e._recDest) {
      try { e.gainNode.disconnect(e._recDest); } catch (_) {}
      a.limiter.connect(e._recDest);
    }
    this.enabled = true;
    this.overlay.classList.remove('pk-hidden');
    this._layout();
    this._startLoop();
  }

  disable() {
    if (!this.enabled) return;
    const e = this.engine, a = this.audio;
    if (this.probeId) this.toggleProbe(this.probeId);   // release the probe first
    try { e.visBusL.disconnect(a.inputGain); } catch (_) {}
    try { e.visBusR.disconnect(a.inputGain); } catch (_) {}
    try { a.master.disconnect(e.analyserL); } catch (_) {}
    try { a.master.disconnect(e.analyserR); } catch (_) {}
    try { a.limiter.disconnect(e.actx.destination); } catch (_) {}
    if (e._recDest) {
      try { a.limiter.disconnect(e._recDest); } catch (_) {}
      e.gainNode.connect(e._recDest);
    }
    e.visBusL.connect(e.analyserL);
    e.visBusR.connect(e.analyserR);
    e.gainNode.connect(e.actx.destination);
    this.enabled = false;
    this.overlay.classList.add('pk-hidden');
    this._stopLoop();
  }

  // ── Interaction wiring ──────────────────────────────────────
  _bindUI() {
    const rack = this.rack;
    this.overlay.querySelectorAll('[data-pk-jack]').forEach(el => { this.jackEls[el.dataset.pkJack] = el; });

    // knobs
    this.overlay.querySelectorAll('[data-pk-knob]').forEach(k => {
      const id = k.dataset.pkKnob;
      this.setKnob(id, parseFloat(k.dataset.v));
      k.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        k.setPointerCapture(e.pointerId);
        const y0 = e.clientY, v0 = this.knobs[id];
        const move = ev => this.setKnob(id, v0 + (y0 - ev.clientY) / 150);
        const up = () => { k.removeEventListener('pointermove', move); k.removeEventListener('pointerup', up); this._lastDragEnd = performance.now(); };
        k.addEventListener('pointermove', move); k.addEventListener('pointerup', up);
      });
      k.addEventListener('wheel', e => { e.preventDefault(); this.setKnob(id, this.knobs[id] - Math.sign(e.deltaY) * .03); }, { passive: false });
    });

    // LFO wave selector
    this.overlay.querySelectorAll('[data-pk-wave]').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        this._lfoType = b.dataset.pkWave;
        this.overlay.querySelectorAll('[data-pk-wave]').forEach(x => x.classList.toggle('pk-active', x === b));
        if (this.audio) this.audio.lfo.type = this._lfoType;
      });
    });

    // mode toggle + close
    const modeBtn = this.overlay.querySelector('#pk-mode');
    modeBtn.addEventListener('click', e => {
      e.stopPropagation();
      this.playMode = !this.playMode;
      modeBtn.textContent = this.playMode ? 'PLAYING' : 'PATCHING';
      modeBtn.classList.toggle('pk-active', !this.playMode);
      this.hintEl.innerHTML = this.playMode ? this._hintLocked : this._hintIdle;
      if (this._drag) this._endDrag();
    });
    this.overlay.querySelector('#pk-close').addEventListener('click', () => this.onClose && this.onClose());
    document.addEventListener('keydown', e => {
      if (this.enabled && e.key === 'Escape') { e.stopPropagation(); this.onClose && this.onClose(); }
    }, true);

    // jack drags (grab anywhere on the port)
    const rackPt = e => { const r = rack.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    this.overlay.querySelectorAll('.pk-jwrap').forEach(w => {
      const jk = w.querySelector('[data-pk-jack]');
      if (!jk) return;
      w.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { w.setPointerCapture(e.pointerId); } catch (_) {}
        this._layout();
        const p = rackPt(e);
        this._drag = { fromId: jk.dataset.pkJack, x: p.x, y: p.y, sx: p.x, sy: p.y };
        if (!this.playMode) {
          rack.classList.add('pk-dragging');
          const dir = jk.dataset.dir;
          for (const id in this.jackEls) {
            if (id === this._drag.fromId) this.jackEls[id].classList.add('pk-drag-src');
            else if (this.jackEls[id].dataset.dir !== dir) this.jackEls[id].classList.add('pk-target');
          }
          this.hintEl.innerHTML = 'release on any <b>pulsing port</b> &mdash; direction doesn&#39;t matter';
        }
      });
    });
    addEventListener('pointermove', e => { if (this._drag) { const p = rackPt(e); this._drag.x = p.x; this._drag.y = p.y; } });
    addEventListener('pointercancel', () => { if (this._drag) this._endDrag(); });
    addEventListener('pointerup', e => {
      if (!this._drag) return;
      const p = rackPt(e);
      // a plain click is a PROBE, not a patch
      if (Math.hypot(p.x - this._drag.sx, p.y - this._drag.sy) < 12) { this.toggleProbe(this._drag.fromId); this._endDrag(); return; }
      if (this.playMode) { this._endDrag(); return; }
      const srcDir = this.jackEls[this._drag.fromId].dataset.dir;
      let best = null, bestD = 46 * 46;                  // forgiving drop radius
      for (const id in this.jackEls) {
        if (id === this._drag.fromId || this.jackEls[id].dataset.dir === srcDir) continue;
        const q = this.jackPos[id];
        const d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y);
        if (d < bestD) { bestD = d; best = id; }
      }
      if (best) {
        const from = srcDir === 'out' ? this._drag.fromId : best;
        const to = srcDir === 'out' ? best : this._drag.fromId;
        this.connect(from, to);
      }
      this._endDrag();
    });

    // cable hover + click-to-unplug
    rack.addEventListener('pointermove', e => {
      if (this._drag || !this.enabled) { this._hoverIdx = -1; rack.style.cursor = ''; return; }
      const p = rackPt(e);
      this._hoverIdx = this._hitCable(p);
      rack.style.cursor = this._hoverIdx >= 0 ? 'pointer' : '';
    });
    rack.addEventListener('click', e => {
      if (!this.enabled || this.playMode) return;
      if (performance.now() - this._lastDragEnd < 400) return;   // ignore the click a drag leaves behind
      const i = this._hitCable(rackPt(e));
      if (i >= 0) this.removeCable(i);
    });
    addEventListener('resize', () => { if (this.enabled) this._layout(); });
  }

  _endDrag() {
    this.rack.classList.remove('pk-dragging');
    for (const id in this.jackEls) this.jackEls[id].classList.remove('pk-target', 'pk-drag-src');
    this.hintEl.innerHTML = this.playMode ? this._hintLocked : this._hintIdle;
    this._drag = null;
    this._lastDragEnd = performance.now();
  }

  _hitCable(p) {
    for (let i = 0; i < this.cables.length; i++) {
      const pts = this._cablePts(this.jackPos[this.cables[i].from], this.jackPos[this.cables[i].to], 40);
      for (const q of pts) {
        if ((q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y) < 100) return i;
      }
    }
    return -1;
  }

  // ── Rendering ───────────────────────────────────────────────
  _layout() {
    const r = this.rack.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.cablesCv.style.width = r.width + 'px'; this.cablesCv.style.height = r.height + 'px';
    this.cablesCv.width = Math.round(r.width * dpr); this.cablesCv.height = Math.round(r.height * dpr);
    this.cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const id in this.jackEls) {
      const j = this.jackEls[id].getBoundingClientRect();
      this.jackPos[id] = { x: j.left - r.left + j.width / 2, y: j.top - r.top + j.height / 2 };
    }
  }

  _cablePts(a, b, n) {
    const sag = Math.min(90, Math.hypot(b.x - a.x, b.y - a.y) * 0.15 + 28);
    const c1 = { x: a.x + (b.x - a.x) * 0.25, y: a.y + sag };
    const c2 = { x: a.x + (b.x - a.x) * 0.75, y: b.y + sag };
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push({
        x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
      });
    }
    return pts;
  }

  _drawCable(a, b, kind, tapRef, idx, hovered) {
    const cctx = this.cctx;
    const N = 64, pts = this._cablePts(a, b, N);
    const col = kind === 'cv' ? '255,179,0' : '0,255,65';
    cctx.lineWidth = 5; cctx.lineCap = 'round'; cctx.lineJoin = 'round';
    cctx.strokeStyle = kind === 'cv' ? '#2b2008' : '#0a2312';
    cctx.beginPath();
    pts.forEach((p, i) => i ? cctx.lineTo(p.x, p.y) : cctx.moveTo(p.x, p.y));
    cctx.stroke();
    let buf = null;
    if (tapRef) { tapRef.analyser.getFloatTimeDomainData(tapRef.buf); buf = tapRef.buf; }
    cctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const s = buf ? buf[Math.floor(t * (buf.length - 1))] : 0;
      const amp = (kind === 'cv' ? 13 : 16) * Math.sin(Math.PI * t);
      const p = pts[i], q = pts[Math.min(i + 1, N)], pr = pts[Math.max(i - 1, 0)];
      const dx = q.x - pr.x, dy = q.y - pr.y, len = Math.hypot(dx, dy) || 1;
      const off = s * amp;
      const x = p.x + (-dy / len) * off, y = p.y + (dx / len) * off;
      i ? cctx.lineTo(x, y) : cctx.moveTo(x, y);
    }
    cctx.shadowColor = 'rgb(' + col + ')'; cctx.shadowBlur = hovered ? 14 : 9;
    cctx.strokeStyle = 'rgba(' + col + ',' + (hovered ? 1 : 0.9) + ')';
    cctx.lineWidth = hovered ? 2.8 : 1.6; cctx.stroke();
    cctx.shadowBlur = 0;
    if (idx >= 0) {                                      // direction dot: out -> in
      const tp = this._reducedMotion ? 0.6 : ((performance.now() / 1600) + idx * 0.37) % 1;
      const dp = pts[Math.round(tp * N)];
      cctx.fillStyle = 'rgba(' + col + ',0.95)';
      cctx.shadowColor = 'rgb(' + col + ')'; cctx.shadowBlur = 8;
      cctx.beginPath(); cctx.arc(dp.x, dp.y, 2.6, 0, 7); cctx.fill();
      cctx.shadowBlur = 0;
    }
    for (const e of [a, b]) {                            // plug boots
      cctx.fillStyle = '#0c0e0d';
      cctx.beginPath(); cctx.arc(e.x, e.y, 7, 0, 7); cctx.fill();
      cctx.strokeStyle = 'rgba(' + col + ',0.8)'; cctx.lineWidth = 2;
      cctx.beginPath(); cctx.arc(e.x, e.y, 5, 0, 7); cctx.stroke();
    }
  }

  _startLoop() {
    this._reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = () => {
      if (!this.enabled) { this._raf = 0; return; }
      const r = this.rack.getBoundingClientRect();
      this.cctx.clearRect(0, 0, r.width, r.height);
      this.cables.forEach((c, i) => this._drawCable(this.jackPos[c.from], this.jackPos[c.to], c.kind, this.taps[c.from], i, i === this._hoverIdx));
      if (this._drag && !this.playMode) {
        const from = this.jackPos[this._drag.fromId];
        this.cctx.globalAlpha = 0.6;
        this._drawCable(from, { x: this._drag.x, y: this._drag.y }, this.jackEls[this._drag.fromId].dataset.kind, null, -1, false);
        this.cctx.globalAlpha = 1;
      }
      const led = this.overlay.querySelector('#pk-led-input');
      if (led && this.taps['input.out']) {
        const t = this.taps['input.out'];
        t.analyser.getFloatTimeDomainData(t.buf);
        let peak = 0, sum = 0, n = 0;
        for (let i = 0; i < t.buf.length; i += 8) { const v = t.buf[i]; peak = Math.max(peak, Math.abs(v)); sum += v * v; n++; }
        led.className = 'pk-led' + (peak > 0.01 ? ' pk-on-green' : '');
        if (this._beat && this._beat.detect(Math.sqrt(sum / n)).beat) this._firePulse();
        const pled = this.overlay.querySelector('#pk-led-pulse');
        if (pled) pled.className = 'pk-led' + (performance.now() < (this._pulseLedUntil || 0) ? ' pk-on-amber' : '');
      }
      this._raf = requestAnimationFrame(frame);
    };
    if (!this._raf) this._raf = requestAnimationFrame(frame);
  }

  _stopLoop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
  }
}

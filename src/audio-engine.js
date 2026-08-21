'use strict';

// ─────────────────────────────────────────────────────────────
//  AudioEngine
// ─────────────────────────────────────────────────────────────
export class AudioEngine {
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
    // Pre-allocated buffers — avoids ~120 Float32Array allocations per second
    this._bufL = new Float32Array(this.FFT_SIZE);
    this._bufR = new Float32Array(this.FFT_SIZE);
  }

  async init() {
    this.actx = new (window.AudioContext || window.webkitAudioContext)();
    // Some browsers (and iframes) start the context suspended; resume on init.
    if (this.actx.state === 'suspended') {
      try { await this.actx.resume(); } catch (_) {}
    }
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

    // Visual buses: every source feeds these, and they normally pass straight
    // through to the analysers. PATCH mode re-routes them through the rack so
    // the whole visualiser stack shows the processed signal.
    this.visBusL = this.actx.createGain();
    this.visBusR = this.actx.createGain();
    this.visBusL.connect(this.analyserL);
    this.visBusR.connect(this.analyserR);
  }

  _connect(node, channels = 1) {
    node.connect(this.gainNode);
    if (channels >= 2) {
      const split = this.actx.createChannelSplitter(2);
      node.connect(split);
      split.connect(this.visBusL, 0);
      split.connect(this.visBusR, 1);
    } else {
      node.connect(this.visBusL);
      node.connect(this.visBusR);
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
    // Bind the handler to *this* source: stopping the previous one fires its
    // onended asynchronously, after the new source is already playing, so an
    // unguarded handler would clear isPlaying on the live source.
    const src = this.source;
    src.onended = () => { if (this.source === src) this.isPlaying = false; };
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
    this._micSource = this.actx.createMediaStreamSource(this.micStream);
    this._connect(this._micSource, 1);
  }

  stopMic() {
    if (this._micSource) { try { this._micSource.disconnect(); } catch (_) {} this._micSource = null; }
    if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null; }
  }

  // ── System audio (loopback) ───────────────────────────────────────────────
  // Routes: analyserL/R + _recDest (if recording).
  // Deliberately NOT connected to gainNode / actx.destination — avoids echo.
  async startSystemAudio() {
    if (this._sysStream) this.stopSystemAudio();
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    } catch (err) {
      this.sysAudioActive = false;
      throw err;
    }
    // Discard video tracks immediately — we only need audio.
    stream.getVideoTracks().forEach(t => t.stop());

    this._sysStream = stream;
    this._sysSource = this.actx.createMediaStreamSource(stream);

    // Tap point: a GainNode that we can connect to _recDest without routing to speakers.
    this._sysGain = this.actx.createGain();
    this._sysSource.connect(this._sysGain);

    // Connect to analysers (stereo split, same pattern as _connect's 2-channel branch).
    const split = this.actx.createChannelSplitter(2);
    this._sysGain.connect(split);
    split.connect(this.visBusL, 0);
    split.connect(this.visBusR, 1);

    // Also tap into recording destination if it already exists.
    if (this._recDest) this._sysGain.connect(this._recDest);

    this.sysAudioActive = true;

    // Handle the user revoking capture from the OS (e.g. clicking "Stop sharing").
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.onended = () => { this.stopSystemAudio(); };
    }
  }

  stopSystemAudio() {
    if (this._sysGain)   { try { this._sysGain.disconnect(); }   catch (_) {} this._sysGain   = null; }
    if (this._sysSource) { try { this._sysSource.disconnect(); } catch (_) {} this._sysSource = null; }
    if (this._sysStream) { this._sysStream.getTracks().forEach(t => t.stop()); this._sysStream = null; }
    this.sysAudioActive = false;
  }

  // ── Idle / ambient signal (visible only — connects to analysers, not output) ─
  startIdleSignal() {
    if (!this.actx) return;
    this._stopIdleSignal();

    // Fundamental + harmonics with slow LFO wobble → organic-looking waveform
    const make = (freq, gain, type = 'sine') => {
      const osc = this.actx.createOscillator();
      const g   = this.actx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = gain;
      osc.connect(g);
      return { osc, g };
    };

    const fund   = make(60,  0.55);            // 60 Hz fundamental
    const h2     = make(120, 0.18);            // 2nd harmonic
    const h3     = make(180, 0.09);            // 3rd harmonic
    const h5     = make(300, 0.04);            // 5th harmonic

    // Slow LFO slightly wobbles the fundamental pitch (±1.5 Hz, 0.15 Hz rate)
    const lfo    = this.actx.createOscillator();
    const lfoGn  = this.actx.createGain();
    lfo.frequency.value  = 0.15;
    lfoGn.gain.value     = 1.5;
    lfo.connect(lfoGn);
    lfoGn.connect(fund.osc.frequency);

    // Tiny noise floor
    const nLen  = this.actx.sampleRate * 2;
    const nBuf  = this.actx.createBuffer(1, nLen, this.actx.sampleRate);
    const nData = nBuf.getChannelData(0);
    for (let i = 0; i < nLen; i++) nData[i] = (Math.random() * 2 - 1) * 0.004;
    const noise = this.actx.createBufferSource();
    noise.buffer = nBuf; noise.loop = true;
    const noiseGn = this.actx.createGain();
    noiseGn.gain.value = 1;
    noise.connect(noiseGn);

    // Connect everything to analysers only (silent — no audio output)
    for (const n of [fund.g, h2.g, h3.g, h5.g, noiseGn]) {
      n.connect(this.visBusL);
      n.connect(this.visBusR);
    }

    [fund.osc, h2.osc, h3.osc, h5.osc, lfo, noise].forEach(n => n.start());
    this._idleNodes   = [fund.osc, h2.osc, h3.osc, h5.osc, lfo, noise,
                         fund.g, h2.g, h3.g, h5.g, lfoGn, noiseGn];
    this.idleActive   = true;
  }

  _stopIdleSignal() {
    if (this._idleNodes) {
      for (const n of this._idleNodes) {
        try { n.stop?.(); } catch (_) {}
        try { n.disconnect(); } catch (_) {}
      }
      this._idleNodes = null;
    }
    this.idleActive = false;
  }

  getDataL() {
    if (this.analyserL) this.analyserL.getFloatTimeDomainData(this._bufL);
    else this._bufL.fill(0);
    return this._bufL;
  }
  getDataR() {
    if (this.analyserR) this.analyserR.getFloatTimeDomainData(this._bufR);
    else this._bufR.fill(0);
    return this._bufR;
  }

  getCurrentTime() {
    if (!this.actx || !this.isPlaying) return this.pauseOffset;
    return this.actx.currentTime - this.startTime;
  }

  setVolume(v) { if (this.gainNode) this.gainNode.gain.value = v; }
  get sampleRate() { return this.actx ? this.actx.sampleRate : 44100; }

  // ── Recording stream — tap the master gainNode into a MediaStream ──────────
  // Lazy init: node is created once per AudioContext lifecycle and reused.
  // Also taps any live system-audio source so recordings include loopback audio.
  getRecordingStream() {
    if (!this.actx || !this.gainNode) return null;
    if (!this._recDest) {
      this._recDest = this.actx.createMediaStreamDestination();
      this.gainNode.connect(this._recDest);
      // If system audio is already active, connect its tap now.
      if (this._sysGain) this._sysGain.connect(this._recDest);
    }
    return this._recDest.stream;
  }

  // ── Draw sound — oscilloscope CRT hum that ramps with draw power ──────
  // Connects to speakers only (not the visualiser analysers)
  startDrawSound() {
    if (!this.actx) return;
    // Mid-fade restart: cancel pending teardown and ramp gain back up.
    if (this._drawActive && this._drawFading) {
      clearTimeout(this._drawFadeTimer);
      this._drawFadeTimer = null;
      this._drawFading = false;
      if (this._drawGain) {
        const now = this.actx.currentTime;
        this._drawGain.gain.cancelScheduledValues(now);
        this._drawGain.gain.setTargetAtTime(0.55, now, 0.04);
      }
      return;
    }
    if (this._drawActive) return;

    // Sawtooth oscillator — sweeps from ~40 Hz (idle buzz) to ~600 Hz (full scan)
    this._drawOsc = this.actx.createOscillator();
    this._drawOsc.type = 'sawtooth';
    this._drawOsc.frequency.value = 40;

    // Band-pass filtered noise — adds the magnetic-coil texture
    const bufLen = this.actx.sampleRate * 2;
    const nBuf   = this.actx.createBuffer(1, bufLen, this.actx.sampleRate);
    const nd     = nBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nd[i] = Math.random() * 2 - 1;
    this._drawNoise = this.actx.createBufferSource();
    this._drawNoise.buffer = nBuf;
    this._drawNoise.loop   = true;

    this._drawFilter = this.actx.createBiquadFilter();
    this._drawFilter.type            = 'bandpass';
    this._drawFilter.frequency.value = 120;
    this._drawFilter.Q.value         = 1.5;

    // Separate gains so we can mix osc vs noise
    this._drawOscGain   = this.actx.createGain();
    this._drawNoiseGain = this.actx.createGain();
    this._drawGain      = this.actx.createGain();
    this._drawGain.gain.value = 0;

    this._drawOsc.connect(this._drawOscGain);
    this._drawNoise.connect(this._drawFilter);
    this._drawFilter.connect(this._drawNoiseGain);
    this._drawOscGain.connect(this._drawGain);
    this._drawNoiseGain.connect(this._drawGain);
    this._drawGain.connect(this.actx.destination);   // speakers only — NOT analysers

    this._drawOsc.start();
    this._drawNoise.start();
    this._drawActive = true;
  }

  // Call every frame while draw power is < 1
  updateDrawSound(power) {
    if (!this._drawActive || !this._drawGain) return;
    const now  = this.actx.currentTime;
    const p    = Math.max(0, Math.min(1, power));
    // Frequency sweeps from 40 Hz to 580 Hz with a slight power-curve feel
    const freq = 40 + Math.pow(p, 0.6) * 540;
    this._drawOsc.frequency.setTargetAtTime(freq, now, 0.04);
    this._drawFilter.frequency.setTargetAtTime(freq * 2.5, now, 0.04);
    // Noise is louder at low power (crackle / static), quieter when running fast
    this._drawOscGain.gain.setTargetAtTime(p * 0.06, now, 0.04);
    this._drawNoiseGain.gain.setTargetAtTime((1 - p * 0.7) * 0.04, now, 0.04);
    this._drawGain.gain.setTargetAtTime(0.55, now, 0.04);
  }

  stopDrawSound() {
    // _drawActive stays true until the fade timer fires, so guarding on it
    // alone lets every frame during the 400 ms fade schedule another teardown
    // timer, orphaning the previous handle. An orphan that fires after a
    // restart tears down the freshly-created nodes.
    if (!this._drawActive || this._drawFading) return;
    const now = this.actx.currentTime;
    this._drawGain.gain.setTargetAtTime(0, now, 0.15);
    // Mark as fading so updateDrawSound/startDrawSound can detect mid-fade
    this._drawFading = true;
    this._drawFadeTimer = setTimeout(() => {
      try { this._drawOsc.stop();   } catch (_) {}
      try { this._drawNoise.stop(); } catch (_) {}
      try { this._drawGain.disconnect(); } catch (_) {}
      this._drawOsc = this._drawNoise = this._drawFilter = null;
      this._drawOscGain = this._drawNoiseGain = this._drawGain = null;
      this._drawActive = false;
      this._drawFading = false;
      this._drawFadeTimer = null;
    }, 400);
  }
}

'use strict';

// ─────────────────────────────────────────────────────────────
//  VideoRecorder — canvas + audio → webm
// ─────────────────────────────────────────────────────────────
export class VideoRecorder {
  constructor(canvas) {
    this.canvas = canvas;
    this._recorder    = null;
    this._chunks      = [];
    this.isRecording  = false;
    this._audioEngine = null;
  }

  /** Provide an AudioEngine reference so recordings include audio. */
  setAudioEngine(engine) {
    this._audioEngine = engine;
  }

  /**
   * start(opts?)                       — new form; uses setAudioEngine()
   * start(actx, gainNode, opts?)       — legacy form; kept for back-compat
   */
  start(actxOrOpts, gainNode, legacyOpts) {
    // Detect legacy call: first arg is an AudioContext instance
    let opts = {};
    if (actxOrOpts && typeof actxOrOpts.createMediaStreamDestination === 'function') {
      // Legacy: start(actx, gainNode, opts)
      // Prefer the engine if available; fall back to the passed gainNode.
      opts = legacyOpts || {};
      if (!this._audioEngine && gainNode) {
        // Wrap gainNode in a minimal shim so the rest of start() works
        this._legacyActx    = actxOrOpts;
        this._legacyGain    = gainNode;
        this._usingLegacy   = true;
      }
    } else {
      opts = actxOrOpts || {};
      this._usingLegacy = false;
    }

    const { transparent = false } = opts;
    this._transparent = transparent;

    const videoStream = this.canvas.captureStream(60);

    // Build combined stream — audio is optional (engine may not be ready yet)
    const audioTracks = [];
    if (this._audioEngine) {
      const stream = this._audioEngine.getRecordingStream();
      if (stream) audioTracks.push(...stream.getAudioTracks());
    } else if (this._usingLegacy && this._legacyActx && this._legacyGain) {
      // Legacy fallback: create a tap on the gainNode directly
      this._legacyDest = this._legacyActx.createMediaStreamDestination();
      this._legacyGain.connect(this._legacyDest);
      audioTracks.push(...this._legacyDest.stream.getAudioTracks());
    }

    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioTracks,
    ]);

    // Transparent mode: VP8 is the only codec with reliable alpha in WebM.
    // Opaque mode: prefer VP9 for best quality.
    const codecs = audioTracks.length > 0
      ? (transparent
          ? ['video/webm;codecs=vp8,opus', 'video/webm']
          : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
      : (transparent
          ? ['video/webm;codecs=vp8', 'video/webm']
          : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']);

    const mime = codecs.find(m => MediaRecorder.isTypeSupported(m));

    this._chunks   = [];
    this._recorder = new MediaRecorder(combined, {
      mimeType: mime,
      videoBitsPerSecond: 25e6,   // 25 Mbps — crisp lines & glow at 1080p
      audioBitsPerSecond: 192000, // 192 kbps audio
    });
    this._recorder.ondataavailable = e => { if (e.data.size > 0) this._chunks.push(e.data); };
    this._recorder.onstop = () => this._download();
    this._recorder.start(50);    // smaller timeslice = smoother muxing
    this.isRecording = true;
  }

  stop() {
    if (this._recorder && this.isRecording) {
      this._recorder.stop();
      this.isRecording = false;
      if (this._legacyDest) {
        try { this._legacyDest.disconnect(); } catch (_) {}
        this._legacyDest = null;
      }
    }
  }

  _download() {
    const blob = new Blob(this._chunks, { type: 'video/webm' });
    const url  = URL.createObjectURL(blob);
    const suffix = this._transparent ? '_alpha' : '';
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `dso1_${Date.now()}${suffix}.webm`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

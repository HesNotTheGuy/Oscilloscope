'use strict';

// ─────────────────────────────────────────────────────────────
//  VideoRecorder — canvas + audio → webm
// ─────────────────────────────────────────────────────────────
export class VideoRecorder {
  constructor(canvas) {
    this.canvas = canvas;
    this._recorder = null;
    this._chunks   = [];
    this.isRecording = false;
    this._audioDest  = null;
  }

  start(actx, gainNode, opts = {}) {
    const { transparent = false } = opts;
    this._transparent = transparent;

    const videoStream = this.canvas.captureStream(60);

    // Capture audio via a MediaStreamDestination
    this._audioDest = actx.createMediaStreamDestination();
    gainNode.connect(this._audioDest);

    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...this._audioDest.stream.getAudioTracks(),
    ]);

    // Transparent mode: VP8 is the codec with reliable alpha in WebM.
    // Opaque mode: prefer VP9 for best quality.
    const mime = (transparent
      ? ['video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    ).find(m => MediaRecorder.isTypeSupported(m));
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
      if (this._audioDest) { try { this._audioDest.disconnect(); } catch (_) {} }
    }
  }

  _download() {
    const blob = new Blob(this._chunks, { type: 'video/webm' });
    const url  = URL.createObjectURL(blob);
    const suffix = this._transparent ? '_alpha' : '';
    const a    = Object.assign(document.createElement('a'), { href: url, download: `osc_${Date.now()}${suffix}.webm` });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

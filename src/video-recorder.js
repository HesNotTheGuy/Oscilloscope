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

  start(actx, gainNode) {
    const videoStream = this.canvas.captureStream(60);

    // Capture audio via a MediaStreamDestination
    this._audioDest = actx.createMediaStreamDestination();
    gainNode.connect(this._audioDest);

    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...this._audioDest.stream.getAudioTracks(),
    ]);

    // Prefer VP9 for best quality, fallback to VP8
    const mime = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ].find(m => MediaRecorder.isTypeSupported(m));
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
    const a    = Object.assign(document.createElement('a'), { href: url, download: `osc_${Date.now()}.webm` });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

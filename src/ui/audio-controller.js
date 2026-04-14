'use strict';

import { loadFile } from './ui-utils.js';

// ─────────────────────────────────────────────────────────────
//  AudioController — file loading, playback, mic, volume, recording
// ─────────────────────────────────────────────────────────────
export class AudioController {
  constructor(ctx) {
    this.engine      = ctx.engine;
    this.scope       = ctx.scope;
    this.recorder    = ctx.recorder;
    this.store       = ctx.store;
    this.ensureAudio = ctx.ensureAudio;
  }

  init() {
    const e = this.engine;
    const rec = this.recorder;

    // ── Audio file drop / load ──
    const fileDrop  = document.getElementById('file-drop');
    const fileInput = document.getElementById('audio-file');
    const btnPlay   = document.getElementById('btn-play');
    const btnStop   = document.getElementById('btn-stop-audio');
    const stSrc     = document.getElementById('st-src');

    fileDrop.addEventListener('dragover', ev => { ev.preventDefault(); fileDrop.classList.add('drag-over'); });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));
    fileDrop.addEventListener('drop', ev => {
      ev.preventDefault(); fileDrop.classList.remove('drag-over');
      const f = ev.dataTransfer.files[0]; if (f) loadFile(e, f);
    });
    fileInput.addEventListener('change', ev => { const f = ev.target.files[0]; if (f) loadFile(e, f); });

    // ── Playback ──
    btnPlay.addEventListener('click', () => {
      if (!e.buffer) return;
      if (e.isPlaying) { e.pause(); btnPlay.textContent = '▶ PLAY'; }
      else             { e.play();  btnPlay.textContent = '⏸ PAUSE'; }
    });
    btnStop.addEventListener('click', () => { e.stop(); btnPlay.textContent = '▶ PLAY'; });

    // ── Microphone ──
    document.getElementById('btn-mic').addEventListener('click', async () => {
      const btn = document.getElementById('btn-mic');
      if (e.micStream) {
        e.stopMic(); btn.classList.remove('active'); stSrc.textContent = 'No signal';
      } else {
        try { await e.startMic(); btn.classList.add('active'); stSrc.textContent = 'Microphone'; }
        catch (_) { alert('Mic denied.'); }
      }
    });

    // ── Volume ──
    document.getElementById('volume').addEventListener('input', ev => e.setVolume(+ev.target.value));

    // ── Progress scrubbing ──
    document.getElementById('progress-bg').addEventListener('click', ev => {
      if (!e.buffer) return;
      const r = ev.currentTarget.getBoundingClientRect();
      e.pauseOffset = ((ev.clientX - r.left) / r.width) * e.buffer.duration;
      if (e.isPlaying) e.play();
    });

    // ── Record ──
    const btnRec = document.getElementById('btn-record');
    btnRec.addEventListener('click', async () => {
      if (rec.isRecording) {
        rec.stop();
        btnRec.textContent = '● REC';
        btnRec.classList.remove('recording');
      } else {
        await this.ensureAudio();
        rec.start(e.actx, e.gainNode);
        btnRec.textContent = '■ STOP';
        btnRec.classList.add('recording');
      }
    });

    // ── Progress & status polling ──
    setInterval(() => {
      if (e.buffer) {
        const dur = e.buffer.duration;
        const cur = Math.min(e.getCurrentTime(), dur);
        document.getElementById('progress-fill').style.width = (cur / dur * 100) + '%';
        const fmt = t => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
        document.getElementById('time-lbl').textContent = `${fmt(cur)} / ${fmt(dur)}`;
      }
      const f = this.scope.measFreq;
      document.getElementById('st-freq').textContent = f > 0
        ? (f >= 1000 ? `${(f / 1000).toFixed(3)}kHz` : `${f.toFixed(2)}Hz`) : '---';
    }, 100);
  }
}

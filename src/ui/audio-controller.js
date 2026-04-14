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

    // ── Record (split button: main click + mode dropdown) ──
    const btnRec     = document.getElementById('btn-record');
    const btnMode    = document.getElementById('btn-record-mode');
    const recMenu    = document.getElementById('rec-menu');

    // Persisted mode: 'standard' | 'alpha'
    let recMode = localStorage.getItem('osc_recMode') || 'standard';

    const labelFor = m => m === 'alpha' ? '● REC α' : '● REC';
    const syncMenu = () => {
      if (!recMenu) return;
      recMenu.querySelectorAll('.rec-menu-item').forEach(el => {
        const sel = el.dataset.mode === recMode;
        el.classList.toggle('selected', sel);
        const check = el.querySelector('.rec-check');
        if (check) check.textContent = sel ? '●' : '○';
      });
    };
    const setIdleLabel = () => {
      if (!rec.isRecording) btnRec.textContent = labelFor(recMode);
    };
    syncMenu();
    setIdleLabel();

    btnRec.addEventListener('click', async () => {
      if (rec.isRecording) {
        rec.stop();
        if (recMode === 'alpha') this.scope.setTransparentMode(false);
        btnRec.classList.remove('recording');
        setIdleLabel();
      } else {
        await this.ensureAudio();
        const transparent = recMode === 'alpha';
        if (transparent) this.scope.setTransparentMode(true);
        rec.start(e.actx, e.gainNode, { transparent });
        btnRec.textContent = '■ STOP';
        btnRec.classList.add('recording');
      }
    });

    if (btnMode && recMenu) {
      btnMode.addEventListener('click', ev => {
        ev.stopPropagation();
        recMenu.hidden = !recMenu.hidden;
      });
      recMenu.addEventListener('click', ev => {
        const item = ev.target.closest('.rec-menu-item');
        if (!item) return;
        recMode = item.dataset.mode;
        localStorage.setItem('osc_recMode', recMode);
        syncMenu();
        setIdleLabel();
        recMenu.hidden = true;
      });
      // Click-outside closes the menu
      document.addEventListener('click', ev => {
        if (recMenu.hidden) return;
        if (!recMenu.contains(ev.target) && ev.target !== btnMode) recMenu.hidden = true;
      });
    }

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

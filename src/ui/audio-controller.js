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
    this.notify      = ctx.notify || null;
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

    // The welcome card tells people to drop a file "anywhere on the scope",
    // and the drop zone itself is 0x0 until the SOURCE tab is open — so honour
    // the instruction: accept an audio drop anywhere in the window.
    const scopeEl = document.getElementById('scope');
    const dropAnywhere = ev => {
      const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (!f) return;
      if (!/^audio\//.test(f.type) && !/\.(wav|mp3|ogg|flac|aac|m4a|opus|aiff?)$/i.test(f.name)) return;
      ev.preventDefault();
      if (scopeEl) scopeEl.classList.remove('drag-over');
      loadFile(e, f);
    };
    window.addEventListener('dragover', ev => {
      if (ev.dataTransfer && [...(ev.dataTransfer.types || [])].includes('Files')) {
        ev.preventDefault();
        if (scopeEl) scopeEl.classList.add('drag-over');
      }
    });
    window.addEventListener('dragleave', () => { if (scopeEl) scopeEl.classList.remove('drag-over'); });
    window.addEventListener('drop', dropAnywhere);

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
        // System audio is exclusive with mic — stop it first.
        if (e.sysAudioActive) {
          e.stopSystemAudio();
          document.getElementById('btn-sysaudio').classList.remove('active');
        }
        try { await e.startMic(); btn.classList.add('active'); stSrc.textContent = 'Microphone'; }
        catch (err) {
          if (this.notify) this.notify.error('Microphone blocked \u2014 allow mic access and try again');
          else alert('Mic denied.');
        }
      }
    });

    // ── System audio (loopback) ──
    document.getElementById('btn-sysaudio').addEventListener('click', async () => {
      const btn = document.getElementById('btn-sysaudio');
      if (e.sysAudioActive) {
        e.stopSystemAudio(); btn.classList.remove('active'); stSrc.textContent = 'No signal';
      } else {
        // Mic is exclusive with system audio — stop it first.
        if (e.micStream) {
          e.stopMic();
          document.getElementById('btn-mic').classList.remove('active');
        }
        try {
          await this.ensureAudio();
          await e.startSystemAudio();
          btn.classList.add('active'); stSrc.textContent = 'System audio';
          // Handle external revocation (OS "Stop sharing" button).
          const checkGone = setInterval(() => {
            if (!e.sysAudioActive) {
              btn.classList.remove('active'); stSrc.textContent = 'No signal';
              clearInterval(checkGone);
            }
          }, 500);
        } catch (err) {
          // Was a silent no-op: the button just didn't light and nobody knew
          // whether the click registered, the picker was cancelled, or the
          // platform refused. Cancelling is normal; anything else is worth
          // saying out loud.
          const name = (err && err.name) || '';
          if (name !== 'AbortError' && name !== 'NotAllowedError' && this.notify) {
            this.notify.error('System audio unavailable: ' + ((err && err.message) || name || 'unknown'));
          } else if (name === 'NotAllowedError' && this.notify) {
            this.notify.warn('System audio was blocked — nothing is being captured');
          }
        }
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
        // Use the transparent state captured at START, not the current
        // dropdown value — recMode can change mid-recording, which would
        // otherwise leave the scope stuck in transparent mode.
        if (this._recStartedTransparent) this.scope.setTransparentMode(false);
        this._recStartedTransparent = false;
        btnRec.classList.remove('recording');
        setIdleLabel();
      } else {
        await this.ensureAudio();
        const transparent = recMode === 'alpha';
        this._recStartedTransparent = transparent;
        if (transparent) this.scope.setTransparentMode(true);
        rec.start({ transparent });
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
    // Cache element references once — these are static elements
    const progressFill = document.getElementById('progress-fill');
    const timeLbl      = document.getElementById('time-lbl');
    const stFreq       = document.getElementById('st-freq');
    const fmt = t => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
    setInterval(() => {
      if (e.buffer) {
        const dur = e.buffer.duration;
        const cur = Math.min(e.getCurrentTime(), dur);
        if (progressFill) progressFill.style.width = (cur / dur * 100) + '%';
        if (timeLbl) timeLbl.textContent = `${fmt(cur)} / ${fmt(dur)}`;
      }
      const f = this.scope.measFreq;
      if (stFreq) stFreq.textContent = f > 0
        ? (f >= 1000 ? `${(f / 1000).toFixed(3)}kHz` : `${f.toFixed(2)}Hz`) : '---';
    }, 100);
  }
}

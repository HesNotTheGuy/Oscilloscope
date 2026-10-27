'use strict';

import { KEYS } from './scale.js';
import { mountRipplePad } from './ripple-pad.js';
import { mountChordWheel } from './chord-wheel.js';
import { mountHearImage } from './hear-image.js';

const TOYS = [
  {
    id: 'ripple-pad',
    title: 'Ripple Pad',
    hint: 'Tap or drag the sheet. Rings play notes.',
    mount: mountRipplePad,
  },
  {
    id: 'chord-wheel',
    title: 'Chord Wheel',
    hint: 'Turn speed. Pick a ratio.',
    mount: mountChordWheel,
  },
  {
    id: 'hear-image',
    title: 'Hear an Image',
    hint: 'Scan color into tone. Black rests. White chords.',
    mount: mountHearImage,
  },
];

export class SoundToysController {
  constructor(ctx) {
    this.ctx = ctx;
    this.engine = ctx.engine;
    this.ensureAudio = ctx.ensureAudio;
    this._open = false;
    this._epoch = 0;
    this._handle = null;
    this._btn = null;
    this._dock = null;
    this._readout = null;
    this._hint = null;
    this._stage = null;
    this._controls = null;
    this._toyId = TOYS[0].id;
  }

  init() {
    this._btn = document.getElementById('btn-toys');
    this._dock = document.getElementById('toys-dock');
    if (!this._btn || !this._dock) return;
    this._btn.addEventListener('click', () => { this.toggle(); });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this._open) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      this.close();
    });
    this._build();
  }

  toggle() {
    if (this._open) this.close();
    else return this.open();
  }

  async open() {
    if (this._open || !this._handle) return;
    const epoch = ++this._epoch;
    try {
      if (this.ensureAudio) await this.ensureAudio();
    } catch (_) {
      return;
    }
    if (epoch !== this._epoch || this._open) return;
    this._closeOthers();
    if (epoch !== this._epoch) return;
    this._resumeAudio();
    this._applyChrome(true);
    this._handle.start();
    this._open = true;
  }

  close() {
    this._epoch++;
    this._open = false;
    if (this._handle) this._handle.stop();
    this._applyChrome(false);
  }

  select(id) {
    if (id === this._toyId) return;
    const toy = TOYS.find(t => t.id === id);
    if (!toy) return;
    this._disposeHandle();
    this._toyId = id;
    this._mountCurrent();
    if (this._open && this._handle) {
      this._resumeAudio();
      this._handle.start();
    }
  }

  get api() {
    const self = this;
    return {
      isOpen: () => self._open,
      get toyId() { return self._toyId; },
      tap: (nx, ny, amp) => { if (self._handle && self._handle.tap) self._handle.tap(nx, ny, amp); },
      noteLog: () => (self._handle && self._handle.noteLog ? self._handle.noteLog() : []),
      voiceCount: () => (self._handle && self._handle.voiceCount ? self._handle.voiceCount() : 0),
      energy: () => (self._handle && self._handle.energy ? self._handle.energy() : 0),
      title: () => (self._handle && self._handle.title ? self._handle.title() : ''),
      hz: () => (self._handle && self._handle.hz ? self._handle.hz() : ''),
      speed: () => (self._handle && self._handle.speed ? self._handle.speed() : null),
      ratioId: () => (self._handle && self._handle.ratioId ? self._handle.ratioId() : ''),
      setSpeed: (value) => { if (self._handle && self._handle.setSpeed) self._handle.setSpeed(value); },
      preset: () => (self._handle && self._handle.preset ? self._handle.preset() : ''),
      setPreset: (id) => { if (self._handle && self._handle.setPreset) self._handle.setPreset(id); },
      columnVoices: () => (self._handle && self._handle.columnVoices ? self._handle.columnVoices() : []),
      playheadX: () => (self._handle && self._handle.playheadX ? self._handle.playheadX() : 0),
      setPlayhead: (x) => { if (self._handle && self._handle.setPlayhead) self._handle.setPlayhead(x); },
    };
  }

  _build() {
    const dock = this._dock;
    dock.className = 'ty-dock';
    dock.replaceChildren();

    const bar = document.createElement('div');
    bar.className = 'ty-bar';
    for (const toy of TOYS) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'ty-tab';
      tab.id = 'ty-tab-' + toy.id;
      tab.textContent = toy.title;
      tab.addEventListener('click', () => { this.select(toy.id); });
      bar.appendChild(tab);
    }
    const hint = document.createElement('div');
    hint.className = 'ty-hint';
    this._hint = hint;
    const readout = document.createElement('div');
    readout.className = 'ty-readout';
    readout.textContent = '';
    this._readout = readout;
    bar.append(hint, readout);

    const stage = document.createElement('div');
    stage.className = 'ty-stage';
    this._stage = stage;

    const controls = document.createElement('div');
    controls.className = 'ty-controls';
    this._controls = controls;

    dock.append(bar, stage, controls);
    this._mountCurrent();
  }

  _mountCurrent() {
    const toy = TOYS.find(t => t.id === this._toyId) || TOYS[0];
    this._stage.replaceChildren();
    this._controls.replaceChildren();
    this._hint.textContent = toy.hint || '';
    if (this._readout) this._readout.textContent = '';
    this._markTabs();
    this._handle = toy.mount(this._stage, {
      audio: () => this._audioNodes(),
      readout: this._readout,
      controls: this._controls,
      onNote: (ev) => this._showNote(ev),
    });
  }

  _disposeHandle() {
    const handle = this._handle;
    this._handle = null;
    if (!handle) return;
    handle.stop();
    handle.dispose();
  }

  _markTabs() {
    const tabs = this._dock.querySelectorAll('.ty-tab');
    for (const tab of tabs) {
      const on = tab.id === 'ty-tab-' + this._toyId;
      tab.classList.toggle('ty-tab-on', on);
      tab.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  _showNote(ev) {
    if (!this._readout || !ev) return;
    const pc = ((ev.midi % 12) + 12) % 12;
    const oct = Math.floor(ev.midi / 12) - 1;
    this._readout.textContent = KEYS[pc] + oct;
  }

  _closeOthers() {
    if (document.body.classList.contains('patch-open')) {
      const patch = document.getElementById('btn-patch');
      if (patch) patch.click();
    }
    const synth = document.getElementById('btn-synth');
    if (synth && synth.classList.contains('synth-active')) synth.click();
  }

  _audioNodes() {
    const engine = this.engine;
    if (!engine || !engine.actx || !engine.gainNode) return null;
    return {
      actx: engine.actx,
      dest: engine.gainNode,
      visL: engine.visBusL,
      visR: engine.visBusR,
    };
  }

  _resumeAudio() {
    const engine = this.engine;
    if (engine && engine.actx && engine.actx.state === 'suspended') {
      engine.actx.resume().catch(() => {});
    }
  }

  _applyChrome(on) {
    document.body.classList.toggle('toys-open', on);
    const app = document.querySelector('.app');
    if (app) app.classList.toggle('toys-open', on);
    if (this._btn) {
      this._btn.classList.toggle('active', on);
      this._btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (this._dock) this._dock.hidden = !on;
  }
}

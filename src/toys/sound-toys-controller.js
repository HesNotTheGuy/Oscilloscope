'use strict';

import { Knob } from '../knob.js';
import { KEYS } from './scale.js';
import { PluckPool } from './pluck-pool.js';
import { RipplePad } from './ripple-pad.js';

const TOYS = [
  {
    id: 'ripple-pad',
    title: 'Ripple Pad',
    mount(root, hooks) {
      const canvas = document.createElement('canvas');
      canvas.id = 'ripple-pad-canvas';
      canvas.className = 'ty-pad';
      canvas.setAttribute('aria-label', 'Ripple pad');
      root.appendChild(canvas);
      return new RipplePad(canvas, hooks);
    },
  },
];

const KNOBS = [
  {
    id: 'scale',
    label: 'SCALE',
    index: 0,
    steps: [
      { value: 'major', label: 'Major' },
      { value: 'minor', label: 'Minor' },
      { value: 'pentatonic', label: 'Pentatonic' },
      { value: 'dorian', label: 'Dorian' },
      { value: 'mixolydian', label: 'Mixolydian' },
    ],
  },
  {
    id: 'key',
    label: 'KEY',
    index: 0,
    steps: KEYS.map(name => ({ value: name, label: name })),
  },
  {
    id: 'speed',
    label: 'SPEED',
    index: 2,
    steps: [
      { value: 0.18, label: 'Slow' },
      { value: 0.28, label: 'Med' },
      { value: 0.38, label: 'Fast' },
      { value: 0.48, label: 'Rush' },
    ],
  },
  {
    id: 'damping',
    label: 'RING',
    index: 2,
    steps: [
      { value: 0.94, label: 'Short' },
      { value: 0.97, label: 'Med' },
      { value: 0.985, label: 'Long' },
      { value: 0.995, label: 'Endless' },
    ],
  },
  {
    id: 'timbre',
    label: 'TIMBRE',
    index: 0,
    steps: [
      { value: 'pluck', label: 'Pluck' },
      { value: 'glass', label: 'Glass' },
      { value: 'mallet', label: 'Mallet' },
    ],
  },
  {
    id: 'density',
    label: 'DENSITY',
    index: 2,
    steps: [8, 12, 16, 24, 32].map(n => ({ value: n, label: String(n) })),
  },
];

function paramsFromKnobs() {
  const params = {};
  for (const k of KNOBS) params[k.id] = k.steps[k.index].value;
  return params;
}

export class SoundToysController {
  constructor(ctx) {
    this.ctx = ctx;
    this.engine = ctx.engine;
    this.ensureAudio = ctx.ensureAudio;
    this._params = paramsFromKnobs();
    this._open = false;
    this._epoch = 0;
    this._pad = null;
    this._pool = null;
    this._btn = null;
    this._dock = null;
    this._readout = null;
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
    if (this._open || !this._pad) return;
    const epoch = ++this._epoch;
    try {
      if (this.ensureAudio) await this.ensureAudio();
    } catch (_) {
      return;
    }
    if (epoch !== this._epoch || this._open) return;
    this._closeOthers();
    if (epoch !== this._epoch) return;
    this._ensurePool();
    this._applyChrome(true);
    this._pad.setDensity(this._params.density);
    this._pad.start();
    this._open = true;
  }

  close() {
    this._epoch++;
    this._open = false;
    if (this._pad) this._pad.stop();
    if (this._pool) this._pool.dispose();
    this._applyChrome(false);
  }

  get api() {
    return {
      isOpen: () => this._open,
      toyId: TOYS[0].id,
      tap: (nx, ny, amp) => { if (this._pad) this._pad.pointerNorm(nx, ny, amp); },
      noteLog: () => (this._pool ? this._pool.noteEvents.slice() : []),
      voiceCount: () => (this._pool ? this._pool.activeCount() : 0),
      energy: () => (this._pad ? this._pad.field.energy() : 0),
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
      tab.className = 'ty-tab' + (toy.id === this._toyId ? ' ty-tab-on' : '');
      tab.textContent = toy.title;
      tab.addEventListener('click', () => { this._toyId = toy.id; });
      bar.appendChild(tab);
    }
    const hint = document.createElement('div');
    hint.className = 'ty-hint';
    hint.textContent = 'Tap or drag the sheet. Rings play notes.';
    const readout = document.createElement('div');
    readout.className = 'ty-readout';
    readout.textContent = '';
    this._readout = readout;
    bar.append(hint, readout);

    const stage = document.createElement('div');
    stage.className = 'ty-stage';
    const toy = TOYS.find(t => t.id === this._toyId) || TOYS[0];
    this._pad = toy.mount(stage, {
      onNote: (ev) => this._showNote(ev),
      getParams: () => this._params,
    });
    this._pad.setDensity(this._params.density);

    const controls = document.createElement('div');
    controls.className = 'ty-controls';
    for (const spec of KNOBS) {
      const group = document.createElement('div');
      group.className = 'knob-group';
      const knob = document.createElement('div');
      knob.className = 'knob';
      knob.id = 'ty-knob-' + spec.id;
      const mark = document.createElement('div');
      mark.className = 'knob-mark';
      knob.appendChild(mark);
      const sub = document.createElement('div');
      sub.className = 'knob-sub';
      const label = document.createElement('div');
      label.className = 'knob-label';
      label.textContent = spec.label;
      const value = document.createElement('div');
      value.className = 'knob-value';
      value.id = 'ty-val-' + spec.id;
      value.textContent = spec.steps[spec.index].label;
      sub.append(label, value);
      group.append(knob, sub);
      controls.appendChild(group);
      new Knob(knob, spec.steps.map(s => s.value), spec.index, (v, index) => {
        this._params[spec.id] = v;
        value.textContent = spec.steps[index].label;
      });
    }

    dock.append(bar, stage, controls);
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

  _ensurePool() {
    const engine = this.engine;
    if (!this._pool && engine && engine.actx && engine.gainNode) {
      this._pool = new PluckPool({
        actx: engine.actx,
        dest: engine.gainNode,
        visL: engine.visBusL,
        visR: engine.visBusR,
      });
    }
    if (this._pad) this._pad.attach(this._pool);
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

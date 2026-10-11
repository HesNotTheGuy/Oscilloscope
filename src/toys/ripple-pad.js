'use strict';

import { WaveField, clampGrid } from './wave-field.js';
import { midiForCell, frequencyForMidi } from './scale.js';

const TRIGGER_LEVEL = 0.18;
const CELL_QUIET_MS = 120;
const GREEN = [124, 255, 74];
const YELLOW = [245, 225, 75];

// Prefer a trigger count inside 12..20, then the count closest to 16.
function triggerStride(n) {
  const hi = n - 2;
  let bestK = 1;
  let bestScore = Infinity;
  for (let k = 1; k <= hi; k++) {
    const along = Math.floor((hi - 1) / k) + 1;
    const count = along * along;
    const outside = count < 12 || count > 20 ? 100 : 0;
    const score = outside + Math.abs(count - 16);
    if (score < bestScore) {
      bestScore = score;
      bestK = k;
    }
  }
  return bestK;
}

function buildTriggers(n) {
  const hi = n - 2;
  const k = triggerStride(n);
  const cells = [];
  for (let y = 1; y <= hi; y += k) {
    for (let x = 1; x <= hi; x += k) {
      cells.push({ x, y, prev: 0, lastFire: -1e9 });
    }
  }
  return cells;
}

function dotColor(t) {
  const r = GREEN[0] + (YELLOW[0] - GREEN[0]) * t;
  const g = GREEN[1] + (YELLOW[1] - GREEN[1]) * t;
  const b = GREEN[2] + (YELLOW[2] - GREEN[2]) * t;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export class RipplePad {
  constructor(canvas, { onNote, getParams } = {}) {
    this._canvas = canvas;
    this._onNote = onNote || null;
    this._getParams = getParams || null;
    this._g = canvas.getContext('2d', { alpha: false });
    this.field = new WaveField(16);
    this._pool = null;
    this._triggers = [];
    this._rings = new Set();
    this._built = 0;
    this._running = false;
    this._raf = 0;
    this._down = false;
    this.setDensity(16);
    this._bindPointer();
  }

  attach(engine, pool) {
    this._engine = engine || null;
    this._pool = pool || null;
  }

  setDensity(n) {
    const next = clampGrid(n);
    if (this._built === next) return;
    this.field.resize(next);
    this._built = this.field.size;
    this._triggers = buildTriggers(this._built);
    this._rings = new Set();
    for (const t of this._triggers) this._rings.add(t.y * this._built + t.x);
  }

  pointerNorm(nx, ny, amp = 1) {
    const n = this.field.size;
    const x = Math.floor(clamp01(Number(nx)) * n);
    const y = Math.floor(clamp01(Number(ny)) * n);
    this.field.impulse(x, y, amp);
  }

  pointer(nx, ny, amp) {
    this.pointerNorm(nx, ny, amp);
  }

  tap(nx, ny, amp) {
    this.pointerNorm(nx, ny, amp);
  }

  start() {
    if (this._running) return;
    this._running = true;
    const loop = (now) => {
      if (!this._running) return;
      this._frame(now);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  snapshot() {
    return {
      energy: this.field.energy(),
      voiceCount: this._pool ? this._pool.activeCount() : 0,
      noteCount: this._pool ? this._pool.noteEvents.length : 0,
      density: this.field.size,
      open: this._running,
    };
  }

  _bindPointer() {
    const canvas = this._canvas;
    canvas.addEventListener('pointerdown', (e) => {
      this._down = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      this._fromEvent(e, 1);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this._down) return;
      this._fromEvent(e, 0.55);
    });
    const up = () => { this._down = false; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  _fromEvent(e, amp) {
    const rect = this._canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
    this.pointerNorm(nx, ny, amp);
  }

  _frame(now) {
    const params = this._getParams ? this._getParams() : null;
    if (params && params.density != null) this.setDensity(params.density);
    this.field.step({
      speed: params && params.speed != null ? params.speed : 0.35,
      damping: params && params.damping != null ? params.damping : 0.985,
    });
    this._scan(params || {}, Number.isFinite(now) ? now : performance.now());
    this._draw();
  }

  _scan(params, now) {
    const scale = params.scale || 'major';
    const key = params.key || 'C';
    const timbre = params.timbre || 'pluck';
    for (const trig of this._triggers) {
      const a = Math.abs(this.field.uAt(trig.x, trig.y));
      const prev = trig.prev;
      trig.prev = a;
      if (!(prev < TRIGGER_LEVEL && a >= TRIGGER_LEVEL)) continue;
      if (now - trig.lastFire < CELL_QUIET_MS) continue;
      trig.lastFire = now;
      const midi = midiForCell(trig.x, trig.y, key, scale);
      const freq = frequencyForMidi(midi);
      const id = trig.x + ',' + trig.y;
      const started = this._pool ? this._pool.pluck({ freq, timbre, id }) : false;
      if (started && this._onNote) {
        this._onNote({ t: now, midi, freq, x: trig.x, y: trig.y, id, timbre });
      }
    }
  }

  _draw() {
    const g = this._g;
    const canvas = this._canvas;
    if (!g) return;
    const dpr = globalThis.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width || 0;
    const h = canvas.clientHeight || canvas.height || 0;
    if (w < 2 || h < 2) return;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#070807';
    g.fillRect(0, 0, w, h);

    const n = this.field.size;
    const cw = w / n;
    const ch = h / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const mag = Math.min(1, Math.abs(this.field.uAt(x, y)) / 0.7);
        const cx = (x + 0.5) * cw;
        const cy = (y + 0.5) * ch;
        const rad = Math.max(1.25, Math.min(cw, ch) * (0.14 + 0.3 * mag));
        g.beginPath();
        g.fillStyle = dotColor(mag);
        g.arc(cx, cy, rad, 0, Math.PI * 2);
        g.fill();
        if (!this._rings.has(y * n + x)) continue;
        g.beginPath();
        g.lineWidth = 1;
        g.strokeStyle = mag > 0.25 ? 'rgba(245,225,75,0.9)' : 'rgba(124,255,74,0.4)';
        g.arc(cx, cy, rad + Math.max(2.5, Math.min(cw, ch) * 0.16), 0, Math.PI * 2);
        g.stroke();
      }
    }
  }
}

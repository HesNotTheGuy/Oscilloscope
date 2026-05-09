'use strict';

// ─────────────────────────────────────────────────────────────
//  TooltipController — hover tooltips for all DSO-1 controls
//  Single tooltip div, event-delegated, 400 ms delay.
// ─────────────────────────────────────────────────────────────
export class TooltipController {
  constructor(_ctx) {
    this._tip   = null;
    this._timer = null;
  }

  init() {
    // Create single tooltip element
    const tip = document.createElement('div');
    tip.id = 'dso-tooltip';
    document.body.appendChild(tip);
    this._tip = tip;

    // Hide on mousedown / dragstart so it never blocks interactions
    document.addEventListener('mousedown',  () => this._hide(), true);
    document.addEventListener('dragstart',  () => this._hide(), true);

    // Event delegation on body
    document.body.addEventListener('mouseover',  e => this._onOver(e));
    document.body.addEventListener('mouseout',   e => this._onOut(e));
  }

  // ─── Internal ───────────────────────────────────────────────

  _show(el, text) {
    if (!text) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      if (!this._tip) return;
      this._tip.innerHTML = text;
      this._tip.classList.add('visible');
      this._position(el);
    }, 400);
  }

  _hide() {
    clearTimeout(this._timer);
    if (!this._tip) return;
    this._tip.classList.remove('visible');
  }

  _position(el) {
    const tip  = this._tip;
    const rect = el.getBoundingClientRect();
    const gap  = 6;

    // First pass: above
    let top  = rect.top - tip.offsetHeight - gap;
    let left = rect.left + (rect.width - tip.offsetWidth) / 2;

    // If off screen top, place below
    if (top < 4) top = rect.bottom + gap;

    // Clamp horizontally
    left = Math.max(6, Math.min(left, window.innerWidth - tip.offsetWidth - 6));

    tip.style.top  = top  + 'px';
    tip.style.left = left + 'px';
  }

  _onOver(e) {
    // Suppress during snake game
    if (document.getElementById('kb-help-overlay')) { this._hide(); return; }

    const el  = e.target;
    const text = this._resolve(el);
    if (text) this._show(el, text);
  }

  _onOut(e) {
    // Only hide when leaving the matched element itself (not child→parent bubbles)
    const rel = e.relatedTarget;
    if (rel && e.target.contains(rel)) return;
    this._hide();
  }

  // ─── Tooltip content resolver ────────────────────────────────

  _resolve(el) {
    // ── Knob (.knob wraps .knob-mark) ──
    const knob = el.closest('.knob');
    if (knob) {
      const sub   = knob.nextElementSibling;  // .knob-sub
      const label = sub?.querySelector('.knob-label')?.textContent?.trim() || '';
      const value = sub?.querySelector('.knob-value')?.textContent?.trim() || '';
      if (!label) return null;
      return `<span class="label">${label}</span>${value}`;
    }

    // ── Range slider label (.fp-range-label wraps input + span) ──
    const rangeLabel = el.closest('.fp-range-label');
    if (rangeLabel && !el.closest('.knob')) {
      const labelNode = rangeLabel.childNodes[0];
      const name  = labelNode?.nodeValue?.trim() || rangeLabel.querySelector('.range-name')?.textContent?.trim() || '';
      const value = rangeLabel.querySelector('span')?.textContent?.trim() || '';
      if (!name) return null;
      const input = rangeLabel.querySelector('input[type=range]');
      const min   = input?.min ?? '';
      const max   = input?.max ?? '';
      const range = (min !== '' && max !== '') ? ` [${min}–${max}]` : '';
      return `<span class="label">${name}</span>${value}${range}`;
    }

    // ── Section divider ──
    if (el.classList.contains('fp-section-divider')) {
      const map = {
        'FREQ FILTER': 'Bandpass filter applied to audio before rendering',
        'COLOR':       'Beam color presets — click to apply',
        'EFFECTS':     'Post-processing FX layered on the beam',
        'GEOMETRY':    'Tile and radial symmetry for patterns',
        'AUTO ROTATE': 'Continuous per-axis rotation of the 3D/2D scene',
        'SCROLL':      'Infinite drift speed along X or Y axis',
        'MOTION':      'Animated movement FX (float, ripple, twist, explode)',
        'DRAW POWER':  'Controls how many vertices are drawn each frame',
      };
      const key = el.textContent?.trim();
      return map[key] || null;
    }

    // ── Mode buttons ──
    const id = el.id;
    if (id === 'btn-yt')       return 'YT mode — voltage vs. time (standard waveform view)';
    if (id === 'btn-xy')       return 'XY mode — Lissajous figures (CH1=X axis, CH2=Y axis)';
    if (id === 'btn-vs')       return 'Vectorscope — L/R stereo correlation as a polar plot';

    // ── Transport / system buttons ──
    if (id === 'btn-record')    return 'Record video — audio is included. Use ▾ to choose Standard or Transparent';
    if (id === 'btn-run-stop')  return 'Run / Stop scope acquisition';
    if (id === 'btn-single')    return 'Single-shot trigger — captures one frame on next trigger event';
    if (id === 'btn-measure')   return 'Toggle measurement readout strip (Vpp, Vrms, frequency, etc.)';
    if (id === 'btn-auto-set')  return 'Auto-set — automatically adjust timebase and V/div to fit the signal';
    if (id === 'btn-reset-pos') return 'Reset CH1, CH2 and horizontal position to center';
    if (id === 'btn-idle-sig')  return 'Idle signal — inject a test sine wave when no audio source is connected';
    if (id === 'btn-screenshot')return 'Save scope display as a PNG screenshot';
    if (id === 'btn-popout')    return 'Open scope in a separate window (clean view, no panels)';
    if (id === 'btn-fullscreen')return 'Enter fullscreen on the selected monitor';

    // ── Coupling buttons ──
    if (el.classList.contains('coup-btn')) {
      const coup = el.dataset.coup;
      if (coup === 'AC')  return '<span class="label">AC coupling</span>Removes DC offset — shows only AC component';
      if (coup === 'DC')  return '<span class="label">DC coupling</span>Preserves full signal including DC offset';
      if (coup === 'GND') return '<span class="label">GND</span>Input shorted to zero — use to set trigger reference';
    }

    // ── Color swatches ──
    if (el.classList.contains('color-swatch')) {
      const color = el.dataset.color || el.style.background;
      const name  = el.title ? `${el.title} ` : '';
      return `<span class="label">Beam color</span>${name}${color}`;
    }

    // ── Preset pack buttons ──
    if (el.classList.contains('preset-pack-btn')) {
      const desc = el.title || el.dataset.title || '';
      const name = el.textContent?.trim() || '';
      return desc ? `<span class="label">${name}</span>${desc}` : null;
    }

    // ── Theme select ──
    if (el.classList.contains('theme-select') || el.id === 'theme-select') {
      return 'UI theme — affects panels and chrome only, not the wave display';
    }

    // ── Rig / layout select ──
    if (el.classList.contains('rig-select') || el.id === 'rig-select') {
      return 'Workspace layout — rearranges panels. Use ⋯ menu to save custom rigs';
    }

    // ── Preset slots ──
    if (el.classList.contains('preset-slot')) {
      const n = el.dataset.slot ?? el.dataset.index ?? '';
      const label = n !== '' ? `Preset slot ${n}` : 'Preset slot';
      return `<span class="label">${label}</span>Click to load · hold SAVE then click to overwrite`;
    }

    // ── Trigger mode buttons ──
    if (el.classList.contains('trig-btn')) {
      const mode = el.dataset.mode;
      if (mode === 'auto')   return '<span class="label">AUTO</span>Free-runs if no trigger — always shows a waveform';
      if (mode === 'normal') return '<span class="label">NORM</span>Waits for a trigger — blanks if none occurs';
      if (mode === 'single') return '<span class="label">SING</span>Captures one sweep then stops';
    }

    // ── Trigger source / slope selects ──
    if (el.id === 'trig-source') return 'Trigger source channel';
    if (el.id === 'trig-slope')  return 'Trigger edge — rising (↑) or falling (↓)';

    // ── Signal gen wave select ──
    if (el.id === 'gen-wave')    return 'Signal generator waveform shape';

    // ── Signal gen start/stop ──
    if (id === 'btn-gen-start')  return 'Start signal generator — routes stereo test signal to scope';
    if (id === 'btn-gen-stop')   return 'Stop signal generator';

    // ── Ratio buttons ──
    if (el.classList.contains('ratio-btn')) {
      return `<span class="label">L:R ratio</span>${el.textContent?.trim()} — sets Lissajous figure shape`;
    }

    // ── Audio buttons ──
    if (id === 'btn-play')       return 'Play loaded audio file';
    if (id === 'btn-stop-audio') return 'Stop audio playback';
    if (id === 'btn-mic')        return 'Use microphone as audio input';

    // ── Display toggles ──
    if (el.id === 'show-grid')  return 'Show / hide graticule grid on scope display';
    if (el.id === 'crt-curve')  return 'CRT barrel distortion and vignette overlay';
    if (el.id === 'scanlines')  return 'Horizontal scanline overlay for retro CRT look';

    // ── OBJ/IMG scene controls ──
    if (id === 'obj-mode-3d')   return '3D object mode — load a .obj file';
    if (id === 'obj-mode-img')  return '2D image mode — traces edges of a loaded image';
    if (id === 'btn-gen-start') return 'Start signal generator';

    // ── Recording mode chevron ──
    if (id === 'btn-record-mode') return 'Recording options — Standard (black bg) or Transparent (alpha channel)';

    // ── Rig menu ──
    if (id === 'rig-menu-btn') return 'Workspace options — save, update, delete, or rearrange layout';

    return null;
  }
}

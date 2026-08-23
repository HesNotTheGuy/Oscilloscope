'use strict';

// ─────────────────────────────────────────────────────────────
//  TourController — optional guided tour.
//
//  Passive hint text is the weakest teacher: the thing that makes
//  this app click is touching it, so the tour spotlights the real
//  control and says what to DO with it, rather than describing the
//  app in the abstract.
//
//  Rules it holds to:
//   - never automatic-and-unskippable: it is offered, not imposed
//   - a step whose element is missing or hidden is skipped, so a
//     renamed id degrades to a shorter tour instead of a dead one
//   - replayable forever from the help card
// ─────────────────────────────────────────────────────────────

const SEEN_PREFIX = 'dso1.tour.';

export const TOURS = {
  basics: [
    { sel: '#scope', title: 'This is the scope',
      body: 'Drop an audio file anywhere on it to see the waveform. Mic and system audio work too, from the SOURCE panel.',
      place: 'right' },
    { sel: '#zone-right', title: 'Everything is a panel',
      body: 'SCOPE sets the timebase and trigger. BEAM changes how the trace is drawn — glow, persistence, width. SCENE adds shapes and images.',
      place: 'left' },
    { sel: '#theme-select', title: 'Themes change the whole instrument',
      body: 'Tektronix blue, analog amber, synthwave. The theme sets the beam colour and feel, not just the frame.',
      place: 'bottom' },
    { sel: '#btn-synth', title: 'Play it yourself',
      body: 'Press K or click SYNTH to play notes on your keyboard. Chords draw Lissajous figures — that is the fun part.',
      place: 'bottom' },
    { sel: '#btn-patch', title: 'PATCH turns it into an instrument',
      body: 'Route whatever is playing through a modular rack: filters, echo, and modulators you wire up with cables. Open it and take the patch tour.',
      place: 'bottom' },
    { sel: '#btn-record', title: 'Record what you make',
      body: 'Captures the canvas with audio, including anything the patch rack is doing to it.',
      place: 'bottom' },
  ],
  patch: [
    { sel: '#pk-book', title: 'Start from a recipe',
      body: 'The patch book has working starting points. Try "wobble" with a song playing, or "groovebox" — that one plays itself with no input at all.',
      place: 'bottom' },
    { sel: '[data-pk-jack="lfo.out"]', title: 'Drag jack to jack to patch',
      body: 'Grab an OUT and drop it on any pulsing IN. Direction does not matter. Green cables carry sound, dashed amber ones carry modulation.',
      place: 'top' },
    { sel: '[data-pk-jack="vcf.out"]', title: 'Click a jack to probe it',
      body: 'A plain click puts that point of the circuit on the scope — like touching a real probe to a test point. Click again to release.',
      place: 'top' },
    { sel: '.pk-name', title: 'Rearrange your board',
      body: 'Drag a module by its name plate to move it. Double-click the plate to hide a module you never use. Your layout is saved.',
      place: 'bottom' },
    { sel: '#pk-mode', title: 'Patch, then play',
      body: 'PLAYING locks the cables and the layout so a performance cannot snag a wire. Knobs and probing still work.',
      place: 'bottom' },
  ],
};

export class TourController {
  constructor(_ctx) {
    this._els = null;
    this._steps = [];
    this._i = 0;
    this._onKey = null;
    this._onResize = null;
  }

  static seen(id) {
    try { return !!localStorage.getItem(SEEN_PREFIX + id); } catch (_) { return true; }
  }
  static markSeen(id) {
    try { localStorage.setItem(SEEN_PREFIX + id, '1'); } catch (_) {}
  }

  get running() { return !!this._els; }

  start(id) {
    if (this._els) this._end();
    const steps = (TOURS[id] || []).filter(s => {
      const el = document.querySelector(s.sel);
      return el && el.getBoundingClientRect().width > 0;
    });
    if (!steps.length) return false;
    TourController.markSeen(id);
    this._steps = steps;
    this._i = 0;
    this._build();
    this._render();
    return true;
  }

  _build() {
    const spot = document.createElement('div');
    spot.className = 'tour-spot';
    const card = document.createElement('div');
    card.className = 'tour-card';
    card.innerHTML =
      '<div class="tour-step"></div>' +
      '<div class="tour-title"></div>' +
      '<div class="tour-body"></div>' +
      '<div class="tour-actions">' +
        '<button class="tour-btn tour-skip">Skip</button>' +
        '<span class="tour-spacer"></span>' +
        '<button class="tour-btn tour-back">Back</button>' +
        '<button class="tour-btn tour-next tour-primary">Next</button>' +
      '</div>';
    document.body.appendChild(spot);
    document.body.appendChild(card);
    this._els = { spot, card };

    card.querySelector('.tour-skip').addEventListener('click', () => this._end());
    card.querySelector('.tour-back').addEventListener('click', () => { this._i = Math.max(0, this._i - 1); this._render(); });
    card.querySelector('.tour-next').addEventListener('click', () => this._advance());

    // Escape leaves, arrows/Enter move. Captured so the app's own shortcuts
    // (Escape closes the rack, K opens the synth) don't fire mid-tour.
    this._onKey = e => {
      if (!this._els) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this._end(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this._advance(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); this._i = Math.max(0, this._i - 1); this._render(); }
    };
    document.addEventListener('keydown', this._onKey, true);
    this._onResize = () => this._render();
    addEventListener('resize', this._onResize);
  }

  _advance() {
    if (this._i >= this._steps.length - 1) this._end();
    else { this._i++; this._render(); }
  }

  _render() {
    const s = this._steps[this._i];
    const el = document.querySelector(s.sel);
    if (!el) { this._advance(); return; }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const pad = 6;
    const { spot, card } = this._els;
    spot.style.left = (r.left - pad) + 'px';
    spot.style.top = (r.top - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';

    card.querySelector('.tour-step').textContent = (this._i + 1) + ' / ' + this._steps.length;
    card.querySelector('.tour-title').textContent = s.title;
    card.querySelector('.tour-body').textContent = s.body;
    card.querySelector('.tour-back').style.visibility = this._i ? '' : 'hidden';
    card.querySelector('.tour-next').textContent = this._i === this._steps.length - 1 ? 'Done' : 'Next';

    // Place the card beside the target, then clamp it into the viewport so a
    // step near an edge can never render off-screen.
    const cw = card.offsetWidth || 300, ch = card.offsetHeight || 140, gap = 14;
    let x, y;
    if (s.place === 'left')       { x = r.left - cw - gap; y = r.top; }
    else if (s.place === 'right') { x = r.right + gap;     y = r.top; }
    else if (s.place === 'top')   { x = r.left;            y = r.top - ch - gap; }
    else                          { x = r.left;            y = r.bottom + gap; }
    x = Math.max(12, Math.min(x, innerWidth - cw - 12));
    y = Math.max(12, Math.min(y, innerHeight - ch - 12));
    card.style.left = x + 'px';
    card.style.top = y + 'px';
  }

  _end() {
    if (!this._els) return;
    document.removeEventListener('keydown', this._onKey, true);
    removeEventListener('resize', this._onResize);
    this._els.spot.remove();
    this._els.card.remove();
    this._els = null;
    this._onKey = this._onResize = null;
  }
}

'use strict';

// ─────────────────────────────────────────────────────────────
//  FirstRunHint — one-time welcome overlay shown on first launch.
//  Dismissed by: Got-it button, Escape, drop on window, or K key.
//  Guard: only runs in the main window (requires #scope AND
//  #panel-store, which the popout display.html lacks).
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'osc_firstRunSeen';

const HINTS = [
  '🎵 Drop an audio file anywhere on the scope to visualize it',
  '🎹 Press K to play the keyboard synth — chords draw Lissajous shapes',
  '❓ Press ? for all shortcuts',
];

export class FirstRunHint {
  constructor(ctx) {
    this.tour = (ctx && ctx.tour) || null;
    this._card      = null;
    this._onKeyDown = null;
    this._onDrop    = null;
  }

  init() {
    // Popout guard — display.html has no #panel-store
    if (!document.getElementById('scope') || !document.getElementById('panel-store')) return;

    // Already seen
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch (_) { return; }

    this._show();
  }

  _show() {
    const card = document.createElement('div');
    card.className = 'first-run-hint';

    const title = document.createElement('div');
    title.className = 'frh-title';
    title.textContent = 'Welcome to DSO-1';
    card.appendChild(title);

    const rows = document.createElement('div');
    rows.className = 'frh-rows';
    for (const text of HINTS) {
      const row = document.createElement('div');
      row.className = 'frh-row';
      row.textContent = text;
      rows.appendChild(row);
    }
    card.appendChild(rows);

    // Offered, never imposed: the tour is a button next to "Got it", not
    // something that starts talking at you the moment the app opens.
    if (this.tour) {
      const tourBtn = document.createElement('button');
      tourBtn.className = 'sys-btn frh-btn frh-tour-btn';
      tourBtn.textContent = 'Take the tour';
      tourBtn.addEventListener('click', () => {
        this._dismiss();
        setTimeout(() => this.tour.start('basics'), 350);   // let the card fade first
      });
      card.appendChild(tourBtn);
    }

    const btn = document.createElement('button');
    btn.className = 'sys-btn frh-btn';
    btn.textContent = 'Got it';
    card.appendChild(btn);

    document.body.appendChild(card);
    this._card = card;

    const dismiss = () => this._dismiss();

    btn.addEventListener('click', dismiss, { once: true });

    this._onKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'k' || e.key === 'K') dismiss();
    };
    this._onDrop = () => dismiss();

    document.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('drop', this._onDrop, { once: true });
  }

  _dismiss() {
    if (!this._card) return;

    // Persist so overlay never shows again
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) { /* ignore */ }

    // Clean up global listeners
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._onDrop) {
      window.removeEventListener('drop', this._onDrop);
      this._onDrop = null;
    }

    // Fade out then remove from DOM
    const card = this._card;
    this._card = null;
    card.classList.add('frh-hidden');

    const cleanup = () => card.remove();
    card.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, 600); // fallback if transitionend never fires
  }
}

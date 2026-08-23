'use strict';

// ─────────────────────────────────────────────────────────────
//  Notifier — one place the app says what just happened.
//
//  A seven-persona UX crawl found the same habit in every single
//  run: the app changes state, or fails, without telling anyone.
//  Audio silently summed to mono, a button silently switched the
//  display mode, DMX reported "SENDING" while every packet failed,
//  a recording came out silent because the volume was down.
//
//  These were not seven bugs, they were one missing channel. This
//  is that channel: visible to everyone, and announced to screen
//  readers via role="status" (the app previously had no aria-live
//  region anywhere in the document).
//
//  Deliberately quiet by design: notices are for things the user
//  did NOT ask for. Confirming an action they just took is noise.
// ─────────────────────────────────────────────────────────────

const KINDS = { info: 'nt-info', warn: 'nt-warn', error: 'nt-error' };

export class Notifier {
  constructor() {
    this._el = null;
    this._timer = null;
    this._last = '';
    this._lastAt = 0;
  }

  init() {
    if (this._el) return;
    // The popout display window has no topbar; skip there.
    if (!document.getElementById('scope')) return;
    const el = document.createElement('div');
    el.id = 'app-notice';
    el.className = 'nt-hidden';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
    this._el = el;
  }

  /**
   * Say something happened.
   * @param {string} msg  – plain language, user's side of the screen
   * @param {'info'|'warn'|'error'} kind
   * @param {number} ms   – how long to show it
   */
  say(msg, kind = 'info', ms = 5000) {
    if (!this._el) this.init();
    if (!this._el || !msg) return;
    // Collapse repeats: a per-frame failure must not become a strobe.
    const now = Date.now();
    if (msg === this._last && now - this._lastAt < 4000) return;
    this._last = msg; this._lastAt = now;

    this._el.textContent = msg;
    this._el.className = KINDS[kind] || KINDS.info;
    clearTimeout(this._timer);
    // Errors stay until superseded; they usually need an action.
    if (kind !== 'error') {
      this._timer = setTimeout(() => {
        if (this._el) this._el.className = 'nt-hidden';
      }, ms);
    }
  }

  warn(msg, ms)  { this.say(msg, 'warn', ms); }
  error(msg)     { this.say(msg, 'error'); }

  clear() {
    clearTimeout(this._timer);
    if (this._el) { this._el.className = 'nt-hidden'; this._el.textContent = ''; }
    this._last = '';
  }
}

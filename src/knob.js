'use strict';

// ─────────────────────────────────────────────────────────────
//  Knob — stepped or continuous rotary control
// ─────────────────────────────────────────────────────────────
export class Knob {
  constructor(el, steps, defaultIdx, onChange) {
    this.el       = el;
    this.mark     = el.querySelector('.knob-mark');
    this.steps    = steps;
    this.index    = defaultIdx;
    this.onChange = onChange;
    this._dragY   = null;
    this._dragIdx = 0;
    this._setupEvents();
    this._updateAngle();
  }

  setIndex(i) {
    if (!this.steps) return;
    this.index = Math.max(0, Math.min(this.steps.length - 1, i));
    this._updateAngle();
    this.onChange(this.steps[this.index], this.index);
  }

  _updateAngle() {
    const max   = this.steps ? this.steps.length - 1 : 10;
    const t     = this.steps ? this.index / max : 0.5;
    this.mark.style.transform = `rotate(${-135 + t * 270}deg)`;
  }

  _setupEvents() {
    this.el.addEventListener('wheel', e => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      if (this.steps) this.setIndex(this.index + dir);
      else this.onChange(dir * 0.05);
    }, { passive: false });

    this.el.addEventListener('mousedown', e => {
      this._dragY   = e.clientY;
      this._dragIdx = this.index;
      e.preventDefault();
      const onMove = ev => {
        const delta = Math.round((this._dragY - ev.clientY) / 10);
        if (this.steps) {
          const ni = Math.max(0, Math.min(this.steps.length - 1, this._dragIdx + delta));
          if (ni !== this.index) { this.index = ni; this._updateAngle(); this.onChange(this.steps[ni], ni); }
        } else {
          const dy = this._dragY - ev.clientY;
          this._dragY = ev.clientY;
          this.onChange(dy * 0.005);
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    this.el.addEventListener('dblclick', () => {
      if (this.steps) this.setIndex(Math.floor(this.steps.length / 2));
      else this.onChange('reset');
    });
  }
}

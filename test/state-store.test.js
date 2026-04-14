import { describe, it, expect, beforeEach } from 'vitest';
import { StateStore, STATE_SCHEMA } from '../src/state-store.js';

// ── Minimal schema for focused tests ────────────────────────
const MINI_SCHEMA = {
  display: {
    color: '#00ff41',
    glow: 12,
    showGrid: true,
  },
  fx: {
    bloom: false,
    bloomStr: 1.0,
    _angle: 0,
    _flash: 0,
  },
  ch1: {
    coupling: 'AC',
    pos: 0,
  },
};

describe('StateStore', () => {
  let store;

  beforeEach(() => {
    store = new StateStore(MINI_SCHEMA);
  });

  // ── Construction & flattening ──────────────────────────────

  describe('constructor', () => {
    it('flattens nested schema into dot-paths', () => {
      expect(store.get('display.color')).toBe('#00ff41');
      expect(store.get('display.glow')).toBe(12);
      expect(store.get('fx.bloom')).toBe(false);
      expect(store.get('ch1.coupling')).toBe('AC');
    });

    it('initializes internal state paths', () => {
      expect(store.get('fx._angle')).toBe(0);
      expect(store.get('fx._flash')).toBe(0);
    });

    it('returns undefined for non-existent paths', () => {
      expect(store.get('nonexistent.path')).toBeUndefined();
    });
  });

  // ── get / set ─────────────────────────────────────────────

  describe('get / set', () => {
    it('sets and retrieves values', () => {
      store.set('display.color', '#ff0000');
      expect(store.get('display.color')).toBe('#ff0000');
    });

    it('returns true when value changes', () => {
      expect(store.set('display.glow', 20)).toBe(true);
    });

    it('returns false when value is unchanged', () => {
      expect(store.set('display.color', '#00ff41')).toBe(false);
    });

    it('handles boolean values', () => {
      store.set('display.showGrid', false);
      expect(store.get('display.showGrid')).toBe(false);
    });

    it('handles numeric values', () => {
      store.set('fx.bloomStr', 0.5);
      expect(store.get('fx.bloomStr')).toBe(0.5);
    });
  });

  // ── batch ─────────────────────────────────────────────────

  describe('batch', () => {
    it('sets multiple values atomically', () => {
      store.batch({
        'display.color': '#ff0000',
        'display.glow': 30,
        'fx.bloom': true,
      });
      expect(store.get('display.color')).toBe('#ff0000');
      expect(store.get('display.glow')).toBe(30);
      expect(store.get('fx.bloom')).toBe(true);
    });

    it('fires events after all values are applied', () => {
      const events = [];
      store.on('display.color', (v, o, p) => {
        // At this point, glow should already be updated
        events.push({ path: p, glow: store.get('display.glow') });
      });
      store.on('display.glow', (v, o, p) => events.push({ path: p }));

      store.batch({ 'display.color': '#ff0000', 'display.glow': 30 });
      expect(events).toHaveLength(2);
      expect(events[0].glow).toBe(30); // glow already set when color event fires
    });

    it('does not fire events for unchanged values', () => {
      let fired = 0;
      store.on('display.color', () => fired++);
      store.batch({ 'display.color': '#00ff41' }); // same value
      expect(fired).toBe(0);
    });
  });

  // ── snapshot / restore ────────────────────────────────────

  describe('snapshot / restore', () => {
    it('captures all user-configurable state', () => {
      const snap = store.snapshot();
      expect(snap['display.color']).toBe('#00ff41');
      expect(snap['fx.bloom']).toBe(false);
      expect(snap['ch1.coupling']).toBe('AC');
    });

    it('excludes internal paths (starting with _)', () => {
      const snap = store.snapshot();
      expect(snap['fx._angle']).toBeUndefined();
      expect(snap['fx._flash']).toBeUndefined();
    });

    it('restores from snapshot', () => {
      const snap = store.snapshot();
      store.set('display.color', '#ff0000');
      store.set('fx.bloom', true);
      store.restore(snap);
      expect(store.get('display.color')).toBe('#00ff41');
      expect(store.get('fx.bloom')).toBe(false);
    });

    it('clones values in snapshot (no shared references)', () => {
      const snap = store.snapshot();
      snap['display.color'] = '#changed';
      expect(store.get('display.color')).toBe('#00ff41');
    });
  });

  // ── reset ─────────────────────────────────────────────────

  describe('reset', () => {
    it('restores all values to schema defaults', () => {
      store.set('display.color', '#ff0000');
      store.set('fx.bloom', true);
      store.set('ch1.pos', 1.5);
      store.reset();
      expect(store.get('display.color')).toBe('#00ff41');
      expect(store.get('fx.bloom')).toBe(false);
      expect(store.get('ch1.pos')).toBe(0);
    });
  });

  // ── keys / group ──────────────────────────────────────────

  describe('keys', () => {
    it('returns paths matching prefix', () => {
      const fxKeys = store.keys('fx');
      expect(fxKeys).toContain('fx.bloom');
      expect(fxKeys).toContain('fx.bloomStr');
      expect(fxKeys).toContain('fx._angle');
      expect(fxKeys).not.toContain('display.color');
    });

    it('returns empty for non-existent prefix', () => {
      expect(store.keys('nope')).toHaveLength(0);
    });
  });

  describe('group', () => {
    it('returns flattened group as plain object', () => {
      const fx = store.group('fx');
      expect(fx.bloom).toBe(false);
      expect(fx.bloomStr).toBe(1.0);
      expect(fx._angle).toBe(0);
    });

    it('strips prefix from keys', () => {
      const display = store.group('display');
      expect(display).toHaveProperty('color');
      expect(display).not.toHaveProperty('display.color');
    });
  });

  // ── Event system ──────────────────────────────────────────

  describe('events', () => {
    it('fires exact match listener on change', () => {
      let received = null;
      store.on('display.color', (val, old, path) => {
        received = { val, old, path };
      });
      store.set('display.color', '#ff0000');
      expect(received).toEqual({ val: '#ff0000', old: '#00ff41', path: 'display.color' });
    });

    it('fires wildcard listener for group changes', () => {
      const events = [];
      store.on('fx.*', (val, old, path) => events.push(path));
      store.set('fx.bloom', true);
      store.set('fx.bloomStr', 0.5);
      expect(events).toEqual(['fx.bloom', 'fx.bloomStr']);
    });

    it('fires global listener for any change', () => {
      const paths = [];
      store.onAny((val, old, path) => paths.push(path));
      store.set('display.color', '#ff0000');
      store.set('ch1.pos', 1);
      expect(paths).toEqual(['display.color', 'ch1.pos']);
    });

    it('does not fire when value unchanged', () => {
      let fired = 0;
      store.on('display.glow', () => fired++);
      store.set('display.glow', 12); // same value
      expect(fired).toBe(0);
    });

    it('unsubscribes correctly', () => {
      let count = 0;
      const unsub = store.on('display.color', () => count++);
      store.set('display.color', '#ff0000');
      expect(count).toBe(1);
      unsub();
      store.set('display.color', '#00ff00');
      expect(count).toBe(1);
    });

    it('off() removes all listeners for pattern', () => {
      let count = 0;
      store.on('fx.*', () => count++);
      store.on('fx.*', () => count++);
      store.set('fx.bloom', true);
      expect(count).toBe(2);
      store.off('fx.*');
      store.set('fx.bloom', false);
      expect(count).toBe(2); // no more events
    });

    it('off() with no args clears all listeners', () => {
      let count = 0;
      store.on('display.color', () => count++);
      store.on('fx.*', () => count++);
      store.onAny(() => count++);
      store.off();
      store.set('display.color', '#ff0000');
      store.set('fx.bloom', true);
      expect(count).toBe(0);
    });
  });

  // ── Full schema ───────────────────────────────────────────

  describe('STATE_SCHEMA', () => {
    it('produces the expected number of state keys', () => {
      const fullStore = new StateStore(STATE_SCHEMA);
      const allKeys = fullStore.keys('');
      // All paths under any group
      const total = [...fullStore._state.keys()].length;
      expect(total).toBeGreaterThanOrEqual(85);
    });

    it('has all expected top-level groups', () => {
      const fullStore = new StateStore(STATE_SCHEMA);
      expect(fullStore.keys('scope').length).toBeGreaterThan(0);
      expect(fullStore.keys('ch1').length).toBeGreaterThan(0);
      expect(fullStore.keys('ch2').length).toBeGreaterThan(0);
      expect(fullStore.keys('horiz').length).toBeGreaterThan(0);
      expect(fullStore.keys('trigger').length).toBeGreaterThan(0);
      expect(fullStore.keys('display').length).toBeGreaterThan(0);
      expect(fullStore.keys('signal').length).toBeGreaterThan(0);
      expect(fullStore.keys('fx').length).toBeGreaterThan(0);
      expect(fullStore.keys('scene').length).toBeGreaterThan(0);
      expect(fullStore.keys('siggen').length).toBeGreaterThan(0);
    });

    it('excludes internal keys from snapshots', () => {
      const fullStore = new StateStore(STATE_SCHEMA);
      const snap = fullStore.snapshot();
      const internalKeys = Object.keys(snap).filter(k => k.includes('._'));
      expect(internalKeys).toHaveLength(0);
    });
  });
});

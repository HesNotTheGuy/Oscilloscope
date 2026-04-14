import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InputMapper } from '../src/input-mapper.js';

// ── Mock localStorage ───────────────────────────────────────
const mockStorage = {};
const localStorageMock = {
  getItem: vi.fn(key => mockStorage[key] || null),
  setItem: vi.fn((key, value) => { mockStorage[key] = value; }),
  removeItem: vi.fn(key => { delete mockStorage[key]; }),
};

vi.stubGlobal('localStorage', localStorageMock);

describe('InputMapper', () => {
  let mapper;

  beforeEach(() => {
    // Clear mock storage
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    vi.clearAllMocks();
    mapper = new InputMapper(null);
  });

  // ── Action registry ───────────────────────────────────────

  describe('action registry', () => {
    it('registers and triggers actions', () => {
      let called = false;
      mapper.registerAction('test.action', () => { called = true; });
      mapper.trigger('test.action');
      expect(called).toBe(true);
    });

    it('passes value to action handler', () => {
      let received = null;
      mapper.registerAction('test.action', v => { received = v; });
      mapper.trigger('test.action', 127);
      expect(received).toBe(127);
    });

    it('registers multiple actions at once', () => {
      const calls = [];
      mapper.registerActions({
        'action.a': () => calls.push('a'),
        'action.b': () => calls.push('b'),
      });
      mapper.trigger('action.a');
      mapper.trigger('action.b');
      expect(calls).toEqual(['a', 'b']);
    });

    it('returns registered action names', () => {
      mapper.registerAction('foo', () => {});
      mapper.registerAction('bar', () => {});
      const actions = mapper.getActions();
      expect(actions).toContain('foo');
      expect(actions).toContain('bar');
    });

    it('silently does nothing for unknown actions', () => {
      expect(() => mapper.trigger('nonexistent')).not.toThrow();
    });
  });

  // ── Keyboard mapping ──────────────────────────────────────

  describe('keyboard mapping', () => {
    it('binds key to action', () => {
      mapper.bindKey('g', 'display.toggleGrid');
      expect(mapper.getKeyAction('g')).toBe('display.toggleGrid');
    });

    it('is case-insensitive', () => {
      mapper.bindKey('G', 'display.toggleGrid');
      expect(mapper.getKeyAction('g')).toBe('display.toggleGrid');
    });

    it('unbinds key', () => {
      mapper.bindKey('g', 'display.toggleGrid');
      mapper.unbindKey('g');
      expect(mapper.getKeyAction('g')).toBeUndefined();
    });

    it('returns all key bindings', () => {
      mapper.bindKey('g', 'display.toggleGrid');
      mapper.bindKey('c', 'display.toggleCRT');
      const bindings = mapper.getKeyBindings();
      expect(bindings).toEqual({ g: 'display.toggleGrid', c: 'display.toggleCRT' });
    });

    it('persists bindings to localStorage on bind', () => {
      mapper.bindKey('g', 'display.toggleGrid');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'osc_inputMap',
        expect.any(String)
      );
    });

    it('loads bindings from localStorage on construction', () => {
      mockStorage['osc_inputMap'] = JSON.stringify({
        keys: { x: 'test.action' },
        midi: {},
      });
      const mapper2 = new InputMapper(null);
      expect(mapper2.getKeyAction('x')).toBe('test.action');
    });
  });

  // ── MIDI mapping ──────────────────────────────────────────

  describe('MIDI mapping', () => {
    it('binds MIDI CC to action', () => {
      mapper.bindMidi(0, 64, 'fx.toggleBloom');
      const bindings = mapper.getMidiBindings();
      expect(bindings['0:64']).toBe('fx.toggleBloom');
    });

    it('unbinds MIDI CC', () => {
      mapper.bindMidi(0, 64, 'fx.toggleBloom');
      mapper.unbindMidi(0, 64);
      expect(mapper.getMidiBindings()['0:64']).toBeUndefined();
    });

    it('persists MIDI bindings to localStorage', () => {
      mapper.bindMidi(1, 10, 'scene.toggle');
      const stored = JSON.parse(mockStorage['osc_inputMap']);
      expect(stored.midi['1:10']).toBe('scene.toggle');
    });
  });

  // ── Default bindings ──────────────────────────────────────

  describe('installDefaults', () => {
    it('installs default key bindings on empty mapper', () => {
      mapper.installDefaults();
      expect(mapper.getKeyAction(' ')).toBe('playback.toggle');
      expect(mapper.getKeyAction('g')).toBe('display.toggleGrid');
      expect(mapper.getKeyAction('1')).toBe('scope.modeYT');
      expect(mapper.getKeyAction('?')).toBe('help.toggle');
    });

    it('does not overwrite existing bindings', () => {
      mapper.bindKey('g', 'custom.action');
      mapper.installDefaults();
      expect(mapper.getKeyAction('g')).toBe('custom.action');
    });

    it('installs all expected default actions', () => {
      mapper.installDefaults();
      const bindings = mapper.getKeyBindings();
      const actions = Object.values(bindings);
      expect(actions).toContain('playback.toggle');
      expect(actions).toContain('playback.stop');
      expect(actions).toContain('display.toggleGrid');
      expect(actions).toContain('display.toggleCRT');
      expect(actions).toContain('display.toggleMeasure');
      expect(actions).toContain('display.toggleFullscreen');
      expect(actions).toContain('scope.modeYT');
      expect(actions).toContain('scope.modeXY');
      expect(actions).toContain('scope.runStop');
      expect(actions).toContain('scope.single');
      expect(actions).toContain('scene.toggle');
      expect(actions).toContain('scene.switchMode');
      expect(actions).toContain('help.toggle');
    });
  });

  // ── resetToDefaults ───────────────────────────────────────

  describe('resetToDefaults', () => {
    it('clears custom bindings and restores defaults', () => {
      mapper.bindKey('x', 'custom.action');
      mapper.bindMidi(0, 1, 'midi.action');
      mapper.resetToDefaults();

      expect(mapper.getKeyAction('x')).toBeUndefined();
      expect(mapper.getMidiBindings()['0:1']).toBeUndefined();
      expect(mapper.getKeyAction('g')).toBe('display.toggleGrid');
    });

    it('removes old localStorage data', () => {
      mapper.bindKey('x', 'custom');
      mapper.resetToDefaults();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('osc_inputMap');
    });
  });

  // ── Error handling ────────────────────────────────────────

  describe('error handling', () => {
    it('handles corrupted localStorage gracefully', () => {
      mockStorage['osc_inputMap'] = 'not valid json{{{';
      expect(() => new InputMapper(null)).not.toThrow();
    });

    it('handles missing keys/midi in stored data', () => {
      mockStorage['osc_inputMap'] = JSON.stringify({});
      const mapper2 = new InputMapper(null);
      expect(mapper2.getKeyBindings()).toEqual({});
    });
  });
});

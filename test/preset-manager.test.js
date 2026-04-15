import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PresetManager } from '../src/preset-manager.js';

// ── Mock localStorage ───────────────────────────────────────
const mockStorage = {};
const localStorageMock = {
  getItem: vi.fn(key => mockStorage[key] || null),
  setItem: vi.fn((key, value) => { mockStorage[key] = value; }),
  removeItem: vi.fn(key => { delete mockStorage[key]; }),
};
vi.stubGlobal('localStorage', localStorageMock);

// ── Mock document (for _updateUI) ───────────────────────────
const mockElements = {};
vi.stubGlobal('document', {
  getElementById: vi.fn(id => mockElements[id] || {
    value: '', checked: false, disabled: false,
    textContent: '', style: { width: '' },
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    dispatchEvent: vi.fn(),
    click: vi.fn(),
  }),
  querySelector: vi.fn(() => null),
  querySelectorAll: vi.fn(() => []),
  documentElement: { style: { setProperty: vi.fn() } },
  createElement: vi.fn(() => ({
    href: '', download: '',
    appendChild: vi.fn(), removeChild: vi.fn(),
    click: vi.fn(),
  })),
  body: { appendChild: vi.fn(), removeChild: vi.fn() },
});

// ── Mock scope + scenes ─────────────────────────────────────
function makeScope() {
  return {
    color: '#00ff41', sceneColor: '', beamWidth: 1.5,
    glowAmount: 12, persistence: 0.15,
    fx: {
      reactive: false, beatFlash: false, bloom: false,
      mirrorX: false, mirrorY: false, rotation: false,
      beatInvert: false, afterglow: false,
      rotSpeed: 0.003, beatSens: 1.5,
      afterglowSpeed: 0, afterglowStr: 0.7,
      reactiveStr: 1.0, beatStr: 0.35, bloomStr: 1.0,
    },
    smooth: false, filterEnabled: false, filterLow: 200, filterHigh: 3000,
    objMode: false, obj3dMode: true,
    showGrid: true, crtCurve: true,
    _obj: {
      scale: 0.8, rotZ: 0, posX: 0, posY: 0,
      tileX: 1, tileY: 1, radialN: 1, scrollX: 0, scrollY: 0,
      autoRotX: false, autoRotY: true, autoRotZ: false,
      rotSpeedX: 0.5, rotSpeed: 0.5, rotSpeedZ: 0.5,
      beatPulse: true, showAudio: false,
      breathe: false, shake: false, warp: false, warpAmt: 0.1,
      float: false, ripple: false, twist: false, explode: false,
      motionAmt: 0.2, motionSpeed: 1.0, explodeLoop: false,
      power: 1, autoPower: false, powerLoop: false, powerSpeed: 0.004,
    },
    _imgScene: {
      scale: 0.8, rotZ: 0, posX: 0, posY: 0,
      tileX: 1, tileY: 1, radialN: 1, scrollX: 0, scrollY: 0,
      autoRotX3d: false, autoRotY3d: true, autoSpin: false,
      rotSpeedX3d: 0.5, rotSpeedY3d: 0.5, rotSpeed: 0.5,
      beatPulse: true, showAudio: false,
      breathe: false, shake: false, warp: false, warpAmt: 0.1,
      float: false, ripple: false, twist: false, explode: false,
      motionAmt: 0.2, motionSpeed: 1.0, explodeLoop: false,
      power: 1, autoPower: false, powerLoop: false, powerSpeed: 0.004,
    },
  };
}

describe('PresetManager', () => {
  let pm, scope;

  beforeEach(() => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    vi.clearAllMocks();
    scope = makeScope();
    pm = new PresetManager(scope);
  });

  // ── Construction ──────────────────────────────────────────

  describe('constructor', () => {
    it('initializes with 8 empty slots', () => {
      expect(pm.SLOT_COUNT).toBe(8);
      expect(pm.getSlots()).toHaveLength(8);
      expect(pm.getSlots().every(s => s === null)).toBe(true);
    });

    it('loads existing slots from localStorage', () => {
      const slots = new Array(8).fill(null);
      slots[0] = { _name: 'Test', color: '#ff0000' };
      mockStorage['osc_presets'] = JSON.stringify(slots);
      const pm2 = new PresetManager(scope);
      expect(pm2.getSlot(0)._name).toBe('Test');
    });
  });

  // ── capture ───────────────────────────────────────────────

  describe('capture', () => {
    it('captures all beam properties', () => {
      const p = pm.capture();
      expect(p.color).toBe('#00ff41');
      expect(p.beamWidth).toBe(1.5);
      expect(p.glowAmount).toBe(12);
      expect(p.persistence).toBe(0.15);
    });

    it('captures FX state', () => {
      const p = pm.capture();
      expect(p.fx).toBeDefined();
      expect(p.fx.reactive).toBe(false);
      expect(p.fx.bloom).toBe(false);
      expect(p.fx.rotSpeed).toBe(0.003);
    });

    it('captures signal FX', () => {
      const p = pm.capture();
      expect(p.smooth).toBe(false);
      expect(p.filterEnabled).toBe(false);
      expect(p.filterLow).toBe(200);
    });

    it('captures scene state', () => {
      const p = pm.capture();
      expect(p.objMode).toBe(false);
      expect(p.obj3dMode).toBe(true);
      expect(p.scale).toBe(0.8);
      expect(p.tileX).toBe(1);
    });

    it('captures display toggles', () => {
      const p = pm.capture();
      expect(p.showGrid).toBe(true);
      expect(p.crtCurve).toBe(true);
    });
  });

  // ── apply ─────────────────────────────────────────────────

  describe('apply', () => {
    it('applies beam properties to scope', () => {
      const preset = pm.capture();
      preset.color = '#ff0000';
      preset.beamWidth = 3.0;
      pm.apply(preset);
      expect(scope.color).toBe('#ff0000');
      expect(scope.beamWidth).toBe(3.0);
    });

    it('applies FX state', () => {
      const preset = pm.capture();
      preset.fx.bloom = true;
      preset.fx.reactive = true;
      pm.apply(preset);
      expect(scope.fx.bloom).toBe(true);
      expect(scope.fx.reactive).toBe(true);
    });

    it('applies scene transforms to both scenes', () => {
      const preset = pm.capture();
      preset.scale = 0.5;
      preset.tileX = 3;
      pm.apply(preset);
      expect(scope._obj.scale).toBe(0.5);
      expect(scope._imgScene.scale).toBe(0.5);
      expect(scope._obj.tileX).toBe(3);
      expect(scope._imgScene.tileX).toBe(3);
    });

    it('handles missing optional properties with defaults', () => {
      const preset = pm.capture();
      delete preset.fx.afterglow;
      delete preset.fx.afterglowSpeed;
      pm.apply(preset);
      expect(scope.fx.afterglow).toBe(false);
      expect(scope.fx.afterglowSpeed).toBe(0);
    });
  });

  // ── save / load ───────────────────────────────────────────

  describe('save / load', () => {
    it('saves preset to slot', () => {
      pm.save(0, 'Test Preset');
      const slot = pm.getSlot(0);
      expect(slot).not.toBeNull();
      expect(slot._name).toBe('Test Preset');
      expect(slot.color).toBe('#00ff41');
    });

    it('loads preset from slot and applies to scope', () => {
      scope.color = '#ff0000';
      pm.save(0, 'Red');
      scope.color = '#00ff00'; // change after save
      const loaded = pm.load(0);
      expect(loaded).toBe(true);
      expect(scope.color).toBe('#ff0000');
    });

    it('returns false for empty slot', () => {
      expect(pm.load(0)).toBe(false);
    });

    it('rejects out-of-bounds indices', () => {
      pm.save(-1, 'Bad');
      pm.save(8, 'Bad');
      expect(pm.getSlots().every(s => s === null)).toBe(true);
    });

    it('persists to localStorage', () => {
      pm.save(0, 'Saved');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'osc_presets',
        expect.any(String)
      );
    });
  });

  // ── delete ────────────────────────────────────────────────

  describe('delete', () => {
    it('clears a slot', () => {
      pm.save(0, 'ToDelete');
      pm.delete(0);
      expect(pm.getSlot(0)).toBeNull();
    });

    it('persists deletion to localStorage', () => {
      pm.save(0, 'ToDelete');
      vi.clearAllMocks();
      pm.delete(0);
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  // ── installDefaults ───────────────────────────────────────

  describe('installDefaults', () => {
    it('installs built-in presets into empty storage', () => {
      const builtins = [
        { _name: 'Classic', color: '#00ff41' },
        { _name: 'Neon', color: '#ff00ff' },
      ];
      pm.installDefaults(builtins);
      expect(pm.getSlot(0)._name).toBe('Classic');
      expect(pm.getSlot(1)._name).toBe('Neon');
    });

    it('does not overwrite existing presets', () => {
      pm.save(0, 'Custom');
      const builtins = [{ _name: 'Classic', color: '#00ff41' }];
      pm.installDefaults(builtins);
      expect(pm.getSlot(0)._name).toBe('Custom');
    });
  });
});

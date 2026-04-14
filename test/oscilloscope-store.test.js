import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateStore, STATE_SCHEMA } from '../src/state-store.js';

// ── Mock Oscilloscope (just the state that connectStore binds) ──
function makeScope() {
  return {
    isRunning: true, mode: 'YT',
    ch1: { coupling: 'AC', vdiv: { label: '500mV', v: 0.5 }, vdivIdx: 3, pos: 0 },
    ch2: { coupling: 'AC', vdiv: { label: '500mV', v: 0.5 }, vdivIdx: 3, pos: 0 },
    tbIdx: 24, tb: { label: '1ms', s: 1e-3 }, hPos: 0,
    trigSource: 1, trigEdge: 'rising', trigMode: 'auto', trigLevel: 0,
    color: '#00ff41', sceneColor: '', beamWidth: 1.5,
    glowAmount: 12, persistence: 0.15,
    showGrid: true, crtCurve: true, showMeasure: true,
    smooth: false, filterEnabled: false, filterLow: 200, filterHigh: 3000,
    objMode: false, obj3dMode: true,
    fx: {
      reactive: false, beatFlash: false, bloom: false,
      mirrorX: false, mirrorY: false, rotation: false,
      beatInvert: false, afterglow: false, gradient: false,
      rotSpeed: 0.003, beatSens: 1.5,
      afterglowSpeed: 0, afterglowStr: 0.7,
      reactiveStr: 1.0, beatStr: 0.35, bloomStr: 1.0,
      gradientStart: '#00ff41', gradientEnd: '#ff00ff', gradientDir: 'h',
      _angle: 0, _flash: 0, _rms: 0, _lastRotT: 0,
    },
    _obj: {
      scale: 0.8, rotZ: 0, posX: 0, posY: 0,
      tileX: 1, tileY: 1, radialN: 1, scrollX: 0, scrollY: 0,
      autoRotX: false, autoRotY: true, autoRotZ: false,
      rotSpeedX: 0.5, rotSpeed: 0.5, rotSpeedZ: 0.5,
      beatPulse: true, showAudio: false,
      breathe: false, shake: false, warp: false, warpAmt: 0.1,
      float: false, ripple: false, twist: false, explode: false,
      explodeLoop: false, motionAmt: 0.2, motionSpeed: 1.0,
      power: 1, autoPower: false, powerSpeed: 0.004, powerLoop: false,
    },
    _imgScene: {
      scale: 0.8, rotZ: 0, posX: 0, posY: 0,
      tileX: 1, tileY: 1, radialN: 1, scrollX: 0, scrollY: 0,
      autoRotX3d: false, autoRotY3d: true, autoSpin: false,
      rotSpeedX3d: 0.5, rotSpeedY3d: 0.5, rotSpeed: 0.5,
      beatPulse: true, showAudio: false,
      breathe: false, shake: false, warp: false, warpAmt: 0.1,
      float: false, ripple: false, twist: false, explode: false,
      explodeLoop: false, motionAmt: 0.2, motionSpeed: 1.0,
      power: 1, autoPower: false, powerSpeed: 0.004, powerLoop: false,
    },
  };
}

// Minimal connectStore implementation (mirrors oscilloscope.js logic)
// We test the store bridge pattern without importing the full Oscilloscope
// (which depends on Canvas/WebGL)
function connectStore(scope, store) {
  const VDIV = [
    { label: '50mV', v: 0.05 }, { label: '100mV', v: 0.1 },
    { label: '200mV', v: 0.2 }, { label: '500mV', v: 0.5 },
    { label: '1V', v: 1.0 }, { label: '2V', v: 2.0 },
    { label: '5V', v: 5.0 },
  ];
  const TIMEBASE_SAMPLE = [
    { label: '1ms', s: 1e-3 }, { label: '2ms', s: 2e-3 },
  ];

  const bindings = {
    'scope.running':  v => { scope.isRunning = v; },
    'scope.mode':     v => { scope.mode = v; },
    'display.color':  v => { scope.color = v; },
    'display.glow':   v => { scope.glowAmount = v; },
    'fx.bloom':       v => { scope.fx.bloom = v; },
    'fx.gradient':    v => { scope.fx.gradient = v; },
    'scene.enabled':  v => { scope.objMode = v; },
    'scene.scale':    v => { scope._obj.scale = v; scope._imgScene.scale = v; },
  };

  const unsubs = [];
  for (const [path, setter] of Object.entries(bindings)) {
    unsubs.push(store.on(path, setter));
  }

  // Initial sync: push scope state → store
  store.batch({
    'scope.running': scope.isRunning,
    'scope.mode': scope.mode,
    'display.color': scope.color,
    'display.glow': scope.glowAmount,
    'fx.bloom': scope.fx.bloom,
    'fx.gradient': scope.fx.gradient,
    'scene.enabled': scope.objMode,
    'scene.scale': scope._obj.scale,
  });

  return { unsubs, disconnect: () => unsubs.forEach(fn => fn()) };
}

describe('Oscilloscope ↔ Store bridge', () => {
  let store, scope, bridge;

  beforeEach(() => {
    store = new StateStore(STATE_SCHEMA);
    scope = makeScope();
    bridge = connectStore(scope, store);
  });

  // ── Initial sync ──────────────────────────────────────────

  describe('initial sync', () => {
    it('pushes scope state to store on connect', () => {
      expect(store.get('scope.running')).toBe(true);
      expect(store.get('scope.mode')).toBe('YT');
      expect(store.get('display.color')).toBe('#00ff41');
      expect(store.get('display.glow')).toBe(12);
    });

    it('pushes FX state to store', () => {
      expect(store.get('fx.bloom')).toBe(false);
      expect(store.get('fx.gradient')).toBe(false);
    });

    it('pushes scene state to store', () => {
      expect(store.get('scene.enabled')).toBe(false);
      expect(store.get('scene.scale')).toBe(0.8);
    });
  });

  // ── Store → Scope (downstream) ────────────────────────────

  describe('store → scope', () => {
    it('propagates display changes to scope', () => {
      store.set('display.color', '#ff0000');
      expect(scope.color).toBe('#ff0000');
    });

    it('propagates FX changes to scope', () => {
      store.set('fx.bloom', true);
      expect(scope.fx.bloom).toBe(true);
    });

    it('propagates scene changes to both obj and img', () => {
      store.set('scene.scale', 0.5);
      expect(scope._obj.scale).toBe(0.5);
      expect(scope._imgScene.scale).toBe(0.5);
    });

    it('propagates scope mode changes', () => {
      store.set('scope.mode', 'XY');
      expect(scope.mode).toBe('XY');
    });

    it('batch updates all propagate to scope', () => {
      store.batch({
        'display.color': '#ff00ff',
        'fx.bloom': true,
        'scene.enabled': true,
      });
      expect(scope.color).toBe('#ff00ff');
      expect(scope.fx.bloom).toBe(true);
      expect(scope.objMode).toBe(true);
    });
  });

  // ── Disconnect ────────────────────────────────────────────

  describe('disconnect', () => {
    it('stops propagation after disconnect', () => {
      bridge.disconnect();
      store.set('display.color', '#ff0000');
      expect(scope.color).toBe('#00ff41'); // unchanged
    });
  });

  // ── Round-trip ────────────────────────────────────────────

  describe('round-trip', () => {
    it('snapshot captures current scope state', () => {
      store.set('display.color', '#ff0000');
      const snap = store.snapshot();
      expect(snap['display.color']).toBe('#ff0000');
    });

    it('restore re-applies state through listeners', () => {
      const snap = store.snapshot();
      store.set('display.color', '#ff0000');
      store.set('fx.bloom', true);
      store.restore(snap);
      expect(scope.color).toBe('#00ff41');
      expect(scope.fx.bloom).toBe(false);
    });
  });
});

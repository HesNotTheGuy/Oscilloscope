import { describe, it, expect } from 'vitest';
import { TIMEBASE, TB_DEFAULT, VDIV, VD_DEFAULT, LISSAJOUS_RATIOS } from '../src/constants.js';

describe('Constants', () => {

  describe('TIMEBASE', () => {
    it('has entries from μs to seconds', () => {
      expect(TIMEBASE.length).toBeGreaterThanOrEqual(50);
      expect(TIMEBASE[0].s).toBeLessThan(1e-5);      // μs range
      expect(TIMEBASE[TIMEBASE.length - 1].s).toBe(10); // 10s
    });

    it('values are in ascending order', () => {
      for (let i = 1; i < TIMEBASE.length; i++) {
        expect(TIMEBASE[i].s).toBeGreaterThan(TIMEBASE[i - 1].s);
      }
    });

    it('every entry has label and s properties', () => {
      TIMEBASE.forEach(entry => {
        expect(entry).toHaveProperty('label');
        expect(entry).toHaveProperty('s');
        expect(typeof entry.label).toBe('string');
        expect(typeof entry.s).toBe('number');
        expect(entry.s).toBeGreaterThan(0);
      });
    });

    it('TB_DEFAULT points to 1ms', () => {
      expect(TIMEBASE[TB_DEFAULT].label).toBe('1ms');
      expect(TIMEBASE[TB_DEFAULT].s).toBe(1e-3);
    });

    it('TB_DEFAULT is within bounds', () => {
      expect(TB_DEFAULT).toBeGreaterThanOrEqual(0);
      expect(TB_DEFAULT).toBeLessThan(TIMEBASE.length);
    });
  });

  describe('VDIV', () => {
    it('has 7 entries from 50mV to 5V', () => {
      expect(VDIV).toHaveLength(7);
      expect(VDIV[0].v).toBe(0.05);
      expect(VDIV[6].v).toBe(5.0);
    });

    it('values are in ascending order', () => {
      for (let i = 1; i < VDIV.length; i++) {
        expect(VDIV[i].v).toBeGreaterThan(VDIV[i - 1].v);
      }
    });

    it('every entry has label and v properties', () => {
      VDIV.forEach(entry => {
        expect(entry).toHaveProperty('label');
        expect(entry).toHaveProperty('v');
        expect(typeof entry.label).toBe('string');
        expect(entry.v).toBeGreaterThan(0);
      });
    });

    it('VD_DEFAULT points to 500mV', () => {
      expect(VDIV[VD_DEFAULT].label).toBe('500mV');
      expect(VDIV[VD_DEFAULT].v).toBe(0.5);
    });

    it('VD_DEFAULT is within bounds', () => {
      expect(VD_DEFAULT).toBeGreaterThanOrEqual(0);
      expect(VD_DEFAULT).toBeLessThan(VDIV.length);
    });
  });

  describe('LISSAJOUS_RATIOS', () => {
    it('has at least 5 ratios', () => {
      expect(LISSAJOUS_RATIOS.length).toBeGreaterThanOrEqual(5);
    });

    it('first ratio is 1:1', () => {
      expect(LISSAJOUS_RATIOS[0].label).toBe('1:1');
      expect(LISSAJOUS_RATIOS[0].r).toBe(1);
    });

    it('every entry has label and r properties', () => {
      LISSAJOUS_RATIOS.forEach(entry => {
        expect(entry).toHaveProperty('label');
        expect(entry).toHaveProperty('r');
        expect(typeof entry.label).toBe('string');
        expect(entry.r).toBeGreaterThan(0);
      });
    });

    it('all ratios are positive', () => {
      LISSAJOUS_RATIOS.forEach(entry => {
        expect(entry.r).toBeGreaterThan(0);
      });
    });
  });
});

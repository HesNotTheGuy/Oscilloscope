import { describe, expect, it } from 'vitest';
import {
  HUE_BINS,
  colorToVoice,
  formatVoices,
  hzFromThz,
  paintSwatches,
  voicesForColumn,
} from '../src/toys/hear-image-voices.js';
import {
  FRAME,
  PRESETS,
  exhibitColumn,
  paintPreset,
  stampBand,
  stampDisc,
  stampStripe,
} from '../src/toys/hear-image-presets.js';

function column(pixels) {
  const height = pixels.length;
  const data = new Uint8ClampedArray(height * 4);
  for (let y = 0; y < height; y++) {
    data[y * 4] = pixels[y][0];
    data[y * 4 + 1] = pixels[y][1];
    data[y * 4 + 2] = pixels[y][2];
    data[y * 4 + 3] = 255;
  }
  return { data, width: 1, height };
}

const RGB = [
  [255, 0, 0],
  [255, 96, 0],
  [255, 191, 0],
  [223, 255, 0],
  [128, 255, 0],
  [32, 255, 0],
  [0, 255, 64],
  [0, 255, 159],
  [0, 255, 255],
  [0, 159, 255],
  [0, 64, 255],
  [32, 0, 255],
  [128, 0, 255],
];

describe('hear image voices', () => {
  it('builds 13 bins from 400 THz to 789 THz', () => {
    expect(HUE_BINS.length, 'odd count so white has a middle bin').toBe(13);
    for (let key = 0; key < 13; key++) {
      const bin = HUE_BINS[key];
      expect(bin.key, 'bin key').toBe(key);
      expect(bin.thz, 'linear THz').toBe(400 + key * (789 - 400) / 12);
      expect(bin.hz, 'one conversion').toBe(hzFromThz(bin.thz));
      expect(bin.hz, 'formula').toBe(bin.thz * 1e12 / 2 ** 40);
      expect([bin.r, bin.g, bin.b], 'canonical rgb').toEqual(RGB[key]);
      const role = colorToVoice(bin);
      expect(role, 'bin color is a tone of that bin').toMatchObject({
        kind: 'tone',
        key,
        thz: bin.thz,
        hz: bin.hz,
        css: bin.css,
      });
    }
    expect(hzFromThz(400), 'red hz literal').toBe(400e12 / 2 ** 40);
    expect(HUE_BINS[12].thz, 'violet endpoint').toBe(789);
    expect(HUE_BINS[6].thz, 'middle bin').toBe(594.5);
  });

  it('classifies black, gray, white, magenta, and hue', () => {
    expect(colorToVoice({ r: 0, g: 0, b: 0 }).kind, 'black').toBe('silent');
    expect(colorToVoice({ r: 30, g: 0, b: 0 }).kind, 'near black').toBe('silent');
    expect(colorToVoice({ r: 128, g: 128, b: 128 }).kind, 'gray').toBe('silent');
    expect(colorToVoice({ r: 229, g: 229, b: 229 }).kind, 'light gray').toBe('silent');
    expect(colorToVoice({ r: 180, g: 160, b: 160 }).kind, 'dust').toBe('silent');
    expect(colorToVoice({}), 'missing channels').toMatchObject({ kind: 'silent' });

    expect(colorToVoice({ r: 255, g: 255, b: 255 }), 'white').toMatchObject({
      kind: 'chord',
      id: 'white',
    });
    expect(colorToVoice({ r: 255, g: 255, b: 255 }).tones.map((t) => t.key), 'white keys').toEqual([0, 6, 12]);
    expect(colorToVoice({ r: 230, g: 230, b: 230 }).id, 'near white').toBe('white');
    expect(colorToVoice({ r: 255, g: 230, b: 230 }).id, 'warm white').toBe('white');

    expect(colorToVoice({ r: 255, g: 0, b: 255 }), 'magenta').toMatchObject({
      kind: 'chord',
      id: 'magenta',
    });
    expect(colorToVoice({ r: 255, g: 0, b: 255 }).tones.map((t) => t.key), 'magenta keys').toEqual([0, 12]);

    expect(colorToVoice({ r: 31, g: 0, b: 0 }), 'dark red still a tone').toMatchObject({
      kind: 'tone',
      key: 0,
      thz: 400,
    });
    expect(colorToVoice({ r: 255, g: 255, b: 0 }), 'yellow snaps to bin 3').toMatchObject({
      kind: 'tone',
      key: 3,
      thz: 497.25,
      css: '#dfff00',
    });
    expect(colorToVoice({ r: 0, g: 0, b: 255 }).key, 'pure blue snaps to bin 11').toBe(11);
    expect(colorToVoice({ r: 255, g: 220, b: 220 }), 'pastel pink sings').toMatchObject({
      kind: 'tone',
      key: 0,
    });
    expect(colorToVoice({ r: 300, g: -4, b: 0 }), 'channels clamp').toMatchObject({
      kind: 'tone',
      key: 0,
      thz: 400,
    });
  });

  it('sets gain from how many pixels claim the bin', () => {
    const half = voicesForColumn(column([[255, 0, 0], [0, 0, 0]]), 0);
    expect(half, 'red over black').toEqual([{
      key: 0, thz: 400, hz: 400e12 / 2 ** 40, gain: 1 / 2, css: '#ff0000',
    }]);

    const white = voicesForColumn(column([[255, 255, 255]]), 0);
    expect(white.map((v) => v.key), 'white splats three bins').toEqual([0, 6, 12]);
    expect(white.map((v) => v.gain), 'each claim is the full pixel').toEqual([1, 1, 1]);

    const mixed = voicesForColumn(column([[255, 0, 0], [255, 255, 255]]), 0);
    expect(mixed.map((v) => [v.key, v.gain]), 'red and white share bin 0').toEqual([
      [0, 1],
      [6, 1 / 2],
      [12, 1 / 2],
    ]);

    expect(voicesForColumn(column([[0, 0, 0]]), 0), 'silence').toEqual([]);
    expect(() => voicesForColumn(column([[0, 0, 0]]), 1), 'x past width').toThrow('column out of range');
  });

  it('paints the listening presets', () => {
    expect(PRESETS.map((p) => p.id), 'button order').toEqual([
      'vertical-stripes',
      'horizontal-stripes',
      'circle',
      'dots',
      'france',
      'germany',
      'japan',
    ]);
    expect(FRAME, 'stage').toEqual({ width: 480, height: 270 });

    const vertical = paintPreset('vertical-stripes', 480, 270);
    expect(voicesForColumn(vertical, 0), 'scale starts on red').toMatchObject([{ key: 0, gain: 1 }]);
    expect(voicesForColumn(vertical, 36), 'stripe holds').toMatchObject([{ key: 0, gain: 1 }]);
    expect(voicesForColumn(vertical, 37), 'next stripe').toMatchObject([{ key: 1, gain: 1 }]);
    expect(voicesForColumn(vertical, 479), 'scale ends on violet').toMatchObject([{ key: 12, gain: 1 }]);

    const horizontal = paintPreset('horizontal-stripes', 480, 270);
    expect(voicesForColumn(horizontal, 0).map((v) => [v.key, v.gain]), 'standing triad').toEqual([
      [0, 1 / 3],
      [6, 1 / 3],
      [12, 1 / 3],
    ]);

    const circle = paintPreset('circle', 480, 270);
    expect(voicesForColumn(circle, 0), 'circle column 0 is black').toEqual([]);
    expect(voicesForColumn(circle, 240), 'center swell').toEqual([{
      key: 5,
      thz: 400 + 5 * (789 - 400) / 12,
      hz: hzFromThz(400 + 5 * (789 - 400) / 12),
      gain: 205 / 270,
      css: '#20ff00',
    }]);

    const dots = paintPreset('dots', 480, 270);
    expect(voicesForColumn(dots, 0), 'dots start silent').toEqual([]);
    expect(voicesForColumn(dots, 96), 'first dot').toMatchObject([{ key: 0, gain: 21 / 270 }]);
    expect(voicesForColumn(dots, 240), 'middle dot').toMatchObject([{ key: 6, gain: 21 / 270 }]);
    expect(voicesForColumn(dots, 384), 'last dot').toMatchObject([{ key: 12, gain: 21 / 270 }]);

    const france = paintPreset('france', 480, 270);
    expect(voicesForColumn(france, 0), 'french blue bin').toMatchObject([{ key: 11, gain: 1 }]);
    expect(voicesForColumn(france, 160).map((v) => [v.key, v.gain]), 'white band').toEqual([
      [0, 1], [6, 1], [12, 1],
    ]);
    expect(voicesForColumn(france, 320), 'red band').toMatchObject([{ key: 0, gain: 1 }]);

    const germany = paintPreset('germany', 480, 270);
    expect(voicesForColumn(germany, 10).map((v) => [v.key, v.gain]), 'black rests').toEqual([
      [0, 1 / 3],
      [2, 1 / 3],
    ]);

    const japan = paintPreset('japan', 480, 270);
    expect(voicesForColumn(japan, 0).map((v) => v.gain), 'white field').toEqual([1, 1, 1]);
    expect(voicesForColumn(japan, 240).map((v) => [v.key, v.gain]), 'disc shares bin 0').toEqual([
      [0, 1],
      [6, 107 / 270],
      [12, 107 / 270],
    ]);

    expect(() => paintPreset('no-such', 480, 270), 'one registry').toThrow('Unknown preset: no-such');
  });

  it('derives swatches and the legend line from the bins', () => {
    expect(paintSwatches().map((s) => s.id), 'swatch ids').toEqual([
      'b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b10', 'b11', 'b12',
      'black', 'white', 'magenta',
    ]);
    expect(formatVoices([]), 'silence label').toBe('silence');
    expect(formatVoices([{
      key: 0, thz: 400, hz: 400e12 / 2 ** 40, gain: 1, css: '#ff0000',
    }]), 'legend line').toBe('b0 400 THz 363.8 Hz 100%');
    expect(formatVoices([
      { key: 0, thz: 400, hz: 400e12 / 2 ** 40, gain: 1, css: '#ff0000' },
      { key: 6, thz: 594.5, hz: hzFromThz(594.5), gain: 1 / 3, css: '#00ff40' },
    ]), 'joined labels').toBe('b0 400 THz 363.8 Hz 100%, b6 594.5 THz 540.7 Hz 33%');
  });

  it('stamps a hard disc the scanner can hear', () => {
    const buffer = paintPreset('dots', 480, 270);
    stampDisc(buffer, 240, 135, 10, HUE_BINS[0]);
    expect(voicesForColumn(buffer, 240), 'disc covers the middle dot').toMatchObject([
      { key: 0, gain: 21 / 270 },
    ]);
  });

  it('parks circle and japan on the center column', () => {
    expect(exhibitColumn('vertical-stripes', 480), 'vertical exhibit').toBe(0);
    expect(exhibitColumn('horizontal-stripes', 480), 'horizontal exhibit').toBe(0);
    expect(exhibitColumn('dots', 480), 'dots exhibit').toBe(0);
    expect(exhibitColumn('france', 480), 'france exhibit').toBe(0);
    expect(exhibitColumn('germany', 480), 'germany exhibit').toBe(0);
    expect(exhibitColumn('circle', 480), 'circle exhibit').toBe(240);
    expect(exhibitColumn('japan', 480), 'japan exhibit').toBe(240);
    const circle = paintPreset('circle', 480, 270);
    expect(voicesForColumn(circle, 0), 'setPlayhead 0').toEqual([]);
    expect(voicesForColumn(circle, 240), 'setPlayhead 240').toEqual([{
      key: 5,
      thz: 400 + 5 * (789 - 400) / 12,
      hz: hzFromThz(400 + 5 * (789 - 400) / 12),
      gain: 205 / 270,
      css: '#20ff00',
    }]);
  });

  it('stamps a horizontal band and a vertical stripe', () => {
    const band = paintPreset('dots', 480, 270);
    stampBand(band, 0, 270, HUE_BINS[3]);
    expect(voicesForColumn(band, 10), 'band fills the column').toMatchObject([{ key: 3, gain: 1 }]);
    stampBand(band, 0, 270, HUE_BINS[3]);
    expect(voicesForColumn(band, 10), 'second band is the same').toMatchObject([{ key: 3, gain: 1 }]);

    const stripe = paintPreset('dots', 480, 270);
    stampStripe(stripe, 96, 1, HUE_BINS[4]);
    expect(voicesForColumn(stripe, 96), 'stripe replaces the first dot').toMatchObject([{ key: 4, gain: 1 }]);
    expect(voicesForColumn(stripe, 240), 'other columns stay').toMatchObject([{ key: 6, gain: 21 / 270 }]);
  });
});

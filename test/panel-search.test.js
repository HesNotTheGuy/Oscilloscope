import { describe, it, expect } from 'vitest';
import { panelMatches } from '../src/ui/layout-controller.js';

describe('panelMatches', () => {
  const ctrl = {
    id: 'ctrl',
    title: 'ctrl',
    aliases: 'control system screenshot',
    body: 'midi',
  };

  it('matches divider text so MIDI is findable from CTRL', () => {
    expect(panelMatches('midi', ctrl)).toBe(true);
  });

  it('matches aliases like spectrum on the horizontal panel', () => {
    expect(panelMatches('spectrum', {
      id: 'horiz',
      title: 'horizontal',
      aliases: 'yt xy lissajous vectorscope spectrum spectrogram',
      body: '',
    })).toBe(true);
  });

  it('does not match unrelated queries', () => {
    expect(panelMatches('midi', {
      id: 'audio',
      title: 'audio in',
      aliases: 'mic file volume',
      body: '',
    })).toBe(false);
  });

  it('treats an empty query as a match', () => {
    expect(panelMatches('', ctrl)).toBe(true);
  });
});

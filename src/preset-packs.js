'use strict';

// ─────────────────────────────────────────────────────────────
//  Preset Packs — curated one-click looks for the wave display
//  Affects only the scope/beam (color, glow, fx, mode, siggen).
//  Theme (UI chrome) is independent and not changed by packs.
// ─────────────────────────────────────────────────────────────

export const PRESET_PACKS = [
  // ── 1. Synthwave Demo ──────────────────────────────────────
  {
    id: 'synthwave-demo',
    name: 'Synthwave',
    description: 'Neon pink glow with bloom and reactive response',
    scope: {
      color:       '#ff44ff',
      glowAmount:  22,
      beamWidth:   1.9,
      persistence: 0.30,
      mode:        'YT',
      fx: {
        bloom:        true,
        bloomStr:     1.1,
        reactive:     true,
        reactiveStr:  1.0,
        beatFlash:    false,
        beatInvert:   false,
        afterglow:    true,
        afterglowSpeed: 0.002,
        afterglowStr: 0.6,
        mirrorX:      false,
        mirrorY:      false,
        rotation:     false,
        rotSpeed:     0.003,
        beatSens:     1.5,
        beatStr:      0.35,
      },
    },
  },

  // ── 2. Vintage CRT ────────────────────────────────────────
  {
    id: 'vintage-crt',
    name: 'Vintage CRT',
    description: 'Warm amber phosphor with slow decay, authentic retro look',
    scope: {
      color:       '#ffaa00',
      glowAmount:  16,
      beamWidth:   1.8,
      persistence: 0.55,
      mode:        'YT',
      fx: {
        bloom:        false,
        bloomStr:     1.0,
        reactive:     false,
        reactiveStr:  1.0,
        beatFlash:    false,
        beatInvert:   false,
        afterglow:    true,
        afterglowSpeed: 0.001,
        afterglowStr: 0.85,
        mirrorX:      false,
        mirrorY:      false,
        rotation:     false,
        rotSpeed:     0.003,
        beatSens:     1.5,
        beatStr:      0.35,
      },
    },
  },

  // ── 3. Lissajous Lab ──────────────────────────────────────
  {
    id: 'lissajous-lab',
    name: 'Lissajous',
    description: 'Classic green phosphor in XY mode with 2:3 frequency ratio',
    scope: {
      color:       '#00ff41',
      glowAmount:  14,
      beamWidth:   1.5,
      persistence: 0.20,
      mode:        'XY',
      fx: {
        bloom:        false,
        bloomStr:     1.0,
        reactive:     false,
        reactiveStr:  1.0,
        beatFlash:    false,
        beatInvert:   false,
        afterglow:    false,
        afterglowSpeed: 0,
        afterglowStr: 0.7,
        mirrorX:      false,
        mirrorY:      false,
        rotation:     false,
        rotSpeed:     0.003,
        beatSens:     1.5,
        beatStr:      0.35,
      },
    },
    siggen: {
      active:    true,
      waveform:  'sine',
      freqL:     200,
      freqR:     300,
      phase:     90,
      amplitude: 0.8,
    },
  },

  // ── 4. Beat Drop ──────────────────────────────────────────
  {
    id: 'beat-drop',
    name: 'Beat Drop',
    description: 'Magenta bloom with beat-reactive flash',
    scope: {
      color:       '#ff00cc',
      glowAmount:  18,
      beamWidth:   1.6,
      persistence: 0.10,
      mode:        'YT',
      fx: {
        bloom:        true,
        bloomStr:     1.3,
        reactive:     true,
        reactiveStr:  1.2,
        beatFlash:    true,
        beatInvert:   false,
        afterglow:    false,
        afterglowSpeed: 0,
        afterglowStr: 0.7,
        mirrorX:      false,
        mirrorY:      false,
        rotation:     false,
        rotSpeed:     0.003,
        beatSens:     1.8,
        beatStr:      0.5,
      },
    },
  },

  // ── 5. Rainbow Trails ─────────────────────────────────────
  {
    id: 'rainbow-trails',
    name: 'Trails',
    description: 'Cyan XY spiral with long afterglow, near-1:1 ratio drift',
    scope: {
      color:       '#00ffee',
      glowAmount:  16,
      beamWidth:   1.4,
      persistence: 0.25,
      mode:        'XY',
      fx: {
        bloom:        true,
        bloomStr:     0.8,
        reactive:     false,
        reactiveStr:  1.0,
        beatFlash:    false,
        beatInvert:   false,
        afterglow:    true,
        afterglowSpeed: 0.003,
        afterglowStr: 0.75,
        mirrorX:      false,
        mirrorY:      false,
        rotation:     false,
        rotSpeed:     0.003,
        beatSens:     1.5,
        beatStr:      0.35,
      },
    },
    siggen: {
      active:    true,
      waveform:  'sine',
      freqL:     200,
      freqR:     201,
      phase:     90,
      amplitude: 0.8,
    },
  },

  // ── 6. Minimalist ─────────────────────────────────────────
  {
    id: 'minimalist',
    name: 'Minimal',
    description: 'Clean modern look — thin trace, low glow, no FX',
    scope: {
      color:       '#334466',
      glowAmount:  4,
      beamWidth:   1.0,
      persistence: 0.06,
      mode:        'YT',
      fx: {
        bloom:        false,
        bloomStr:     1.0,
        reactive:     false,
        reactiveStr:  1.0,
        beatFlash:    false,
        beatInvert:   false,
        afterglow:    false,
        afterglowSpeed: 0,
        afterglowStr: 0.7,
        mirrorX:      false,
        mirrorY:      false,
        rotation:     false,
        rotSpeed:     0.003,
        beatSens:     1.5,
        beatStr:      0.35,
      },
    },
  },

  // ── 7. Glitch ─────────────────────────────────────────────
  {
    id: 'glitch',
    name: 'Glitch',
    description: 'Orange chaos with mirror + low persistence — glitchy look',
    scope: {
      color:       '#ff6633',
      glowAmount:  10,
      beamWidth:   1.4,
      persistence: 0.06,
      mode:        'XY',
      fx: {
        bloom:        false,
        bloomStr:     1.0,
        reactive:     true,
        reactiveStr:  1.4,
        beatFlash:    false,
        beatInvert:   true,
        afterglow:    false,
        afterglowSpeed: 0,
        afterglowStr: 0.7,
        mirrorX:      true,
        mirrorY:      false,
        rotation:     true,
        rotSpeed:     0.008,
        beatSens:     1.5,
        beatStr:      0.35,
      },
    },
    siggen: {
      active:    true,
      waveform:  'sawtooth',
      freqL:     317,
      freqR:     Math.round(317 * Math.PI / 2),
      phase:     37,
      amplitude: 0.8,
    },
  },

  // ── 8. Wireframe Studio ───────────────────────────────────
  {
    id: 'wireframe-studio',
    name: 'Wireframe',
    description: 'Warm sage green YT trace, low glow',
    scope: {
      color:       '#88aa55',
      glowAmount:  8,
      beamWidth:   1.3,
      persistence: 0.15,
      mode:        'YT',
      fx: {
        bloom:        false,
        bloomStr:     1.0,
        reactive:     false,
        reactiveStr:  1.0,
        beatFlash:    false,
        beatInvert:   false,
        afterglow:    false,
        afterglowSpeed: 0,
        afterglowStr: 0.7,
        mirrorX:      false,
        mirrorY:      false,
        rotation:     false,
        rotSpeed:     0.003,
        beatSens:     1.5,
        beatStr:      0.35,
      },
    },
  },
];

/** Look up a preset pack by ID. */
export function getPresetPack(id) {
  return PRESET_PACKS.find(p => p.id === id) || null;
}

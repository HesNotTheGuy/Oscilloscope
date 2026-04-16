'use strict';

// ─────────────────────────────────────────────────────────────
//  Theme definitions — 10 visual themes for the DSO-1
// ─────────────────────────────────────────────────────────────

/**
 * Helper: convert hex color to "R,G,B" string for rgba() usage.
 */
export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export const THEMES = [
  // ── 1. Classic Lab ──────────────────────────────────────────
  {
    id: 'classic-lab',
    name: 'Classic Lab',
    css: {
      '--p':         '#00ff41',
      '--p-rgb':     '0,255,65',
      '--bg':        '#080808',
      '--panel':     '#0d0d0d',
      '--border':    '#252525',
      '--text':      '#999',
      '--text-hi':   '#ccc',
      '--input-bg':  '#141414',
      '--bezel':     '#1a1a1a',
      '--knob-body': '#222',
    },
    scope: {
      traceColor:    '#00ff41',
      gradientStart: '#00ff41',
      glowAmount:    12,
      beamWidth:     1.5,
      persistence:   0.15,
    },
    titleBar: {
      color:       '#0a0a0a',
      symbolColor: '#00ff41',
    },
  },

  // ── 2. Tektronix Blue ──────────────────────────────────────
  {
    id: 'tektronix-blue',
    name: 'Tektronix Blue',
    css: {
      '--p':         '#4488ff',
      '--p-rgb':     '68,136,255',
      '--bg':        '#070a10',
      '--panel':     '#0c1018',
      '--border':    '#1e2a3a',
      '--text':      '#8899aa',
      '--text-hi':   '#bbccdd',
      '--input-bg':  '#101825',
      '--bezel':     '#141c28',
      '--knob-body': '#1a2233',
    },
    scope: {
      traceColor:    '#4488ff',
      gradientStart: '#4488ff',
      glowAmount:    14,
      beamWidth:     1.6,
      persistence:   0.18,
    },
    titleBar: {
      color:       '#0a0e16',
      symbolColor: '#4488ff',
    },
  },

  // ── 3. Analog Amber ────────────────────────────────────────
  {
    id: 'analog-amber',
    name: 'Analog Amber',
    css: {
      '--p':         '#ffaa00',
      '--p-rgb':     '255,170,0',
      '--bg':        '#0a0804',
      '--panel':     '#110e08',
      '--border':    '#2a2218',
      '--text':      '#998866',
      '--text-hi':   '#ccaa77',
      '--input-bg':  '#161008',
      '--bezel':     '#1a1510',
      '--knob-body': '#252015',
    },
    scope: {
      traceColor:    '#ffaa00',
      gradientStart: '#ffaa00',
      glowAmount:    15,
      beamWidth:     1.8,
      persistence:   0.22,
    },
    titleBar: {
      color:       '#0a0806',
      symbolColor: '#ffaa00',
    },
  },

  // ── 4. MIL-SPEC ────────────────────────────────────────────
  {
    id: 'mil-spec',
    name: 'MIL-SPEC',
    css: {
      '--p':         '#ff6633',
      '--p-rgb':     '255,102,51',
      '--bg':        '#0a0b08',
      '--panel':     '#12140e',
      '--border':    '#2a2d22',
      '--text':      '#889977',
      '--text-hi':   '#aabb99',
      '--input-bg':  '#161810',
      '--bezel':     '#1c1e16',
      '--knob-body': '#252818',
    },
    scope: {
      traceColor:    '#ff6633',
      gradientStart: '#ff6633',
      glowAmount:    10,
      beamWidth:     1.4,
      persistence:   0.12,
    },
    titleBar: {
      color:       '#0c0d0a',
      symbolColor: '#ff6633',
    },
  },

  // ── 5. Modern Minimal ──────────────────────────────────────
  {
    id: 'modern-minimal',
    name: 'Modern Minimal',
    css: {
      '--p':         '#334466',
      '--p-rgb':     '51,68,102',
      '--bg':        '#f0f0f0',
      '--panel':     '#ffffff',
      '--border':    '#d0d0d0',
      '--text':      '#555555',
      '--text-hi':   '#222222',
      '--input-bg':  '#e8e8e8',
      '--bezel':     '#e0e0e0',
      '--knob-body': '#cccccc',
    },
    scope: {
      traceColor:    '#334466',
      gradientStart: '#334466',
      glowAmount:    4,
      beamWidth:     1.2,
      persistence:   0.08,
    },
    titleBar: {
      color:       '#f0f0f0',
      symbolColor: '#334466',
    },
  },

  // ── 6. Synthwave ───────────────────────────────────────────
  {
    id: 'synthwave',
    name: 'Synthwave',
    css: {
      '--p':         '#00ffff',
      '--p-rgb':     '0,255,255',
      '--bg':        '#0c0618',
      '--panel':     '#120a20',
      '--border':    '#2a1848',
      '--text':      '#9977bb',
      '--text-hi':   '#cc99ff',
      '--input-bg':  '#180e2a',
      '--bezel':     '#1a1030',
      '--knob-body': '#221440',
    },
    scope: {
      traceColor:    '#00ffff',
      gradientStart: '#00ffff',
      glowAmount:    22,
      beamWidth:     2.0,
      persistence:   0.30,
    },
    titleBar: {
      color:       '#0a0616',
      symbolColor: '#00ffff',
    },
  },

  // ── 7. Wooden Rack ─────────────────────────────────────────
  {
    id: 'wooden-rack',
    name: 'Wooden Rack',
    css: {
      '--p':         '#88aa55',
      '--p-rgb':     '136,170,85',
      '--bg':        '#0e0b08',
      '--panel':     '#1a1510',
      '--border':    '#3a3025',
      '--text':      '#aa9977',
      '--text-hi':   '#d4c4a8',
      '--input-bg':  '#1e1812',
      '--bezel':     '#241e16',
      '--knob-body': '#302818',
    },
    scope: {
      traceColor:    '#88aa55',
      gradientStart: '#88aa55',
      glowAmount:    8,
      beamWidth:     1.4,
      persistence:   0.15,
    },
    titleBar: {
      color:       '#100c08',
      symbolColor: '#88aa55',
    },
  },

  // ── 8. OLED Dark ───────────────────────────────────────────
  {
    id: 'oled-dark',
    name: 'OLED Dark',
    css: {
      '--p':         '#ffffff',
      '--p-rgb':     '255,255,255',
      '--bg':        '#000000',
      '--panel':     '#080808',
      '--border':    '#181818',
      '--text':      '#777777',
      '--text-hi':   '#bbbbbb',
      '--input-bg':  '#0c0c0c',
      '--bezel':     '#0a0a0a',
      '--knob-body': '#1a1a1a',
    },
    scope: {
      traceColor:    '#ffffff',
      gradientStart: '#ffffff',
      glowAmount:    3,
      beamWidth:     1.0,
      persistence:   0.10,
    },
    titleBar: {
      color:       '#000000',
      symbolColor: '#ffffff',
    },
  },

  // ── 9. Nixie Tube ──────────────────────────────────────────
  {
    id: 'nixie-tube',
    name: 'Nixie Tube',
    css: {
      '--p':         '#ff8830',
      '--p-rgb':     '255,136,48',
      '--bg':        '#0a0604',
      '--panel':     '#100a06',
      '--border':    '#2a1e14',
      '--text':      '#aa7744',
      '--text-hi':   '#dd9955',
      '--input-bg':  '#140c06',
      '--bezel':     '#181008',
      '--knob-body': '#22180c',
    },
    scope: {
      traceColor:    '#ff8830',
      gradientStart: '#ff8830',
      glowAmount:    18,
      beamWidth:     1.8,
      persistence:   0.25,
    },
    titleBar: {
      color:       '#0a0604',
      symbolColor: '#ff8830',
    },
  },

  // ── 10. Frosted Glass ──────────────────────────────────────
  {
    id: 'frosted-glass',
    name: 'Frosted Glass',
    css: {
      '--p':         '#aaccee',
      '--p-rgb':     '170,204,238',
      '--bg':        '#0a0e14',
      '--panel':     'rgba(16,24,36,0.75)',
      '--border':    'rgba(100,140,180,0.2)',
      '--text':      '#8899aa',
      '--text-hi':   '#ccddee',
      '--input-bg':  'rgba(10,18,28,0.6)',
      '--bezel':     'rgba(20,30,44,0.8)',
      '--knob-body': 'rgba(30,44,60,0.8)',
      '--panel-opacity': '0.75',
    },
    scope: {
      traceColor:    '#aaccee',
      gradientStart: '#aaccee',
      glowAmount:    10,
      beamWidth:     1.3,
      persistence:   0.18,
    },
    titleBar: {
      color:       '#0a0e14',
      symbolColor: '#aaccee',
    },
  },
];

/** Look up a theme by ID. */
export function getTheme(id) {
  return THEMES.find(t => t.id === id) || THEMES[0];
}

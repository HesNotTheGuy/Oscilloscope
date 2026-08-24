'use strict';

import { BeatDetector } from '../beat-detector.js';
import { LightsBridge } from './lights-bridge.js';

// ─────────────────────────────────────────────────────────────
//  PatchRack — modular patch bay inserted between the engine's
//  visual buses and its analysers. While enabled, everything the
//  app visualises AND plays flows through the rack, so the whole
//  visualiser stack (scope/spectrum/vectorscope/spectrogram, all
//  themes and beam FX) shows the processed signal.
//
//  Interaction model (validated in the PATCH-1 prototype):
//   - drag jack → jack to patch (either direction, forgiving drop)
//   - plain click on a jack PROBES it: the app's visualisers show
//     that point in the circuit until clicked again
//   - click a cable to unplug (PATCHING mode only)
//   - PATCHING / PLAYING modes: playing locks the cables
//   - feedback loops get an automatic 5 ms delay (Web Audio
//     silences delay-free cycles) — feedback is a feature
// ─────────────────────────────────────────────────────────────

const SENS = { 'vcf.cv': 3600, 'vco.fm': 120, 'echo.cv': 0.05, 'out.cv': 0.35, 'fold.cv': 3,
  'vcaa.cv': 1, 'vcab.cv': 1 };

const VERB = { 'lfo.out': 'wobbling', 'seq.out': 'stepping', 'sh.out': 'randomizing', 'tracer.out': 'riding', 'pulse.out': 'punching',
  'drift.out': 'drifting', 'sweep.out': 'sweeping', 'memory.out': 'looping', 'strange.x': 'entangling', 'strange.y': 'entangling',
  'orbit.x': 'circling', 'orbit.y': 'circling',
  'divide.d2': 'clocking', 'divide.d4': 'clocking', 'divide.d8': 'clocking', 'bounce.out': 'bouncing',
  'clock.out': 'driving', 'env.out': 'shaping' };
const DEST_PHRASE = {
  'vcf.cv': 'the filter', 'vco.fm': 'the pitch', 'out.cv': 'the volume',
  'echo.cv': 'the echo time', 'vcf.in': 'into the filter', 'out.in': 'the speakers',
  'mix.a': 'into the mixer', 'mix.b': 'into the mixer',
  'echo.in': 'into the echo', 'drive.in': 'into the drive',
  'tracer.in': 'the tracer', 'ghost.in': 'into the ghost', 'fold.in': 'into the fold', 'fold.cv': 'the fold',
  'divide.in': 'the divider', 'bounce.trig': 'the bounce',
  'lights.c1': 'light 1', 'lights.c2': 'light 2', 'lights.c3': 'light 3', 'lights.c4': 'light 4',
  'vector.x': 'the scope\u2019s X', 'vector.y': 'the scope\u2019s Y',
  'env.trig': 'the envelope', 'vcaa.cv': 'voice A', 'vcab.cv': 'voice B',
  'vcaa.in': 'into voice A', 'vcab.in': 'into voice B',
};
const JACK_NAME = {
  'input.out': 'the source', 'vco.out': 'the synth', 'lfo.out': 'the LFO',
  'seq.out': 'the sequencer', 'sh.out': 'the S&H', 'vcf.out': 'the filter',
  'mix.out': 'the mix', 'echo.out': 'the echo', 'drive.out': 'the drive',
  'tracer.out': 'the tracer', 'pulse.out': 'the pulse', 'ghost.out': 'the ghost', 'fold.out': 'the fold',
  'drift.out': 'the drift', 'sweep.out': 'the sweep', 'memory.out': 'the memory',
  'strange.x': 'strange X', 'strange.y': 'strange Y',
  'orbit.x': 'orbit X', 'orbit.y': 'orbit Y',
  'divide.d2': 'the half-time', 'divide.d4': 'the quarter-time', 'divide.d8': 'the eighth-time',
  'bounce.out': 'the bounce',
  'clock.out': 'the clock', 'env.out': 'the envelope',
  'vcaa.out': 'voice A', 'vcab.out': 'voice B', 'noise.out': 'the noise',
};

// Declarative module layout. knobs: [id, label, default]; jacks: [id, dir, kind, label]
const ROWS = [
  [
    { id: 'input', name: 'Input', sub: 'what the app is playing', w: 150,
      knobs: [['input.level', 'Level', 1]],
      jacks: [['input.out', 'out', 'audio', 'Out']], led: 'pk-led-input' },
    { id: 'vco', name: 'VCO', sub: 'test tone', w: 158,
      knobs: [['vco.freq', 'Freq', 0.5], ['vco.level', 'Level', 0]],
      jacks: [['vco.fm', 'in', 'cv', '▸ FM'], ['vco.out', 'out', 'audio', 'Out']] },
    { id: 'lfo', name: 'LFO', sub: 'slow wobble', subDyn: 'lfo', w: 170, waves: true,
      knobs: [['lfo.rate', 'Rate', 0.45], ['lfo.depth', 'Depth', 0.6]],
      jacks: [['lfo.out', 'out', 'cv', 'Out']] },
    { id: 'seq', name: 'Seq', sub: 'step melody', subDyn: 'seq', w: 352, seq: true,
      knobs: [['seq.rate', 'Rate', 0.5]],
      jacks: [['seq.out', 'out', 'cv', 'Out']] },
    { id: 'sh', name: 'S&H', sub: 'random steps', subDyn: 'sh', w: 128,
      knobs: [['sh.rate', 'Rate', 0.5]],
      jacks: [['sh.out', 'out', 'cv', 'Out']], led: 'pk-led-sh' },
  ],
  [
    { id: 'vcf', name: 'VCF', sub: 'tone filter', w: 176,
      knobs: [['vcf.cutoff', 'Cutoff', 0.62], ['vcf.res', 'Res', 0.08]],
      jacks: [['vcf.in', 'in', 'audio', '▸ In'], ['vcf.cv', 'in', 'cv', '▸ CV'], ['vcf.out', 'out', 'audio', 'Out']] },
    { id: 'mix', name: 'Mix', sub: 'blend two sounds', w: 150,
      knobs: [['mix.a', 'A', 0.7], ['mix.b', 'B', 0.7]],
      jacks: [['mix.a', 'in', 'audio', '▸ A'], ['mix.b', 'in', 'audio', '▸ B'], ['mix.out', 'out', 'audio', 'Out']] },
    { id: 'echo', name: 'Echo', sub: 'repeats & tape warble', w: 190,
      knobs: [['echo.time', 'Time', 0.4], ['echo.fdbk', 'Fdbk', 0.45]],
      jacks: [['echo.in', 'in', 'audio', '▸ In'], ['echo.cv', 'in', 'cv', '▸ Time'], ['echo.out', 'out', 'audio', 'Out']] },
    { id: 'drive', name: 'Drive', sub: 'grit & warmth', w: 140,
      knobs: [['drive.amt', 'Drive', 0.3]],
      jacks: [['drive.in', 'in', 'audio', '▸ In'], ['drive.out', 'out', 'audio', 'Out']] },
    { id: 'out', name: 'Out', sub: 'speakers + visualizers', w: 150,
      knobs: [['out.monitor', 'Monitor', 0.8]],
      jacks: [['out.in', 'in', 'audio', '▸ In'], ['out.cv', 'in', 'cv', '▸ Trem']] },
  ],
  [
    { id: 'tracer', name: 'Tracer', sub: 'the music moves the knobs', subDyn: 'tracer', w: 172,
      knobs: [['tracer.speed', 'Speed', 0.5], ['tracer.gain', 'Gain', 0.33]],
      jacks: [['tracer.in', 'in', 'audio', '▸ In'], ['tracer.out', 'out', 'cv', 'Out']] },
    { id: 'pulse', name: 'Pulse', sub: 'fires on the beat', subDyn: 'pulse', w: 140,
      knobs: [['pulse.decay', 'Decay', 0.3]],
      jacks: [['pulse.out', 'out', 'cv', 'Out']], led: 'pk-led-pulse' },
    { id: 'ghost', name: 'Ghost', sub: 'a second, blurrier you', w: 170,
      knobs: [['ghost.rate', 'Rate', 0.5], ['ghost.depth', 'Depth', 0.5]],
      jacks: [['ghost.in', 'in', 'audio', '▸ In'], ['ghost.out', 'out', 'audio', 'Out']] },
    { id: 'fold', name: 'Fold', sub: 'creases the wave', w: 172,
      knobs: [['fold.amt', 'Fold', 0.35]],
      jacks: [['fold.in', 'in', 'audio', '▸ In'], ['fold.cv', 'in', 'cv', '▸ CV'], ['fold.out', 'out', 'audio', 'Out']] },
  ],
  [
    { id: 'drift', name: 'Drift', sub: 'slow wander', subDyn: 'drift', w: 158,
      knobs: [['drift.rate', 'Rate', 0.4], ['drift.slew', 'Slew', 0.5]],
      jacks: [['drift.out', 'out', 'cv', 'Out']] },
    { id: 'sweep', name: 'Sweep', sub: 'rise & fall', subDyn: 'sweep', w: 160,
      knobs: [['sweep.rise', 'Rise', 0.45], ['sweep.fall', 'Fall', 0.45]],
      jacks: [['sweep.out', 'out', 'cv', 'Out']] },
    { id: 'memory', name: 'Memory', sub: 'a melody that mutates', subDyn: 'memory', w: 172,
      knobs: [['memory.rate', 'Rate', 0.5], ['memory.lock', 'Lock', 0.35]],
      jacks: [['memory.out', 'out', 'cv', 'Out']], led: 'pk-led-mem' },
    { id: 'strange', name: 'Strange', sub: 'chaos, but elegant', subDyn: 'strange', w: 176,
      knobs: [['strange.speed', 'Speed', 0.5]],
      jacks: [['strange.x', 'out', 'cv', 'X'], ['strange.y', 'out', 'cv', 'Y']] },
  ],
  [
    { id: 'orbit', name: 'Orbit', sub: 'two waves, one circle', subDyn: 'orbit', w: 176,
      knobs: [['orbit.rate', 'Rate', 0.45], ['orbit.phase', 'Phase', 0.5]],
      jacks: [['orbit.x', 'out', 'cv', 'X'], ['orbit.y', 'out', 'cv', 'Y']] },
    { id: 'divide', name: 'Divide', sub: 'slower copies of a beat', subDyn: 'divide', w: 196,
      knobs: [],
      jacks: [['divide.in', 'in', 'cv', '\u25b8 Trig'], ['divide.d2', 'out', 'cv', '\u00f72'],
              ['divide.d4', 'out', 'cv', '\u00f74'], ['divide.d8', 'out', 'cv', '\u00f78']],
      led: 'pk-led-div' },
    { id: 'bounce', name: 'Bounce', sub: 'drop it, watch it settle', subDyn: 'bounce', w: 168,
      knobs: [['bounce.decay', 'Bounce', 0.5]],
      jacks: [['bounce.trig', 'in', 'cv', '\u25b8 Trig'], ['bounce.out', 'out', 'cv', 'Out']] },
    { id: 'lights', name: 'Lights', sub: 'patch your stage rig', w: 210,
      knobs: [['lights.dim', 'Master', 0.8]],
      jacks: [['lights.c1', 'in', 'cv', '▸ 1'], ['lights.c2', 'in', 'cv', '▸ 2'],
              ['lights.c3', 'in', 'cv', '▸ 3'], ['lights.c4', 'in', 'cv', '▸ 4']],
      led: 'pk-led-dmx' },
    { id: 'vector', name: 'Vector', sub: 'draws on the XY scope', w: 176,
      knobs: [['vector.gain', 'Gain', 0.5]],
      jacks: [['vector.x', 'in', 'cv', '\u25b8 X'], ['vector.y', 'in', 'cv', '\u25b8 Y']] },
  ],
  [
    { id: 'clock', name: 'Clock', sub: 'the heartbeat', subDyn: 'clock', w: 150,
      knobs: [['clock.bpm', 'Tempo', 0.5]],
      jacks: [['clock.out', 'out', 'cv', 'Out']], led: 'pk-led-clock' },
    { id: 'env', name: 'Env', sub: 'turns a gate into a note', subDyn: 'env', w: 166,
      knobs: [['env.attack', 'Attack', 0.08], ['env.decay', 'Decay', 0.3]],
      jacks: [['env.trig', 'in', 'cv', '\u25b8 Trig'], ['env.out', 'out', 'cv', 'Out']] },
    { id: 'vcaa', name: 'Voice A', sub: 'sound \u00d7 control', w: 168,
      knobs: [['vcaa.level', 'Level', 0]],
      jacks: [['vcaa.in', 'in', 'audio', '\u25b8 In'], ['vcaa.cv', 'in', 'cv', '\u25b8 CV'], ['vcaa.out', 'out', 'audio', 'Out']] },
    { id: 'vcab', name: 'Voice B', sub: 'sound \u00d7 control', w: 168,
      knobs: [['vcab.level', 'Level', 0]],
      jacks: [['vcab.in', 'in', 'audio', '\u25b8 In'], ['vcab.cv', 'in', 'cv', '\u25b8 CV'], ['vcab.out', 'out', 'audio', 'Out']] },
    { id: 'noise', name: 'Noise', sub: 'hiss for hats & snares', w: 150,
      knobs: [['noise.tone', 'Tone', 0.6]],
      jacks: [['noise.out', 'out', 'audio', 'Out']] },
  ],
];

// Every knob in the rack, derived from ROWS. Exported so MIDI targets can be
// registered at startup — a saved CC binding has to resolve even if the user
// hasn't opened PATCH mode yet this session.
export function patchKnobIds() {
  const out = [];
  for (const row of ROWS) {
    for (const m of row) {
      for (const [id, label] of m.knobs) out.push({ id, label, module: m.name });
      if (m.seq) for (let i = 0; i < 8; i++) out.push({ id: 'seq.s' + i, label: 'Step ' + (i + 1), module: m.name });
    }
  }
  return out;
}

// The patch book: named starting points, the software version of the patch
// recipe cards semi-modular makers ship. Every recipe assumes the app is
// already playing something (the INPUT module carries it).
const RECIPES = {
  'wobble': {
    knobs: { 'vcf.cutoff': 0.62, 'vcf.res': 0.2, 'lfo.rate': 0.45, 'lfo.depth': 0.6 },
    cables: [['input.out', 'vcf.in'], ['lfo.out', 'vcf.cv'], ['vcf.out', 'out.in']] },
  'self-playing': {
    knobs: { 'vcf.cutoff': 0.35, 'vcf.res': 0.45, 'tracer.speed': 0.5, 'tracer.gain': 0.5, 'pulse.decay': 0.25 },
    cables: [['input.out', 'vcf.in'], ['input.out', 'tracer.in'], ['tracer.out', 'vcf.cv'],
             ['pulse.out', 'out.cv'], ['vcf.out', 'out.in']] },
  'tape ghost': {
    knobs: { 'echo.time': 0.5, 'echo.fdbk': 0.55, 'lfo.rate': 0.3, 'lfo.depth': 0.5, 'ghost.rate': 0.5, 'ghost.depth': 0.6 },
    cables: [['input.out', 'ghost.in'], ['ghost.out', 'echo.in'], ['lfo.out', 'echo.cv'], ['echo.out', 'out.in']] },
  'scream': {
    knobs: { 'vcf.cutoff': 0.5, 'vcf.res': 0.7, 'drive.amt': 0.6, 'out.monitor': 0.5 },
    cables: [['input.out', 'vcf.in'], ['vcf.out', 'drive.in'], ['vcf.out', 'vcf.cv'], ['drive.out', 'out.in']] },
  'weather': {
    knobs: { 'vcf.cutoff': 0.55, 'drift.rate': 0.25, 'drift.slew': 0.7, 'strange.speed': 0.45,
             'echo.time': 0.45, 'echo.fdbk': 0.5 },
    cables: [['input.out', 'vcf.in'], ['drift.out', 'vcf.cv'], ['vcf.out', 'echo.in'],
             ['strange.x', 'echo.cv'], ['echo.out', 'out.in']] },
  'mutation': {
    knobs: { 'vco.level': 0.6, 'memory.rate': 0.5, 'memory.lock': 0.7, 'vcf.cutoff': 0.5, 'vcf.res': 0.4 },
    cables: [['memory.out', 'vco.fm'], ['vco.out', 'vcf.in'], ['sweep.out', 'vcf.cv'], ['vcf.out', 'out.in']] },
  'groovebox': {
    knobs: { 'clock.bpm': 0.5, 'seq.rate': 0.55, 'vco.level': 0.5, 'vco.freq': 0.32,
             'env.attack': 0.03, 'env.decay': 0.28, 'vcaa.level': 0, 'vcab.level': 0,
             'noise.tone': 0.75, 'bounce.decay': 0.45, 'vcf.cutoff': 0.55, 'vcf.res': 0.35,
             'echo.time': 0.34, 'echo.fdbk': 0.42, 'mix.a': 0.75, 'mix.b': 0.5 },
    cables: [
      ['clock.out', 'divide.in'], ['divide.d2', 'env.trig'],
      ['seq.out', 'vco.fm'], ['vco.out', 'vcaa.in'], ['env.out', 'vcaa.cv'],
      ['clock.out', 'bounce.trig'], ['noise.out', 'vcab.in'], ['bounce.out', 'vcab.cv'],
      ['vcaa.out', 'mix.a'], ['vcab.out', 'mix.b'],
      ['mix.out', 'vcf.in'], ['vcf.out', 'echo.in'], ['echo.out', 'out.in'],
    ] },
  'lissajous': {
    knobs: { 'orbit.rate': 0.5, 'orbit.phase': 0.5, 'vector.gain': 0.5, 'vcf.cutoff': 0.6 },
    cables: [['input.out', 'vcf.in'], ['vcf.out', 'out.in'],
             ['orbit.x', 'vector.x'], ['orbit.y', 'vector.y']] },
  'bouncing': {
    knobs: { 'vcf.cutoff': 0.5, 'vcf.res': 0.5, 'pulse.decay': 0.2, 'bounce.decay': 0.6, 'orbit.rate': 0.35, 'orbit.phase': 0.5 },
    cables: [['input.out', 'vcf.in'], ['pulse.out', 'divide.in'], ['divide.d2', 'bounce.trig'],
             ['bounce.out', 'vcf.cv'], ['orbit.x', 'echo.cv'], ['vcf.out', 'echo.in'], ['echo.out', 'out.in']] },
  'step melody': {
    knobs: { 'vco.level': 0.6, 'vco.freq': 0.5, 'seq.rate': 0.55, 'vcf.cutoff': 0.55, 'echo.time': 0.35, 'echo.fdbk': 0.4 },
    cables: [['seq.out', 'vco.fm'], ['vco.out', 'vcf.in'], ['vcf.out', 'echo.in'],
             ['lfo.out', 'vcf.cv'], ['echo.out', 'out.in']] },
};
const STORE_KEY = 'dso1.patches';
const BOARD_KEY = 'dso1.board';

export class PatchRack {
  constructor(engine, inputMap = null) {
    this.engine = engine;
    this.inputMap = inputMap;
    this._learningKnob = null;
    this.enabled = false;
    this.playMode = false;
    this.probeId = null;
    this.cables = [];        // {from, to, kind, gain, src, delay}
    this.knobs = {};         // id -> 0..1
    this.taps = {};          // out-jack id -> {analyser, buf, node}
    this.inTargets = {};     // in-jack id -> AudioNode|AudioParam|array
    this.jackEls = {};
    this.jackPos = {};
    this.audio = null;       // node graph, built once
    this._drag = null;
    this._hoverIdx = -1;
    this._lastDragEnd = 0;
    this._raf = 0;
    this._lfoType = 'sine';
    this._seqStep = 0;
    this._built = false;
    this._ticking = false;
    this._tickCount = 0;   // exposed for perf verification
  }

  // ── DOM ─────────────────────────────────────────────────────
  build() {
    if (this._built) return;
    this._built = true;
    const el = document.createElement('div');
    el.id = 'pk-overlay';
    el.className = 'pk-hidden';
    el.innerHTML = `
      <div class="pk-top">
        <div class="pk-title">PATCH<em> MODE</em></div>
        <button class="pk-btn pk-active" id="pk-mode">PATCHING</button>
        <select class="pk-btn" id="pk-book" title="Patch book — starting points and your saved patches"></select>
        <button class="pk-btn" id="pk-save" title="Save the current patch">SAVE</button>
        <button class="pk-btn" id="pk-stream" title="Serve the visuals to OBS / Resolume over localhost">STREAM</button>
        <select class="pk-btn" id="pk-board" title="Your board: restore a hidden module, or reset the layout"></select>
        <button class="pk-btn" id="pk-tour" title="Replay the patch tour">?</button>
        <div class="pk-hint" id="pk-hint">drag <b>jack → jack</b> to patch &middot; click a jack to <b>probe</b> it &middot; click a cable to unplug &middot; Ctrl+Z undoes</div>
        <button class="pk-btn pk-close" id="pk-close" title="Collapse the rack (Esc)">✕ CLOSE</button>
      </div>
      <div class="pk-legend">
        <span><span class="pk-swatch pk-sw-audio"></span>sound</span>
        <span><span class="pk-swatch pk-sw-cv"></span>modulation (moves a knob for you)</span>
        <span>signal flows out → in &mdash; follow the moving dot</span>
        <span class="pk-warn" id="pk-warn">live input is audible through the patch &mdash; headphones recommended</span>
      </div>
      <div class="pk-rack" id="pk-rack"><canvas id="pk-cables"></canvas></div>`;
    // Dock under the scope rather than covering it. A rack you can only see
    // by hiding the instrument it is patching is the wrong shape: people
    // reasonably expect the controls to sit with the oscilloscope, not on a
    // second screen. zone-bottom is full width, which is the rack's shape,
    // and the rig system only manages .fp-section nodes so this is safe here.
    (document.getElementById('patch-dock') || document.body).appendChild(el);
    this.overlay = el;
    this.rack = el.querySelector('#pk-rack');
    this.cablesCv = el.querySelector('#pk-cables');
    this.cctx = this.cablesCv.getContext('2d');
    this.hintEl = el.querySelector('#pk-hint');
    this._hintIdle = this.hintEl.innerHTML;
    this._hintLocked = 'cables locked &mdash; drag knobs, click jacks to probe';

    const rail = () => { const r = document.createElement('div'); r.className = 'pk-rail'; return r; };
    this.rack.insertBefore(rail(), this.cablesCv);
    for (const row of ROWS) {
      const rowEl = document.createElement('div');
      rowEl.className = 'pk-row';
      for (const m of row) rowEl.appendChild(this._buildModule(m));
      this.rack.insertBefore(rowEl, this.cablesCv);
      this.rack.insertBefore(rail(), this.cablesCv);
    }
    this.rowEls = [...this.rack.querySelectorAll('.pk-row')];
    this.moduleEls = {};
    this.rack.querySelectorAll('[data-pk-module]').forEach(el => { this.moduleEls[el.dataset.pkModule] = el; });
    this._bindUI();
    this._bindKeyboard();
    this._loadBoard();
    this._applyBoard();
  }

  // ── The board: which modules exist, in what order, on which rail ──
  // Spatial memory is the whole point of a rack — you stop reading labels and
  // just reach for where the thing lives. That only works if YOUR arrangement
  // is the one that persists, so the layout is saved on every change.
  // Everything past this set is hidden on a fresh board. 28 modules crammed
  // into a docked strip is a menu with extra steps — you scroll to find things
  // instead of reaching for where they live, which is the entire advantage a
  // rack has over menus. These eight cover a first patch; the BOARD menu adds
  // any of the rest back, and loading a recipe un-hides whatever it needs.
  _defaultBoard() {
    const STARTER = new Set(['input', 'vco', 'lfo', 'vcf', 'mix', 'echo', 'drive', 'out']);
    const hidden = [];
    for (const row of ROWS) for (const m of row) if (!STARTER.has(m.id)) hidden.push(m.id);
    return { rows: ROWS.map(row => row.map(m => m.id)), hidden };
  }

  _loadBoard() {
    let b = null;
    try { b = JSON.parse(localStorage.getItem(BOARD_KEY) || 'null'); } catch (_) {}
    const def = this._defaultBoard();
    if (!b || !Array.isArray(b.rows)) { this.board = def; return; }
    // Reconcile with the modules that actually exist: drop unknown ids (a
    // module removed since the layout was saved) and append genuinely new
    // ones, so an app update never strands a module off the board.
    const known = new Set(Object.keys(this.moduleEls));
    const placed = new Set();
    const rows = b.rows.map(r => r.filter(id => {
      if (!known.has(id) || placed.has(id)) return false;
      placed.add(id); return true;
    }));
    while (rows.length < def.rows.length) rows.push([]);
    for (const row of def.rows) {
      for (const id of row) {
        if (placed.has(id)) continue;
        placed.add(id);
        rows[rows.length - 1].push(id);     // new modules land on the last rail
      }
    }
    this.board = { rows, hidden: (b.hidden || []).filter(id => known.has(id)) };
  }

  _saveBoard() {
    try { localStorage.setItem(BOARD_KEY, JSON.stringify(this.board)); } catch (_) {}
  }

  // Move the existing elements rather than rebuilding them: every knob, jack
  // and MIDI badge keeps its listeners and its state.
  _applyBoard() {
    const hidden = new Set(this.board.hidden);
    this.board.rows.forEach((ids, i) => {
      const rowEl = this.rowEls[i];
      if (!rowEl) return;
      for (const id of ids) {
        const el = this.moduleEls[id];
        if (el) rowEl.appendChild(el);       // appendChild MOVES a live node
      }
    });
    for (const id in this.moduleEls) {
      this.moduleEls[id].style.display = hidden.has(id) ? 'none' : '';
    }
    // An empty rail is just a floating bar; fold it away.
    this.rowEls.forEach((rowEl, i) => {
      const visible = (this.board.rows[i] || []).some(id => !hidden.has(id));
      rowEl.style.display = visible ? '' : 'none';
      const rail = rowEl.previousElementSibling;
      if (rail && rail.classList.contains('pk-rail')) rail.style.display = visible ? '' : 'none';
    });
    this._refreshBoardMenu();
    this._layout();
  }

  _refreshBoardMenu() {
    const sel = this.overlay.querySelector('#pk-board');
    if (!sel) return;
    const names = {};
    for (const row of ROWS) for (const m of row) names[m.id] = m.name;
    sel.innerHTML = '<option value="">BOARD</option>' +
      (this.board.hidden.length
        ? '<optgroup label="show again">' +
          this.board.hidden.map(id => `<option value="show:${id}">${names[id] || id}</option>`).join('') +
          '</optgroup>'
        : '') +
      '<optgroup label="layout"><option value="reset">reset to default</option></optgroup>';
  }

  hideModule(id) {
    if (!this.moduleEls[id]) return false;               // unknown id never enters the board
    // Refuse while patched: a hidden module's jacks have no position, so its
    // cables would draw to nowhere. Non-destructive beats clever here.
    if (this.cables.some(c => c.from.split('.')[0] === id || c.to.split('.')[0] === id)) {
      this._flashHint('unplug that module first');
      return false;
    }
    if (!this.board.hidden.includes(id)) this.board.hidden.push(id);
    this._saveBoard();
    this._applyBoard();
    return true;
  }

  showModule(id) {
    this.board.hidden = this.board.hidden.filter(x => x !== id);
    this._saveBoard();
    this._applyBoard();
  }

  resetBoard() {
    this.board = this._defaultBoard();
    this._saveBoard();
    this._applyBoard();
    this._flashHint('board reset');
  }

  // Read the live DOM back into the board model after a drag.
  _captureOrder() {
    this.board.rows = this.rowEls.map(rowEl =>
      [...rowEl.querySelectorAll('[data-pk-module]')].map(el => el.dataset.pkModule));
    this._saveBoard();
  }

  _buildModule(m) {
    const mod = document.createElement('div');
    mod.className = 'pk-module';
    mod.dataset.pkModule = m.id;
    mod.style.width = m.w + 'px';
    let html = `<div class="pk-name">${m.name}</div>` +
      `<div class="pk-sub"${m.subDyn ? ` data-pk-sub="${m.subDyn}"` : ''}${m.id === 'input' ? ' data-pk-sub-input' : ''}>${m.sub}</div>`;
    if (m.led) html += `<div class="pk-led" id="${m.led}"></div>`;
    if (m.id === 'lights') html +=
      `<input class="pk-input" id="pk-dmx-host" value="2.255.255.255" spellcheck="false" title="Art-Net target: a node IP, or a broadcast address">` +
      `<button class="pk-btn" id="pk-dmx-btn">SEND DMX</button>`;
    if (m.waves) html += `<div class="pk-waves">` +
      ['sine', 'triangle', 'square', 'sawtooth'].map((w, i) =>
        `<button class="pk-btn pk-wave${i === 0 ? ' pk-active' : ''}" data-pk-wave="${w}">${['SIN', 'TRI', 'SQR', 'SAW'][i]}</button>`).join('') + `</div>`;
    html += `<div class="pk-knobs${m.seq ? ' pk-seq' : ''}">`;
    for (const [id, label, v] of m.knobs) {
      html += `<div class="pk-kwrap"><div class="pk-knob" data-pk-knob="${id}" data-v="${v}" tabindex="0"` +
        ` role="slider" aria-label="${m.name} ${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v * 100)}">` +
        `<div class="pk-ptr"></div></div>` +
        `<label>${label}</label><div class="pk-val" data-pk-val="${id}"></div></div>`;
    }
    if (m.seq) {
      const defs = [0, 0.25, 0.5, 0.35, 0.7, 0.5, 0.9, 0.6];
      for (let i = 0; i < 8; i++) {
        html += `<div class="pk-kwrap"><div class="pk-led pk-seq-led"></div>` +
          `<div class="pk-knob pk-mini" data-pk-knob="seq.s${i}" data-v="${defs[i]}" tabindex="0"` +
          ` role="slider" aria-label="Sequencer step ${i + 1}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(defs[i] * 100)}">` +
          `<div class="pk-ptr"></div></div><label>${i + 1}</label></div>`;
      }
    }
    html += `</div><div class="pk-jacks">`;
    for (const [id, dir, kind, label] of m.jacks) {
      const plain = String(label).replace(/[^\w\s]/g, '').trim() || (dir === 'out' ? 'out' : 'in');
      html += `<div class="pk-jwrap${dir === 'out' ? ' pk-out' : ''}">` +
        `<div class="pk-jack" data-pk-jack="${id}" data-dir="${dir}" data-kind="${kind}" tabindex="0" role="button"` +
        ` aria-label="${m.name} ${plain} ${dir === 'out' ? 'output' : 'input'}, ${kind}"></div><label>${label}</label></div>`;
    }
    html += `</div>`;
    mod.innerHTML = html;
    return mod;
  }

  // ── Formatting & knob application ───────────────────────────
  _fmt(id, v) {
    switch (id) {
      case 'vco.freq':  return (27.5 * Math.pow(16, v)).toFixed(0) + ' Hz';
      case 'lfo.rate': case 'lfo2.rate': return (0.05 * Math.pow(400, v)).toFixed(2) + ' Hz';
      case 'seq.rate':  return (0.5 * Math.pow(32, v)).toFixed(1) + ' Hz';
      case 'sh.rate':   return (0.5 * Math.pow(60, v)).toFixed(1) + ' Hz';
      case 'vcf.cutoff': { const f = 60 * Math.pow(200, v); return f >= 1000 ? (f / 1000).toFixed(1) + ' kHz' : f.toFixed(0) + ' Hz'; }
      case 'vcf.res':   return 'Q ' + (0.5 + v * 18).toFixed(1);
      case 'echo.time': return (0.05 + v * 0.75).toFixed(2) + ' s';
      case 'drive.amt': return Math.round(1 + v * 39) + 'x';
      case 'tracer.speed': return (2 * Math.pow(25, v)).toFixed(0) + ' Hz';
      case 'tracer.gain': return (1 + v * 3).toFixed(1) + 'x';
      case 'pulse.decay': return (0.05 + v * 0.95).toFixed(2) + ' s';
      case 'ghost.rate': return (0.1 * Math.pow(40, v)).toFixed(2) + ' Hz';
      case 'drift.rate': return (0.2 * Math.pow(40, v)).toFixed(1) + ' Hz';
      case 'drift.slew': return (0.05 * Math.pow(40, v)).toFixed(2) + ' s';
      case 'sweep.rise': case 'sweep.fall': return (0.05 * Math.pow(80, v)).toFixed(2) + ' s';
      case 'memory.rate': return (0.5 * Math.pow(32, v)).toFixed(1) + ' Hz';
      case 'strange.speed': return (0.2 * Math.pow(25, v)).toFixed(1) + 'x';
      case 'orbit.rate': return (0.02 * Math.pow(100, v)).toFixed(2) + ' Hz';
      case 'orbit.phase': return Math.round(v * 180) + '\u00b0';
      case 'bounce.decay': return Math.round(v * 100) + '%';
      case 'vector.gain': return (0.25 + v * 1.75).toFixed(2) + 'x';
      case 'clock.bpm': return Math.round(60 + v * 140) + ' BPM';
      case 'lights.dim': return Math.round(v * 100) + '%';
      case 'env.attack': return (1000 * (0.002 + v * 0.4)).toFixed(0) + ' ms';
      case 'env.decay': return (0.02 + v * 1.5).toFixed(2) + ' s';
      case 'noise.tone': return (200 * Math.pow(60, v)).toFixed(0) + ' Hz';
      default:          return Math.round(v * 100) + '%';
    }
  }

  setKnob(id, v) {
    v = Math.min(1, Math.max(0, v));
    this.knobs[id] = v;
    const ptr = this.overlay.querySelector(`[data-pk-knob="${id}"] .pk-ptr`);
    if (ptr) ptr.style.transform = `rotate(${-135 + v * 270}deg)`;
    const val = this.overlay.querySelector(`[data-pk-val="${id}"]`);
    if (val) val.textContent = this._fmt(id, v);
    const knobEl = this.overlay.querySelector(`[data-pk-knob="${id}"]`);
    if (knobEl) {
      knobEl.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      knobEl.setAttribute('aria-valuetext', this._fmt(id, v));
    }
    const a = this.audio;
    if (!a) return;
    const t = this.engine.actx.currentTime;
    switch (id) {
      case 'input.level': a.inputGain.gain.setTargetAtTime(v, t, .02); break;   // 100% = unity
      case 'vco.freq': { const f = 27.5 * Math.pow(16, v);
        a.osc1.frequency.setTargetAtTime(f, t, .02); a.osc2.frequency.setTargetAtTime(f * 1.004, t, .02); break; }
      case 'vco.level': a.vcoOut.gain.setTargetAtTime(0.5 * v, t, .02); break;
      case 'lfo.rate':  a.lfo.frequency.setTargetAtTime(0.05 * Math.pow(400, v), t, .02); break;
      case 'lfo.depth': a.lfoDepth.gain.setTargetAtTime(v * v, t, .02); break;
      case 'vcf.cutoff': a.filter.frequency.setTargetAtTime(60 * Math.pow(200, v), t, .02); break;
      case 'vcf.res':   a.filter.Q.setTargetAtTime(0.5 + v * 18, t, .02); break;
      case 'mix.a':     a.mixA.gain.setTargetAtTime(v, t, .02); break;
      case 'mix.b':     a.mixB.gain.setTargetAtTime(v, t, .02); break;
      // slow time constant on purpose: gliding delay time = tape-style pitch warp
      case 'echo.time': a.echoDelay.delayTime.setTargetAtTime(0.05 + v * 0.75, t, .08); break;
      case 'echo.fdbk': a.echoFb.gain.setTargetAtTime(v * 0.85, t, .02); break;
      case 'drive.amt':
        a.drivePre.gain.setTargetAtTime(1 + v * 39, t, .02);
        a.drivePost.gain.setTargetAtTime(0.9 / (1 + v * 2.5), t, .02); break;
      case 'out.monitor': a.master.gain.setTargetAtTime(v * v, t, .02); break;
      case 'vector.gain': {
        const g = 0.25 + v * 1.75;
        a.vecL.gain.setTargetAtTime(g, t, .02); a.vecR.gain.setTargetAtTime(g, t, .02); break;
      }
      case 'vcaa.level': a.vcaA.gain.setTargetAtTime(v, t, .02); break;
      case 'vcab.level': a.vcaB.gain.setTargetAtTime(v, t, .02); break;
      case 'noise.tone': a.noiseLP.frequency.setTargetAtTime(200 * Math.pow(60, v), t, .02); break;
      case 'tracer.speed': a.tracerLP.frequency.setTargetAtTime(2 * Math.pow(25, v), t, .02); break;
      case 'tracer.gain': a.tracerGain.gain.setTargetAtTime(1 + v * 3, t, .02); break;
      case 'ghost.rate': a.ghostLfo.frequency.setTargetAtTime(0.1 * Math.pow(40, v), t, .02); break;
      case 'ghost.depth': a.ghostLfoGain.gain.setTargetAtTime(v * 0.005, t, .02); break;
      case 'fold.amt': a.foldShaper.curve = this._foldCurve(v); break;
    }
  }

  // ── Audio graph ─────────────────────────────────────────────
  _buildGraph() {
    if (this.audio) return;
    const actx = this.engine.actx;
    const a = this.audio = {};
    // visBusL and visBusR both land here, so sum them at 0.5 each: feeding
    // one mono node from two buses at unity was a silent +6 dB that drove the
    // limiter and made simply OPENING the rack distort.
    a.inputSum = new GainNode(actx, { gain: 0.5 });
    a.inputGain = new GainNode(actx, { gain: 1 });
    a.inputSum.connect(a.inputGain);
    a.osc1 = new OscillatorNode(actx, { type: 'sawtooth' });
    a.osc2 = new OscillatorNode(actx, { type: 'sawtooth' });
    a.vcoOut = new GainNode(actx, { gain: 0 });
    a.osc1.connect(a.vcoOut); a.osc2.connect(a.vcoOut);
    a.lfo = new OscillatorNode(actx, { type: this._lfoType });
    a.lfoDepth = new GainNode(actx, { gain: 0 });
    a.lfo.connect(a.lfoDepth);
    a.seqSrc = new ConstantSourceNode(actx, { offset: 0 });
    a.shSrc = new ConstantSourceNode(actx, { offset: 0 });
    a.filter = new BiquadFilterNode(actx, { type: 'lowpass' });
    a.mixA = new GainNode(actx, { gain: 0 });
    a.mixB = new GainNode(actx, { gain: 0 });
    a.mixBus = new GainNode(actx, { gain: 1 });
    a.mixA.connect(a.mixBus); a.mixB.connect(a.mixBus);
    a.echoIn = new GainNode(actx, { gain: 1 });
    a.echoDelay = new DelayNode(actx, { delayTime: 0.35, maxDelayTime: 2 });
    a.echoFb = new GainNode(actx, { gain: 0 });
    a.echoWet = new GainNode(actx, { gain: 0.6 });
    a.echoOut = new GainNode(actx, { gain: 1 });
    a.echoIn.connect(a.echoOut);
    a.echoIn.connect(a.echoDelay);
    a.echoDelay.connect(a.echoWet).connect(a.echoOut);
    a.echoDelay.connect(a.echoFb).connect(a.echoDelay);
    a.drivePre = new GainNode(actx, { gain: 1 });
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(3 * x) / Math.tanh(3); }
    a.shaper = new WaveShaperNode(actx, { curve, oversample: '2x' });
    a.drivePost = new GainNode(actx, { gain: 0.9 });
    a.drivePre.connect(a.shaper).connect(a.drivePost);
    // TRACER: |x| -> lowpass = the loudness of the input, as audio-rate CV
    a.tracerIn = new GainNode(actx, { gain: 1 });
    const absCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) absCurve[i] = Math.abs(i / 511.5 - 1);
    a.tracerAbs = new WaveShaperNode(actx, { curve: absCurve });
    a.tracerLP = new BiquadFilterNode(actx, { type: 'lowpass', frequency: 10, Q: 0.5 });
    a.tracerGain = new GainNode(actx, { gain: 2 });
    a.tracerIn.connect(a.tracerAbs).connect(a.tracerLP).connect(a.tracerGain);
    // PULSE: beat-triggered decay envelope on a ConstantSource
    a.pulseSrc = new ConstantSourceNode(actx, { offset: 0 });
    // GHOST: dry + LFO-modulated short delay (chorus / CRT double image)
    a.ghostIn = new GainNode(actx, { gain: 1 });
    a.ghostDelay = new DelayNode(actx, { delayTime: 0.016, maxDelayTime: 0.06 });
    a.ghostLfo = new OscillatorNode(actx, { type: 'sine', frequency: 0.6 });
    a.ghostLfoGain = new GainNode(actx, { gain: 0.0025 });
    a.ghostLfo.connect(a.ghostLfoGain).connect(a.ghostDelay.delayTime);
    a.ghostWet = new GainNode(actx, { gain: 0.7 });
    a.ghostOut = new GainNode(actx, { gain: 1 });
    a.ghostIn.connect(a.ghostOut);
    a.ghostIn.connect(a.ghostDelay).connect(a.ghostWet).connect(a.ghostOut);
    // FOLD: sine-shaped wavefolder; knob rebuilds the curve, CV drives deeper
    a.foldPre = new GainNode(actx, { gain: 1 });
    a.foldShaper = new WaveShaperNode(actx, { curve: this._foldCurve(0.35), oversample: '4x' });
    a.foldOut = new GainNode(actx, { gain: 0.9 });
    a.foldPre.connect(a.foldShaper).connect(a.foldOut);
    a.driftSrc = new ConstantSourceNode(actx, { offset: 0 });
    a.sweepSrc = new ConstantSourceNode(actx, { offset: 0 });
    a.memSrc = new ConstantSourceNode(actx, { offset: 0 });
    a.strangeX = new ConstantSourceNode(actx, { offset: 0 });
    a.strangeY = new ConstantSourceNode(actx, { offset: 0 });
    a.orbitX = new ConstantSourceNode(actx, { offset: 0 });
    a.orbitY = new ConstantSourceNode(actx, { offset: 0 });
    // Trigger inputs: a gain node the cables land on, tapped by an analyser
    // so the tick loop can watch for rising edges (gates driving gates).
    a.divIn = new GainNode(actx, { gain: 1 });
    a.divAn = actx.createAnalyser(); a.divAn.fftSize = 256;
    a.divIn.connect(a.divAn);
    a.div2 = new ConstantSourceNode(actx, { offset: 0 });
    a.div4 = new ConstantSourceNode(actx, { offset: 0 });
    a.div8 = new ConstantSourceNode(actx, { offset: 0 });
    a.bounceIn = new GainNode(actx, { gain: 1 });
    a.bounceAn = actx.createAnalyser(); a.bounceAn.fftSize = 256;
    a.bounceIn.connect(a.bounceAn);
    a.bounceSrc = new ConstantSourceNode(actx, { offset: 0 });
    this._edgeBuf = new Float32Array(256);
    // VECTOR: feeds the app's left/right analysers directly so the XY /
    // vectorscope mode can draw two independent signals. Deliberately NOT
    // routed to the limiter — CV here is sub-audio and must never reach
    // the speakers as DC.
    a.vecL = new GainNode(actx, { gain: 1 });
    a.vecR = new GainNode(actx, { gain: 1 });
    // LIGHTS: four CV inputs sampled once per frame and sent as DMX.
    // Analyser taps, not a ScriptProcessor: a lighting rig needs a level
    // per frame, not per sample.
    a.dmxIn = []; a.dmxAn = [];
    for (let i = 0; i < 4; i++) {
      const g = new GainNode(actx, { gain: 1 });
      const an = actx.createAnalyser();
      an.fftSize = 256;
      g.connect(an);
      a.dmxIn.push(g); a.dmxAn.push(an);
    }
    this._dmxBuf = new Float32Array(256);
    // CLOCK: free-running square gate, so the rack can play with no input
    a.clockSrc = new ConstantSourceNode(actx, { offset: 0 });
    // ENV: gate in -> attack/decay contour out
    a.envIn = new GainNode(actx, { gain: 1 });
    a.envAn = actx.createAnalyser(); a.envAn.fftSize = 256;
    a.envIn.connect(a.envAn);
    a.envSrc = new ConstantSourceNode(actx, { offset: 0 });
    // VCAs: a gain node IS a voltage-controlled amplifier — the CV cable
    // lands on .gain, so envelope x sound = a note instead of a drone
    a.vcaA = new GainNode(actx, { gain: 0 });
    a.vcaB = new GainNode(actx, { gain: 0 });
    // NOISE: looping buffer through a tone lowpass
    const nlen = actx.sampleRate * 2;
    const nbuf = actx.createBuffer(1, nlen, actx.sampleRate);
    const nd = nbuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    a.noiseSrc = new AudioBufferSourceNode(actx, { buffer: nbuf, loop: true });
    a.noiseLP = new BiquadFilterNode(actx, { type: 'lowpass', frequency: 3000, Q: 0.7 });
    a.noiseSrc.connect(a.noiseLP);
    this._beat = new BeatDetector();
    // outBus is what the patch produced; master is only how loud you are
    // monitoring it. The analysers tap outBus, so turning the volume down
    // does not shrink the trace — and the scope stays identical to the dry
    // path when the rack is just passing audio through.
    a.outBus = new GainNode(actx, { gain: 1 });
    a.master = new GainNode(actx, { gain: 0 });
    a.outBus.connect(a.master);
    // limiter so feedback patches and hot drives can't blast the speakers
    // Safety net for feedback patches and hot drive settings only. At -6 dB
    // and 12:1 this was compressing ordinary programme material and pumping;
    // a fast, high-ratio limiter near 0 dBFS stays out of the way instead.
    a.limiter = new DynamicsCompressorNode(actx, {
      threshold: -1.5, ratio: 20, knee: 0, attack: 0.002, release: 0.08,
    });
    a.master.connect(a.limiter);
    a.osc1.start(); a.osc2.start(); a.lfo.start(); a.seqSrc.start(); a.shSrc.start();
    a.pulseSrc.start(); a.ghostLfo.start();
    a.driftSrc.start(); a.sweepSrc.start(); a.memSrc.start(); a.strangeX.start(); a.strangeY.start();
    a.orbitX.start(); a.orbitY.start(); a.div2.start(); a.div4.start(); a.div8.start(); a.bounceSrc.start();
    a.clockSrc.start(); a.envSrc.start(); a.noiseSrc.start();

    const tap = (id, node) => {
      const an = actx.createAnalyser();
      an.fftSize = 512;
      node.connect(an);
      this.taps[id] = { analyser: an, buf: new Float32Array(an.fftSize), node };
    };
    tap('input.out', a.inputGain);
    tap('vco.out', a.vcoOut);
    tap('lfo.out', a.lfoDepth);
    tap('seq.out', a.seqSrc);
    tap('sh.out', a.shSrc);
    tap('vcf.out', a.filter);
    tap('mix.out', a.mixBus);
    tap('echo.out', a.echoOut);
    tap('drive.out', a.drivePost);
    tap('tracer.out', a.tracerGain);
    tap('pulse.out', a.pulseSrc);
    tap('ghost.out', a.ghostOut);
    tap('fold.out', a.foldOut);
    tap('drift.out', a.driftSrc);
    tap('sweep.out', a.sweepSrc);
    tap('memory.out', a.memSrc);
    tap('strange.x', a.strangeX);
    tap('strange.y', a.strangeY);
    tap('orbit.x', a.orbitX);
    tap('orbit.y', a.orbitY);
    tap('divide.d2', a.div2);
    tap('divide.d4', a.div4);
    tap('divide.d8', a.div8);
    tap('bounce.out', a.bounceSrc);
    tap('clock.out', a.clockSrc);
    tap('env.out', a.envSrc);
    tap('vcaa.out', a.vcaA);
    tap('vcab.out', a.vcaB);
    tap('noise.out', a.noiseLP);
    this.inTargets = {
      'vcf.in': a.filter, 'vcf.cv': a.filter.frequency,
      'vco.fm': [a.osc1.frequency, a.osc2.frequency],
      'mix.a': a.mixA, 'mix.b': a.mixB,
      'echo.in': a.echoIn, 'echo.cv': a.echoDelay.delayTime,
      'drive.in': a.drivePre,
      'divide.in': a.divIn,
      'bounce.trig': a.bounceIn,
      'vector.x': a.vecL,
      'vector.y': a.vecR,
      'lights.c1': a.dmxIn[0], 'lights.c2': a.dmxIn[1],
      'lights.c3': a.dmxIn[2], 'lights.c4': a.dmxIn[3],
      'env.trig': a.envIn,
      'vcaa.in': a.vcaA, 'vcaa.cv': a.vcaA.gain,
      'vcab.in': a.vcaB, 'vcab.cv': a.vcaB.gain,
      'tracer.in': a.tracerIn,
      'ghost.in': a.ghostIn,
      'fold.in': a.foldPre, 'fold.cv': a.foldPre.gain,
      'out.in': a.outBus, 'out.cv': a.outBus.gain,
    };
    for (const id in this.knobs) this.setKnob(id, this.knobs[id]);

    // Straight through, nothing in the way. Opening the rack is a thing you
    // do to LOOK at the patch, and it must not change how anything sounds —
    // arriving inside a resonant sweeping filter made the app feel broken.
    // The old starter patch is the "wobble" recipe, one click away.
    this.connect('input.out', 'out.in');
  }

  _foldCurve(v) {
    const c = new Float32Array(2048);
    const k = Math.PI * (0.5 + v * 5);
    for (let i = 0; i < 2048; i++) c[i] = Math.sin((i / 1023.5 - 1) * k);
    return c;
  }

  // One beat -> a snappy decay envelope on the PULSE output.
  _firePulse() {
    if (!this.audio) return;
    const t = this.engine.actx.currentTime;
    const dec = (0.05 + 0.95 * (this.knobs['pulse.decay'] ?? 0.3)) / 3;
    const o = this.audio.pulseSrc.offset;
    o.cancelScheduledValues(t);
    o.setTargetAtTime(1, t, 0.004);
    o.setTargetAtTime(0, t + 0.04, dec);
    this._pulseLedUntil = performance.now() + 120;
  }

  _seqTick() {
    if (this.audio) {
      const leds = this.overlay.querySelectorAll('.pk-seq-led');
      leds.forEach((l, i) => l.className = 'pk-led pk-seq-led' + (i === this._seqStep ? ' pk-on-amber' : ''));
      this.audio.seqSrc.offset.setTargetAtTime(this.knobs['seq.s' + this._seqStep] || 0, this.engine.actx.currentTime, 0.004);
      this._seqStep = (this._seqStep + 1) % 8;
    }
    this._tickCount++;
    if (this.enabled) setTimeout(() => this._seqTick(), 1000 / (0.5 * Math.pow(32, this.knobs['seq.rate'] ?? 0.5)));
    else this._ticking = false;
  }

  _shTick() {
    if (this.audio) {
      const v = Math.random() * 2 - 1;
      this.audio.shSrc.offset.setTargetAtTime(v, this.engine.actx.currentTime, 0.004);
      const led = this.overlay.querySelector('#pk-led-sh');
      if (led) led.className = 'pk-led' + (v > 0 ? ' pk-on-amber' : '');
    }
    this._tickCount++;
    if (this.enabled) setTimeout(() => this._shTick(), 1000 / (0.5 * Math.pow(60, this.knobs['sh.rate'] ?? 0.5)));
    else this._ticking = false;
  }

  // DRIFT: glide to a new random target at RATE; SLEW sets how lazily.
  _driftTick() {
    if (this.audio) {
      const slew = 0.05 * Math.pow(40, this.knobs['drift.slew'] ?? 0.5);
      this.audio.driftSrc.offset.setTargetAtTime(Math.random() * 2 - 1, this.engine.actx.currentTime, slew);
    }
    this._tickCount++;
    if (this.enabled) setTimeout(() => this._driftTick(), 1000 / (0.2 * Math.pow(40, this.knobs['drift.rate'] ?? 0.4)));
    else this._ticking = false;
  }

  // SWEEP: looping rise/fall ramp with independent slopes (0..1 out).
  _sweepTick() {
    if (this.audio) {
      const rise = 0.05 * Math.pow(80, this.knobs['sweep.rise'] ?? 0.45);
      const fall = 0.05 * Math.pow(80, this.knobs['sweep.fall'] ?? 0.45);
      const st = this._sweep = this._sweep || { v: 0, up: true };
      const step = 0.025;
      st.v += st.up ? step / rise : -step / fall;
      if (st.v >= 1) { st.v = 1; st.up = false; }
      if (st.v <= 0) { st.v = 0; st.up = true; }
      this.audio.sweepSrc.offset.setTargetAtTime(st.v, this.engine.actx.currentTime, 0.012);
    }
    this._tickCount++;
    if (this.enabled) setTimeout(() => this._sweepTick(), 25);
    else this._ticking = false;
  }

  // MEMORY: 16-step Turing loop; LOCK morphs mutation -> frozen melody.
  _memTick() {
    if (this.audio) {
      const st = this._mem = this._mem || { slots: Array.from({ length: 16 }, () => Math.random()), idx: 0 };
      st.idx = (st.idx + 1) % 16;
      const mutated = Math.random() > (this.knobs['memory.lock'] ?? 0.35);
      if (mutated) st.slots[st.idx] = Math.random();
      this.audio.memSrc.offset.setTargetAtTime(st.slots[st.idx], this.engine.actx.currentTime, 0.004);
      const led = this.overlay.querySelector('#pk-led-mem');
      if (led) led.className = 'pk-led' + (mutated ? ' pk-on-amber' : ' pk-on-green');
    }
    this._tickCount++;
    if (this.enabled) setTimeout(() => this._memTick(), 1000 / (0.5 * Math.pow(32, this.knobs['memory.rate'] ?? 0.5)));
    else this._ticking = false;
  }

  // STRANGE: Lorenz attractor, X and Y outs normalized to ~±1.
  _strangeTick() {
    if (this.audio) {
      const st = this._lorenz = this._lorenz || { x: 1, y: 1, z: 20 };
      const speed = 0.2 * Math.pow(25, this.knobs['strange.speed'] ?? 0.5);
      const dt = 0.0035 * speed;
      for (let i = 0; i < 8; i++) {
        const dx = 10 * (st.y - st.x);
        const dy = st.x * (28 - st.z) - st.y;
        const dz = st.x * st.y - (8 / 3) * st.z;
        st.x += dx * dt; st.y += dy * dt; st.z += dz * dt;
      }
      const t = this.engine.actx.currentTime;
      this.audio.strangeX.offset.setTargetAtTime(Math.max(-1, Math.min(1, st.x / 20)), t, 0.02);
      this.audio.strangeY.offset.setTargetAtTime(Math.max(-1, Math.min(1, st.y / 25)), t, 0.02);
    }
    this._tickCount++;
    if (this.enabled) setTimeout(() => this._strangeTick(), 25);
    else this._ticking = false;
  }

  // ORBIT: quadrature pair. PHASE morphs X/Y from a diagonal line (0\u00b0)
  // through a circle (90\u00b0) to the opposite diagonal (180\u00b0) in XY mode.
  _orbitTick() {
    if (this.audio) {
      const rate = 0.02 * Math.pow(100, this.knobs['orbit.rate'] ?? 0.45);
      const ph = (this.knobs['orbit.phase'] ?? 0.5) * Math.PI;
      this._orbitPhase = (this._orbitPhase || 0) + 2 * Math.PI * rate * 0.016;
      const t = this.engine.actx.currentTime;
      this.audio.orbitX.offset.setTargetAtTime(Math.sin(this._orbitPhase), t, 0.012);
      this.audio.orbitY.offset.setTargetAtTime(Math.sin(this._orbitPhase + ph), t, 0.012);
    }
    this._tickCount++;
    if (this.enabled) setTimeout(() => this._orbitTick(), 16);
    else this._ticking = false;
  }

  // CLOCK: 50% duty gate. Square so it can open a VCA directly for organ
  // notes, and its rising edge drives DIVIDE / ENV / BOUNCE.
  _clockTick() {
    const bpm = 60 + (this.knobs['clock.bpm'] ?? 0.5) * 140;
    const half = 30000 / bpm;
    if (this.audio) {
      this._clockHigh = !this._clockHigh;
      this.audio.clockSrc.offset.setTargetAtTime(this._clockHigh ? 1 : 0, this.engine.actx.currentTime, 0.002);
      if (this._clockHigh) this._clockLedUntil = performance.now() + Math.min(90, half * 0.8);
      const led = this.overlay && this.overlay.querySelector('#pk-led-clock');
      if (led) led.className = 'pk-led' + (performance.now() < (this._clockLedUntil || 0) ? ' pk-on-amber' : '');
    }
    this._tickCount++;
    if (this.enabled) setTimeout(() => this._clockTick(), half);
    else this._ticking = false;
  }

  // Rising-edge watcher for the trigger inputs. Hysteresis on 0.45 keeps
  // a decaying envelope (PULSE, BOUNCE) from re-triggering on its own tail.
  _edgeTick() {
    if (this.audio) {
      const a = this.audio, t = this.engine.actx.currentTime;
      const peakOf = an => {
        an.getFloatTimeDomainData(this._edgeBuf);
        let p = 0;
        for (let i = 0; i < this._edgeBuf.length; i += 4) p = Math.max(p, Math.abs(this._edgeBuf[i]));
        return p;
      };
      // DIVIDE: binary counter -> gates at half, quarter, eighth speed
      const dHigh = peakOf(a.divAn) > 0.45;
      if (dHigh && !this._divHigh) {
        this._divCount = ((this._divCount || 0) + 1) & 7;
        const c = this._divCount;
        a.div2.offset.setTargetAtTime(c & 1 ? 1 : 0, t, 0.004);
        a.div4.offset.setTargetAtTime(c & 2 ? 1 : 0, t, 0.004);
        a.div8.offset.setTargetAtTime(c & 4 ? 1 : 0, t, 0.004);
        this._divLedUntil = performance.now() + 90;
      }
      this._divHigh = dHigh;
      const led = this.overlay && this.overlay.querySelector('#pk-led-div');
      if (led) led.className = 'pk-led' + (performance.now() < (this._divLedUntil || 0) ? ' pk-on-amber' : '');

      // BOUNCE: one trigger -> a settling series of shorter, weaker hops
      const bHigh = peakOf(a.bounceAn) > 0.45;
      if (bHigh && !this._bounceHigh) {
        const keep = 0.45 + 0.45 * (this.knobs['bounce.decay'] ?? 0.5);
        const o = a.bounceSrc.offset;
        o.cancelScheduledValues(t);
        let when = t, amp = 1, gap = 0.26;
        for (let i = 0; i < 7 && amp > 0.02; i++) {
          o.setTargetAtTime(amp, when, 0.006);
          o.setTargetAtTime(0, when + gap * 0.3, gap * 0.16);
          when += gap; amp *= keep; gap *= 0.74;
        }
      }
      this._bounceHigh = bHigh;

      // ENV: gate -> attack ramp, then decay. This is what turns a droning
      // oscillator into notes once it drives a VCA.
      const eHigh = peakOf(a.envAn) > 0.45;
      if (eHigh && !this._envHigh) {
        const atk = 0.002 + (this.knobs['env.attack'] ?? 0.08) * 0.4;
        const dec = 0.02 + (this.knobs['env.decay'] ?? 0.3) * 1.5;
        const o = a.envSrc.offset;
        o.cancelScheduledValues(t);
        o.setTargetAtTime(1, t, atk / 3);
        o.setTargetAtTime(0, t + atk, dec / 3);
      }
      this._envHigh = eHigh;
    }
    this._tickCount++;
    if (this.enabled) setTimeout(() => this._edgeTick(), 16);
    else this._ticking = false;
  }

  // The rack's modulators run on timers, not on the render loop, so they
  // must be stopped explicitly — otherwise closing PATCH mode would leave
  // nine loops (two at 16 ms) running for the rest of the session.
  // Sample the four LIGHTS inputs and hand them to the DMX bridge. Cheap
  // enough to run per frame; the bridge throttles the wire itself.
  _pumpLights() {
    const a = this.audio;
    if (!a || !this._lights || !this._lights.running) return;
    const master = this.knobs['lights.dim'] ?? 0.8;
    for (let i = 0; i < 4; i++) {
      a.dmxAn[i].getFloatTimeDomainData(this._dmxBuf);
      let peak = 0;
      for (let j = 0; j < this._dmxBuf.length; j += 4) {
        const v = Math.abs(this._dmxBuf[j]);
        if (v > peak) peak = v;
      }
      this._lights.setChannel(i, peak * master);
    }
  }

  // Start/stop DMX output. Nothing goes on the wire until the user turns it
  // on, so someone with no lighting rig never opens a socket.
  toggleLights(opts = {}) {
    const led = this.overlay.querySelector('#pk-led-dmx');
    if (this._lights && this._lights.running) {
      this._lights.stop();
      if (window.electronAPI && window.electronAPI.artnetStop) window.electronAPI.artnetStop();
      if (led) led.className = 'pk-led';
      return false;
    }
    if (!window.electronAPI || !window.electronAPI.artnetSend) return false;
    if (!this._lights) {
      this._dmxFails = 0;
      this._lights = new LightsBridge(async (universe, bytes) => {
        const res = await window.electronAPI.artnetSend(universe, Array.from(bytes));
        // A resolved promise carrying { ok:false } is still a failure. The
        // bridge only counted rejections, so a bad host showed "SENDING" with
        // an amber LED while nothing reached the wire.
        if (res && res.ok === false) {
          // Give up rather than retry forever: a rig we cannot reach will
          // never start working on its own, and a failure repeating at frame
          // rate drowns out every other message the app needs to show.
          if (++this._dmxFails >= 40) {
            const why = res.error || 'send failed';
            this.toggleLights();                       // stops, resets the button and LED
            if (this.onLightsError) this.onLightsError(why);
          }
          throw new Error(res.error || 'artnet send failed');
        }
        this._dmxFails = 0;
        return res;
      });
    }
    this._lights.configure(opts);
    if (window.electronAPI.artnetConfigure) window.electronAPI.artnetConfigure(opts);
    this._lights.start();
    if (led) led.className = 'pk-led pk-on-amber';
    return true;
  }

  _startTicks() {
    if (this._ticking || !this.audio) return;
    this._ticking = true;
    this._seqTick(); this._shTick(); this._driftTick(); this._sweepTick();
    this._memTick(); this._strangeTick(); this._orbitTick(); this._edgeTick(); this._clockTick();
  }

  // ── Patching ────────────────────────────────────────────────
  _closesCycle(fromId, toId) {
    const modOf = id => id.split('.')[0];
    const start = modOf(toId), goal = modOf(fromId);
    if (start === goal) return true;
    const seen = new Set([start]); const stack = [start];
    while (stack.length) {
      const m = stack.pop();
      for (const c of this.cables) {
        if (modOf(c.from) !== m) continue;
        const n = modOf(c.to);
        if (n === goal) return true;
        if (!seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    return false;
  }

  connect(fromId, toId) {
    if (this.cables.some(c => c.from === fromId && c.to === toId)) return;
    const old = this.cables.findIndex(c => c.to === toId);
    if (old >= 0) this.removeCable(old);                 // one plug per input
    const kind = this.jackEls[fromId].dataset.kind;
    const actx = this.engine.actx;
    const gain = new GainNode(actx, { gain: SENS[toId] || 1 });
    const src = this.taps[fromId].node;
    src.connect(gain);
    // Web Audio silences delay-free cycles — give feedback loops a few ms
    // instead so they scream rather than mute.
    let tail = gain, delay = null;
    if (this._closesCycle(fromId, toId)) {
      delay = new DelayNode(actx, { delayTime: 0.005, maxDelayTime: 0.05 });
      gain.connect(delay); tail = delay;
    }
    [].concat(this.inTargets[toId]).forEach(t => tail.connect(t));
    this.cables.push({ from: fromId, to: toId, kind, gain, src, delay });
    this._refreshJacks();
  }

  removeCable(i) {
    const c = this.cables[i];
    try { c.src.disconnect(c.gain); } catch (_) {}
    c.gain.disconnect();
    if (c.delay) c.delay.disconnect();
    this.cables.splice(i, 1);
    this._hoverIdx = -1; this.rack.style.cursor = '';
    this._refreshJacks();
  }

  _snapshot() { return this.cables.map(c => ({ from: c.from, to: c.to })); }

  serialize() {
    return { knobs: { ...this.knobs }, lfoType: this._lfoType,
             cables: this.cables.map(c => [c.from, c.to]),
             board: this.board ? JSON.parse(JSON.stringify(this.board)) : null };
  }
  applyPatch(data) {
    this._pushUndo();                                    // recipes are undoable too
    while (this.cables.length) this.removeCable(0);
    // A saved patch restores the board it was built on; the shipped recipes
    // carry no board and leave your arrangement alone.
    if (data.board && Array.isArray(data.board.rows)) {
      this.board = data.board;
      this._saveBoard();
      this._applyBoard();
    }
    if (data.knobs) for (const id in data.knobs) this.setKnob(id, data.knobs[id]);
    if (data.lfoType) {
      this._lfoType = data.lfoType;
      if (this.audio) this.audio.lfo.type = data.lfoType;
      this.overlay.querySelectorAll('[data-pk-wave]').forEach(x =>
        x.classList.toggle('pk-active', x.dataset.pkWave === data.lfoType));
    }
    // Un-hide anything this patch touches first: a cable into a hidden module
    // has no on-screen position, so it would draw to nowhere.
    const needed = new Set();
    for (const [from, to] of (data.cables || [])) {
      needed.add(from.split('.')[0]);
      needed.add(to.split('.')[0]);
    }
    const wasHidden = this.board.hidden.length;
    this.board.hidden = this.board.hidden.filter(id => !needed.has(id));
    if (this.board.hidden.length !== wasHidden) { this._saveBoard(); this._applyBoard(); }

    for (const [from, to] of (data.cables || [])) {
      if (this.taps[from] && this.inTargets[to]) this.connect(from, to);
    }
  }
  _savedPatches() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (_) { return {}; }
  }
  _refreshBook() {
    const sel = this.overlay.querySelector('#pk-book');
    if (!sel) return;
    const saved = this._savedPatches();
    sel.innerHTML = '<option value="">PATCH BOOK</option>' +
      '<optgroup label="recipes">' +
      Object.keys(RECIPES).map(n => `<option value="r:${n}">${n}</option>`).join('') +
      '</optgroup>' +
      (Object.keys(saved).length
        ? '<optgroup label="saved">' + Object.keys(saved).map(n => `<option value="s:${n}">${n}</option>`).join('') + '</optgroup>'
        : '');
  }
  _pushUndo() {
    this._undo = this._undo || [];
    this._undo.push(this._snapshot());
    if (this._undo.length > 50) this._undo.shift();
  }
  undo() {
    if (!this._undo || !this._undo.length) return;
    const snap = this._undo.pop();
    while (this.cables.length) this.removeCable(0);
    for (const c of snap) this.connect(c.from, c.to);
  }
  _flashHint(msg) {
    this.hintEl.textContent = msg;
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => { this.hintEl.innerHTML = this.playMode ? this._hintLocked : this._hintIdle; }, 2500);
  }

  _refreshJacks() {
    for (const id in this.jackEls) {
      const el = this.jackEls[id];
      const c = this.cables.find(cb => cb.from === id || cb.to === id);
      el.className = 'pk-jack' + (c ? ' pk-lit-' + c.kind : '') + (id === this.probeId ? ' pk-probed' : '')
                   + (id === this._kbSource ? ' pk-kb-source' : '');
      const base = (el.getAttribute('aria-label') || '').split(' \u2014 ')[0];
      const partner = c ? (c.from === id ? c.to : c.from) : null;
      el.setAttribute('aria-label', base + (partner ? ' \u2014 patched to ' + partner : ' \u2014 not patched'));
    }
    const DEFAULTS = { lfo: 'slow wobble', seq: 'step melody', sh: 'random steps',
      tracer: 'the music moves the knobs', pulse: 'fires on the beat',
      drift: 'slow wander', sweep: 'rise & fall', memory: 'a melody that mutates', strange: 'chaos, but elegant',
      orbit: 'two waves, one circle', divide: 'slower copies of a beat', bounce: 'drop it, watch it settle',
      clock: 'the heartbeat', env: 'turns a gate into a note' };
    const byModule = {};
    for (const outId in VERB) {
      const mod = outId.split('.')[0];
      if (!byModule[mod]) byModule[mod] = { verb: VERB[outId], dests: [] };
      for (const c of this.cables) if (c.from === outId) byModule[mod].dests.push(DEST_PHRASE[c.to] || c.to);
    }
    for (const mod in byModule) {
      const el = this.overlay.querySelector(`[data-pk-sub="${mod}"]`);
      if (!el) continue;
      const d = byModule[mod].dests;
      if (d.length) { el.textContent = byModule[mod].verb + ' ' + d.join(' + '); el.classList.add('pk-live'); }
      else { el.textContent = DEFAULTS[mod]; el.classList.remove('pk-live'); }
    }
    this._refreshAnalyserFeed();          // vector patching changes the feed
  }

  // ── Probing: the app's visualisers show the probed point ────
  // What SHOULD be feeding the app's analysers right now. Precedence:
  // an active probe wins; otherwise a patched VECTOR input drives that
  // channel; otherwise both channels hear the patch master.
  _desiredFeed() {
    if (!this.enabled || !this.audio) return { L: null, R: null };
    const a = this.audio;
    if (this.probeId && this.taps[this.probeId]) {
      const n = this.taps[this.probeId].node;
      return { L: n, R: n };
    }
    return {
      L: this.cables.some(c => c.to === 'vector.x') ? a.vecL : a.outBus,
      R: this.cables.some(c => c.to === 'vector.y') ? a.vecR : a.outBus,
    };
  }
  // Reconcile actual wiring with _desiredFeed(). One place, so probe,
  // vector patching, enable and disable can't disagree about the routing.
  _refreshAnalyserFeed() {
    const e = this.engine, want = this._desiredFeed();
    if (this._feedL !== want.L) {
      if (this._feedL) { try { this._feedL.disconnect(e.analyserL); } catch (_) {} }
      if (want.L) want.L.connect(e.analyserL);
      this._feedL = want.L;
    }
    if (this._feedR !== want.R) {
      if (this._feedR) { try { this._feedR.disconnect(e.analyserR); } catch (_) {} }
      if (want.R) want.R.connect(e.analyserR);
      this._feedR = want.R;
    }
  }

  toggleProbe(id) {
    let target = id;
    if (this.jackEls[id].dataset.dir === 'in') {
      const c = this.cables.find(cb => cb.to === id);
      target = c ? c.from : null;
    }
    if (!target || !this.taps[target]) return;
    this.probeId = this.probeId === target ? null : target;
    this._refreshJacks();
    const sub = this.overlay.querySelector('[data-pk-sub-input]');
    if (sub) {
      sub.textContent = this.probeId ? 'scope is probing ' + (JACK_NAME[this.probeId] || this.probeId) : 'what the app is playing';
      sub.classList.toggle('pk-live', !!this.probeId);
    }
  }

  // ── Enable / disable: reroute the engine through the rack ───
  enable() {
    if (this.enabled) return;
    const e = this.engine;
    this.build();
    this._buildGraph();
    const a = this.audio;
    // visual buses: analysers now hear the rack's master instead
    try { e.visBusL.disconnect(e.analyserL); } catch (_) {}
    try { e.visBusR.disconnect(e.analyserR); } catch (_) {}
    e.visBusL.connect(a.inputSum);
    e.visBusR.connect(a.inputSum);
    // audible path: master gain no longer feeds the speakers directly
    try { e.gainNode.disconnect(e.actx.destination); } catch (_) {}
    a.limiter.connect(e.actx.destination);
    // recording follows the processed signal
    if (e._recDest) {
      try { e.gainNode.disconnect(e._recDest); } catch (_) {}
      a.limiter.connect(e._recDest);
    }
    this.enabled = true;
    this._refreshAnalyserFeed();
    this._startTicks();
    setTimeout(() => this._flashHint('patched straight through \u2014 open the PATCH BOOK to add effects'), 60);
    this.overlay.classList.remove('pk-hidden');
    this._layout();
    this._startLoop();
  }

  disable() {
    if (!this.enabled) return;
    const e = this.engine, a = this.audio;
    this.probeId = null;
    this.enabled = false;
    this._refreshAnalyserFeed();                        // detaches both channels
    try { e.visBusL.disconnect(a.inputSum); } catch (_) {}
    try { e.visBusR.disconnect(a.inputSum); } catch (_) {}
    try { a.limiter.disconnect(e.actx.destination); } catch (_) {}
    if (e._recDest) {
      try { a.limiter.disconnect(e._recDest); } catch (_) {}
      e.gainNode.connect(e._recDest);
    }
    e.visBusL.connect(e.analyserL);
    e.visBusR.connect(e.analyserR);
    e.gainNode.connect(e.actx.destination);
    if (this._lights && this._lights.running) this.toggleLights();
    this.overlay.classList.add('pk-hidden');
    this._stopLoop();
  }

  // ── Interaction wiring ──────────────────────────────────────
  _bindUI() {
    const rack = this.rack;
    this.overlay.querySelectorAll('[data-pk-jack]').forEach(el => { this.jackEls[el.dataset.pkJack] = el; });

    // Modules are dragged by the name plate — the body is full of knobs and
    // jacks, and the plate is where you'd grab a real module anyway.
    this.overlay.querySelectorAll('.pk-name').forEach(plate => {
      const mod = plate.closest('[data-pk-module]');
      if (!mod) return;
      plate.addEventListener('pointerdown', e => {
        if (this.playMode) return;                  // performing: board is locked
        e.preventDefault(); e.stopPropagation();
        try { plate.setPointerCapture(e.pointerId); } catch (_) {}
        this._moveDrag = { el: mod, moved: false };
        mod.classList.add('pk-moving');
        this.rack.classList.add('pk-arranging');
      });
      // Double-click the plate to take a module off your board.
      plate.addEventListener('dblclick', e => {
        e.preventDefault(); e.stopPropagation();
        this.hideModule(mod.dataset.pkModule);
      });
    });
    addEventListener('pointermove', e => {
      const d = this._moveDrag;
      if (!d) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const overMod = el && el.closest ? el.closest('[data-pk-module]') : null;
      const overRow = el && el.closest ? el.closest('.pk-row') : null;
      if (overMod && overMod !== d.el) {
        // Live reorder: insert before or after depending on which half of the
        // neighbour we're over, so the board rearranges under the cursor.
        const r = overMod.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        overMod.parentNode.insertBefore(d.el, after ? overMod.nextSibling : overMod);
        d.moved = true;
        this._layout();                             // cables follow the module live
      } else if (overRow && !overMod && overRow !== d.el.parentNode) {
        overRow.appendChild(d.el);                  // dropped onto an empty stretch of rail
        d.moved = true;
        this._layout();
      }
    });
    addEventListener('pointerup', () => {
      const d = this._moveDrag;
      if (!d) return;
      d.el.classList.remove('pk-moving');
      this.rack.classList.remove('pk-arranging');
      this._moveDrag = null;
      if (d.moved) { this._captureOrder(); this._layout(); this._flashHint('board saved'); }
    });

    const tourBtn = this.overlay.querySelector('#pk-tour');
    if (tourBtn) tourBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (this.onTour) this.onTour('patch');
    });

    // board menu
    const boardSel = this.overlay.querySelector('#pk-board');
    boardSel.addEventListener('change', () => {
      const v = boardSel.value;
      boardSel.value = '';
      if (v === 'reset') this.resetBoard();
      else if (v.startsWith('show:')) this.showModule(v.slice(5));
    });
    boardSel.addEventListener('pointerdown', e => e.stopPropagation());

    // knobs
    this.overlay.querySelectorAll('[data-pk-knob]').forEach(k => {
      const id = k.dataset.pkKnob;
      this.setKnob(id, parseFloat(k.dataset.v));
      k.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        // double-press resets to default (native dblclick is suppressed by preventDefault)
        const now = performance.now();
        if (now - (k._lastDown || 0) < 350) { k._lastDown = 0; this.setKnob(id, parseFloat(k.dataset.v)); return; }
        k._lastDown = now;
        try { k.setPointerCapture(e.pointerId); } catch (_) {}
        const y0 = e.clientY, v0 = this.knobs[id];
        const move = ev => this.setKnob(id, v0 + (y0 - ev.clientY) / (ev.shiftKey ? 1500 : 150));
        const up = () => { k.removeEventListener('pointermove', move); k.removeEventListener('pointerup', up); this._lastDragEnd = performance.now(); };
        k.addEventListener('pointermove', move); k.addEventListener('pointerup', up);
      });
      k.addEventListener('wheel', e => { e.preventDefault(); this.setKnob(id, this.knobs[id] - Math.sign(e.deltaY) * .03); }, { passive: false });
      // Right-click = MIDI learn, the way hardware-oriented software does it,
      // instead of hunting for the knob's name in a 40-item dropdown.
      k.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        this._midiLearn(id, k);
      });
    });
    this._refreshMidiBadges();

    // LFO wave selector
    this.overlay.querySelectorAll('[data-pk-wave]').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        this._lfoType = b.dataset.pkWave;
        this.overlay.querySelectorAll('[data-pk-wave]').forEach(x => x.classList.toggle('pk-active', x === b));
        if (this.audio) this.audio.lfo.type = this._lfoType;
      });
    });

    // patch book + save
    this._refreshBook();
    const bookSel = this.overlay.querySelector('#pk-book');
    bookSel.addEventListener('change', () => {
      const v = bookSel.value;
      if (!v) return;
      const [kind, name] = [v.slice(0, 1), v.slice(2)];
      const data = kind === 'r' ? RECIPES[name] : this._savedPatches()[name];
      if (data) { this.applyPatch(data); this._flashHint('loaded \u201c' + name + '\u201d \u2014 Ctrl+Z restores the old patch'); }
    });
    bookSel.addEventListener('pointerdown', e => e.stopPropagation());
    this.overlay.querySelector('#pk-save').addEventListener('click', e => {
      e.stopPropagation();
      const saved = this._savedPatches();
      let n = 1;
      while (saved['patch ' + n]) n++;
      const name = 'patch ' + n;
      saved[name] = this.serialize();
      try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (_) {}
      this._refreshBook();
      this.overlay.querySelector('#pk-book').value = 's:' + name;
      this._flashHint('saved as \u201c' + name + '\u201d');
    });

    // STREAM: start/stop the localhost MJPEG server for OBS / Resolume.
    const streamBtn = this.overlay.querySelector('#pk-stream');
    streamBtn.addEventListener('click', async e => {
      e.stopPropagation();
      const api = window.electronAPI;
      if (!api || !api.streamStart) { this._flashHint('streaming needs the desktop app'); return; }
      if (this._streamUrl) {
        await api.streamStop();
        this._streamUrl = null;
        streamBtn.classList.remove('pk-active');
        streamBtn.textContent = 'STREAM';
        if (this.onFramesWanted) this.onFramesWanted(false);
        this._flashHint('stream stopped');
        return;
      }
      const res = await api.streamStart({});
      if (!res || !res.ok) { this._flashHint('stream failed: ' + ((res && res.error) || 'unknown')); return; }
      this._streamUrl = res.url;
      streamBtn.classList.add('pk-active');
      streamBtn.textContent = 'STREAMING';
      if (this.onFramesWanted) this.onFramesWanted(true);
      this._flashHint('add a Browser source in OBS: ' + res.url);
    });

    // LIGHTS: DMX output toggle lives on the module faceplate.
    const dmxBtn = this.overlay.querySelector('#pk-dmx-btn');
    if (dmxBtn) {
      dmxBtn.addEventListener('click', e => {
        e.stopPropagation();
        const hostEl = this.overlay.querySelector('#pk-dmx-host');
        const on = this.toggleLights({ host: (hostEl && hostEl.value.trim()) || '2.255.255.255', universe: 0 });
        dmxBtn.classList.toggle('pk-active', on);
        dmxBtn.textContent = on ? 'SENDING' : 'SEND DMX';
        this._flashHint(on ? 'Art-Net going to ' + ((hostEl && hostEl.value.trim()) || '2.255.255.255')
                           : 'DMX output stopped');
      });
      const hostEl = this.overlay.querySelector('#pk-dmx-host');
      if (hostEl) hostEl.addEventListener('pointerdown', e => e.stopPropagation());
    }

    // mode toggle + close
    const modeBtn = this.overlay.querySelector('#pk-mode');
    modeBtn.addEventListener('click', e => {
      e.stopPropagation();
      this.playMode = !this.playMode;
      modeBtn.textContent = this.playMode ? 'PLAYING' : 'PATCHING';
      modeBtn.classList.toggle('pk-active', !this.playMode);
      this.hintEl.innerHTML = this.playMode ? this._hintLocked : this._hintIdle;
      // performance view declutters itself: dim the whole cable layer
      // (CSS opacity composites once — per-stroke alpha stacks back up)
      this.cablesCv.style.opacity = this.playMode ? '0.4' : '1';
      if (this._drag) this._endDrag();
    });
    this.overlay.querySelector('#pk-close').addEventListener('click', () => this.onClose && this.onClose());
    document.addEventListener('keydown', e => {
      if (!this.enabled) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (this._learningKnob) { this._cancelLearn(); this._flashHint('learn cancelled'); return; }
        if (this._kbSource) { this._kbCancel(); this._flashHint('cancelled'); return; }
        this.onClose && this.onClose();
      }
      else if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); e.stopPropagation();
        this.undo(); this._flashHint('undone');
      }
    }, true);

    // jack drags (grab anywhere on the port)
    const rackPt = e => { const r = rack.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    this.overlay.querySelectorAll('.pk-jwrap').forEach(w => {
      const jk = w.querySelector('[data-pk-jack]');
      if (!jk) return;
      w.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { w.setPointerCapture(e.pointerId); } catch (_) {}
        this._layout();
        const p = rackPt(e);
        this._drag = { fromId: jk.dataset.pkJack, x: p.x, y: p.y, sx: p.x, sy: p.y };
        if (!this.playMode) {
          rack.classList.add('pk-dragging');
          const dir = jk.dataset.dir;
          for (const id in this.jackEls) {
            if (id === this._drag.fromId) this.jackEls[id].classList.add('pk-drag-src');
            else if (this.jackEls[id].dataset.dir !== dir) this.jackEls[id].classList.add('pk-target');
          }
          this.hintEl.innerHTML = 'release on any <b>pulsing port</b> &mdash; direction doesn&#39;t matter';
        }
      });
    });
    addEventListener('pointermove', e => { if (this._drag) { const p = rackPt(e); this._drag.x = p.x; this._drag.y = p.y; } });
    addEventListener('pointercancel', () => { if (this._drag) this._endDrag(); });
    addEventListener('pointerup', e => {
      if (!this._drag) return;
      const p = rackPt(e);
      // a plain click is a PROBE, not a patch
      if (Math.hypot(p.x - this._drag.sx, p.y - this._drag.sy) < 12) { this.toggleProbe(this._drag.fromId); this._endDrag(); return; }
      if (this.playMode) { this._endDrag(); return; }
      const srcDir = this.jackEls[this._drag.fromId].dataset.dir;
      let best = null, bestD = 46 * 46;                  // forgiving drop radius
      for (const id in this.jackEls) {
        if (id === this._drag.fromId || this.jackEls[id].dataset.dir === srcDir) continue;
        const q = this.jackPos[id];
        const d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y);
        if (d < bestD) { bestD = d; best = id; }
      }
      if (best) {
        this._pushUndo();
        const from = srcDir === 'out' ? this._drag.fromId : best;
        const to = srcDir === 'out' ? best : this._drag.fromId;
        this.connect(from, to);
      }
      this._endDrag();
    });

    // cable hover + click-to-unplug
    rack.addEventListener('pointermove', e => {
      if (this._drag || !this.enabled) { this._hoverIdx = -1; rack.style.cursor = ''; return; }
      const p = rackPt(e);
      this._hoverIdx = this._hitCable(p);
      rack.style.cursor = this._hoverIdx >= 0 ? 'pointer' : '';
    });
    rack.addEventListener('click', e => {
      if (!this.enabled || this.playMode) return;
      if (performance.now() - this._lastDragEnd < 400) return;   // ignore the click a drag leaves behind
      const i = this._hitCable(rackPt(e));
      if (i >= 0) { this._pushUndo(); this.removeCable(i); this._flashHint('unplugged \u2014 Ctrl+Z to undo'); }
    });
    addEventListener('resize', () => { if (this.enabled) this._layout(); });
  }

  // ── MIDI learn ──────────────────────────────────────────────
  _midiLearn(id, knobEl) {
    const mapper = this.inputMap;
    if (!mapper || !mapper.enableMidi) { this._flashHint('MIDI is not available'); return; }
    if (this._learningKnob) this._cancelLearn();
    this._learningKnob = { id, el: knobEl };
    knobEl.classList.add('pk-learning');
    this._flashHint('move a knob on your controller \u2014 Esc cancels');
    mapper.enableMidi().then(ok => {
      if (ok === false) { this._cancelLearn(); this._flashHint('no MIDI device found'); return; }
      if (!this._learningKnob) return;                 // cancelled while waiting
      mapper.startMidiLearn(({ channel, cc }) => {
        if (!this._learningKnob) return;
        mapper.bindMidi(channel, cc, { type: 'continuous', target: 'patch.' + id });
        this._cancelLearn();
        this._refreshMidiBadges();
        this._flashHint('bound CC ' + cc + ' \u2192 ' + id);
      });
    }).catch(() => { this._cancelLearn(); this._flashHint('MIDI unavailable'); });
  }

  _cancelLearn() {
    if (this._learningKnob) this._learningKnob.el.classList.remove('pk-learning');
    this._learningKnob = null;
    if (this.inputMap && this.inputMap.startMidiLearn) this.inputMap.startMidiLearn(null);
  }

  // Show which hardware CC drives each knob, so a board stays readable.
  _refreshMidiBadges() {
    if (!this.inputMap || !this.inputMap.getMidiBindings) return;
    const binds = this.inputMap.getMidiBindings() || {};
    const byTarget = {};
    for (const key in binds) {
      const a = binds[key];
      if (a && a.type === 'continuous' && typeof a.target === 'string' && a.target.startsWith('patch.')) {
        byTarget[a.target.slice(6)] = key.split(':')[1];
      }
    }
    this.overlay.querySelectorAll('[data-pk-knob]').forEach(k => {
      const cc = byTarget[k.dataset.pkKnob];
      k.classList.toggle('pk-bound', !!cc);
      let b = k.querySelector('.pk-cc');
      if (cc) {
        if (!b) { b = document.createElement('span'); b.className = 'pk-cc'; k.appendChild(b); }
        b.textContent = 'CC' + cc;
      } else if (b) { b.remove(); }
    });
  }

  // ── Keyboard access ─────────────────────────────────────────
  // The rack was mouse-only. Tab reaches every knob and jack; arrows turn a
  // knob; Enter picks a jack then lands the cable on the next one. Patching
  // is inherently a two-point gesture, so keyboard patching is two presses.
  _bindKeyboard() {
    this.overlay.querySelectorAll('[data-pk-knob]').forEach(k => {
      const id = k.dataset.pkKnob;
      k.addEventListener('keydown', e => {
        const fine = e.shiftKey ? 0.002 : 0.02;
        let d = 0;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') d = fine;
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') d = -fine;
        else if (e.key === 'PageUp') d = 0.1;
        else if (e.key === 'PageDown') d = -0.1;
        else if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); this.setKnob(id, parseFloat(k.dataset.v)); return; }
        else return;
        e.preventDefault(); e.stopPropagation();
        this.setKnob(id, this.knobs[id] + d);
      });
    });

    this.overlay.querySelectorAll('[data-pk-jack]').forEach(j => {
      const id = j.dataset.pkJack;
      j.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); e.stopPropagation();
          this._kbPick(id);
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault(); e.stopPropagation();
          const i = this.cables.findIndex(c => c.from === id || c.to === id);
          if (i >= 0 && !this.playMode) {
            this._pushUndo(); this.removeCable(i);
            this._flashHint('unplugged \u2014 Ctrl+Z to undo');
          }
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault(); e.stopPropagation();
          this.toggleProbe(id);
        }
      });
    });
  }

  // First press picks a source, second press completes the patch.
  _kbPick(id) {
    if (this.playMode) { this.toggleProbe(id); return; }
    if (!this._kbSource) {
      this._kbSource = id;
      this._refreshJacks();
      this._flashHint('pick a matching port to patch, or Esc to cancel');
      return;
    }
    if (this._kbSource === id) { this._kbCancel(); this.toggleProbe(id); return; }
    const a = this._kbSource, b = id;
    const da = this.jackEls[a].dataset.dir, db = this.jackEls[b].dataset.dir;
    this._kbSource = null;
    if (da === db) { this._refreshJacks(); this._flashHint('those are both ' + da + 'puts'); return; }
    this._pushUndo();
    this.connect(da === 'out' ? a : b, da === 'out' ? b : a);
    this._flashHint('patched');
  }

  _kbCancel() {
    if (!this._kbSource) return;
    this._kbSource = null;
    this._refreshJacks();
  }

  // Plug a cable in, visibly, so the first thing anyone sees is the gesture
  // being performed rather than described. One cable, one effect, and a result
  // you can watch on the scope: the LFO taking hold of the volume.
  demoPatch(fromId, toId, onDone) {
    if (!this.enabled || !this.jackPos[fromId] || !this.jackPos[toId]) { if (onDone) onDone(false); return false; }
    if (this.cables.some(c => c.to === toId)) { if (onDone) onDone(false); return false; }
    this._demo = { from: fromId, to: toId, t0: performance.now(), dur: 1500, onDone };
    this.jackEls[fromId].classList.add('pk-demo-end');
    this.jackEls[toId].classList.add('pk-demo-end');
    return true;
  }

  _tickDemo() {
    const d = this._demo;
    if (!d) return;
    const p = Math.min(1, (performance.now() - d.t0) / d.dur);
    // ease-out so the plug decelerates into the socket like a hand would
    const e = 1 - Math.pow(1 - p, 3);
    const a = this.jackPos[d.from], b = this.jackPos[d.to];
    d.tip = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    if (p >= 1) {
      this.jackEls[d.from].classList.remove('pk-demo-end');
      this.jackEls[d.to].classList.remove('pk-demo-end');
      this._demo = null;
      this._pushUndo();                       // Ctrl+Z takes the demo back out
      this.connect(d.from, d.to);
      this._flashHint('that is all a patch is \u2014 Ctrl+Z removes it');
      if (d.onDone) d.onDone(true);
    }
  }

  _endDrag() {
    this.rack.classList.remove('pk-dragging');
    for (const id in this.jackEls) this.jackEls[id].classList.remove('pk-target', 'pk-drag-src');
    this.hintEl.innerHTML = this.playMode ? this._hintLocked : this._hintIdle;
    this._drag = null;
    this._lastDragEnd = performance.now();
  }

  _hitCable(p) {
    for (let i = 0; i < this.cables.length; i++) {
      const pts = this._cablePts(this.jackPos[this.cables[i].from], this.jackPos[this.cables[i].to], 40);
      for (const q of pts) {
        if ((q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y) < 100) return i;
      }
    }
    return -1;
  }

  // ── Rendering ───────────────────────────────────────────────
  _layout() {
    const r = this.rack.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.cablesCv.style.width = r.width + 'px'; this.cablesCv.style.height = r.height + 'px';
    this.cablesCv.width = Math.round(r.width * dpr); this.cablesCv.height = Math.round(r.height * dpr);
    this.cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const id in this.jackEls) {
      const j = this.jackEls[id].getBoundingClientRect();
      this.jackPos[id] = { x: j.left - r.left + j.width / 2, y: j.top - r.top + j.height / 2 };
    }
  }

  _cablePts(a, b, n) {
    const sag = Math.min(90, Math.hypot(b.x - a.x, b.y - a.y) * 0.15 + 28);
    const c1 = { x: a.x + (b.x - a.x) * 0.25, y: a.y + sag };
    const c2 = { x: a.x + (b.x - a.x) * 0.75, y: b.y + sag };
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push({
        x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
      });
    }
    return pts;
  }

  _drawCable(a, b, kind, tapRef, idx, hovered) {
    const cctx = this.cctx;
    const N = 64, pts = this._cablePts(a, b, N);
    const col = kind === 'cv' ? '255,179,0' : '0,255,65';
    cctx.lineWidth = 5; cctx.lineCap = 'round'; cctx.lineJoin = 'round';
    cctx.strokeStyle = kind === 'cv' ? '#2b2008' : '#0a2312';
    cctx.beginPath();
    pts.forEach((p, i) => i ? cctx.lineTo(p.x, p.y) : cctx.moveTo(p.x, p.y));
    cctx.stroke();
    let buf = null;
    if (tapRef) { tapRef.analyser.getFloatTimeDomainData(tapRef.buf); buf = tapRef.buf; }
    cctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const s = buf ? buf[Math.floor(t * (buf.length - 1))] : 0;
      const amp = (kind === 'cv' ? 13 : 16) * Math.sin(Math.PI * t);
      const p = pts[i], q = pts[Math.min(i + 1, N)], pr = pts[Math.max(i - 1, 0)];
      const dx = q.x - pr.x, dy = q.y - pr.y, len = Math.hypot(dx, dy) || 1;
      const off = s * amp;
      const x = p.x + (-dy / len) * off, y = p.y + (dx / len) * off;
      i ? cctx.lineTo(x, y) : cctx.moveTo(x, y);
    }
    cctx.shadowColor = 'rgb(' + col + ')'; cctx.shadowBlur = hovered ? 14 : 9;
    cctx.strokeStyle = 'rgba(' + col + ',' + (hovered ? 1 : 0.9) + ')';
    cctx.lineWidth = hovered ? 2.8 : 1.6;
    if (kind === 'cv') cctx.setLineDash([7, 5]);          // modulation reads as dashed, not just amber
    cctx.stroke();
    cctx.setLineDash([]);
    cctx.shadowBlur = 0;
    if (idx >= 0) {                                      // direction dot: out -> in
      const tp = this._reducedMotion ? 0.6 : ((performance.now() / 1600) + idx * 0.37) % 1;
      const dp = pts[Math.round(tp * N)];
      cctx.fillStyle = 'rgba(' + col + ',0.95)';
      cctx.shadowColor = 'rgb(' + col + ')'; cctx.shadowBlur = 8;
      cctx.beginPath(); cctx.arc(dp.x, dp.y, 2.6, 0, 7); cctx.fill();
      cctx.shadowBlur = 0;
    }
    for (const e of [a, b]) {                            // plug boots
      cctx.fillStyle = '#0c0e0d';
      cctx.beginPath(); cctx.arc(e.x, e.y, 7, 0, 7); cctx.fill();
      cctx.strokeStyle = 'rgba(' + col + ',0.8)'; cctx.lineWidth = 2;
      cctx.beginPath(); cctx.arc(e.x, e.y, 5, 0, 7); cctx.stroke();
    }
  }

  _startLoop() {
    this._reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = () => {
      if (!this.enabled) { this._raf = 0; return; }
      const r = this.rack.getBoundingClientRect();
      this.cctx.clearRect(0, 0, r.width, r.height);
      this.cables.forEach((c, i) => this._drawCable(this.jackPos[c.from], this.jackPos[c.to], c.kind, this.taps[c.from], i, i === this._hoverIdx));
      if (this._demo) {
      this._tickDemo();
      if (this._demo) {
        const from = this.jackPos[this._demo.from];
        this.cctx.globalAlpha = 0.9;
        this._drawCable(from, this._demo.tip, this.jackEls[this._demo.from].dataset.kind, null, -1, true);
        this.cctx.globalAlpha = 1;
      }
    }
    if (this._drag && !this.playMode) {
        const from = this.jackPos[this._drag.fromId];
        this.cctx.globalAlpha = 0.6;
        this._drawCable(from, { x: this._drag.x, y: this._drag.y }, this.jackEls[this._drag.fromId].dataset.kind, null, -1, false);
        this.cctx.globalAlpha = 1;
      }
      this._pumpLights();
      if (!this._warnNext || performance.now() > this._warnNext) {   // time-based: frame rate varies
        this._warnNext = performance.now() + 800;
        const w = this.overlay.querySelector('#pk-warn');
        if (w) w.classList.toggle('pk-show', !!(this.engine.micStream || this.engine.sysAudioActive));
      }
      const led = this.overlay.querySelector('#pk-led-input');
      if (led && this.taps['input.out']) {
        const t = this.taps['input.out'];
        t.analyser.getFloatTimeDomainData(t.buf);
        let peak = 0, sum = 0, n = 0;
        for (let i = 0; i < t.buf.length; i += 8) { const v = t.buf[i]; peak = Math.max(peak, Math.abs(v)); sum += v * v; n++; }
        led.className = 'pk-led' + (peak > 0.01 ? ' pk-on-green' : '');
        if (this._beat && this._beat.detect(Math.sqrt(sum / n)).beat) this._firePulse();
        const pled = this.overlay.querySelector('#pk-led-pulse');
        if (pled) pled.className = 'pk-led' + (performance.now() < (this._pulseLedUntil || 0) ? ' pk-on-amber' : '');
      }
      this._raf = requestAnimationFrame(frame);
    };
    if (!this._raf) this._raf = requestAnimationFrame(frame);
  }

  _stopLoop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
  }
}

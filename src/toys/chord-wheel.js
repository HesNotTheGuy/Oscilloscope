'use strict';

import {
  RATIO_TABLE,
  SLIDER_MAX,
  angleRadians,
  clampSpeed,
  formatHz,
  formatSpeed,
  headline,
  multiplierFromSlider,
  ratioById,
  ringRatesHz,
  sliderFromMultiplier,
  slowestHz,
  voiceKind,
} from './chord-ratios.js';
import { LookAheadScheduler } from './look-ahead-scheduler.js';
import { ChordVoice } from './chord-voice.js';

const TAU = Math.PI * 2;
const LOOK_AHEAD = 0.1;
const PUMP_MS = 25;

function secondsSinceDot(now, origin, speed, pulses, dot) {
  const turn = 1 / speed;
  const first = origin + (dot / pulses) * turn;
  if (now < first) return Infinity;
  const k = Math.floor((now - first) / turn + 1e-9);
  return now - (first + k * turn);
}

export function mountChordWheel(stage, hooks) {
  const wrap = document.createElement('div');
  wrap.className = 'ty-wheel';
  const canvas = document.createElement('canvas');
  canvas.id = 'chord-wheel-canvas';
  canvas.className = 'ty-wheel-canvas';
  canvas.setAttribute('aria-label', 'Chord wheel');
  const readout = document.createElement('div');
  readout.className = 'ty-wheel-readout';
  const titleEl = document.createElement('div');
  titleEl.id = 'chord-wheel-title';
  const ratioEl = document.createElement('div');
  ratioEl.id = 'chord-wheel-ratio';
  const speedText = document.createElement('div');
  speedText.id = 'chord-wheel-center-speed';
  const hzEl = document.createElement('div');
  hzEl.id = 'chord-wheel-hz';
  readout.append(titleEl, ratioEl, speedText, hzEl);
  wrap.append(canvas, readout);
  stage.appendChild(wrap);

  const controls = hooks && hooks.controls;
  const speedGroup = document.createElement('div');
  speedGroup.className = 'ty-speed';
  const speedLabel = document.createElement('div');
  speedLabel.className = 'knob-label';
  speedLabel.textContent = 'SPEED';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'chord-wheel-speed';
  slider.min = '0';
  slider.max = String(SLIDER_MAX);
  slider.step = '1';
  slider.value = String(sliderFromMultiplier(1));
  const speedValue = document.createElement('div');
  speedValue.id = 'chord-wheel-speed-value';
  speedValue.textContent = formatSpeed(1);
  speedGroup.append(speedLabel, slider, speedValue);

  const ratios = document.createElement('div');
  ratios.className = 'ty-ratios';
  if (controls) controls.append(speedGroup, ratios);

  let ratio = ratioById('4:5:6');
  let speed = 1;
  let origin = 0;
  let running = false;
  let voice = null;
  let raf = 0;
  let timer = 0;
  const gfx = canvas.getContext('2d', { alpha: false });

  function audioNodes() {
    if (!hooks || !hooks.audio) return null;
    return hooks.audio();
  }

  const clock = {
    now() {
      const nodes = audioNodes();
      if (nodes && nodes.actx) return nodes.actx.currentTime;
      return performance.now() / 1000;
    },
  };

  const scheduler = new LookAheadScheduler({
    clock,
    lookAhead: LOOK_AHEAD,
    onSchedule(ring, time) {
      if (voice) voice.scheduleClick(ring, time);
    },
  });

  function paintText() {
    const rates = ringRatesHz(ratio.pulses, speed);
    titleEl.textContent = headline(slowestHz(ratio.pulses, speed), ratio.name);
    ratioEl.textContent = ratio.id;
    const shown = formatSpeed(speed);
    speedText.textContent = shown;
    speedValue.textContent = shown;
    hzEl.textContent = formatHz(rates);
  }

  function pushPattern() {
    if (voice) voice.setRates(ringRatesHz(ratio.pulses, speed));
    if (running) scheduler.setPattern({ pulses: ratio.pulses, speed, origin });
  }

  function applySpeed(next) {
    const clamped = clampSpeed(next);
    if (running && clamped !== speed) {
      const now = clock.now();
      const turns = (now - origin) * speed;
      speed = clamped;
      origin = now - turns / speed;
    } else {
      speed = clamped;
    }
    paintText();
    pushPattern();
  }

  function setRatioId(id) {
    ratio = ratioById(id);
    markRatios();
    paintText();
    pushPattern();
  }

  function markRatios() {
    const buttons = ratios.querySelectorAll('.ty-ratio');
    for (const btn of buttons) {
      const on = btn.dataset.ratio === ratio.id;
      btn.classList.toggle('ty-ratio-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  for (const row of RATIO_TABLE) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ty-ratio';
    btn.dataset.ratio = row.id;
    btn.textContent = row.id;
    btn.addEventListener('click', () => setRatioId(row.id));
    ratios.appendChild(btn);
  }
  markRatios();

  slider.addEventListener('input', () => {
    applySpeed(multiplierFromSlider(slider.value));
  });

  function draw() {
    if (!gfx) return;
    const dpr = globalThis.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width || 0;
    const h = canvas.clientHeight || canvas.height || 0;
    if (w < 2 || h < 2) return;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    gfx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gfx.fillStyle = '#05060a';
    gfx.fillRect(0, 0, w, h);

    const now = running ? clock.now() : origin;
    const pulses = ratio.pulses;
    const colors = ratio.colors;
    const fused = voiceKind(slowestHz(pulses, speed)) === 'tone';
    const minSide = Math.min(w, h);
    const outer = minSide * 0.44;
    const inner = Math.min(outer * 0.42, Math.max(54, minSide * 0.15));
    const cx = w / 2;
    const cy = h / 2;
    const hand = angleRadians(now, origin, speed) - Math.PI / 2;

    for (let i = 0; i < pulses.length; i++) {
      const n = pulses[i];
      const color = colors[i] || colors[colors.length - 1];
      const radius = pulses.length === 1
        ? (inner + outer) / 2
        : inner + (outer - inner) * (i / (pulses.length - 1));
      gfx.beginPath();
      gfx.lineWidth = 1;
      gfx.strokeStyle = color;
      gfx.globalAlpha = fused ? 0.25 : 0.45;
      gfx.arc(cx, cy, radius, 0, TAU);
      gfx.stroke();
      gfx.globalAlpha = 1;

      if (fused) {
        gfx.save();
        gfx.shadowColor = color;
        gfx.shadowBlur = 16;
        gfx.strokeStyle = color;
        gfx.lineWidth = 7;
        gfx.globalAlpha = 0.9;
        gfx.beginPath();
        gfx.arc(cx, cy, radius, 0, TAU);
        gfx.stroke();
        gfx.restore();
        continue;
      }

      for (let k = 0; k < n; k++) {
        const age = secondsSinceDot(now, origin, speed, n, k);
        const hot = Number.isFinite(age) ? Math.exp(-age / 0.18) : 0;
        const ang = (k / n) * TAU - Math.PI / 2;
        const x = cx + Math.cos(ang) * radius;
        const y = cy + Math.sin(ang) * radius;
        gfx.save();
        gfx.shadowColor = color;
        gfx.shadowBlur = 6 + 26 * hot;
        gfx.fillStyle = color;
        gfx.globalAlpha = 0.45 + 0.55 * hot;
        gfx.beginPath();
        gfx.arc(x, y, 3 + 7 * hot, 0, TAU);
        gfx.fill();
        gfx.restore();
      }
    }

    gfx.beginPath();
    gfx.strokeStyle = '#f7f7f7';
    gfx.lineWidth = 2;
    gfx.lineCap = 'round';
    gfx.moveTo(cx, cy);
    gfx.lineTo(cx + Math.cos(hand) * (outer + 10), cy + Math.sin(hand) * (outer + 10));
    gfx.stroke();
    gfx.beginPath();
    gfx.fillStyle = '#f7f7f7';
    gfx.arc(cx, cy, 3, 0, TAU);
    gfx.fill();
  }

  function loop() {
    if (!running) return;
    scheduler.tick();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function wake() {
    if (!running) return;
    scheduler.tick();
    timer = setTimeout(wake, PUMP_MS);
  }

  function start() {
    if (running) return;
    const nodes = audioNodes();
    if (nodes && nodes.actx && nodes.dest) voice = new ChordVoice(nodes);
    running = true;
    origin = clock.now();
    pushPattern();
    loop();
    wake();
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (timer) clearTimeout(timer);
    timer = 0;
    if (voice) {
      voice.dispose();
      voice = null;
    }
  }

  function dispose() {
    stop();
    wrap.remove();
    if (controls) controls.replaceChildren();
  }

  paintText();
  draw();

  return {
    start,
    stop,
    dispose,
    setSpeed(raw) {
      const next = clampSpeed(raw);
      slider.value = String(sliderFromMultiplier(next));
      applySpeed(next);
    },
    setRatioId,
    title() { return titleEl.textContent; },
    hz() { return hzEl.textContent; },
    speed() { return speed; },
    ratioId() { return ratio.id; },
  };
}

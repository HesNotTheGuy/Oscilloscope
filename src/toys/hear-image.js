'use strict';

import {
  formatVoices,
  paintSwatches,
  voiceLabel,
  voicesForColumn,
} from './hear-image-voices.js';
import {
  FRAME,
  PRESETS,
  exhibitColumn,
  paintPreset,
  stampBand,
  stampDisc,
  stampStripe,
} from './hear-image-presets.js';
import { createVoiceBank } from './hear-image-bank.js';

const SPEED_MIN = 0;
const SPEED_MAX = 80;
const SPEED_DEFAULT = 24;
const BRUSH_DEFAULT = 8;
const BRUSH_MAX = 48;
const DT_CAP_SEC = 0.1;
const WAVE_BINS = 1024;
const TOOLS = [
  { id: 'disk', label: 'Disk' },
  { id: 'band', label: 'Band' },
  { id: 'stripe', label: 'Stripe' },
];

export function mountHearImage(stage, hooks) {
  const controls = hooks && hooks.controls;
  const root = document.createElement('div');
  root.id = 'hear-image';

  const picture = document.createElement('canvas');
  picture.id = 'hear-image-picture';
  picture.setAttribute('aria-label', 'Hear an image');
  const wave = document.createElement('canvas');
  wave.id = 'hear-image-wave';
  wave.setAttribute('aria-hidden', 'true');
  const legend = document.createElement('div');
  legend.id = 'hear-image-legend';
  root.append(picture, wave, legend);
  stage.appendChild(root);

  const gfx = picture.getContext('2d');
  const waveGfx = wave.getContext('2d');
  const source = document.createElement('canvas');
  source.width = FRAME.width;
  source.height = FRAME.height;
  const sourceGfx = source.getContext('2d', { alpha: false });
  const waveBytes = new Uint8Array(WAVE_BINS);

  const speedInput = document.createElement('input');
  speedInput.type = 'range';
  speedInput.id = 'hear-image-speed';
  speedInput.min = String(SPEED_MIN);
  speedInput.max = String(SPEED_MAX);
  speedInput.step = '1';
  speedInput.value = String(SPEED_DEFAULT);
  const speedValue = document.createElement('div');
  speedValue.id = 'hear-image-speed-value';

  const brushInput = document.createElement('input');
  brushInput.type = 'range';
  brushInput.id = 'hear-image-brush';
  brushInput.min = '1';
  brushInput.max = String(BRUSH_MAX);
  brushInput.step = '1';
  brushInput.value = String(BRUSH_DEFAULT);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'hear-image-file';
  fileInput.accept = 'image/*';

  const presetButtons = [];
  const toolButtons = [];
  const swatchButtons = [];

  if (controls) {
    const speedGroup = document.createElement('div');
    speedGroup.className = 'ty-speed';
    const speedLabel = document.createElement('div');
    speedLabel.className = 'knob-label';
    speedLabel.textContent = 'SPEED';
    speedGroup.append(speedLabel, speedInput, speedValue);
    controls.appendChild(speedGroup);

    for (const preset of PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'hear-image-preset-' + preset.id;
      btn.dataset.preset = preset.id;
      btn.textContent = preset.label;
      btn.addEventListener('click', () => setPreset(preset.id));
      presetButtons.push(btn);
      controls.appendChild(btn);
    }

    for (const tool of TOOLS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'hear-image-tool-' + tool.id;
      btn.dataset.tool = tool.id;
      btn.textContent = tool.label;
      btn.addEventListener('click', () => selectTool(tool.id));
      toolButtons.push(btn);
      controls.appendChild(btn);
    }

    for (const swatch of paintSwatches()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'hear-image-swatch-' + swatch.id;
      btn.dataset.swatch = swatch.id;
      btn.style.background = swatch.css;
      btn.setAttribute('aria-label', swatch.id);
      btn.addEventListener('click', () => selectSwatch(swatch));
      swatchButtons.push(btn);
      controls.appendChild(btn);
    }

    const brushGroup = document.createElement('div');
    brushGroup.className = 'ty-speed';
    const brushLabel = document.createElement('div');
    brushLabel.className = 'knob-label';
    brushLabel.textContent = 'BRUSH';
    brushGroup.append(brushLabel, brushInput);
    controls.append(brushGroup, fileInput);
  }

  let buffer = paintPreset('vertical-stripes', FRAME.width, FRAME.height);
  let presetId = 'vertical-stripes';
  let x = exhibitColumn(presetId, buffer.width);
  let speed = SPEED_DEFAULT;
  let voices = [];
  let bank = null;
  let running = false;
  let disposed = false;
  let raf = 0;
  let lastStamp = null;
  let loadGen = 0;
  let tool = 'disk';
  let brushRadius = BRUSH_DEFAULT;
  let brushRgb = paintSwatches()[0];

  function audioNodes() {
    if (!hooks || typeof hooks.audio !== 'function') return null;
    return hooks.audio();
  }

  function clockSeconds() {
    const nodes = audioNodes();
    if (nodes && nodes.actx && Number.isFinite(nodes.actx.currentTime)) return nodes.actx.currentTime;
    return performance.now() / 1000;
  }

  function writeSpeed() {
    speedInput.value = String(speed);
    speedValue.textContent = formatSpeed(speed);
  }

  function press(buttons, on) {
    for (const btn of buttons) {
      btn.setAttribute('aria-pressed', on(btn) ? 'true' : 'false');
    }
  }

  function markPresets() {
    press(presetButtons, (btn) => btn.dataset.preset === presetId);
  }

  function selectTool(id) {
    tool = id;
    press(toolButtons, (btn) => btn.dataset.tool === tool);
  }

  function selectSwatch(swatch) {
    brushRgb = swatch;
    press(swatchButtons, (btn) => btn.dataset.swatch === swatch.id);
  }

  function blit() {
    if (!sourceGfx) return;
    if (source.width !== buffer.width || source.height !== buffer.height) {
      source.width = buffer.width;
      source.height = buffer.height;
    }
    sourceGfx.putImageData(new ImageData(buffer.data, buffer.width, buffer.height), 0, 0);
  }

  function paintLegend() {
    legend.replaceChildren();
    if (voices.length === 0) {
      legend.textContent = 'silence';
      return;
    }
    for (const voice of voices) {
      const row = document.createElement('span');
      const chip = document.createElement('i');
      chip.style.background = voice.css;
      row.append(chip, document.createTextNode(voiceLabel(voice)));
      legend.appendChild(row);
    }
  }

  function publishColumn() {
    const col = Math.min(buffer.width - 1, Math.max(0, Math.floor(x)));
    voices = voicesForColumn(buffer, col);
    if (bank) bank.apply(voices, clockSeconds());
    paintLegend();
    if (hooks && hooks.readout) hooks.readout.textContent = formatVoices(voices);
  }

  function commitBuffer(next, nextPreset, nextX) {
    buffer = next;
    presetId = nextPreset;
    if (nextX != null) x = nextX;
    markPresets();
    blit();
    publishColumn();
    draw();
  }

  function setPreset(id) {
    const painted = paintPreset(id, FRAME.width, FRAME.height);
    commitBuffer(painted, id, exhibitColumn(id, painted.width));
  }

  function setPlayhead(raw) {
    let col = Math.floor(Number(raw));
    if (!Number.isFinite(col)) col = 0;
    if (col < 0) col = 0;
    if (col > buffer.width - 1) col = buffer.width - 1;
    x = col;
    publishColumn();
    draw();
  }

  function setSpeed(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) speed = SPEED_DEFAULT;
    else if (n < SPEED_MIN) speed = SPEED_MIN;
    else if (n > SPEED_MAX) speed = SPEED_MAX;
    else speed = n;
    writeSpeed();
  }

  function fit(canvas, context) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2 || !context) return null;
    const dpr = globalThis.devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function pictureRect(w, h) {
    const scale = Math.min(w / buffer.width, h / buffer.height);
    const dw = buffer.width * scale;
    const dh = buffer.height * scale;
    return {
      ox: (w - dw) / 2,
      oy: (h - dh) / 2,
      dw,
      dh,
    };
  }

  function paintPicture() {
    const box = fit(picture, gfx);
    if (!box || !sourceGfx) return;
    gfx.imageSmoothingEnabled = false;
    gfx.fillStyle = '#070807';
    gfx.fillRect(0, 0, box.w, box.h);
    const placed = pictureRect(box.w, box.h);
    gfx.drawImage(source, placed.ox, placed.oy, placed.dw, placed.dh);
    const col = Math.min(buffer.width - 1, Math.max(0, Math.floor(x)));
    const px = placed.ox + (col + 0.5) * placed.dw / buffer.width;
    gfx.strokeStyle = '#f4f4f4';
    gfx.lineWidth = 1;
    gfx.beginPath();
    gfx.moveTo(px, placed.oy);
    gfx.lineTo(px, placed.oy + placed.dh);
    gfx.stroke();
  }

  function paintWave() {
    const box = fit(wave, waveGfx);
    if (!box) return;
    waveGfx.fillStyle = '#05060a';
    waveGfx.fillRect(0, 0, box.w, box.h);
    if (!bank) return;
    bank.timeDomain(waveBytes);
    waveGfx.beginPath();
    waveGfx.strokeStyle = '#d5ffd0';
    waveGfx.lineWidth = 1;
    const last = waveBytes.length - 1;
    for (let i = 0; i < waveBytes.length; i++) {
      const px = (i / last) * box.w;
      const py = box.h - (waveBytes[i] / 255) * box.h;
      if (i === 0) waveGfx.moveTo(px, py);
      else waveGfx.lineTo(px, py);
    }
    waveGfx.stroke();
  }

  function draw() {
    paintPicture();
    paintWave();
  }

  function stepPlayhead() {
    const now = clockSeconds();
    if (lastStamp == null) {
      lastStamp = now;
      return;
    }
    let dt = now - lastStamp;
    lastStamp = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    const prev = Math.floor(x);
    const width = buffer.width;
    x += Math.min(dt, DT_CAP_SEC) * speed;
    if (width > 0) {
      x %= width;
      if (x < 0) x += width;
    }
    if (Math.floor(x) !== prev) publishColumn();
  }

  function frame() {
    if (!running) return;
    stepPlayhead();
    draw();
    if (!running) return;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (disposed || running) return;
    const nodes = audioNodes();
    if (nodes && nodes.actx && nodes.dest) bank = createVoiceBank(nodes);
    running = true;
    lastStamp = null;
    publishColumn();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastStamp = null;
    if (bank) {
      bank.dispose();
      bank = null;
    }
  }

  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
    loadGen += 1;
    root.remove();
    if (controls) controls.replaceChildren();
  }

  function pointerPixel(ev) {
    const rect = picture.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    const placed = pictureRect(rect.width, rect.height);
    const lx = ev.clientX - rect.left;
    const ly = ev.clientY - rect.top;
    if (lx < placed.ox || ly < placed.oy || lx >= placed.ox + placed.dw || ly >= placed.oy + placed.dh) {
      return null;
    }
    const px = Math.floor((lx - placed.ox) / placed.dw * buffer.width);
    const py = Math.floor((ly - placed.oy) / placed.dh * buffer.height);
    if (px < 0 || py < 0 || px >= buffer.width || py >= buffer.height) return null;
    return { px, py };
  }

  function stampAt(px, py) {
    const thick = Math.max(1, Math.round(brushRadius));
    if (tool === 'band') stampBand(buffer, py - Math.floor((thick - 1) / 2), thick, brushRgb);
    else if (tool === 'stripe') stampStripe(buffer, px - Math.floor((thick - 1) / 2), thick, brushRgb);
    else stampDisc(buffer, px, py, brushRadius, brushRgb);
    commitBuffer(buffer, 'custom', null);
  }

  picture.addEventListener('pointerdown', (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    const hit = pointerPixel(ev);
    if (!hit) return;
    if (ev.preventDefault) ev.preventDefault();
    stampAt(hit.px, hit.py);
  });

  speedInput.addEventListener('input', () => setSpeed(speedInput.value));
  brushInput.addEventListener('input', () => {
    const n = Math.round(Number(brushInput.value));
    if (!Number.isFinite(n)) return;
    brushRadius = Math.min(BRUSH_MAX, Math.max(1, n));
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (!file.type || file.type.indexOf('image/') !== 0) {
      if (hooks && hooks.readout) hooks.readout.textContent = 'Need an image file.';
      return;
    }
    const gen = ++loadGen;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        if (disposed || gen !== loadGen || !img.width || !img.height) return;
        commitBuffer(flattenContain(img), 'custom', 0);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  writeSpeed();
  selectTool(tool);
  selectSwatch(brushRgb);
  markPresets();
  blit();
  publishColumn();

  return {
    start,
    stop,
    dispose,
    setPreset,
    preset() { return presetId; },
    setSpeed,
    speed() { return speed; },
    setPlayhead,
    playheadX() { return Math.floor(x); },
    columnVoices() { return voices; },
  };
}

function formatSpeed(speed) {
  const shown = Number.isInteger(speed) ? String(speed) : String(Math.round(speed * 10) / 10);
  return shown + ' col/s';
}

function flattenContain(img) {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME.width;
  canvas.height = FRAME.height;
  const g = canvas.getContext('2d', { alpha: false });
  g.fillStyle = '#000000';
  g.fillRect(0, 0, FRAME.width, FRAME.height);
  const scale = Math.min(FRAME.width / img.width, FRAME.height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  g.drawImage(img, (FRAME.width - w) / 2, (FRAME.height - h) / 2, w, h);
  const image = g.getImageData(0, 0, FRAME.width, FRAME.height);
  const data = image.data;
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { data, width: FRAME.width, height: FRAME.height };
}

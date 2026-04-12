'use strict';

import { Knob } from './knob.js';
import { PresetManager } from './preset-manager.js';
import { TIMEBASE, VDIV, TB_DEFAULT, VD_DEFAULT, LISSAJOUS_RATIOS } from './constants.js';

export class UIController {
  constructor(engine, scope, sigGen, recorder) {
    this.engine   = engine;
    this.scope    = scope;
    this.sigGen   = sigGen;
    this.recorder = recorder;
    this.knobs    = {};
  }

  init() {
    const e = this.engine, s = this.scope, sg = this.sigGen, rec = this.recorder;

    // ── CH1/CH2 V/div & position knobs ───────────────────────────────
    this.knobs.ch1vdiv = new Knob(document.getElementById('knob-ch1-vdiv'), VDIV, VD_DEFAULT, (step, idx) => {
      s.ch1.vdiv = step; s.ch1.vdivIdx = idx;
      document.getElementById('val-ch1-vdiv').textContent = step.label;
      this._updateStatus();
    });
    this.knobs.ch2vdiv = new Knob(document.getElementById('knob-ch2-vdiv'), VDIV, VD_DEFAULT, (step, idx) => {
      s.ch2.vdiv = step; s.ch2.vdivIdx = idx;
      document.getElementById('val-ch2-vdiv').textContent = step.label;
    });
    this.knobs.ch1pos = new Knob(document.getElementById('knob-ch1-pos'), null, 0, delta => {
      if (delta === 'reset') s.ch1.pos = 0;
      else s.ch1.pos = Math.max(-2, Math.min(2, s.ch1.pos + delta));
      document.getElementById('val-ch1-pos').textContent = s.ch1.pos.toFixed(2);
    });
    this.knobs.ch2pos = new Knob(document.getElementById('knob-ch2-pos'), null, 0, delta => {
      if (delta === 'reset') s.ch2.pos = 0;
      else s.ch2.pos = Math.max(-2, Math.min(2, s.ch2.pos + delta));
      document.getElementById('val-ch2-pos').textContent = s.ch2.pos.toFixed(2);
    });

    // ── Timebase & H-position knobs ───────────────────────────────────
    this.knobs.timebase = new Knob(document.getElementById('knob-timebase'), TIMEBASE, TB_DEFAULT, (step, idx) => {
      s.tb = step; s.tbIdx = idx;
      document.getElementById('val-timebase').textContent = step.label;
      this._updateStatus();
    });
    this.knobs.hpos = new Knob(document.getElementById('knob-hpos'), null, 0, delta => {
      if (delta === 'reset') s.hPos = 0;
      else s.hPos = Math.max(-2000, Math.min(2000, s.hPos + Math.round(delta * 400)));
      document.getElementById('val-hpos').textContent = s.hPos;
    });

    // ── Trigger level knob ────────────────────────────────────────────
    this.knobs.trigLevel = new Knob(document.getElementById('knob-trig-level'), null, 0, delta => {
      if (delta === 'reset') s.trigLevel = 0;
      else s.trigLevel = Math.max(-1, Math.min(1, s.trigLevel + delta));
      document.getElementById('val-trig-level').textContent = s.trigLevel.toFixed(2) + 'V';
      this._updateStatus();
    });

    // ── Coupling ──────────────────────────────────────────────────────
    document.querySelectorAll('.coup-row').forEach(row => {
      const ch = parseInt(row.dataset.ch);
      row.querySelectorAll('.coup-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          row.querySelectorAll('.coup-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (ch === 1) s.ch1.coupling = btn.dataset.coup;
          else          s.ch2.coupling = btn.dataset.coup;
        });
      });
    });

    // ── YT / XY mode ─────────────────────────────────────────────────
    document.getElementById('btn-yt').addEventListener('click', () => {
      s.mode = 'YT';
      document.getElementById('btn-yt').classList.add('active');
      document.getElementById('btn-xy').classList.remove('active');
      this._resetPhosphor();
    });
    document.getElementById('btn-xy').addEventListener('click', () => {
      s.mode = 'XY';
      document.getElementById('btn-xy').classList.add('active');
      document.getElementById('btn-yt').classList.remove('active');
      this._resetPhosphor();
    });

    // ── Trigger controls ──────────────────────────────────────────────
    document.getElementById('trig-source').addEventListener('change', e => { s.trigSource = +e.target.value; this._updateStatus(); });
    document.getElementById('trig-slope').addEventListener('change', e => { s.trigEdge = e.target.value; this._updateStatus(); });
    document.querySelectorAll('.trig-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.trig-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        s.trigMode = btn.dataset.mode;
        this._updateStatus();
      });
    });

    // ── RUN/STOP ──────────────────────────────────────────────────────
    const runBtn = document.getElementById('btn-run-stop');
    runBtn.addEventListener('click', () => {
      s.isRunning = !s.isRunning;
      runBtn.textContent = s.isRunning ? 'RUN' : 'STOP';
      runBtn.className   = 'run-stop-btn ' + (s.isRunning ? 'running' : 'stopped');
    });

    document.getElementById('btn-single').addEventListener('click', () => {
      s.isRunning = true; s._singleArmed = true;
      runBtn.textContent = 'RUN'; runBtn.className = 'run-stop-btn running';
    });

    document.getElementById('btn-auto-set').addEventListener('click', () => {
      s.autoSet();
      this.knobs.timebase.index = s.tbIdx; this.knobs.timebase._updateAngle();
      this.knobs.ch1vdiv.index  = s.ch1.vdivIdx; this.knobs.ch1vdiv._updateAngle();
      document.getElementById('val-timebase').textContent = s.tb.label;
      document.getElementById('val-ch1-vdiv').textContent = s.ch1.vdiv.label;
      document.getElementById('val-ch1-pos').textContent  = '0.00';
      document.getElementById('val-hpos').textContent     = '0';
      document.getElementById('val-trig-level').textContent = '0.00V';
      this._updateStatus();
    });

    document.getElementById('btn-measure').addEventListener('click', () => {
      s.showMeasure = !s.showMeasure;
      document.getElementById('btn-measure').classList.toggle('active', s.showMeasure);
      document.getElementById('meas-led').classList.toggle('on', s.showMeasure);
    });
    document.getElementById('btn-measure').classList.add('active');
    document.getElementById('meas-led').classList.add('on');

    document.getElementById('btn-reset-pos').addEventListener('click', () => {
      s.ch1.pos = 0; s.ch2.pos = 0; s.hPos = 0;
      ['val-ch1-pos','val-ch2-pos'].forEach(id => document.getElementById(id).textContent = '0.00');
      document.getElementById('val-hpos').textContent = '0';
    });

    document.getElementById('btn-idle-sig').addEventListener('click', async () => {
      await this._ensureAudio();
      const btn = document.getElementById('btn-idle-sig');
      if (e.idleActive) {
        e._stopIdleSignal();
        btn.classList.remove('active');
      } else {
        e.startIdleSignal();
        btn.classList.add('active');
      }
    });

    // ── Screenshot ─────────────────────────────────────────────────────
    document.getElementById('btn-screenshot').addEventListener('click', () => {
      const canvas = s.canvas;
      let dataURL;

      if (s._glr) {
        // WebGL: composite GL canvas + 2D overlay (grid/measurements) onto a temp canvas
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width;
        tmp.height = canvas.height;
        const tctx = tmp.getContext('2d');

        // Draw WebGL canvas content
        tctx.drawImage(canvas, 0, 0);

        // Overlay canvas (grid, measurements, CRT vignette)
        if (s._glr._ovCanvas) {
          tctx.drawImage(s._glr._ovCanvas, 0, 0);
        }
        dataURL = tmp.toDataURL('image/png');
      } else {
        // Canvas 2D path — everything is already on the main canvas
        dataURL = canvas.toDataURL('image/png');
      }

      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const a = document.createElement('a');
      a.href = dataURL;
      a.download = `osc_screenshot_${ts}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    document.getElementById('show-grid').addEventListener('change', e => s.showGrid = e.target.checked);
    document.getElementById('crt-curve').addEventListener('change', e => s.crtCurve = e.target.checked);
    document.getElementById('smooth').addEventListener('change', e => s.smooth = e.target.checked);
    document.getElementById('freq-filter').addEventListener('change', e => s.filterEnabled = e.target.checked);
    document.getElementById('filter-low').addEventListener('change',  e => s.filterLow  = Math.max(20, +e.target.value));
    document.getElementById('filter-high').addEventListener('change', e => s.filterHigh = Math.min(20000, +e.target.value));

    // Frequency filter presets
    const filterPresetBtns = document.querySelectorAll('.filter-preset-btn');
    filterPresetBtns.forEach(btn => btn.addEventListener('click', () => {
      const lo = +btn.dataset.lo, hi = +btn.dataset.hi;
      s.filterLow = lo; s.filterHigh = hi;
      document.getElementById('filter-low').value  = lo;
      document.getElementById('filter-high').value = hi;
      document.getElementById('freq-filter').checked = true;
      s.filterEnabled = true;
      filterPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }));
    document.getElementById('scanlines').addEventListener('change', e => {
      document.getElementById('crt-overlay').classList.toggle('scanlines', e.target.checked);
    });

    // ── 3D/2D scene — enable + mode switch ────────────────────────────
    document.getElementById('obj-mode').addEventListener('change', e => s.objMode = e.target.checked);

    // Scene independent color
    const scColorOn = document.getElementById('scene-color-on');
    const scColorPk = document.getElementById('scene-color');
    scColorOn.addEventListener('change', e => {
      const on = e.target.checked;
      scColorPk.disabled = !on;
      s.sceneColor = on ? scColorPk.value : '';
    });
    scColorPk.addEventListener('input', e => {
      if (scColorOn.checked) s.sceneColor = e.target.value;
    });

    const _showMode = is3d => {
      s.obj3dMode = is3d;
      document.getElementById('obj-mode-3d').classList.toggle('active',  is3d);
      document.getElementById('obj-mode-img').classList.toggle('active', !is3d);
      document.getElementById('obj-drop-zone').style.display    = is3d  ? '' : 'none';
      document.getElementById('img-drop-zone').style.display    = is3d  ? 'none' : '';
      document.getElementById('obj-rot-ctrls').style.display    = is3d  ? '' : 'none';
      document.getElementById('img-tilt-ctrls').style.display   = is3d  ? 'none' : '';
      document.getElementById('img-trace-ctrls').style.display  = is3d  ? 'none' : '';
    };
    document.getElementById('obj-mode-3d').addEventListener('click', () => _showMode(true));
    document.getElementById('obj-mode-img').addEventListener('click', () => _showMode(false));

    // ── OBJ file loading ───────────────────────────────────────────────
    const objDrop = document.getElementById('obj-drop-zone');
    const objFile = document.getElementById('obj-file');

    // Load from a File object (drag/drop or file picker)
    const loadObj = async file => {
      if (!file || !file.name.toLowerCase().endsWith('.obj')) return;
      document.getElementById('obj-name').textContent = 'Loading…';
      const text = await file.text();
      const ok   = s._obj.load(text, file.name);
      document.getElementById('obj-name').textContent =
        ok ? (file.name.length > 18 ? file.name.slice(0, 16) + '…' : file.name) : 'Parse error';
      objDrop.classList.toggle('loaded', ok);
      if (ok && file.path) this._lastObjPath = { path: file.path, name: file.name };
      return ok;
    };

    // Load from a saved file path via Electron readFile bridge
    const loadObjFromPath = async (filePath, fileName) => {
      document.getElementById('obj-name').textContent = 'Loading…';
      try {
        const text = await window.electronAPI.readFile(filePath);
        const ok   = s._obj.load(text, fileName);
        document.getElementById('obj-name').textContent =
          ok ? (fileName.length > 18 ? fileName.slice(0, 16) + '…' : fileName) : 'Parse error';
        objDrop.classList.toggle('loaded', ok);
        return ok;
      } catch (_) {
        document.getElementById('obj-name').textContent = 'File not found';
        objDrop.classList.remove('loaded');
        return false;
      }
    };

    objDrop.addEventListener('click',     () => objFile.click());
    objFile.addEventListener('change',    e  => loadObj(e.target.files[0]));
    objDrop.addEventListener('dragover',  e  => { e.preventDefault(); objDrop.classList.add('drag-over'); });
    objDrop.addEventListener('dragleave', () => objDrop.classList.remove('drag-over'));
    objDrop.addEventListener('drop',      e  => { e.preventDefault(); objDrop.classList.remove('drag-over'); loadObj(e.dataTransfer.files[0]); });

    // ── OBJ Library ────────────────────────────────────────────────────
    const OBJ_LIB_KEY  = 'osc_obj_library';
    const objLibEl     = document.getElementById('obj-library');
    const objLibList   = document.getElementById('obj-lib-list');
    const objLibAddBtn = document.getElementById('obj-lib-add');

    if (window.electronAPI?.readFile) objLibEl.style.display = '';

    const _libLoad = () => {
      try { return JSON.parse(localStorage.getItem(OBJ_LIB_KEY) || '[]'); }
      catch (_) { return []; }
    };
    const _libSave = items => localStorage.setItem(OBJ_LIB_KEY, JSON.stringify(items));

    let _activeLibIdx = -1;

    const _renderLib = () => {
      const items = _libLoad();
      objLibList.innerHTML = '';
      items.forEach((item, i) => {
        const row  = document.createElement('div');
        row.className = 'obj-lib-item' + (i === _activeLibIdx ? ' active' : '');

        const name = document.createElement('span');
        name.className = 'obj-lib-item-name';
        name.textContent = item.name;
        name.title = item.path;

        const del = document.createElement('span');
        del.className = 'obj-lib-item-del';
        del.textContent = '×';
        del.title = 'Remove from library';
        del.addEventListener('click', e => {
          e.stopPropagation();
          const lib = _libLoad();
          lib.splice(i, 1);
          _libSave(lib);
          if (_activeLibIdx === i) _activeLibIdx = -1;
          else if (_activeLibIdx > i) _activeLibIdx--;
          _renderLib();
        });

        row.appendChild(name);
        row.appendChild(del);
        row.addEventListener('click', async () => {
          const ok = await loadObjFromPath(item.path, item.name);
          if (ok) { _activeLibIdx = i; _renderLib(); }
        });
        objLibList.appendChild(row);
      });
    };

    objLibAddBtn.addEventListener('click', () => {
      if (!this._lastObjPath) return;
      const lib = _libLoad();
      if (lib.some(x => x.path === this._lastObjPath.path)) return;
      lib.push(this._lastObjPath);
      _libSave(lib);
      _renderLib();
    });

    _renderLib();

    // ── OBJ-only: Rx / Ry ──────────────────────────────────────────────
    this._bindRange('obj-rx', v => { s._obj.rotX = v * Math.PI / 180; document.getElementById('obj-rx-val').textContent = Math.round(v) + '°'; });
    this._bindRange('obj-ry', v => { s._obj.rotY = v * Math.PI / 180; document.getElementById('obj-ry-val').textContent = Math.round(v) + '°'; });

    // ── IMG file loading ───────────────────────────────────────────────
    const imgDrop = document.getElementById('img-drop-zone');
    const imgFile = document.getElementById('img-file');
    const IMG_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','svg','avif','tiff','tif','ico','heic','heif','jxl']);
    const loadImg = async file => {
      if (!file) return;
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!file.type.startsWith('image/') && !IMG_EXTS.has(ext)) return;
      document.getElementById('img-name').textContent = 'Loading…';
      const ok = await s._imgScene.load(file);
      document.getElementById('img-name').textContent =
        ok ? (file.name.length > 18 ? file.name.slice(0, 16) + '…' : file.name) : 'Error';
      if (ok) imgDrop.classList.add('loaded');
    };
    imgDrop.addEventListener('click',     () => imgFile.click());
    imgFile.addEventListener('change',    e  => loadImg(e.target.files[0]));
    imgDrop.addEventListener('dragover',  e  => { e.preventDefault(); imgDrop.classList.add('drag-over'); });
    imgDrop.addEventListener('dragleave', () => imgDrop.classList.remove('drag-over'));
    imgDrop.addEventListener('drop',      e  => { e.preventDefault(); imgDrop.classList.remove('drag-over'); loadImg(e.dataTransfer.files[0]); });

    // ── IMG-only: trace mode, TiltX/TiltY ─────────────────────────────
    const imgTraceBtns = document.querySelectorAll('.img-trace-btn');
    imgTraceBtns.forEach(btn => btn.addEventListener('click', () => {
      imgTraceBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      s._imgScene.traceMode = btn.dataset.trace;
      s._imgScene._computeTrace();
    }));
    this._bindRange('img-threshold', v => {
      s._imgScene.threshold = v;
      document.getElementById('img-thr-val').textContent = Math.round(v);
      s._imgScene._computeTrace();
    });
    this._bindRange('img-density', v => {
      s._imgScene.sampleRes = Math.round(v);
      document.getElementById('img-den-val').textContent = Math.round(v);
      s._imgScene._computeTrace();
    });
    this._bindRange('img-rx3d', v => { s._imgScene.rotX3d = v; document.getElementById('img-rx3d-val').textContent = Math.round(v) + '°'; });
    this._bindRange('img-ry3d', v => { s._imgScene.rotY3d = v; document.getElementById('img-ry3d-val').textContent = Math.round(v) + '°'; });

    // ── Shared: tiling & radial symmetry ──────────────────────────────
    const setTile = () => {
      const tx = +document.getElementById('sc-tile-x').value;
      const ty = +document.getElementById('sc-tile-y').value;
      const rn = +document.getElementById('sc-radial').value;
      s._obj.tileX = tx; s._obj.tileY = ty; s._obj.radialN = rn;
      s._imgScene.tileX = tx; s._imgScene.tileY = ty; s._imgScene.radialN = rn;
    };
    document.getElementById('sc-tile-x').addEventListener('change', setTile);
    document.getElementById('sc-tile-y').addEventListener('change', setTile);
    document.getElementById('sc-radial').addEventListener('change', setTile);

    // ── Shared transforms (set both scenes simultaneously) ─────────────
    this._bindRange('sc-scale', v => {
      s._obj.scale = v; s._imgScene.scale = v;
      document.getElementById('sc-scale-val').textContent = v.toFixed(2);
    });
    this._bindRange('sc-rz', v => {
      s._obj.rotZ = v * Math.PI / 180;  // OBJ uses radians
      s._imgScene.rotZ = v;             // IMG uses degrees
      document.getElementById('sc-rz-val').textContent = Math.round(v) + '°';
    });
    this._bindRange('sc-px', v => {
      s._obj.posX = v; s._imgScene.posX = v;
      document.getElementById('sc-px-val').textContent = v.toFixed(2);
    });
    this._bindRange('sc-py', v => {
      s._obj.posY = v; s._imgScene.posY = v;
      document.getElementById('sc-py-val').textContent = v.toFixed(2);
    });

    // ── Shared animation + music sync ──────────────────────────────────
    // Per-axis auto-rotate  (X = obj.rotX / img.rotX3d,  Y = obj.rotY / img.rotY3d,  Z = obj.rotZ / img.spinZ)
    document.getElementById('sc-auto-rot-x').addEventListener('change', e => {
      s._obj.autoRotX = e.target.checked; s._imgScene.autoRotX3d = e.target.checked;
      if (!e.target.checked) { s._obj.rotX = 0; s._imgScene.rotX3d = 0; }
    });
    document.getElementById('sc-auto-rot-y').addEventListener('change', e => {
      s._obj.autoRotY = e.target.checked; s._imgScene.autoRotY3d = e.target.checked;
      if (!e.target.checked) { s._obj.rotY = 0; s._imgScene.rotY3d = 0; }
    });
    document.getElementById('sc-auto-rot-z').addEventListener('change', e => {
      s._obj.autoRotZ = e.target.checked; s._imgScene.autoSpin = e.target.checked;
      if (!e.target.checked) { s._obj.rotZ = 0; s._imgScene.rotZ = 0; }
    });
    this._bindRange('sc-rot-spd-x', v => {
      s._obj.rotSpeedX = v; s._imgScene.rotSpeedX3d = v;
      document.getElementById('sc-rsx-val').textContent = v.toFixed(1);
    });
    this._bindRange('sc-rot-spd-y', v => {
      s._obj.rotSpeed = v; s._imgScene.rotSpeedY3d = v;
      document.getElementById('sc-rsy-val').textContent = v.toFixed(1);
    });
    this._bindRange('sc-rot-spd-z', v => {
      s._obj.rotSpeedZ = v; s._imgScene.rotSpeed = v;
      document.getElementById('sc-rsz-val').textContent = v.toFixed(1);
    });
    document.getElementById('sc-beat-pulse').addEventListener('change', e => {
      s._obj.beatPulse = e.target.checked; s._imgScene.beatPulse = e.target.checked;
    });
    document.getElementById('sc-show-audio').addEventListener('change', e => {
      s._obj.showAudio = e.target.checked; s._imgScene.showAudio = e.target.checked;
    });
    // Infinite scroll
    this._bindRange('sc-scroll-x', v => {
      s._obj.scrollX = v; s._imgScene.scrollX = v;
      document.getElementById('sc-sx-val').textContent = v.toFixed(2);
    });
    this._bindRange('sc-scroll-y', v => {
      s._obj.scrollY = v; s._imgScene.scrollY = v;
      document.getElementById('sc-sy-val').textContent = v.toFixed(2);
    });
    document.getElementById('sc-breathe').addEventListener('change', e => {
      s._obj.breathe = e.target.checked; s._imgScene.breathe = e.target.checked;
    });
    document.getElementById('sc-shake').addEventListener('change', e => {
      s._obj.shake = e.target.checked; s._imgScene.shake = e.target.checked;
    });
    document.getElementById('sc-warp').addEventListener('change', e => {
      s._obj.warp = e.target.checked; s._imgScene.warp = e.target.checked;
    });
    this._bindRange('sc-warp-amt', v => {
      s._obj.warpAmt = v; s._imgScene.warpAmt = v;
      document.getElementById('sc-warp-val').textContent = v.toFixed(2);
    });
    document.getElementById('sc-audio-sketch').addEventListener('change', e => {
      s._imgScene.audioSketch = e.target.checked;
    });

    // ── Movement FX ───────────────────────────────────────────────────
    document.getElementById('sc-float').addEventListener('change', e => {
      s._obj.float = e.target.checked; s._imgScene.float = e.target.checked;
    });
    document.getElementById('sc-ripple').addEventListener('change', e => {
      s._obj.ripple = e.target.checked; s._imgScene.ripple = e.target.checked;
    });
    document.getElementById('sc-twist').addEventListener('change', e => {
      s._obj.twist = e.target.checked; s._imgScene.twist = e.target.checked;
    });
    document.getElementById('sc-explode').addEventListener('change', e => {
      const on = e.target.checked;
      s._obj.explode = on; s._imgScene.explode = on;
      // Reset phase so it starts fresh each time it's enabled
      if (on) { s._obj._explodeT = 0; s._imgScene._explodeT = 0; }
    });
    document.getElementById('sc-explode-loop').addEventListener('change', e => {
      s._obj.explodeLoop = e.target.checked; s._imgScene.explodeLoop = e.target.checked;
    });
    this._bindRange('sc-motion-amt', v => {
      s._obj.motionAmt = v; s._imgScene.motionAmt = v;
      document.getElementById('sc-motion-amt-val').textContent = v.toFixed(2);
    });
    this._bindRange('sc-motion-speed', v => {
      s._obj.motionSpeed = v; s._imgScene.motionSpeed = v;
      document.getElementById('sc-motion-speed-val').textContent = v.toFixed(1);
    });

    // ── Draw power + ramp ──────────────────────────────────────────────
    this._bindRange('sc-power', v => {
      s._obj.power = v; s._imgScene.power = v;
      document.getElementById('sc-power-val').textContent = v.toFixed(2);
    });
    document.getElementById('sc-auto-power').addEventListener('change', e => {
      const on = e.target.checked;
      s._obj.autoPower = on; s._imgScene.autoPower = on;
      // Reset to 0 when ramp is enabled so it starts from scratch
      if (on) { s._obj.power = 0; s._imgScene.power = 0;
        document.getElementById('sc-power').value = 0;
        document.getElementById('sc-power-val').textContent = '0.00'; }
    });
    document.getElementById('sc-power-loop').addEventListener('change', e => {
      s._obj.powerLoop = e.target.checked; s._imgScene.powerLoop = e.target.checked;
    });
    this._bindRange('sc-power-speed', v => {
      s._obj.powerSpeed = v; s._imgScene.powerSpeed = v;
      document.getElementById('sc-ps-val').textContent = v.toFixed(3);
    });

    // ── Audio ─────────────────────────────────────────────────────────
    const fileDrop  = document.getElementById('file-drop');
    const fileLabel = document.getElementById('file-label');
    const fileInput = document.getElementById('audio-file');
    const btnPlay   = document.getElementById('btn-play');
    const btnStop   = document.getElementById('btn-stop-audio');
    const stSrc     = document.getElementById('st-src');

    fileDrop.addEventListener('dragover', ev => { ev.preventDefault(); fileDrop.classList.add('drag-over'); });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));
    fileDrop.addEventListener('drop', ev => {
      ev.preventDefault(); fileDrop.classList.remove('drag-over');
      const f = ev.dataTransfer.files[0]; if (f) this._loadFile(f);
    });
    fileInput.addEventListener('change', ev => { const f = ev.target.files[0]; if (f) this._loadFile(f); });
    btnPlay.addEventListener('click', () => {
      if (!e.buffer) return;
      if (e.isPlaying) { e.pause(); btnPlay.textContent = '▶ PLAY'; }
      else             { e.play();  btnPlay.textContent = '⏸ PAUSE'; }
    });
    btnStop.addEventListener('click', () => { e.stop(); btnPlay.textContent = '▶ PLAY'; });
    document.getElementById('btn-mic').addEventListener('click', async () => {
      const btn = document.getElementById('btn-mic');
      if (e.micStream) { e.stopMic(); btn.classList.remove('active'); stSrc.textContent = 'No signal'; }
      else { try { await e.startMic(); btn.classList.add('active'); stSrc.textContent = 'Microphone'; } catch (_) { alert('Mic denied.'); } }
    });
    document.getElementById('volume').addEventListener('input', ev => e.setVolume(+ev.target.value));
    document.getElementById('progress-bg').addEventListener('click', ev => {
      if (!e.buffer) return;
      const r = ev.currentTarget.getBoundingClientRect();
      e.pauseOffset = ((ev.clientX - r.left) / r.width) * e.buffer.duration;
      if (e.isPlaying) e.play();
    });

    // ── Signal Generator ──────────────────────────────────────────────
    const genFreqL = document.getElementById('gen-freq-l');
    const genFreqR = document.getElementById('gen-freq-r');
    const genPhase = document.getElementById('gen-phase');
    const genWave  = document.getElementById('gen-wave');
    const genAmp   = document.getElementById('gen-amp');
    const btnGenStart = document.getElementById('btn-gen-start');
    const btnGenStop  = document.getElementById('btn-gen-stop');
    const genRatioRow = document.getElementById('gen-ratio-row');

    genFreqL.addEventListener('input', () => { sg.setFreqL(+genFreqL.value); this._syncRFreq(); });
    genFreqR.addEventListener('input', () => sg.setFreqR(+genFreqR.value));
    genPhase.addEventListener('input', () => {
      sg.phase = +genPhase.value;
      document.getElementById('gen-phase-val').textContent = genPhase.value + '°';
    });
    genWave.addEventListener('change', () => sg.setWaveform(genWave.value));
    genAmp.addEventListener('input', () => {
      sg.setAmplitude(+genAmp.value);
      document.getElementById('gen-amp-val').textContent = (+genAmp.value).toFixed(2);
    });

    // Ratio presets
    let activeRatio = 1;
    genRatioRow.querySelectorAll('.ratio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        genRatioRow.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeRatio = +btn.dataset.ratio;
        genFreqR.value = Math.round(sg.freqL * activeRatio);
        sg.setFreqR(sg.freqL * activeRatio);
      });
    });

    this._syncRFreq = () => {
      genFreqR.value = Math.round(sg.freqL * activeRatio);
      sg.setFreqR(sg.freqL * activeRatio);
    };

    // Shape presets — set freq, ratio, phase, waveform for known Lissajous patterns
    const SHAPE_PRESETS = {
      // ratio = freqR/freqL   (X=freqL on horizontal, Y=freqR on vertical)
      circle:   { freqL: 200, ratio: 1,          phase: 90,  wave: 'sine'     },
      // 1:1 at 90° = perfect circle
      figure8:  { freqL: 200, ratio: 2,          phase: 0,   wave: 'sine'     },
      // 1:2 at 0° = vertical figure-8 (90° gives a parabola arc, not a figure-8)
      heart:    { freqL: 200, ratio: 2,          phase: 55,  wave: 'triangle' },
      // 1:2 triangle wave at 55° phase ≈ asymmetric heart-like curve
      star:     { freqL: 100, ratio: 2.5,        phase: 90,  wave: 'sine'     },
      // 2:5 at 90° = 5-lobe symmetric star pattern
      spiral:   { freqL: 200, ratio: 1.007,      phase: 90,  wave: 'sine'     },
      // Near-unison: ellipse slowly precesses once per ~0.7s — looks like a rotating orbit/spiral
      diamond:  { freqL: 200, ratio: 1,          phase: 90,  wave: 'triangle' },
      // 1:1 triangle at 90°: straight sides connect (0,1)→(1,0)→(0,-1)→(-1,0) = ◇ diamond
      web:      { freqL: 100, ratio: 1.75,       phase: 0,   wave: 'sine'     },
      // 4:7 at 0° = 28 crossing nodes — dense mesh/web-like figure
      chaos:    { freqL: 317, ratio: Math.PI/2,  phase: 37,  wave: 'sawtooth' },
      // Irrational ratio + sawtooth harmonics: pattern never closes, fills space
      flower:   { freqL: 100, ratio: 1.5,        phase: 90,  wave: 'sine'     },
      // 2:3 at 90° = classic trefoil / 3-petal rose curve (shamrock shape)
      bowtie:   { freqL: 200, ratio: 0.5,        phase: 0,   wave: 'sine'     },
      // 2:1 at 0° = horizontal figure-8 = bowtie (inverse of figure8 preset)
    };

    const genPresetBtns = document.querySelectorAll('.gen-preset-btn');
    const _applyGenPreset = async (name) => {
      const p = SHAPE_PRESETS[name];
      if (!p) return;

      // Update UI controls
      genFreqL.value = p.freqL;
      genFreqR.value = Math.round(p.freqL * p.ratio);
      genPhase.value = p.phase;
      document.getElementById('gen-phase-val').textContent = p.phase + '°';
      genWave.value = p.wave;
      activeRatio = p.ratio;

      // Update generator
      sg.freqL = p.freqL;
      sg.freqR = p.freqL * p.ratio;
      sg.phase = p.phase;
      sg.waveform = p.wave;

      // Clear ratio button highlights (custom ratio)
      genRatioRow.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));

      // Highlight preset button
      genPresetBtns.forEach(b => b.classList.remove('active'));
      const activeBtn = document.querySelector(`.gen-preset-btn[data-preset="${name}"]`);
      if (activeBtn) activeBtn.classList.add('active');

      // Auto-start if not already running
      if (!sg.active) {
        await this._ensureAudio();
        sg.init(e.actx);
        sg.start(e.analyserL, e.analyserR);
        btnGenStart.disabled = true;
        btnGenStop.disabled  = false;
        btnGenStart.classList.remove('accent');
        btnGenStop.classList.add('active');
        if (s.mode !== 'XY') {
          s.mode = 'XY';
          document.getElementById('btn-xy').classList.add('active');
          document.getElementById('btn-yt').classList.remove('active');
          this._resetPhosphor();
        }
        document.getElementById('st-src').textContent = 'Signal Gen';
      } else {
        // Live update running generator
        sg.setFreqL(sg.freqL);
        sg.setFreqR(sg.freqR);
        sg.setWaveform(sg.waveform);
        // Restart to apply new phase
        sg.stop();
        sg.init(e.actx);
        sg.start(e.analyserL, e.analyserR);
      }
    };

    genPresetBtns.forEach(btn => {
      btn.addEventListener('click', () => _applyGenPreset(btn.dataset.preset));
    });

    btnGenStart.addEventListener('click', async () => {
      await this._ensureAudio();
      sg.freqL  = +genFreqL.value;
      sg.freqR  = +genFreqR.value;
      sg.phase  = +genPhase.value;
      sg.waveform = genWave.value;
      sg.init(e.actx);
      sg.start(e.analyserL, e.analyserR);
      btnGenStart.disabled = true;
      btnGenStop.disabled  = false;
      btnGenStart.classList.remove('accent');
      btnGenStop.classList.add('active');
      // Auto-switch to XY for shape creation
      if (s.mode !== 'XY') {
        s.mode = 'XY';
        document.getElementById('btn-xy').classList.add('active');
        document.getElementById('btn-yt').classList.remove('active');
        this._resetPhosphor();
      }
      document.getElementById('st-src').textContent = 'Signal Gen';
    });

    btnGenStop.addEventListener('click', () => {
      sg.stop();
      btnGenStart.disabled = false;
      btnGenStop.disabled  = true;
      btnGenStart.classList.add('accent');
      btnGenStop.classList.remove('active');
      document.getElementById('st-src').textContent = 'No signal';
    });

    // ── Signal Gen help toggle ──────────────────────────────────────────
    const sgHelpBtn  = document.getElementById('siggen-help-btn');
    const sgGuide    = document.getElementById('siggen-guide');
    if (sgHelpBtn && sgGuide) {
      sgHelpBtn.addEventListener('click', (ev) => {
        ev.stopPropagation(); // don't trigger panel collapse
        const vis = sgGuide.style.display === 'none';
        sgGuide.style.display = vis ? '' : 'none';
        sgHelpBtn.classList.toggle('active', vis);
      });
    }

    // ── FX controls ───────────────────────────────────────────────────
    const fxBindCheck = (id, key) => {
      document.getElementById(id).addEventListener('change', e => {
        s.fx[key] = e.target.checked;
        // Toggle fx-active on parent .fx-block for param visibility
        const block = e.target.closest('.fx-block');
        if (block) block.classList.toggle('fx-active', e.target.checked);
      });
    };
    fxBindCheck('fx-gradient',  'gradient');
    document.getElementById('gradient-start').addEventListener('input', e => { s.fx.gradientStart = e.target.value; });
    document.getElementById('gradient-end').addEventListener('input', e => { s.fx.gradientEnd = e.target.value; });
    document.getElementById('grad-dir-h').addEventListener('click', () => {
      s.fx.gradientDir = 'h';
      document.getElementById('grad-dir-h').classList.add('active');
      document.getElementById('grad-dir-v').classList.remove('active');
    });
    document.getElementById('grad-dir-v').addEventListener('click', () => {
      s.fx.gradientDir = 'v';
      document.getElementById('grad-dir-v').classList.add('active');
      document.getElementById('grad-dir-h').classList.remove('active');
    });
    fxBindCheck('fx-reactive',  'reactive');
    fxBindCheck('fx-beat',      'beatFlash');
    fxBindCheck('fx-bloom',     'bloom');
    fxBindCheck('fx-afterglow', 'afterglow');
    fxBindCheck('fx-mirror-x',  'mirrorX');
    fxBindCheck('fx-mirror-y',  'mirrorY');
    fxBindCheck('fx-rotate',    'rotation');
    fxBindCheck('fx-invert',    'beatInvert');

    this._bindRange('fx-rot-speed',   v => { s.fx.rotSpeed   = v; document.getElementById('fx-rs-val').textContent = v.toFixed(3); });
    this._bindRange('fx-beat-sens',   v => { s.fx.beatSens   = v; document.getElementById('fx-bs-val').textContent = v.toFixed(2); });
    this._bindRange('fx-afterglow-speed', v => { s.fx.afterglowSpeed = v; document.getElementById('fx-ag-val').textContent = v.toFixed(3); });
    this._bindRange('fx-afterglow-str', v => { s.fx.afterglowStr = v; document.getElementById('fx-afterglow-str-val').textContent = v.toFixed(2); });
    this._bindRange('fx-reactive-str', v => { s.fx.reactiveStr = v; document.getElementById('fx-reactive-str-val').textContent = v.toFixed(1); });
    this._bindRange('fx-beat-str',     v => { s.fx.beatStr     = v; document.getElementById('fx-beat-str-val').textContent = v.toFixed(2); });
    this._bindRange('fx-bloom-str',    v => { s.fx.bloomStr    = v; document.getElementById('fx-bloom-str-val').textContent = v.toFixed(1); });

    // ── Record ────────────────────────────────────────────────────────
    const btnRec = document.getElementById('btn-record');
    btnRec.addEventListener('click', async () => {
      if (rec.isRecording) {
        rec.stop();
        btnRec.textContent = '● REC';
        btnRec.classList.remove('recording');
      } else {
        await this._ensureAudio();
        rec.start(e.actx, e.gainNode);
        btnRec.textContent = '■ STOP';
        btnRec.classList.add('recording');
      }
    });

    // ── Color swatches ────────────────────────────────────────────────
    const _applyColor = (hex) => {
      s.color = hex;
      document.getElementById('phosphor-color').value = hex;
      document.documentElement.style.setProperty('--p', hex);
      document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
      const match = document.querySelector(`.color-swatch[data-color="${hex}"]`);
      if (match) match.classList.add('active');
    };
    document.querySelectorAll('.color-swatch').forEach(btn => {
      btn.addEventListener('click', () => _applyColor(btn.dataset.color));
    });
    document.getElementById('phosphor-color').addEventListener('input', ev => {
      // Custom color — deselect swatches, apply raw value
      s.color = ev.target.value;
      document.documentElement.style.setProperty('--p', ev.target.value);
      document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
    });

    this._bindRange('beam-width',  v => { s.beamWidth   = v; document.getElementById('beam-width-val').textContent  = v.toFixed(1); });
    this._bindRange('glow',        v => { s.glowAmount  = v; document.getElementById('glow-val').textContent         = Math.round(v); });
    this._bindRange('persistence', v => { s.persistence = v; document.getElementById('persistence-val').textContent = v.toFixed(2); });

    // ── Presets ───────────────────────────────────────────────────────
    this._setupPresets(s);

    // ── Progress & status polling ─────────────────────────────────────
    setInterval(() => {
      if (e.buffer) {
        const dur = e.buffer.duration;
        const cur = Math.min(e.getCurrentTime(), dur);
        document.getElementById('progress-fill').style.width = (cur/dur*100) + '%';
        const fmt = t => `${Math.floor(t/60)}:${Math.floor(t%60).toString().padStart(2,'0')}`;
        document.getElementById('time-lbl').textContent = `${fmt(cur)} / ${fmt(dur)}`;
      }
      const f = s.measFreq;
      document.getElementById('st-freq').textContent = f > 0
        ? (f >= 1000 ? `${(f/1000).toFixed(3)}kHz` : `${f.toFixed(2)}Hz`) : '---';
    }, 100);

    this._updateStatus();
    s.start();
    this._setupPanels();
    this._setupLayout();
    this._setupPopOut();
    this._setupKeyboard();
  }

  _setupPopOut() {
    // Only available when running inside Electron (preload exposes electronAPI)
    if (typeof window.electronAPI === 'undefined') return;

    const btn         = document.getElementById('btn-popout');
    const fsControls  = document.getElementById('fullscreen-controls');
    const monSelect   = document.getElementById('monitor-select');
    const btnFs       = document.getElementById('btn-fullscreen');
    const canvas      = this.scope.canvas;

    btn.style.display = '';           // show buttons now we know Electron is available
    fsControls.style.display = '';

    let _open        = false;
    let _rafId       = null;
    let _lastSent    = 0;

    // Populate monitor dropdown
    const _refreshDisplays = async () => {
      const displays = await window.electronAPI.getDisplays();
      monSelect.innerHTML = '';
      displays.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.label + (d.primary ? ' ★' : '');
        monSelect.appendChild(opt);
      });
      // Default to non-primary if available (likely the projector/second monitor)
      const nonPrimary = displays.find(d => !d.primary);
      if (nonPrimary) monSelect.value = nonPrimary.id;
    };
    _refreshDisplays();

    const _streamLoop = () => {
      if (!_open) return;
      _rafId = requestAnimationFrame(_streamLoop);
      const now = performance.now();
      if (now - _lastSent < 33) return;   // cap ~30 fps
      _lastSent = now;
      window.electronAPI.sendFrame(canvas.toDataURL('image/webp', 0.95));
    };

    const _open_ = async (fullscreen = false) => {
      const opts = fullscreen
        ? { fullscreen: true, displayId: parseInt(monSelect.value, 10) }
        : {};
      await window.electronAPI.openDisplay(opts);
      _open = true;
      btn.textContent = '✕ CLOSE DISPLAY';
      btn.classList.add('accent');
      if (fullscreen) {
        btnFs.textContent = '✕ EXIT FS';
        btnFs.classList.add('accent');
      }
      _streamLoop();
    };

    const _close_ = () => {
      _open = false;
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      btn.textContent = '⤢ POP OUT';
      btn.classList.remove('accent');
      btnFs.textContent = '⛶ FULLSCREEN';
      btnFs.classList.remove('accent');
      window.electronAPI.closeDisplay();
    };

    const _reset = () => {
      _open = false;
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      btn.textContent = '⤢ POP OUT';
      btn.classList.remove('accent');
      btnFs.textContent = '⛶ FULLSCREEN';
      btnFs.classList.remove('accent');
    };

    btn.addEventListener('click', () => {
      if (_open) _close_(); else _open_(false);
    });

    btnFs.addEventListener('click', () => {
      if (_open) _close_(); else _open_(true);
    });

    // Refresh display list when dropdown is focused (user might plug in a monitor)
    monSelect.addEventListener('focus', _refreshDisplays);

    // Reset buttons if user closes the display window directly (Escape / overlay X)
    window.electronAPI.onDisplayClosed(_reset);
  }

  _setupPresets(s) {
    // Built-in presets
    const BUILTIN_PRESETS = [
      {
        _name: 'Classic',
        color: '#00ff41', beamWidth: 1.5, glowAmount: 12, persistence: 0.15,
        fx: { reactive: false, beatFlash: false, bloom: false, mirrorX: false, mirrorY: false, rotation: false, beatInvert: false, afterglow: false, rotSpeed: 0.003, beatSens: 1.5, afterglowSpeed: 0, afterglowStr: 0.7 },
        smooth: false, filterEnabled: false, filterLow: 200, filterHigh: 3000,
        objMode: false, obj3dMode: true, scale: 0.8, rotZ: 0, posX: 0, posY: 0,
        tileX: 1, tileY: 1, radialN: 1, scrollX: 0, scrollY: 0,
        breathe: false, shake: false, warp: false, warpAmt: 0.1,
        float: false, ripple: false, twist: false, explode: false, motionAmt: 0.2, motionSpeed: 1.0, explodeLoop: false,
        power: 1, autoPower: false, powerLoop: false, powerSpeed: 0.004,
        autoRotX: false, autoRotY: true, autoRotZ: false,
        rotSpeedX: 0.5, rotSpeedY: 0.5, rotSpeedZ: 0.5,
        beatPulse: true, showAudio: false, showGrid: true, crtCurve: true,
      },
      {
        _name: 'Neon Glow',
        color: '#ff00ff', beamWidth: 2.0, glowAmount: 30, persistence: 0.06,
        fx: { reactive: true, beatFlash: true, bloom: true, mirrorX: false, mirrorY: false, rotation: false, beatInvert: false, afterglow: true, rotSpeed: 0.003, beatSens: 1.5, afterglowSpeed: 0, afterglowStr: 0.7 },
        smooth: false, filterEnabled: false, filterLow: 200, filterHigh: 3000,
        objMode: false, obj3dMode: true, scale: 0.8, rotZ: 0, posX: 0, posY: 0,
        tileX: 1, tileY: 1, radialN: 1, scrollX: 0, scrollY: 0,
        breathe: false, shake: false, warp: false, warpAmt: 0.1,
        float: false, ripple: false, twist: false, explode: false, motionAmt: 0.2, motionSpeed: 1.0, explodeLoop: false,
        power: 1, autoPower: false, powerLoop: false, powerSpeed: 0.004,
        autoRotX: false, autoRotY: true, autoRotZ: false,
        rotSpeedX: 0.5, rotSpeedY: 0.5, rotSpeedZ: 0.5,
        beatPulse: true, showAudio: false, showGrid: true, crtCurve: false,
      },
      {
        _name: 'Amber Retro',
        color: '#ffb000', beamWidth: 1.8, glowAmount: 18, persistence: 0.55,
        fx: { reactive: false, beatFlash: false, bloom: false, mirrorX: false, mirrorY: false, rotation: false, beatInvert: false, afterglow: false, rotSpeed: 0.003, beatSens: 1.5, afterglowSpeed: 0, afterglowStr: 0.7 },
        smooth: true, filterEnabled: false, filterLow: 200, filterHigh: 3000,
        objMode: false, obj3dMode: true, scale: 0.8, rotZ: 0, posX: 0, posY: 0,
        tileX: 1, tileY: 1, radialN: 1, scrollX: 0, scrollY: 0,
        breathe: false, shake: false, warp: false, warpAmt: 0.1,
        float: false, ripple: false, twist: false, explode: false, motionAmt: 0.2, motionSpeed: 1.0, explodeLoop: false,
        power: 1, autoPower: false, powerLoop: false, powerSpeed: 0.004,
        autoRotX: false, autoRotY: true, autoRotZ: false,
        rotSpeedX: 0.5, rotSpeedY: 0.5, rotSpeedZ: 0.5,
        beatPulse: true, showAudio: false, showGrid: true, crtCurve: true,
      },
    ];

    const pm = new PresetManager(s);
    pm.installDefaults(BUILTIN_PRESETS);
    this.presetMgr = pm;

    let saveMode = false;
    let activeSlot = -1;
    const slotsEl = document.getElementById('preset-slots');
    const btnSave = document.getElementById('btn-preset-save');
    const btnExport = document.getElementById('btn-preset-export');
    const btnImport = document.getElementById('btn-preset-import');
    const importFile = document.getElementById('preset-import-file');

    const renderSlots = () => {
      slotsEl.innerHTML = '';
      for (let i = 0; i < pm.SLOT_COUNT; i++) {
        const slot = pm.getSlot(i);
        const btn = document.createElement('button');
        btn.className = 'preset-slot';
        if (slot) {
          btn.classList.add('filled');
          const name = slot._name || `P${i + 1}`;
          btn.textContent = name.length > 5 ? name.slice(0, 5) : name;
          btn.title = name;

          // Delete button
          const del = document.createElement('span');
          del.className = 'preset-del visible';
          del.textContent = '\u00D7';
          del.addEventListener('click', (ev) => {
            ev.stopPropagation();
            pm.delete(i);
            if (activeSlot === i) activeSlot = -1;
            renderSlots();
          });
          btn.appendChild(del);
        } else {
          btn.textContent = String(i + 1);
          btn.title = `Empty slot ${i + 1}`;
        }
        if (i === activeSlot) btn.classList.add('active-slot');

        btn.addEventListener('click', () => {
          if (saveMode) {
            // Save mode: save current settings into this slot
            // Use inline input instead of prompt() for Electron compatibility
            const existingName = pm.getSlot(i)?._name || '';
            const defaultName = existingName || `Preset ${i + 1}`;

            // Create inline name input
            const input = document.createElement('input');
            input.type = 'text';
            input.value = defaultName;
            input.className = 'preset-name-input';
            input.style.cssText = 'width:60px;font-size:9px;padding:1px 3px;background:#222;color:#0f0;border:1px solid #0f0;border-radius:2px;';
            btn.textContent = '';
            btn.appendChild(input);
            input.focus();
            input.select();

            const doSave = () => {
              const name = input.value.trim() || defaultName;
              pm.save(i, name);
              activeSlot = i;
              exitSaveMode();
              renderSlots();
            };
            input.addEventListener('keydown', (ev) => {
              if (ev.key === 'Enter') { ev.preventDefault(); doSave(); }
              if (ev.key === 'Escape') { ev.preventDefault(); exitSaveMode(); renderSlots(); }
              ev.stopPropagation();
            });
            input.addEventListener('blur', doSave);
            return;
          }
          if (slot) {
            // Load mode
            pm.load(i);
            activeSlot = i;
            renderSlots();
          }
        });

        slotsEl.appendChild(btn);
      }
    };

    const exitSaveMode = () => {
      saveMode = false;
      btnSave.classList.remove('save-mode');
      btnSave.textContent = 'SAVE';
    };

    btnSave.addEventListener('click', () => {
      if (saveMode) {
        exitSaveMode();
      } else {
        saveMode = true;
        btnSave.classList.add('save-mode');
        btnSave.textContent = 'PICK SLOT';
      }
    });

    btnExport.addEventListener('click', () => {
      if (activeSlot >= 0 && pm.getSlot(activeSlot)) {
        pm.exportJSON(activeSlot);
      } else {
        // Export first filled slot if none selected
        const idx = pm.getSlots().findIndex(s => s !== null);
        if (idx >= 0) pm.exportJSON(idx);
      }
    });

    btnImport.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const idx = await pm.importJSON(file);
      if (idx >= 0) {
        activeSlot = idx;
        renderSlots();
      }
      importFile.value = '';
    });

    renderSlots();
  }

  _setupKeyboard() {
    const e = this.engine, s = this.scope;
    this._kbHelpVisible = false;

    document.addEventListener('keydown', ev => {
      // Don't fire shortcuts when typing in form elements
      const tag = ev.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const key = ev.key;

      // ── Help overlay (? key) ──
      if (key === '?') {
        ev.preventDefault();
        this._toggleHelp();
        return;
      }

      // ── Dismiss help overlay ──
      if (this._kbHelpVisible && key === 'Escape') {
        ev.preventDefault();
        this._toggleHelp();
        return;
      }

      // ── Playback ──
      if (key === ' ') {
        ev.preventDefault();
        document.getElementById('btn-play').click();
        return;
      }
      if (key === 'Escape') {
        ev.preventDefault();
        document.getElementById('btn-stop-audio').click();
        return;
      }

      // ── Display toggles ──
      if (key === 'g' || key === 'G') {
        ev.preventDefault();
        const cb = document.getElementById('show-grid');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
        return;
      }
      if (key === 'c' || key === 'C') {
        ev.preventDefault();
        const cb = document.getElementById('crt-curve');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
        return;
      }
      if (key === 'm' || key === 'M') {
        ev.preventDefault();
        document.getElementById('btn-measure').click();
        return;
      }
      if (key === 'f' || key === 'F' || key === 'F11') {
        ev.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
        return;
      }

      // ── Scope mode ──
      if (key === '1') {
        ev.preventDefault();
        document.getElementById('btn-yt').click();
        return;
      }
      if (key === '2') {
        ev.preventDefault();
        document.getElementById('btn-xy').click();
        return;
      }
      if (key === 'r' || key === 'R') {
        ev.preventDefault();
        document.getElementById('btn-run-stop').click();
        return;
      }
      if (key === 's' || key === 'S') {
        ev.preventDefault();
        document.getElementById('btn-single').click();
        return;
      }

      // ── Scene ──
      if (key === '3') {
        ev.preventDefault();
        const cb = document.getElementById('obj-mode');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
        return;
      }
      if (key === 'Tab') {
        // Only intercept Tab when scene is enabled
        const cb = document.getElementById('obj-mode');
        if (!cb.checked) return;
        ev.preventDefault();
        if (s.obj3dMode) {
          document.getElementById('obj-mode-img').click();
        } else {
          document.getElementById('obj-mode-3d').click();
        }
        return;
      }
    });
  }

  _toggleHelp() {
    let overlay = document.getElementById('kb-help-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'kb-help-overlay';
      overlay.innerHTML = `
        <div class="kb-help-box">
          <div class="kb-help-title">KEYBOARD SHORTCUTS</div>
          <div class="kb-help-columns">
            <div class="kb-help-col">
              <div class="kb-help-section">PLAYBACK</div>
              <div class="kb-help-row"><kbd>Space</kbd> Play / Pause</div>
              <div class="kb-help-row"><kbd>Esc</kbd> Stop audio</div>

              <div class="kb-help-section">DISPLAY</div>
              <div class="kb-help-row"><kbd>G</kbd> Toggle grid</div>
              <div class="kb-help-row"><kbd>C</kbd> Toggle CRT curve</div>
              <div class="kb-help-row"><kbd>M</kbd> Toggle measurements</div>
              <div class="kb-help-row"><kbd>F</kbd> Toggle fullscreen</div>
              <div class="kb-help-row"><kbd>F11</kbd> Toggle fullscreen</div>
            </div>
            <div class="kb-help-col">
              <div class="kb-help-section">SCOPE</div>
              <div class="kb-help-row"><kbd>1</kbd> YT mode</div>
              <div class="kb-help-row"><kbd>2</kbd> XY mode</div>
              <div class="kb-help-row"><kbd>R</kbd> Run / Stop</div>
              <div class="kb-help-row"><kbd>S</kbd> Single trigger</div>

              <div class="kb-help-section">SCENE</div>
              <div class="kb-help-row"><kbd>3</kbd> Toggle OBJ/IMG enable</div>
              <div class="kb-help-row"><kbd>Tab</kbd> Switch OBJ / IMG</div>

              <div class="kb-help-section" style="margin-top:12px;opacity:0.5">
                Press <kbd>?</kbd> or <kbd>Esc</kbd> to close
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    }
    this._kbHelpVisible = !this._kbHelpVisible;
    overlay.classList.toggle('visible', this._kbHelpVisible);
  }

  _updateStatus() {
    const s = this.scope;
    document.getElementById('st-ch1').textContent  = `CH1: ${s.ch1.vdiv.label}/div`;
    document.getElementById('st-tb').textContent   = `${s.tb.label}/div`;
    const edge = s.trigEdge === 'rising' ? '↑' : '↓';
    document.getElementById('st-trig').textContent = `TRIG: ${s.trigMode.toUpperCase()} CH${s.trigSource} ${edge} ${s.trigLevel.toFixed(2)}V`;
  }

  async _loadFile(file) {
    const e = this.engine;
    document.getElementById('file-label').textContent = 'Loading…';
    try {
      await e.loadFile(file);
      const name = file.name.length > 20 ? file.name.slice(0,18)+'…' : file.name;
      document.getElementById('file-label').textContent = name;
      document.getElementById('file-drop').classList.add('loaded');
      document.getElementById('btn-play').disabled = false;
      document.getElementById('btn-stop-audio').disabled = false;
      document.getElementById('st-src').textContent = name;
      e.play();
      document.getElementById('btn-play').textContent = '⏸ PAUSE';
    } catch (err) {
      document.getElementById('file-label').textContent = 'Error';
      console.error(err);
    }
  }

  _bindRange(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', e => fn(parseFloat(e.target.value)));
    fn(parseFloat(el.value));
  }

  _resetPhosphor() {
    if (!this.scope._phCtx) return; // WebGL path handles phosphor internally
    this.scope._phCtx.fillStyle = '#000';
    this.scope._phCtx.fillRect(0, 0, this.scope.canvas.width, this.scope.canvas.height);
  }

  async _ensureAudio() {
    if (this._audioReady) return;
    await this.engine.init();
    this.sigGen.init(this.engine.actx);
    this._audioReady = true;
  }

  // ── Modular rig system — panels draggable between 4 zones ──────────
  _setupPanels() {
    // No-op — panels now managed by _setupLayout/rig system
  }

  _setupLayout() {
    const app     = document.querySelector('.app');
    const store   = document.getElementById('panel-store');
    const zones   = {
      left:   document.getElementById('zone-left'),
      under:  document.getElementById('zone-under'),
      right:  document.getElementById('zone-right'),
      bottom: document.getElementById('zone-bottom'),
    };
    if (!app || !store) return;

    // ── All panel section elements ──
    const allSections = Array.from(store.querySelectorAll('.fp-section[data-panel-id]'));
    const allIds = allSections.map(s => s.dataset.panelId);

    // ── Built-in rig presets ──
    const BUILTIN_RIGS = {
      classic: {
        left:   ['ch1', 'ch2', 'horiz', 'trig'],
        under:  ['audio', 'siggen', 'presets'],
        right:  ['beamfx', 'display', 'sigfx', 'scene'],
        bottom: ['ctrl'],
      },
      studio: {
        left:   ['ch1', 'ch2', 'horiz', 'trig'],
        under:  ['audio', 'presets'],
        right:  ['beamfx', 'sigfx', 'scene', 'display'],
        bottom: ['ctrl', 'siggen'],
      },
      perform: {
        left:   ['ctrl', 'audio', 'presets'],
        under:  [],
        right:  ['beamfx', 'sigfx', 'display'],
        bottom: ['ch1', 'ch2', 'horiz', 'trig', 'siggen', 'scene'],
      },
      default: {
        left: [], under: [], bottom: [],
        right: allIds.slice(),
      },
    };

    // ── Tab groups for tabbed rig ──
    const TAB_GROUPS = {
      scope:  { label: 'Scope',  ids: ['ch1', 'ch2', 'horiz', 'trig', 'ctrl'] },
      beam:   { label: 'Beam',   ids: ['beamfx', 'display', 'sigfx'] },
      scene:  { label: 'Scene',  ids: ['scene'] },
      source: { label: 'Source', ids: ['audio', 'siggen', 'presets'] },
    };

    // ── Panel search aliases (for search bar) ──
    const PANEL_ALIASES = {
      ch1:     ['channel 1', 'voltage', 'v/div', 'vdiv', 'probe', 'input 1', 'coupling', 'ac', 'dc'],
      ch2:     ['channel 2', 'voltage', 'v/div', 'vdiv', 'probe', 'input 2', 'coupling', 'ac', 'dc'],
      horiz:   ['horizontal', 'timebase', 'time/div', 'time div', 'sweep', 'speed', 'yt', 'xy', 'lissajous'],
      trig:    ['trigger', 'edge', 'rising', 'falling', 'slope', 'threshold', 'level'],
      ctrl:    ['control', 'system', 'grid', 'crt', 'scanlines', 'screenshot', 'fullscreen', 'popout', 'measure', 'auto set'],
      beamfx:  ['beam fx', 'beam effects', 'color', 'colour', 'phosphor', 'gradient', 'reactive', 'beat flash', 'bloom', 'halation', 'afterglow', 'invert'],
      sigfx:   ['signal fx', 'signal effects', 'mirror', 'rotation', 'rotate', 'smooth', 'filter', 'frequency', 'freq', 'bass', 'treble', 'mid', 'bandpass'],
      scene:   ['3d', '2d', 'obj', 'image', 'img', 'model', 'wireframe', 'geometry', 'tile', 'symmetry', 'motion', 'float', 'ripple', 'twist', 'explode', 'warp', 'scroll', 'spin', 'power'],
      audio:   ['audio', 'input', 'mic', 'microphone', 'file', 'music', 'song', 'play', 'volume', 'mp3', 'wav'],
      siggen:  ['signal generator', 'generator', 'sine', 'square', 'sawtooth', 'triangle', 'noise', 'waveform', 'oscillator', 'tone', 'frequency'],
      presets: ['preset', 'save', 'load', 'export', 'import', 'slot'],
      display: ['display', 'beam width', 'glow', 'persist', 'persistence', 'brightness', 'thickness'],
    };

    // ── Build tab bar + search bar (created once, toggled by rig) ──
    const tabBar = document.createElement('div');
    tabBar.className = 'tab-bar';
    tabBar.style.display = 'none';
    Object.keys(TAB_GROUPS).forEach(key => {
      const btn = document.createElement('button');
      btn.className = 'tab-bar-btn';
      btn.dataset.tab = key;
      btn.textContent = TAB_GROUPS[key].label;
      tabBar.appendChild(btn);
    });

    const searchWrap = document.createElement('div');
    searchWrap.className = 'tab-search-wrap';
    searchWrap.style.display = 'none';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search controls…';
    searchInput.className = 'tab-search';
    searchWrap.appendChild(searchInput);

    const zoneRight = zones.right;
    zoneRight.prepend(searchWrap);
    zoneRight.prepend(tabBar);

    let activeTab = 'scope';
    let tabbedMode = false;

    const showTab = (tabKey) => {
      activeTab = tabKey;
      searchInput.value = '';
      tabBar.querySelectorAll('.tab-bar-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabKey));
      const visibleIds = TAB_GROUPS[tabKey].ids;
      allSections.forEach(sec => {
        if (tabbedMode) {
          sec.classList.toggle('tab-hidden', !visibleIds.includes(sec.dataset.panelId));
        }
      });
    };

    tabBar.addEventListener('click', e => {
      const btn = e.target.closest('.tab-bar-btn');
      if (btn) showTab(btn.dataset.tab);
    });

    // ── Search logic ──
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) { showTab(activeTab); return; }
      // Clear tab highlight when searching
      tabBar.querySelectorAll('.tab-bar-btn').forEach(b => b.classList.remove('active'));
      allSections.forEach(sec => {
        const id = sec.dataset.panelId;
        const title = (sec.querySelector('.fp-title')?.textContent || '').toLowerCase();
        const aliases = (PANEL_ALIASES[id] || []).join(' ');
        const match = title.includes(q) || id.includes(q) || aliases.includes(q);
        sec.classList.toggle('tab-hidden', !match);
      });
    });
    // Escape clears search
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { searchInput.value = ''; showTab(activeTab); searchInput.blur(); }
      e.stopPropagation(); // don't trigger app shortcuts
    });

    const enterTabbedMode = () => {
      tabbedMode = true;
      app.classList.add('tabbed-mode');
      tabBar.style.display = '';
      searchWrap.style.display = '';
      showTab(activeTab);
    };

    const exitTabbedMode = () => {
      tabbedMode = false;
      app.classList.remove('tabbed-mode');
      tabBar.style.display = 'none';
      searchWrap.style.display = 'none';
      allSections.forEach(sec => sec.classList.remove('tab-hidden'));
    };

    // ── State ──
    let editing = false;
    let dragSrc = null;
    const rigSelect  = document.getElementById('rig-select');
    const editBtn    = document.getElementById('rig-edit-btn');
    const saveBtn    = document.getElementById('rig-save-btn');

    // ── Collapse state ──
    const savedCollapsed = JSON.parse(localStorage.getItem('osc_panelCollapsed') || '{}');

    const saveRigState = () => {
      // Save current zone assignments + order + collapsed state
      const rig = {};
      const collapsed = {};
      Object.keys(zones).forEach(zk => {
        rig[zk] = [];
        zones[zk].querySelectorAll('.fp-section[data-panel-id]').forEach(s => {
          rig[zk].push(s.dataset.panelId);
          collapsed[s.dataset.panelId] = s.classList.contains('collapsed');
        });
      });
      localStorage.setItem('osc_rigCurrent', JSON.stringify(rig));
      localStorage.setItem('osc_panelCollapsed', JSON.stringify(collapsed));
    };

    const applyRig = (rigDef) => {
      // Move all sections back to store
      allSections.forEach(s => store.appendChild(s));

      // Distribute into zones per rig definition
      Object.keys(zones).forEach(zk => {
        const ids = rigDef[zk] || [];
        ids.forEach(id => {
          const sec = store.querySelector(`[data-panel-id="${id}"]`);
          if (sec) zones[zk].appendChild(sec);
        });
      });

      // Any sections not assigned to a zone? Put them in bottom as fallback
      store.querySelectorAll('.fp-section[data-panel-id]').forEach(s => {
        zones.bottom.appendChild(s);
      });

      saveRigState();
    };

    // ── Rig select change ──
    rigSelect.addEventListener('change', () => {
      const name = rigSelect.value;
      if (name === 'default') {
        applyRig(BUILTIN_RIGS.default);
        enterTabbedMode();
        localStorage.setItem('osc_rigName', name);
      } else if (BUILTIN_RIGS[name]) {
        exitTabbedMode();
        applyRig(BUILTIN_RIGS[name]);
        localStorage.setItem('osc_rigName', name);
      } else {
        // Custom rig from localStorage
        exitTabbedMode();
        const customs = JSON.parse(localStorage.getItem('osc_customRigs') || '{}');
        if (customs[name]) {
          applyRig(customs[name]);
          localStorage.setItem('osc_rigName', name);
        }
      }
    });

    // ── Helpers: get current rig state + check if custom ──
    const updateBtn  = document.getElementById('rig-update-btn');
    const deleteBtn  = document.getElementById('rig-delete-btn');
    const BUILTIN_NAMES = Object.keys(BUILTIN_RIGS);

    const getCurrentRig = () => {
      const rig = {};
      Object.keys(zones).forEach(zk => {
        rig[zk] = [];
        zones[zk].querySelectorAll('.fp-section[data-panel-id]').forEach(s => {
          rig[zk].push(s.dataset.panelId);
        });
      });
      return rig;
    };

    const isCustomRig = () => !BUILTIN_NAMES.includes(rigSelect.value);

    const refreshCustomButtons = () => {
      const custom = isCustomRig();
      updateBtn.style.display = custom ? '' : 'none';
      deleteBtn.style.display = custom ? '' : 'none';
    };
    refreshCustomButtons();

    // Show/hide on rig change
    rigSelect.addEventListener('change', refreshCustomButtons);

    // ── Save new custom rig ──
    saveBtn.addEventListener('click', () => {
      const rig = getCurrentRig();

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Rig name…';
      input.style.cssText = 'width:80px;font-size:10px;padding:2px 4px;background:#222;color:#0f0;border:1px solid #0f0;border-radius:2px;';
      saveBtn.replaceWith(input);
      input.focus();

      const doSave = () => {
        const name = input.value.trim().toLowerCase().replace(/\s+/g, '-') || `rig-${Date.now()}`;
        const customs = JSON.parse(localStorage.getItem('osc_customRigs') || '{}');
        customs[name] = rig;
        localStorage.setItem('osc_customRigs', JSON.stringify(customs));
        localStorage.setItem('osc_rigName', name);

        if (!rigSelect.querySelector(`option[value="${name}"]`)) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          rigSelect.appendChild(opt);
        }
        rigSelect.value = name;
        input.replaceWith(saveBtn);
        refreshCustomButtons();
      };

      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); doSave(); }
        if (ev.key === 'Escape') { ev.preventDefault(); input.replaceWith(saveBtn); }
        ev.stopPropagation();
      });
      input.addEventListener('blur', doSave);
    });

    // ── Update current custom rig in place ──
    updateBtn.addEventListener('click', () => {
      const name = rigSelect.value;
      if (BUILTIN_NAMES.includes(name)) return;
      const customs = JSON.parse(localStorage.getItem('osc_customRigs') || '{}');
      customs[name] = getCurrentRig();
      localStorage.setItem('osc_customRigs', JSON.stringify(customs));
      saveRigState();
      // Brief flash to confirm
      updateBtn.style.color = '#0f0';
      setTimeout(() => { updateBtn.style.color = ''; }, 400);
    });

    // ── Delete current custom rig ──
    deleteBtn.addEventListener('click', () => {
      const name = rigSelect.value;
      if (BUILTIN_NAMES.includes(name)) return;
      const customs = JSON.parse(localStorage.getItem('osc_customRigs') || '{}');
      delete customs[name];
      localStorage.setItem('osc_customRigs', JSON.stringify(customs));
      const opt = rigSelect.querySelector(`option[value="${name}"]`);
      if (opt) opt.remove();
      // Fall back to default
      rigSelect.value = 'default';
      rigSelect.dispatchEvent(new Event('change'));
    });

    // ── Layout mode toggle (masonry vs columns) ──
    const layoutBtn = document.getElementById('rig-layout-btn');
    let columnsMode = localStorage.getItem('osc_layoutMode') === 'columns';
    if (columnsMode) app.classList.add('layout-columns');
    const updateLayoutBtn = () => {
      layoutBtn.classList.toggle('active', columnsMode);
      layoutBtn.title = columnsMode ? 'Switch to masonry layout' : 'Switch to columns layout';
    };
    updateLayoutBtn();
    layoutBtn.addEventListener('click', () => {
      columnsMode = !columnsMode;
      app.classList.toggle('layout-columns', columnsMode);
      localStorage.setItem('osc_layoutMode', columnsMode ? 'columns' : 'masonry');
      updateLayoutBtn();
    });

    // ── Edit mode toggle ──
    editBtn.addEventListener('click', () => {
      editing = !editing;
      app.classList.toggle('rig-editing', editing);
      editBtn.classList.toggle('active', editing);
      editBtn.title = editing ? 'Exit edit mode' : 'Toggle edit mode — drag panels between zones';

      // Update draggable state
      allSections.forEach(sec => {
        const t = sec.querySelector('.fp-title');
        if (t) {
          t.setAttribute('draggable', editing ? 'true' : 'false');
          t.style.cursor = editing ? 'grab' : 'pointer';
        }
      });
    });

    // ── Section behaviors: collapse + drag ──
    allSections.forEach(sec => {
      const id = sec.dataset.panelId;
      sec.setAttribute('draggable', 'false');

      // Restore collapsed
      if (savedCollapsed[id]) sec.classList.add('collapsed');

      // Collapse on title click
      const title = sec.querySelector('.fp-title');
      if (title) {
        title.setAttribute('draggable', 'false');

        title.addEventListener('click', e => {
          if (e.target !== title && e.target.closest('.fp-title') !== title) return;
          sec.classList.toggle('collapsed');
          saveRigState();
        });

        title.addEventListener('dragstart', e => {
          if (!editing) { e.preventDefault(); return; }
          dragSrc = sec;
          sec.classList.add('panel-dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', id);
        });
      }

      sec.addEventListener('dragend', () => {
        dragSrc = null;
        sec.classList.remove('panel-dragging');
        document.querySelectorAll('.fp-section').forEach(s => {
          s.classList.remove('panel-drop-before', 'panel-drop-after');
        });
        document.querySelectorAll('.panel-zone').forEach(z => z.classList.remove('zone-drag-over'));
        saveRigState();
      });

      // Drag over another section — show insertion indicator
      sec.addEventListener('dragover', e => {
        if (!editing) return;
        e.preventDefault();
        e.stopPropagation();
        if (!dragSrc || dragSrc === sec) return;
        e.dataTransfer.dropEffect = 'move';

        document.querySelectorAll('.fp-section').forEach(s => {
          s.classList.remove('panel-drop-before', 'panel-drop-after');
        });
        const rect = sec.getBoundingClientRect();
        const isVert = sec.parentElement.classList.contains('zone-side');
        if (isVert) {
          sec.classList.add(e.clientY < rect.top + rect.height / 2 ? 'panel-drop-before' : 'panel-drop-after');
        } else {
          sec.classList.add(e.clientX < rect.left + rect.width / 2 ? 'panel-drop-before' : 'panel-drop-after');
        }
      });

      sec.addEventListener('dragleave', () => {
        sec.classList.remove('panel-drop-before', 'panel-drop-after');
      });

      // Drop on another section — reorder within same zone or move to this zone
      sec.addEventListener('drop', e => {
        if (!editing) return;
        e.preventDefault();
        e.stopPropagation();
        if (!dragSrc || dragSrc === sec) return;

        const container = sec.parentElement;
        const rect = sec.getBoundingClientRect();
        const isVert = container.classList.contains('zone-side');
        const before = isVert
          ? (e.clientY < rect.top + rect.height / 2)
          : (e.clientX < rect.left + rect.width / 2);
        if (before) {
          container.insertBefore(dragSrc, sec);
        } else {
          sec.after(dragSrc);
        }
        sec.classList.remove('panel-drop-before', 'panel-drop-after');
        saveRigState();
      });
    });

    // ── Zone drop targets (for dropping onto empty zones) ──
    Object.values(zones).forEach(zone => {
      zone.addEventListener('dragover', e => {
        if (!editing || !dragSrc) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('zone-drag-over');
      });
      zone.addEventListener('dragleave', e => {
        // Only remove if leaving the zone itself (not entering a child)
        if (e.relatedTarget && zone.contains(e.relatedTarget)) return;
        zone.classList.remove('zone-drag-over');
      });
      zone.addEventListener('drop', e => {
        if (!editing || !dragSrc) return;
        e.preventDefault();
        zone.classList.remove('zone-drag-over');
        // If dropped on the zone background (not on a section), append to end
        if (e.target === zone || e.target.closest('.panel-zone') === zone) {
          zone.appendChild(dragSrc);
          saveRigState();
        }
      });
    });

    // ── Load custom rigs into select ──
    const customs = JSON.parse(localStorage.getItem('osc_customRigs') || '{}');
    Object.keys(customs).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      rigSelect.appendChild(opt);
    });

    // ── Restore saved rig on startup ──
    const savedName = localStorage.getItem('osc_rigName') || 'default';
    const savedRig  = JSON.parse(localStorage.getItem('osc_rigCurrent') || 'null');

    if (savedRig) {
      applyRig(savedRig);
      if (rigSelect.querySelector(`option[value="${savedName}"]`)) {
        rigSelect.value = savedName;
      }
      if (savedName === 'default') enterTabbedMode();
    } else {
      applyRig(BUILTIN_RIGS[savedName] || BUILTIN_RIGS.default);
      rigSelect.value = savedName;
      if (savedName === 'default') enterTabbedMode();
    }
  }
}

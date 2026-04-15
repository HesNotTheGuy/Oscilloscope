'use strict';

import { bindRange } from './ui-utils.js';

// ─────────────────────────────────────────────────────────────
//  SceneController — 3D/image mode, transforms, animation,
//  file loading, OBJ library, draw power
// ─────────────────────────────────────────────────────────────
export class SceneController {
  constructor(ctx) {
    this.scope = ctx.scope;
    this.store = ctx.store;
    this._lastObjPath = undefined;
  }

  get lastObjPath() { return this._lastObjPath; }

  init() {
    const s = this.scope;

    // ── 3D / 2D mode switch ──
    document.getElementById('obj-mode').addEventListener('change', e => s.objMode = e.target.checked);

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
    document.getElementById('obj-mode-3d').addEventListener('click',  () => _showMode(true));
    document.getElementById('obj-mode-img').addEventListener('click', () => _showMode(false));

    // ── OBJ file loading ──
    this._initObjLoading(s);

    // ── IMG file loading ──
    this._initImgLoading(s);

    // ── OBJ-only: Rx / Ry ──
    bindRange('obj-rx', v => { s._obj.rotX = v * Math.PI / 180; document.getElementById('obj-rx-val').textContent = Math.round(v) + '°'; });
    bindRange('obj-ry', v => { s._obj.rotY = v * Math.PI / 180; document.getElementById('obj-ry-val').textContent = Math.round(v) + '°'; });

    // ── IMG-only: trace mode, threshold, density, tilt ──
    this._initImgTrace(s);

    // ── Shared transforms ──
    this._initSharedTransforms(s);

    // ── Shared animation + music sync ──
    this._initAnimation(s);

    // ── Movement FX ──
    this._initMovementFX(s);

    // ── Draw power ──
    this._initDrawPower(s);
  }

  _initObjLoading(s) {
    const objDrop = document.getElementById('obj-drop-zone');
    const objFile = document.getElementById('obj-file');

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

    // ── OBJ Library ──
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
  }

  _initImgLoading(s) {
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
  }

  _initImgTrace(s) {
    const imgTraceBtns = document.querySelectorAll('.img-trace-btn');
    imgTraceBtns.forEach(btn => btn.addEventListener('click', () => {
      imgTraceBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      s._imgScene.traceMode = btn.dataset.trace;
      s._imgScene._computeTrace();
    }));
    bindRange('img-threshold', v => {
      s._imgScene.threshold = v;
      document.getElementById('img-thr-val').textContent = Math.round(v);
      s._imgScene._computeTrace();
    });
    bindRange('img-density', v => {
      s._imgScene.sampleRes = Math.round(v);
      document.getElementById('img-den-val').textContent = Math.round(v);
      s._imgScene._computeTrace();
    });
    bindRange('img-rx3d', v => { s._imgScene.rotX3d = v; document.getElementById('img-rx3d-val').textContent = Math.round(v) + '°'; });
    bindRange('img-ry3d', v => { s._imgScene.rotY3d = v; document.getElementById('img-ry3d-val').textContent = Math.round(v) + '°'; });
  }

  _initSharedTransforms(s) {
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

    bindRange('sc-scale', v => {
      s._obj.scale = v; s._imgScene.scale = v;
      document.getElementById('sc-scale-val').textContent = v.toFixed(2);
    });
    bindRange('sc-rz', v => {
      s._obj.rotZ = v * Math.PI / 180;
      s._imgScene.rotZ = v;
      document.getElementById('sc-rz-val').textContent = Math.round(v) + '°';
    });
    bindRange('sc-px', v => {
      s._obj.posX = v; s._imgScene.posX = v;
      document.getElementById('sc-px-val').textContent = v.toFixed(2);
    });
    bindRange('sc-py', v => {
      s._obj.posY = v; s._imgScene.posY = v;
      document.getElementById('sc-py-val').textContent = v.toFixed(2);
    });
  }

  _initAnimation(s) {
    // Per-axis auto-rotate
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

    bindRange('sc-rot-spd-x', v => { s._obj.rotSpeedX = v; s._imgScene.rotSpeedX3d = v; document.getElementById('sc-rsx-val').textContent = v.toFixed(1); });
    bindRange('sc-rot-spd-y', v => { s._obj.rotSpeed = v;  s._imgScene.rotSpeedY3d = v; document.getElementById('sc-rsy-val').textContent = v.toFixed(1); });
    bindRange('sc-rot-spd-z', v => { s._obj.rotSpeedZ = v; s._imgScene.rotSpeed = v;    document.getElementById('sc-rsz-val').textContent = v.toFixed(1); });

    document.getElementById('sc-beat-pulse').addEventListener('change', e => {
      s._obj.beatPulse = e.target.checked; s._imgScene.beatPulse = e.target.checked;
    });
    document.getElementById('sc-show-audio').addEventListener('change', e => {
      s._obj.showAudio = e.target.checked; s._imgScene.showAudio = e.target.checked;
    });

    // Infinite scroll
    bindRange('sc-scroll-x', v => { s._obj.scrollX = v; s._imgScene.scrollX = v; document.getElementById('sc-sx-val').textContent = v.toFixed(2); });
    bindRange('sc-scroll-y', v => { s._obj.scrollY = v; s._imgScene.scrollY = v; document.getElementById('sc-sy-val').textContent = v.toFixed(2); });

    // Breathe / shake / warp
    document.getElementById('sc-breathe').addEventListener('change', e => { s._obj.breathe = e.target.checked; s._imgScene.breathe = e.target.checked; });
    document.getElementById('sc-shake').addEventListener('change', e => { s._obj.shake = e.target.checked; s._imgScene.shake = e.target.checked; });
    document.getElementById('sc-warp').addEventListener('change', e => { s._obj.warp = e.target.checked; s._imgScene.warp = e.target.checked; });
    bindRange('sc-warp-amt', v => { s._obj.warpAmt = v; s._imgScene.warpAmt = v; document.getElementById('sc-warp-val').textContent = v.toFixed(2); });

    // Audio sketch (image-only)
    document.getElementById('sc-audio-sketch').addEventListener('change', e => { s._imgScene.audioSketch = e.target.checked; });
  }

  _initMovementFX(s) {
    document.getElementById('sc-float').addEventListener('change', e => { s._obj.float = e.target.checked; s._imgScene.float = e.target.checked; });
    document.getElementById('sc-ripple').addEventListener('change', e => { s._obj.ripple = e.target.checked; s._imgScene.ripple = e.target.checked; });
    document.getElementById('sc-twist').addEventListener('change', e => { s._obj.twist = e.target.checked; s._imgScene.twist = e.target.checked; });
    document.getElementById('sc-explode').addEventListener('change', e => {
      const on = e.target.checked;
      s._obj.explode = on; s._imgScene.explode = on;
      if (on) { s._obj._explodeT = 0; s._imgScene._explodeT = 0; }
    });
    document.getElementById('sc-explode-loop').addEventListener('change', e => { s._obj.explodeLoop = e.target.checked; s._imgScene.explodeLoop = e.target.checked; });
    bindRange('sc-motion-amt', v => { s._obj.motionAmt = v; s._imgScene.motionAmt = v; document.getElementById('sc-motion-amt-val').textContent = v.toFixed(2); });
    bindRange('sc-motion-speed', v => { s._obj.motionSpeed = v; s._imgScene.motionSpeed = v; document.getElementById('sc-motion-speed-val').textContent = v.toFixed(1); });
  }

  _initDrawPower(s) {
    bindRange('sc-power', v => { s._obj.power = v; s._imgScene.power = v; document.getElementById('sc-power-val').textContent = v.toFixed(2); });
    document.getElementById('sc-auto-power').addEventListener('change', e => {
      const on = e.target.checked;
      s._obj.autoPower = on; s._imgScene.autoPower = on;
      if (on) {
        s._obj.power = 0; s._imgScene.power = 0;
        document.getElementById('sc-power').value = 0;
        document.getElementById('sc-power-val').textContent = '0.00';
      }
    });
    document.getElementById('sc-power-loop').addEventListener('change', e => { s._obj.powerLoop = e.target.checked; s._imgScene.powerLoop = e.target.checked; });
    bindRange('sc-power-speed', v => { s._obj.powerSpeed = v; s._imgScene.powerSpeed = v; document.getElementById('sc-ps-val').textContent = v.toFixed(3); });
  }
}

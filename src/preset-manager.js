'use strict';

export class PresetManager {
  constructor(scope) {
    this.scope = scope;
    this.SLOT_COUNT = 8;
    this.STORAGE_KEY = 'osc_presets';
    this._slots = this._loadSlots();
  }

  _loadSlots() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === this.SLOT_COUNT) return parsed;
      }
    } catch (_) {}
    return new Array(this.SLOT_COUNT).fill(null);
  }

  _saveSlots() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._slots));
  }

  capture() {
    const s = this.scope;
    const obj = s._obj;
    const img = s._imgScene;
    return {
      // Beam
      color: s.color,
      sceneColor: s.sceneColor,
      beamWidth: s.beamWidth,
      glowAmount: s.glowAmount,
      persistence: s.persistence,
      // FX
      fx: {
        reactive: s.fx.reactive,
        beatFlash: s.fx.beatFlash,
        bloom: s.fx.bloom,
        mirrorX: s.fx.mirrorX,
        mirrorY: s.fx.mirrorY,
        rotation: s.fx.rotation,
        beatInvert: s.fx.beatInvert,
        afterglow: s.fx.afterglow,
        rotSpeed: s.fx.rotSpeed,
        beatSens: s.fx.beatSens,
        afterglowSpeed: s.fx.afterglowSpeed,
        afterglowStr: s.fx.afterglowStr,
        reactiveStr: s.fx.reactiveStr,
        beatStr: s.fx.beatStr,
        bloomStr: s.fx.bloomStr,
      },
      // Signal FX
      smooth: s.smooth,
      filterEnabled: s.filterEnabled,
      filterLow: s.filterLow,
      filterHigh: s.filterHigh,
      // Scene
      objMode: s.objMode,
      obj3dMode: s.obj3dMode,
      scale: obj.scale,
      rotZ: s.obj3dMode ? (obj.rotZ * 180 / Math.PI) : img.rotZ,
      posX: obj.posX,
      posY: obj.posY,
      tileX: obj.tileX,
      tileY: obj.tileY,
      radialN: obj.radialN,
      scrollX: obj.scrollX,
      scrollY: obj.scrollY,
      breathe: obj.breathe,
      shake: obj.shake,
      warp: obj.warp,
      warpAmt: obj.warpAmt,
      power: obj.power,
      autoPower: obj.autoPower,
      powerLoop: obj.powerLoop,
      powerSpeed: obj.powerSpeed,
      autoRotX: obj.autoRotX,
      autoRotY: obj.autoRotY,
      autoRotZ: obj.autoRotZ,
      rotSpeedX: obj.rotSpeedX,
      rotSpeedY: obj.rotSpeed,
      rotSpeedZ: obj.rotSpeedZ,
      beatPulse: obj.beatPulse,
      showAudio: obj.showAudio,
      // Display
      showGrid: s.showGrid,
      crtCurve: s.crtCurve,
    };
  }

  apply(preset) {
    const s = this.scope;
    const obj = s._obj;
    const img = s._imgScene;

    // Beam
    s.color = preset.color;
    s.sceneColor = preset.sceneColor || '';
    s.beamWidth = preset.beamWidth;
    s.glowAmount = preset.glowAmount;
    s.persistence = preset.persistence;

    // FX
    if (preset.fx) {
      s.fx.reactive = preset.fx.reactive;
      s.fx.beatFlash = preset.fx.beatFlash;
      s.fx.bloom = preset.fx.bloom;
      s.fx.mirrorX = preset.fx.mirrorX;
      s.fx.mirrorY = preset.fx.mirrorY;
      s.fx.rotation = preset.fx.rotation;
      s.fx.beatInvert = preset.fx.beatInvert;
      s.fx.afterglow = preset.fx.afterglow || false;
      s.fx.rotSpeed = preset.fx.rotSpeed;
      s.fx.beatSens = preset.fx.beatSens;
      s.fx.afterglowSpeed = preset.fx.afterglowSpeed || 0;
      s.fx.afterglowStr = preset.fx.afterglowStr || 0.7;
      s.fx.reactiveStr = preset.fx.reactiveStr ?? 1.0;
      s.fx.beatStr     = preset.fx.beatStr     ?? 0.35;
      s.fx.bloomStr    = preset.fx.bloomStr    ?? 1.0;
    }

    // Signal FX
    s.smooth = preset.smooth;
    s.filterEnabled = preset.filterEnabled;
    s.filterLow = preset.filterLow;
    s.filterHigh = preset.filterHigh;

    // Scene
    s.objMode = preset.objMode;
    s.obj3dMode = preset.obj3dMode;

    // Apply to both scenes
    const rz = preset.rotZ || 0;
    obj.scale = preset.scale; img.scale = preset.scale;
    obj.rotZ = rz * Math.PI / 180; img.rotZ = rz;
    obj.posX = preset.posX; img.posX = preset.posX;
    obj.posY = preset.posY; img.posY = preset.posY;
    obj.tileX = preset.tileX; img.tileX = preset.tileX;
    obj.tileY = preset.tileY; img.tileY = preset.tileY;
    obj.radialN = preset.radialN; img.radialN = preset.radialN;
    obj.scrollX = preset.scrollX; img.scrollX = preset.scrollX;
    obj.scrollY = preset.scrollY; img.scrollY = preset.scrollY;
    obj.breathe = preset.breathe; img.breathe = preset.breathe;
    obj.shake = preset.shake; img.shake = preset.shake;
    obj.warp = preset.warp; img.warp = preset.warp;
    obj.warpAmt = preset.warpAmt; img.warpAmt = preset.warpAmt;
    obj.power = preset.power; img.power = preset.power;
    obj.autoPower = preset.autoPower; img.autoPower = preset.autoPower;
    obj.powerLoop = preset.powerLoop; img.powerLoop = preset.powerLoop;
    obj.powerSpeed = preset.powerSpeed; img.powerSpeed = preset.powerSpeed;

    // Auto-rotate
    obj.autoRotX = preset.autoRotX; img.autoRotX3d = preset.autoRotX;
    obj.autoRotY = preset.autoRotY; img.autoRotY3d = preset.autoRotY;
    obj.autoRotZ = preset.autoRotZ; img.autoSpin = preset.autoRotZ;
    obj.rotSpeedX = preset.rotSpeedX; img.rotSpeedX3d = preset.rotSpeedX;
    obj.rotSpeed = preset.rotSpeedY; img.rotSpeedY3d = preset.rotSpeedY;
    obj.rotSpeedZ = preset.rotSpeedZ; img.rotSpeed = preset.rotSpeedZ;
    obj.beatPulse = preset.beatPulse; img.beatPulse = preset.beatPulse;
    obj.showAudio = preset.showAudio; img.showAudio = preset.showAudio;

    // Display
    s.showGrid = preset.showGrid;
    s.crtCurve = preset.crtCurve;

    // Update all UI
    this._updateUI(preset);
  }

  _updateUI(p) {
    // Helper to set value and dispatch input event
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const setCheck = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.checked !== val) {
        el.checked = val;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    const setSelect = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(val);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // Color — apply via swatch or picker
    const hex = p.color;
    document.getElementById('phosphor-color').value = hex;
    document.documentElement.style.setProperty('--p', hex);
    document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
    const match = document.querySelector(`.color-swatch[data-color="${hex}"]`);
    if (match) match.classList.add('active');

    // Beam display
    setVal('beam-width', p.beamWidth);
    document.getElementById('beam-width-val').textContent = p.beamWidth.toFixed(1);
    setVal('glow', p.glowAmount);
    document.getElementById('glow-val').textContent = Math.round(p.glowAmount);
    setVal('persistence', p.persistence);
    document.getElementById('persistence-val').textContent = p.persistence.toFixed(2);

    // Ensure Display panel is uncollapsed so user sees the change
    const dispPanel = document.querySelector('[data-panel-id="display"]');
    if (dispPanel) dispPanel.classList.remove('collapsed');

    // FX checkboxes
    if (p.fx) {
      setCheck('fx-reactive', p.fx.reactive);
      setCheck('fx-beat', p.fx.beatFlash);
      setCheck('fx-bloom', p.fx.bloom);
      setCheck('fx-invert', p.fx.beatInvert);
      setCheck('fx-afterglow', p.fx.afterglow || false);
      setCheck('fx-mirror-x', p.fx.mirrorX);
      setCheck('fx-mirror-y', p.fx.mirrorY);
      setCheck('fx-rotate', p.fx.rotation);
      setVal('fx-rot-speed', p.fx.rotSpeed);
      document.getElementById('fx-rs-val').textContent = p.fx.rotSpeed.toFixed(3);
      setVal('fx-beat-sens', p.fx.beatSens);
      document.getElementById('fx-bs-val').textContent = p.fx.beatSens.toFixed(2);
      setVal('fx-afterglow-speed', p.fx.afterglowSpeed || 0);
      document.getElementById('fx-ag-val').textContent = (p.fx.afterglowSpeed || 0).toFixed(3);
      setVal('fx-afterglow-str', p.fx.afterglowStr || 0.7);
      document.getElementById('fx-afterglow-str-val').textContent = (p.fx.afterglowStr || 0.7).toFixed(2);
      setVal('fx-reactive-str', p.fx.reactiveStr ?? 1.0);
      document.getElementById('fx-reactive-str-val').textContent = (p.fx.reactiveStr ?? 1.0).toFixed(1);
      setVal('fx-beat-str', p.fx.beatStr ?? 0.35);
      document.getElementById('fx-beat-str-val').textContent = (p.fx.beatStr ?? 0.35).toFixed(2);
      setVal('fx-bloom-str', p.fx.bloomStr ?? 1.0);
      document.getElementById('fx-bloom-str-val').textContent = (p.fx.bloomStr ?? 1.0).toFixed(1);
    }

    // Signal FX
    setCheck('smooth', p.smooth);
    setCheck('freq-filter', p.filterEnabled);
    const flEl = document.getElementById('filter-low');
    if (flEl) { flEl.value = p.filterLow; flEl.dispatchEvent(new Event('change', { bubbles: true })); }
    const fhEl = document.getElementById('filter-high');
    if (fhEl) { fhEl.value = p.filterHigh; fhEl.dispatchEvent(new Event('change', { bubbles: true })); }

    // Scene color
    const scOn = !!(p.sceneColor && p.sceneColor !== '');
    setCheck('scene-color-on', scOn);
    document.getElementById('scene-color').disabled = !scOn;
    if (scOn) document.getElementById('scene-color').value = p.sceneColor;

    // Scene
    setCheck('obj-mode', p.objMode);
    // Mode switch (3D vs IMG)
    if (p.obj3dMode) {
      document.getElementById('obj-mode-3d').click();
    } else {
      document.getElementById('obj-mode-img').click();
    }

    // Scene transforms
    setVal('sc-scale', p.scale);
    document.getElementById('sc-scale-val').textContent = p.scale.toFixed(2);
    setVal('sc-rz', p.rotZ || 0);
    document.getElementById('sc-rz-val').textContent = Math.round(p.rotZ || 0) + '\u00B0';
    setVal('sc-px', p.posX);
    document.getElementById('sc-px-val').textContent = p.posX.toFixed(2);
    setVal('sc-py', p.posY);
    document.getElementById('sc-py-val').textContent = p.posY.toFixed(2);

    // Tiling
    setSelect('sc-tile-x', p.tileX);
    setSelect('sc-tile-y', p.tileY);
    setSelect('sc-radial', p.radialN);

    // Auto-rotate
    setCheck('sc-auto-rot-x', p.autoRotX);
    setCheck('sc-auto-rot-y', p.autoRotY);
    setCheck('sc-auto-rot-z', p.autoRotZ);
    setVal('sc-rot-spd-x', p.rotSpeedX);
    document.getElementById('sc-rsx-val').textContent = p.rotSpeedX.toFixed(1);
    setVal('sc-rot-spd-y', p.rotSpeedY);
    document.getElementById('sc-rsy-val').textContent = p.rotSpeedY.toFixed(1);
    setVal('sc-rot-spd-z', p.rotSpeedZ);
    document.getElementById('sc-rsz-val').textContent = p.rotSpeedZ.toFixed(1);

    setCheck('sc-beat-pulse', p.beatPulse);
    setCheck('sc-show-audio', p.showAudio);

    // Scroll
    setVal('sc-scroll-x', p.scrollX);
    document.getElementById('sc-sx-val').textContent = p.scrollX.toFixed(2);
    setVal('sc-scroll-y', p.scrollY);
    document.getElementById('sc-sy-val').textContent = p.scrollY.toFixed(2);

    // Breathe/shake/warp
    setCheck('sc-breathe', p.breathe);
    setCheck('sc-shake', p.shake);
    setCheck('sc-warp', p.warp);
    setVal('sc-warp-amt', p.warpAmt);
    document.getElementById('sc-warp-val').textContent = p.warpAmt.toFixed(2);

    // Draw power
    setVal('sc-power', p.power);
    document.getElementById('sc-power-val').textContent = p.power.toFixed(2);
    setCheck('sc-auto-power', p.autoPower);
    setCheck('sc-power-loop', p.powerLoop);
    setVal('sc-power-speed', p.powerSpeed);
    document.getElementById('sc-ps-val').textContent = p.powerSpeed.toFixed(3);

    // Display toggles
    setCheck('show-grid', p.showGrid);
    setCheck('crt-curve', p.crtCurve);
  }

  save(slotIndex, name) {
    if (slotIndex < 0 || slotIndex >= this.SLOT_COUNT) return;
    const data = this.capture();
    data._name = name || `Preset ${slotIndex + 1}`;
    this._slots[slotIndex] = data;
    this._saveSlots();
  }

  load(slotIndex) {
    if (slotIndex < 0 || slotIndex >= this.SLOT_COUNT) return false;
    const preset = this._slots[slotIndex];
    if (!preset) return false;
    this.apply(preset);
    return true;
  }

  delete(slotIndex) {
    if (slotIndex < 0 || slotIndex >= this.SLOT_COUNT) return;
    this._slots[slotIndex] = null;
    this._saveSlots();
  }

  exportJSON(slotIndex) {
    if (slotIndex < 0 || slotIndex >= this.SLOT_COUNT) return;
    const preset = this._slots[slotIndex];
    if (!preset) return;
    const json = JSON.stringify(preset, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `osc_preset_${(preset._name || 'preset').replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  importJSON(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const preset = JSON.parse(ev.target.result);
          // Find next empty slot
          let idx = this._slots.findIndex(s => s === null);
          if (idx === -1) idx = this.SLOT_COUNT - 1; // overwrite last if all full
          if (!preset._name) preset._name = file.name.replace(/\.json$/i, '');
          this._slots[idx] = preset;
          this._saveSlots();
          resolve(idx);
        } catch (e) {
          console.error('Preset import failed:', e);
          resolve(-1);
        }
      };
      reader.onerror = () => resolve(-1);
      reader.readAsText(file);
    });
  }

  getSlot(i) { return this._slots[i]; }
  getSlots() { return this._slots; }

  // Install built-in presets into empty storage (first run only)
  installDefaults(builtins) {
    // Only install if storage is completely empty
    const hasAny = this._slots.some(s => s !== null);
    if (hasAny) return;
    builtins.forEach((p, i) => {
      if (i < this.SLOT_COUNT) this._slots[i] = p;
    });
    this._saveSlots();
  }
}

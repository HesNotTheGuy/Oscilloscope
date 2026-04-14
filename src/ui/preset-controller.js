'use strict';

import { PresetManager } from '../preset-manager.js';

// ─────────────────────────────────────────────────────────────
//  PresetController — save, load, export, import presets
// ─────────────────────────────────────────────────────────────
export class PresetController {
  constructor(ctx) {
    this.scope = ctx.scope;
    this.store = ctx.store;
    this.presetMgr = null;
  }

  init() {
    const s = this.scope;

    // ── Built-in presets ──
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
    const slotsEl    = document.getElementById('preset-slots');
    const btnSave    = document.getElementById('btn-preset-save');
    const btnExport  = document.getElementById('btn-preset-export');
    const btnImport  = document.getElementById('btn-preset-import');
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

          const del = document.createElement('span');
          del.className = 'preset-del visible';
          del.textContent = '\u00D7';
          del.addEventListener('click', ev => {
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
            const existingName = pm.getSlot(i)?._name || '';
            const defaultName = existingName || `Preset ${i + 1}`;

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
            input.addEventListener('keydown', ev => {
              if (ev.key === 'Enter') { ev.preventDefault(); doSave(); }
              if (ev.key === 'Escape') { ev.preventDefault(); exitSaveMode(); renderSlots(); }
              ev.stopPropagation();
            });
            input.addEventListener('blur', doSave);
            return;
          }
          if (slot) {
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
      if (saveMode) { exitSaveMode(); }
      else { saveMode = true; btnSave.classList.add('save-mode'); btnSave.textContent = 'PICK SLOT'; }
    });

    btnExport.addEventListener('click', () => {
      if (activeSlot >= 0 && pm.getSlot(activeSlot)) {
        pm.exportJSON(activeSlot);
      } else {
        const idx = pm.getSlots().findIndex(s => s !== null);
        if (idx >= 0) pm.exportJSON(idx);
      }
    });

    btnImport.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async ev => {
      const file = ev.target.files[0];
      if (!file) return;
      const idx = await pm.importJSON(file);
      if (idx >= 0) { activeSlot = idx; renderSlots(); }
      importFile.value = '';
    });

    renderSlots();
  }
}

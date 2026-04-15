'use strict';

// ─────────────────────────────────────────────────────────────
//  LayoutController — rig system, panels, tabs, search, drag-drop
// ─────────────────────────────────────────────────────────────
export class LayoutController {
  constructor(ctx) {
    this.scope = ctx.scope;
    this.store = ctx.store;
  }

  init() {
    const app   = document.querySelector('.app');
    const store = document.getElementById('panel-store');
    const zones = {
      left:   document.getElementById('zone-left'),
      under:  document.getElementById('zone-under'),
      right:  document.getElementById('zone-right'),
      bottom: document.getElementById('zone-bottom'),
    };
    if (!app || !store) return;

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

    // ── Tab groups ──
    const TAB_GROUPS = {
      scope:  { label: 'Scope',  ids: ['ch1', 'ch2', 'horiz', 'trig', 'ctrl'] },
      beam:   { label: 'Beam',   ids: ['beamfx', 'display', 'sigfx'] },
      scene:  { label: 'Scene',  ids: ['scene'] },
      source: { label: 'Source', ids: ['audio', 'siggen', 'presets'] },
    };

    // ── Panel search aliases ──
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

    // ── Tab bar + search bar ──
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
      tabBar.querySelectorAll('.tab-bar-btn').forEach(b => b.classList.remove('active'));
      allSections.forEach(sec => {
        const id = sec.dataset.panelId;
        const title = (sec.querySelector('.fp-title')?.textContent || '').toLowerCase();
        const aliases = (PANEL_ALIASES[id] || []).join(' ');
        const match = title.includes(q) || id.includes(q) || aliases.includes(q);
        sec.classList.toggle('tab-hidden', !match);
      });
    });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { searchInput.value = ''; showTab(activeTab); searchInput.blur(); }
      e.stopPropagation();
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
    const rigSelect = document.getElementById('rig-select');
    const editBtn   = document.getElementById('rig-edit-btn');
    const saveBtn   = document.getElementById('rig-save-btn');

    const savedCollapsed = JSON.parse(localStorage.getItem('osc_panelCollapsed') || '{}');

    const saveRigState = () => {
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
      allSections.forEach(s => store.appendChild(s));
      Object.keys(zones).forEach(zk => {
        const ids = rigDef[zk] || [];
        ids.forEach(id => {
          const sec = store.querySelector(`[data-panel-id="${id}"]`);
          if (sec) zones[zk].appendChild(sec);
        });
      });
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
        exitTabbedMode();
        const customs = JSON.parse(localStorage.getItem('osc_customRigs') || '{}');
        if (customs[name]) {
          applyRig(customs[name]);
          localStorage.setItem('osc_rigName', name);
        }
      }
    });

    // ── Update / delete custom rig buttons ──
    const updateBtn = document.getElementById('rig-update-btn');
    const deleteBtn = document.getElementById('rig-delete-btn');
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
          opt.value = name; opt.textContent = name;
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

    updateBtn.addEventListener('click', () => {
      const name = rigSelect.value;
      if (BUILTIN_NAMES.includes(name)) return;
      const customs = JSON.parse(localStorage.getItem('osc_customRigs') || '{}');
      customs[name] = getCurrentRig();
      localStorage.setItem('osc_customRigs', JSON.stringify(customs));
      saveRigState();
      updateBtn.style.color = '#0f0';
      setTimeout(() => { updateBtn.style.color = ''; }, 400);
    });

    deleteBtn.addEventListener('click', () => {
      const name = rigSelect.value;
      if (BUILTIN_NAMES.includes(name)) return;
      const customs = JSON.parse(localStorage.getItem('osc_customRigs') || '{}');
      delete customs[name];
      localStorage.setItem('osc_customRigs', JSON.stringify(customs));
      const opt = rigSelect.querySelector(`option[value="${name}"]`);
      if (opt) opt.remove();
      rigSelect.value = 'default';
      rigSelect.dispatchEvent(new Event('change'));
    });

    // ── Layout mode toggle ──
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

    // ── Workspace ⋯ menu (folds the 5 hidden rig buttons) ──
    const menuBtn = document.getElementById('rig-menu-btn');
    const menu    = document.getElementById('rig-menu');
    if (menuBtn && menu) {
      const items = menu.querySelectorAll('.rig-menu-item');
      const refreshMenuItems = () => {
        const builtin = BUILTIN_NAMES.includes(rigSelect.value);
        items.forEach(it => {
          const action = it.dataset.action;
          if (action === 'update' || action === 'delete') {
            it.classList.toggle('disabled', builtin);
          }
        });
      };
      refreshMenuItems();
      rigSelect.addEventListener('change', refreshMenuItems);

      menuBtn.addEventListener('click', ev => {
        ev.stopPropagation();
        refreshMenuItems();
        menu.hidden = !menu.hidden;
      });
      menu.addEventListener('click', ev => {
        const item = ev.target.closest('.rig-menu-item');
        if (!item || item.classList.contains('disabled')) return;
        const action = item.dataset.action;
        menu.hidden = true;
        switch (action) {
          case 'save': {
            const name = (window.prompt('Save current layout as…', '') || '').trim();
            if (!name) return;
            const slug = name.toLowerCase().replace(/\s+/g, '-');
            const customs = JSON.parse(localStorage.getItem('osc_customRigs') || '{}');
            customs[slug] = getCurrentRig();
            localStorage.setItem('osc_customRigs', JSON.stringify(customs));
            localStorage.setItem('osc_rigName', slug);
            if (!rigSelect.querySelector(`option[value="${slug}"]`)) {
              const opt = document.createElement('option');
              opt.value = slug; opt.textContent = name;
              rigSelect.appendChild(opt);
            }
            rigSelect.value = slug;
            refreshCustomButtons();
            refreshMenuItems();
            break;
          }
          case 'update': updateBtn.click(); break;
          case 'delete':
            if (window.confirm(`Delete rig "${rigSelect.value}"?`)) deleteBtn.click();
            break;
          case 'edit': editBtn.click(); break;
          case 'toggle-layout': layoutBtn.click(); break;
        }
      });
      document.addEventListener('click', ev => {
        if (menu.hidden) return;
        if (!menu.contains(ev.target) && ev.target !== menuBtn) menu.hidden = true;
      });
    }

    // ── Edit mode toggle ──
    editBtn.addEventListener('click', () => {
      editing = !editing;
      app.classList.toggle('rig-editing', editing);
      editBtn.classList.toggle('active', editing);
      editBtn.title = editing ? 'Exit edit mode' : 'Toggle edit mode — drag panels between zones';
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
      if (savedCollapsed[id]) sec.classList.add('collapsed');

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

      sec.addEventListener('dragover', e => {
        if (!editing) return;
        e.preventDefault(); e.stopPropagation();
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

      sec.addEventListener('drop', e => {
        if (!editing) return;
        e.preventDefault(); e.stopPropagation();
        if (!dragSrc || dragSrc === sec) return;
        const container = sec.parentElement;
        const rect = sec.getBoundingClientRect();
        const isVert = container.classList.contains('zone-side');
        const before = isVert
          ? (e.clientY < rect.top + rect.height / 2)
          : (e.clientX < rect.left + rect.width / 2);
        if (before) container.insertBefore(dragSrc, sec);
        else sec.after(dragSrc);
        sec.classList.remove('panel-drop-before', 'panel-drop-after');
        saveRigState();
      });
    });

    // ── Zone drop targets ──
    Object.values(zones).forEach(zone => {
      zone.addEventListener('dragover', e => {
        if (!editing || !dragSrc) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('zone-drag-over');
      });
      zone.addEventListener('dragleave', e => {
        if (e.relatedTarget && zone.contains(e.relatedTarget)) return;
        zone.classList.remove('zone-drag-over');
      });
      zone.addEventListener('drop', e => {
        if (!editing || !dragSrc) return;
        e.preventDefault();
        zone.classList.remove('zone-drag-over');
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
      opt.value = name; opt.textContent = name;
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

'use strict';

import { ScopeController } from './ui/scope-controller.js';
import { DisplayController } from './ui/display-controller.js';
import { FXController } from './ui/fx-controller.js';
import { SceneController } from './ui/scene-controller.js';
import { AudioController } from './ui/audio-controller.js';
import { SignalGenController } from './ui/siggen-controller.js';
import { PresetController } from './ui/preset-controller.js';
import { LayoutController } from './ui/layout-controller.js';
import { KeyboardController } from './ui/keyboard-controller.js';
import { PopOutController } from './ui/popout-controller.js';
import { ThemeController } from './ui/theme-controller.js';
import { ThemeManager } from './theme-manager.js';

// ─────────────────────────────────────────────────────────────
//  UIController — thin orchestrator that delegates to domain
//  controllers. Each domain owns its own DOM bindings.
// ─────────────────────────────────────────────────────────────
export class UIController {
  constructor(engine, scope, sigGen, recorder, store, inputMap) {
    this.engine   = engine;
    this.scope    = scope;
    this.sigGen   = sigGen;
    this.recorder = recorder;
    this.store    = store || null;
    this.inputMap = inputMap || null;
    this.knobs    = {};
  }

  init() {
    // Apply saved theme before any rendering
    this._themeMgr = new ThemeManager();
    const themeDefaults = this._themeMgr.apply(this._themeMgr.current());

    // Apply theme scope defaults to oscilloscope before controllers init
    if (themeDefaults) {
      const s = this.scope;
      if (themeDefaults.traceColor)    s.color       = themeDefaults.traceColor;
      if (themeDefaults.glowAmount !== undefined)  s.glowAmount  = themeDefaults.glowAmount;
      if (themeDefaults.beamWidth !== undefined)    s.beamWidth   = themeDefaults.beamWidth;
      if (themeDefaults.persistence !== undefined)  s.persistence = themeDefaults.persistence;
    }

    // Shared context passed to every domain controller
    const ctx = {
      engine:      this.engine,
      scope:       this.scope,
      sigGen:      this.sigGen,
      recorder:    this.recorder,
      store:       this.store,
      knobs:       this.knobs,
      ensureAudio: () => this._ensureAudio(),
      inputMap:    this.inputMap,
      themeMgr:    this._themeMgr,
    };

    // Instantiate domain controllers
    this._scope    = new ScopeController(ctx);
    this._display  = new DisplayController(ctx);
    this._fx       = new FXController(ctx);
    this._scene    = new SceneController(ctx);
    this._audio    = new AudioController(ctx);
    this._sigGen   = new SignalGenController(ctx);
    this._preset   = new PresetController(ctx);
    this._layout   = new LayoutController(ctx);
    this._keyboard = new KeyboardController(ctx);
    this._popout   = new PopOutController(ctx);
    this._theme    = new ThemeController(ctx);

    // Initialize all domains
    this._scope.init();
    this._display.init();
    this._fx.init();
    this._scene.init();
    this._audio.init();
    this._sigGen.init();
    this._preset.init();

    // Expose preset manager for external access (screenshot automation, etc.)
    this.presetMgr = this._preset.presetMgr;

    // Start scope rendering
    this.scope.start();

    // Theme picker (after display controls exist so theme can update sliders)
    this._theme.init();

    // Layout, popout, and keyboard are initialized last
    // (layout needs panels to exist, keyboard binds globally)
    this._layout.init();
    this._popout.init();
    this._keyboard.init();
  }

  async _ensureAudio() {
    if (this._audioReady) return;
    await this.engine.init();
    this.sigGen.init(this.engine.actx);
    this._audioReady = true;
  }
}

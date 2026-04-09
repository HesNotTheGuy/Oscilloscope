'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  ObjScene  —  parses .obj files and projects edges to screen space
// ─────────────────────────────────────────────────────────────────────────────
export class ObjScene {
  constructor() {
    this.verts     = [];
    this.edges     = [];
    this.loaded    = false;
    this.name      = '';

    // Manual transforms (radians for rotation)
    this.rotX      = 0;
    this.rotY      = 0;
    this.rotZ      = 0;
    this.scale     = 0.8;
    this.posX      = 0;
    this.posY      = 0;

    // Shared music-reactivity (matches ImageScene property names)
    this.autoRotY  = true;
    this.rotSpeed  = 0.5;   // degrees per frame (Y axis)
    this.beatPulse = true;
    this.showAudio = false;
    // Per-axis auto-rotation
    this.autoRotX  = false;
    this.rotSpeedX = 0.5;   // deg/frame for X
    this.autoRotZ  = false;
    this.rotSpeedZ = 0.5;   // deg/frame for Z

    // Music-sync animation modes
    this.breathe   = false;
    this.shake     = false;
    this.warp      = false;
    this.warpAmt   = 0.1;

    // Tiling & radial symmetry
    this.tileX     = 1;
    this.tileY     = 1;
    this.radialN   = 1;

    // Infinite scroll (tile steps per second; wraps seamlessly with tiling)
    this.scrollX   = 0;
    this.scrollY   = 0;

    // Draw power — 0: blank, 1: all edges drawn
    this.power      = 1;
    this.autoPower  = false;
    this.powerSpeed = 0.004;
    this.powerLoop  = false;

    // Movement FX (applied post-projection; shared amt/speed controls all active effects)
    this.float       = false;  // sinusoidal XY drift
    this.ripple      = false;  // expanding ring wave displaces points radially
    this.twist       = false;  // rotate points by amount proportional to distance from center
    this.explode     = false;  // push points outward; loops back to center
    this.motionAmt   = 0.2;   // shared intensity (0–1)
    this.motionSpeed = 1.0;   // shared speed multiplier
    this.explodeLoop = false;  // auto-restart explosion

    // Internal FX state
    this._pulse      = 0;
    this._breatheSc  = 1;
    this._shakeX     = 0;
    this._shakeY     = 0;
    this._scrollOffX = 0;
    this._scrollOffY = 0;
    this._lastScrollT = 0;
    this._lastRotT   = 0;   // for time-based rotation
    // Movement FX phases
    this._floatPhX   = 0;
    this._floatPhY   = 1.3;  // offset so X/Y are out of sync
    this._ripplePh   = 0;
    this._twistPh    = 0;
    this._explodeT   = 0;
    this._lastFxT    = 0;
  }

  load(text, name = 'model') {
    this.verts = []; this.edges = []; this.loaded = false;
    const rawV   = [];
    const edgeSet = new Set();
    const addEdge = (a, b) => {
      if (a === b) return;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!edgeSet.has(key)) { edgeSet.add(key); this.edges.push([a, b]); }
    };

    for (const rawLine of text.split('\n')) {
      const parts = rawLine.trim().split(/\s+/);
      const cmd   = parts[0];
      if (cmd === 'v') {
        rawV.push([parseFloat(parts[1]) || 0, parseFloat(parts[2]) || 0, parseFloat(parts[3]) || 0]);
      } else if (cmd === 'f') {
        const N = rawV.length;
        const idx = parts.slice(1).map(p => {
          const i = parseInt(p.split('/')[0], 10);
          return i < 0 ? N + i : i - 1;
        }).filter(i => i >= 0 && i < N);
        for (let i = 0; i < idx.length; i++) addEdge(idx[i], idx[(i + 1) % idx.length]);
      } else if (cmd === 'l') {
        const N = rawV.length;
        const idx = parts.slice(1).map(p => {
          const i = parseInt(p.split('/')[0], 10);
          return i < 0 ? N + i : i - 1;
        }).filter(i => i >= 0 && i < N);
        for (let i = 0; i < idx.length - 1; i++) addEdge(idx[i], idx[i + 1]);
      }
    }

    if (!rawV.length) return false;

    // Normalize vertices to [-1, 1]
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity,z0=Infinity,z1=-Infinity;
    for (const [x,y,z] of rawV) {
      if(x<x0)x0=x; if(x>x1)x1=x;
      if(y<y0)y0=y; if(y>y1)y1=y;
      if(z<z0)z0=z; if(z>z1)z1=z;
    }
    const cx=(x0+x1)/2, cy=(y0+y1)/2, cz=(z0+z1)/2;
    const range = Math.max(x1-x0, y1-y0, z1-z0) / 2 || 1;
    this.verts  = rawV.map(([x,y,z]) => [(x-cx)/range, (y-cy)/range, (z-cz)/range]);
    this.loaded = true;
    this.name   = name;
    return true;
  }

  // Returns [[x0,y0],[x1,y1]] screen-space edge pairs.
  // audioBuf: Float32Array time-domain samples (for Warp mode)
  getScreenEdges(W, H, rms = 0, beat = false, audioBuf = null) {
    if (!this.loaded) return [];

    // Time-based auto-rotation (independent of frame rate)
    const _now = performance.now() / 1000;
    const _dt  = this._lastRotT > 0 ? Math.min(_now - this._lastRotT, 0.05) : 1/60;
    this._lastRotT = _now;
    const _dps = _dt * 60;  // normalize: speed values were tuned for ~60fps
    if (this.autoRotX) this.rotX = (this.rotX + this.rotSpeedX * Math.PI / 180 * _dps) % (Math.PI * 2);
    if (this.autoRotY) this.rotY = (this.rotY + this.rotSpeed  * Math.PI / 180 * _dps) % (Math.PI * 2);
    if (this.autoRotZ) this.rotZ = (this.rotZ + this.rotSpeedZ * Math.PI / 180 * _dps) % (Math.PI * 2);

    // Beat pulse
    if (beat && this.beatPulse) this._pulse = 0.3;
    if (this._pulse > 0.001)    this._pulse *= 0.8;

    // Breathe — exponentially-smoothed RMS → scale
    this._breatheSc = this._breatheSc * 0.88 + (this.breathe ? 1 + rms * 2.5 : 1) * 0.12;

    // Shake — position jitter on beat, decays each frame
    if (beat && this.shake) {
      this._shakeX = (Math.random() - 0.5) * 0.12;
      this._shakeY = (Math.random() - 0.5) * 0.12;
    }
    this._shakeX *= 0.7;
    this._shakeY *= 0.7;

    const sc  = this.scale * (1 + this._pulse) * this._breatheSc;
    const rx  = this.rotX, ry = this.rotY, rz = this.rotZ;
    const cxr = Math.cos(rx), sxr = Math.sin(rx);
    const cyr = Math.cos(ry), syr = Math.sin(ry);
    const czr = Math.cos(rz), szr = Math.sin(rz);

    // Combined rotation: Rz → Rx → Ry
    const xform = (x, y, z) => {
      const x1 = x*czr - y*szr,  y1 = x*szr + y*czr;
      const y2 = y1*cxr - z*sxr, z2 = y1*sxr + z*cxr;
      const x3 = x1*cyr + z2*syr;
      return [x3, y2];
    };

    const half   = Math.min(W, H) * 0.45 * sc;
    const ox     = this.posX + this._shakeX;
    const oy     = this.posY + this._shakeY;
    const toSx   = v => W/2 + (v + ox) * half;
    const toSy   = v => H/2 - (v + oy) * half;
    // Auto-ramp draw power
    if (this.autoPower) {
      this.power += this.powerSpeed;
      if (this.power >= 1) {
        this.power = this.powerLoop ? 0 : 1;
      }
    }

    const bufLen   = audioBuf ? audioBuf.length : 0;
    const edgeCount = Math.floor(Math.max(0, Math.min(1, this.power)) * this.edges.length);

    const result = [];
    for (let ei = 0; ei < edgeCount; ei++) {
      const [i0, i1] = this.edges[ei];
      let [ax, ay] = xform(...this.verts[i0]);
      let [bx, by] = xform(...this.verts[i1]);

      // Warp — radially displace projected 2D points using the audio waveform
      if (this.warp && bufLen > 0) {
        const ws = this.warpAmt * 0.5;
        const a0 = Math.atan2(ay, ax), a1 = Math.atan2(by, bx);
        const s0 = Math.floor(((a0 / (Math.PI*2)) + 0.5) * bufLen) % bufLen;
        const s1 = Math.floor(((a1 / (Math.PI*2)) + 0.5) * bufLen) % bufLen;
        const d0 = audioBuf[s0] * ws, d1 = audioBuf[s1] * ws;
        const r0 = Math.sqrt(ax*ax + ay*ay) || 0.001;
        const r1 = Math.sqrt(bx*bx + by*by) || 0.001;
        ax += (ax/r0) * d0;  ay += (ay/r0) * d0;
        bx += (bx/r1) * d1;  by += (by/r1) * d1;
      }

      result.push([[toSx(ax), toSy(ay)], [toSx(bx), toSy(by)]]);
    }

    // Radial symmetry — N rotated copies in a ring
    if (this.radialN > 1) {
      const sym = [];
      const cxs = W / 2, cys = H / 2;
      for (let i = 0; i < this.radialN; i++) {
        const a = (i / this.radialN) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        for (const [[x0,y0],[x1,y1]] of result) {
          const dx0=x0-cxs, dy0=y0-cys, dx1=x1-cxs, dy1=y1-cys;
          sym.push([
            [cxs + dx0*ca - dy0*sa, cys + dx0*sa + dy0*ca],
            [cxs + dx1*ca - dy1*sa, cys + dx1*sa + dy1*ca]
          ]);
        }
      }
      return this._applyMoveFx(sym, W, H);
    }

    // Tiling + infinite scroll
    const hasScroll = this.scrollX !== 0 || this.scrollY !== 0;
    const hasTile   = this.tileX > 1 || this.tileY > 1;
    if (hasTile || hasScroll) {
      const objSize = half * 2 * 1.1;
      const stepX   = objSize;
      const stepY   = objSize;

      if (hasScroll) {
        const now = performance.now() / 1000;
        const dt  = this._lastScrollT > 0 ? Math.min(now - this._lastScrollT, 0.05) : 0;
        this._lastScrollT = now;
        this._scrollOffX = ((this._scrollOffX + this.scrollX * stepX * dt) % stepX + stepX) % stepX;
        this._scrollOffY = ((this._scrollOffY + this.scrollY * stepY * dt) % stepY + stepY) % stepY;
      }

      const extraX = this.scrollX !== 0 ? 1 : 0;
      const extraY = this.scrollY !== 0 ? 1 : 0;
      const totalX = Math.max(this.tileX, 1) + extraX * 2;
      const totalY = Math.max(this.tileY, 1) + extraY * 2;
      const tileCount = totalX * totalY;

      // Cap total segments to avoid lag
      const MAX_SEGS = 80000;
      const srcLen = result.length;
      const stride = Math.max(1, Math.ceil(srcLen * tileCount / MAX_SEGS));

      const tiled = [];
      for (let ty = 0; ty < totalY; ty++) {
        for (let tx = 0; tx < totalX; tx++) {
          const offX = (tx - (totalX - 1) / 2) * stepX + this._scrollOffX;
          const offY = (ty - (totalY - 1) / 2) * stepY + this._scrollOffY;
          for (let si = 0; si < srcLen; si += stride) {
            const [[x0,y0],[x1,y1]] = result[si];
            tiled.push([[x0+offX, y0+offY], [x1+offX, y1+offY]]);
          }
        }
      }
      return this._applyMoveFx(tiled, W, H);
    }

    return this._applyMoveFx(result, W, H);
  }

  // ── Movement FX — applied to final screen-space segments ─────────────
  // All four effects share motionAmt (intensity) and motionSpeed (rate).
  // Called after tiling/radial so the FX sweep across the full visible field.
  _applyMoveFx(segs, W, H) {
    const hasAny = this.float || this.ripple || this.twist || this.explode;
    if (!hasAny || !segs.length) return segs;

    const now = performance.now() / 1000;
    const dt  = this._lastFxT > 0 ? Math.min(now - this._lastFxT, 0.05) : 1/60;
    this._lastFxT = now;

    const cx   = W / 2, cy = H / 2;
    const half = Math.min(W, H) * 0.45;
    const amt  = this.motionAmt;
    const spd  = this.motionSpeed;

    // ── Float: advance dual-phase oscillator ──
    if (this.float) {
      this._floatPhX += spd * 0.5  * dt * Math.PI * 2;
      this._floatPhY += spd * 0.31 * dt * Math.PI * 2;  // ~golden-ratio offset keeps X/Y organic
    }
    const floatX = this.float ? Math.sin(this._floatPhX) * amt * 0.3 * half : 0;
    const floatY = this.float ? Math.sin(this._floatPhY) * amt * 0.3 * half : 0;

    // ── Ripple: expanding ring wave ──
    if (this.ripple) this._ripplePh += spd * dt;

    // ── Twist: wind/unwind angle ──
    if (this.twist) this._twistPh += spd * 0.4 * dt;

    // ── Explode: push outward then reset ──
    let explodeF = 0;
    if (this.explode) {
      this._explodeT += spd * 0.3 * dt;
      if (this._explodeT >= 1) {
        if (this.explodeLoop) this._explodeT = 0;
        else this._explodeT = 1;
      }
      // Ease in/out — fast burst, slow settle
      const t = this._explodeT;
      explodeF = (t < 0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2) * amt * 1.5 * half;
    }

    // ── Ripple spatial constants ──
    const rippleWaves = 3;  // concentric ring count (fixed aesthetic)

    return segs.map(([[x0,y0],[x1,y1]]) => {
      let ax = x0, ay = y0, bx = x1, by = y1;

      // Ripple — radially displace each point based on distance from center
      if (this.ripple) {
        const rp = (x, y) => {
          const dx = x - cx, dy = y - cy;
          const dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
          const phase = (dist / half) * rippleWaves * Math.PI * 2 - this._ripplePh * Math.PI * 2;
          const disp  = Math.sin(phase) * amt * 0.25 * half;
          return [x + (dx/dist) * disp, y + (dy/dist) * disp];
        };
        [ax, ay] = rp(ax, ay);
        [bx, by] = rp(bx, by);
      }

      // Twist — rotate each point around center by angle ∝ distance
      if (this.twist) {
        const tp = (x, y) => {
          const dx = x - cx, dy = y - cy;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const angle = (dist / half) * amt * Math.PI * 1.5 + this._twistPh;
          const cos = Math.cos(angle), sin = Math.sin(angle);
          return [cx + dx*cos - dy*sin, cy + dx*sin + dy*cos];
        };
        [ax, ay] = tp(ax, ay);
        [bx, by] = tp(bx, by);
      }

      // Float — global sinusoidal drift
      ax += floatX; ay += floatY;
      bx += floatX; by += floatY;

      // Explode — push each point outward from center
      if (explodeF > 0) {
        const ep = (x, y) => {
          const dx = x - cx, dy = y - cy;
          const dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
          return [x + (dx/dist) * explodeF, y + (dy/dist) * explodeF];
        };
        [ax, ay] = ep(ax, ay);
        [bx, by] = ep(bx, by);
      }

      return [[ax, ay], [bx, by]];
    });
  }
}

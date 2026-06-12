'use strict';

// ─────────────────────────────────────────────────────────────
//  Movement FX — float / ripple / twist / explode, applied to
//  final screen-space segments. Shared by ObjScene and ImageScene
//  (both kept byte-identical copies before this was extracted).
//
//  `scene` supplies the FX flags + tuning (float, ripple, twist,
//  explode, explodeLoop, motionAmt, motionSpeed) and owns the
//  per-instance animation phase state (_floatPhX/_floatPhY,
//  _ripplePh, _twistPh, _explodeT, _lastFxT) which is read and
//  written here so each scene animates independently.
//
//  `segs` is a fresh array of [[x0,y0],[x1,y1]] pairs owned by the
//  caller this frame; it is mutated in place (no allocation) and
//  returned.
// ─────────────────────────────────────────────────────────────

const RIPPLE_WAVES = 3;   // concentric ring count (fixed aesthetic)

export function applyMoveFx(scene, segs, W, H) {
  const hasAny = scene.float || scene.ripple || scene.twist || scene.explode;
  if (!hasAny || !segs.length) return segs;

  const now = performance.now() / 1000;
  const dt  = scene._lastFxT > 0 ? Math.min(now - scene._lastFxT, 0.05) : 1 / 60;
  scene._lastFxT = now;

  const cx   = W / 2, cy = H / 2;
  const half = Math.min(W, H) * 0.45;
  const amt  = scene.motionAmt;
  const spd  = scene.motionSpeed;

  // ── Float: advance dual-phase oscillator ──
  if (scene.float) {
    scene._floatPhX += spd * 0.5  * dt * Math.PI * 2;
    scene._floatPhY += spd * 0.31 * dt * Math.PI * 2;  // ~golden-ratio offset keeps X/Y organic
  }
  const floatX = scene.float ? Math.sin(scene._floatPhX) * amt * 0.3 * half : 0;
  const floatY = scene.float ? Math.sin(scene._floatPhY) * amt * 0.3 * half : 0;

  // ── Ripple: expanding ring wave ──
  if (scene.ripple) scene._ripplePh += spd * dt;

  // ── Twist: wind/unwind angle ──
  if (scene.twist) scene._twistPh += spd * 0.4 * dt;

  // ── Explode: push outward then reset ──
  let explodeF = 0;
  if (scene.explode) {
    scene._explodeT += spd * 0.3 * dt;
    if (scene._explodeT >= 1) {
      scene._explodeT = scene.explodeLoop ? 0 : 1;
    }
    // Ease in/out — fast burst, slow settle
    const t = scene._explodeT;
    explodeF = (t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2) * amt * 1.5 * half;
  }

  const ripplePhBase = scene._ripplePh * Math.PI * 2;
  const rippleScale  = RIPPLE_WAVES * Math.PI * 2 / half;
  const rippleAmp    = amt * 0.25 * half;
  const twistScale   = amt * Math.PI * 1.5 / half;
  const twistPh      = scene._twistPh;
  const doRipple     = scene.ripple;
  const doTwist      = scene.twist;
  const doExplode    = explodeF > 0;

  // Mutate segs in place — eliminates the per-frame map() allocation that
  // produced 5M+ object allocations/sec at scale.
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const p0 = seg[0], p1 = seg[1];
    let ax = p0[0], ay = p0[1], bx = p1[0], by = p1[1];

    if (doRipple) {
      // Point A
      let dx = ax - cx, dy = ay - cy;
      let dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
      let phase = dist * rippleScale - ripplePhBase;
      let disp  = Math.sin(phase) * rippleAmp;
      ax += (dx/dist) * disp;
      ay += (dy/dist) * disp;
      // Point B
      dx = bx - cx; dy = by - cy;
      dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
      phase = dist * rippleScale - ripplePhBase;
      disp  = Math.sin(phase) * rippleAmp;
      bx += (dx/dist) * disp;
      by += (dy/dist) * disp;
    }

    if (doTwist) {
      // Point A
      let dx = ax - cx, dy = ay - cy;
      let dist = Math.sqrt(dx*dx + dy*dy);
      let angle = dist * twistScale + twistPh;
      let cos = Math.cos(angle), sin = Math.sin(angle);
      ax = cx + dx*cos - dy*sin;
      ay = cy + dx*sin + dy*cos;
      // Point B
      dx = bx - cx; dy = by - cy;
      dist = Math.sqrt(dx*dx + dy*dy);
      angle = dist * twistScale + twistPh;
      cos = Math.cos(angle); sin = Math.sin(angle);
      bx = cx + dx*cos - dy*sin;
      by = cy + dx*sin + dy*cos;
    }

    ax += floatX; ay += floatY;
    bx += floatX; by += floatY;

    if (doExplode) {
      // Point A
      let dx = ax - cx, dy = ay - cy;
      let dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
      ax += (dx/dist) * explodeF;
      ay += (dy/dist) * explodeF;
      // Point B
      dx = bx - cx; dy = by - cy;
      dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
      bx += (dx/dist) * explodeF;
      by += (dy/dist) * explodeF;
    }

    p0[0] = ax; p0[1] = ay;
    p1[0] = bx; p1[1] = by;
  }
  return segs;
}

'use strict';

const TWO_PI = Math.PI * 2;
const PEAK = 0.72;

function cis(th) {
  return { re: Math.cos(th), im: Math.sin(th) };
}
function add(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function sub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
function mul(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function smul(a, s) { return { re: a.re * s, im: a.im * s }; }
function cdiv(a, b) {
  const d = b.re * b.re + b.im * b.im || 1e-18;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
function cabs(a) { return Math.hypot(a.re, a.im); }
function cexp(a) {
  const e = Math.exp(a.re);
  return { re: e * Math.cos(a.im), im: e * Math.sin(a.im) };
}
function cpowReal(z, p) {
  const mag = Math.pow(cabs(z) || 1e-18, p);
  const ang = p * Math.atan2(z.im, z.re);
  return { re: mag * Math.cos(ang), im: mag * Math.sin(ang) };
}

function alloc(n) {
  return { L: new Float32Array(n), R: new Float32Array(n), lift: new Uint8Array(n) };
}

export function normalizeTrace(out, peak = PEAK) {
  let m = 0;
  for (let i = 0; i < out.L.length; i++) {
    const a = Math.abs(out.L[i]), b = Math.abs(out.R[i]);
    if (a > m) m = a;
    if (b > m) m = b;
  }
  if (m > 1e-12) {
    const s = peak / m;
    for (let i = 0; i < out.L.length; i++) {
      out.L[i] *= s;
      out.R[i] *= s;
    }
  }
  return out;
}

function closeLoop(out) {
  const n = out.L.length;
  if (n > 1) {
    out.L[n - 1] = out.L[0];
    out.R[n - 1] = out.R[0];
  }
  return out;
}

function fillParam(n, xy) {
  const out = alloc(n);
  const den = n - 1 || 1;
  for (let i = 0; i < n; i++) {
    const t = TWO_PI * i / den;
    const p = xy(t);
    out.L[i] = p.x;
    out.R[i] = p.y;
  }
  return closeLoop(normalizeTrace(out));
}

function polarR(n, rOf) {
  return fillParam(n, t => {
    const r = rOf(t);
    return { x: r * Math.cos(t), y: r * Math.sin(t) };
  });
}

function gielisR(th, p) {
  const a = p.a || 1;
  const b = p.b || 1;
  const n1 = p.n1;
  const n2 = p.n2;
  const n3 = p.n3;
  const m = p.m;
  const phi = m * th / 4;
  const u = Math.pow(Math.abs(Math.cos(phi) / a), n2) + Math.pow(Math.abs(Math.sin(phi) / b), n3);
  if (u <= 1e-18) return 0;
  return Math.pow(u, -1 / n1);
}

function epicycleZ(t, terms) {
  let re = 0, im = 0;
  for (const term of terms) {
    const amp = term.a;
    const ang = term.n * t + (term.ph || 0);
    re += amp * Math.cos(ang);
    im += amp * Math.sin(ang);
  }
  return { x: re, y: im };
}

function rk4(deriv, y, t, dt) {
  const k1 = deriv(y, t);
  const y2 = y.map((v, i) => v + 0.5 * dt * k1[i]);
  const k2 = deriv(y2, t + 0.5 * dt);
  const y3 = y.map((v, i) => v + 0.5 * dt * k2[i]);
  const k3 = deriv(y3, t + 0.5 * dt);
  const y4 = y.map((v, i) => v + dt * k3[i]);
  const k4 = deriv(y4, t + dt);
  return y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

function resampleXY(xs, ys, n) {
  const out = alloc(n);
  const m = xs.length;
  if (m < 2) return out;
  const den = n - 1 || 1;
  for (let i = 0; i < n; i++) {
    const u = (i / den) * (m - 1);
    const j = Math.min(m - 2, Math.floor(u));
    const f = u - j;
    out.L[i] = xs[j] * (1 - f) + xs[j + 1] * f;
    out.R[i] = ys[j] * (1 - f) + ys[j + 1] * f;
  }
  return closeLoop(normalizeTrace(out));
}

function limitCycle(deriv, y0, dt, n, burn, maxSteps) {
  let y = y0.slice();
  let t = 0;
  for (let i = 0; i < burn; i++) {
    y = rk4(deriv, y, t, dt);
    t += dt;
  }
  const xs = [];
  const ys = [];
  let crosses = 0;
  for (let i = 0; i < maxSteps; i++) {
    const yPrev = y[1];
    y = rk4(deriv, y, t, dt);
    t += dt;
    if (yPrev < 0 && y[1] >= 0) {
      crosses += 1;
      if (crosses === 1) {
        xs.length = 0;
        ys.length = 0;
      } else if (crosses === 2 && xs.length > 24) {
        break;
      }
    }
    if (crosses >= 1) {
      xs.push(y[0]);
      ys.push(y[1]);
    }
  }
  if (xs.length < 24) {
    for (let i = 0; i < n; i++) {
      y = rk4(deriv, y, t, dt);
      t += dt;
      xs.push(y[0]);
      ys.push(y[1]);
    }
  }
  return resampleXY(xs, ys, n);
}

function orbitWindow(deriv, y0, dt, n, burn) {
  let y = y0.slice();
  let t = 0;
  for (let i = 0; i < burn; i++) {
    y = rk4(deriv, y, t, dt);
    t += dt;
  }
  const out = alloc(n);
  for (let i = 0; i < n; i++) {
    y = rk4(deriv, y, t, dt);
    t += dt;
    out.L[i] = y[0];
    out.R[i] = y[1];
  }
  return normalizeTrace(out);
}

function keyPt(p) {
  return `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
}

function stitchSegs(segs) {
  const adj = new Map();
  const add = (a, b) => {
    const ka = keyPt(a);
    let list = adj.get(ka);
    if (!list) { list = []; adj.set(ka, list); }
    list.push(b);
  };
  for (const s of segs) {
    add(s.a, s.b);
    add(s.b, s.a);
  }
  const used = new Set();
  const edgeKey = (p, q) => {
    const ka = keyPt(p), kb = keyPt(q);
    return ka < kb ? ka + '>' + kb : kb + '>' + ka;
  };
  const loops = [];
  for (const [ka, nbs] of adj) {
    for (const nb of nbs) {
      const start = ka.split(',').map(Number);
      const ek = edgeKey(start, nb);
      if (used.has(ek)) continue;
      const loop = [start];
      let cur = start;
      let nxt = nb;
      used.add(ek);
      for (let guard = 0; guard < 20000; guard++) {
        loop.push(nxt);
        const kn = keyPt(nxt);
        const opts = adj.get(kn) || [];
        let found = null;
        for (const cand of opts) {
          const ck = edgeKey(nxt, cand);
          if (!used.has(ck)) { found = cand; used.add(ck); break; }
        }
        if (!found) break;
        cur = nxt;
        nxt = found;
        if (keyPt(nxt) === ka) {
          loop.push(start);
          break;
        }
      }
      if (loop.length >= 8) loops.push(loop);
    }
  }
  return loops;
}

function marchingSquares(f, x0, x1, y0, y1, nx, ny, level) {
  const dx = (x1 - x0) / nx;
  const dy = (y1 - y0) / ny;
  const g = new Float64Array((nx + 1) * (ny + 1));
  const at = (i, j) => g[j * (nx + 1) + i];
  for (let j = 0; j <= ny; j++) {
    const y = y0 + j * dy;
    for (let i = 0; i <= nx; i++) g[j * (nx + 1) + i] = f(x0 + i * dx, y) - level;
  }
  const interp = (xa, ya, va, xb, yb, vb) => {
    const den = vb - va;
    const t = Math.abs(den) < 1e-18 ? 0.5 : (0 - va) / den;
    return [xa + t * (xb - xa), ya + t * (yb - ya)];
  };
  const segs = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const xa = x0 + i * dx, ya = y0 + j * dy;
      const v00 = at(i, j), v10 = at(i + 1, j), v01 = at(i, j + 1), v11 = at(i + 1, j + 1);
      const idx = (v00 > 0 ? 1 : 0) | (v10 > 0 ? 2 : 0) | (v11 > 0 ? 4 : 0) | (v01 > 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const bottom = () => interp(xa, ya, v00, xa + dx, ya, v10);
      const right  = () => interp(xa + dx, ya, v10, xa + dx, ya + dy, v11);
      const top    = () => interp(xa, ya + dy, v01, xa + dx, ya + dy, v11);
      const left   = () => interp(xa, ya, v00, xa, ya + dy, v01);
      const push = (p, q) => segs.push({ a: p, b: q });
      switch (idx) {
        case 1: case 14: push(left(), bottom()); break;
        case 2: case 13: push(bottom(), right()); break;
        case 3: case 12: push(left(), right()); break;
        case 4: case 11: push(right(), top()); break;
        case 6: case 9:  push(bottom(), top()); break;
        case 7: case 8:  push(left(), top()); break;
        case 5:  push(left(), bottom()); push(right(), top()); break;
        case 10: push(left(), top()); push(bottom(), right()); break;
      }
    }
  }
  return stitchSegs(segs);
}

function loopsToTrace(loops, n) {
  const lens = loops.map(l => Math.max(1, l.length - 1));
  const total = lens.reduce((s, v) => s + v, 0) || 1;
  const out = alloc(n);
  let w = 0;
  for (let li = 0; li < loops.length; li++) {
    const loop = loops[li];
    const share = Math.max(8, Math.round(n * lens[li] / total));
    const take = Math.min(share, n - w - (loops.length - li) * 4);
    if (take < 4) break;
    const den = take - 1 || 1;
    const m = loop.length;
    for (let k = 0; k < take && w < n; k++, w++) {
      const u = (k / den) * (m - 1);
      const j = Math.min(m - 2, Math.floor(u));
      const f = u - j;
      out.L[w] = loop[j][0] * (1 - f) + loop[j + 1][0] * f;
      out.R[w] = loop[j][1] * (1 - f) + loop[j + 1][1] * f;
    }
    if (w > 0) out.lift[w - 1] = 1;
  }
  if (w < n) {
    const slim = alloc(w);
    slim.L.set(out.L.subarray(0, w));
    slim.R.set(out.R.subarray(0, w));
    slim.lift.set(out.lift.subarray(0, w));
    return normalizeTrace(slim);
  }
  return normalizeTrace(out);
}

function concatPolylines(polys, n) {
  const lens = polys.map(p => p.length);
  const total = lens.reduce((s, v) => s + v, 0) || 1;
  const out = alloc(n);
  let w = 0;
  for (let pi = 0; pi < polys.length; pi++) {
    const poly = polys[pi];
    const share = Math.max(8, Math.round(n * lens[pi] / total));
    const take = Math.min(share, n - w - (polys.length - pi) * 4);
    if (take < 4) break;
    const den = take - 1 || 1;
    const m = poly.length;
    for (let k = 0; k < take && w < n; k++, w++) {
      const u = (k / den) * (m - 1);
      const j = Math.min(m - 2, Math.floor(u));
      const f = u - j;
      const a = poly[j], b = poly[Math.min(m - 1, j + 1)];
      out.L[w] = a[0] * (1 - f) + b[0] * f;
      out.R[w] = a[1] * (1 - f) + b[1] * f;
    }
    if (w > 0) out.lift[w - 1] = 1;
  }
  return normalizeTrace(w === n ? out : (() => {
    const slim = alloc(w);
    slim.L.set(out.L.subarray(0, w));
    slim.R.set(out.R.subarray(0, w));
    slim.lift.set(out.lift.subarray(0, w));
    return slim;
  })());
}

function theta2(q) {
  let s = { re: 1, im: 0 };
  for (let n = 1; n <= 20; n++) s = add(s, cpowReal(q, n * (n + 1)));
  return mul(smul(cpowReal(q, 0.25), 2), s);
}

function theta3(q) {
  let s = { re: 1, im: 0 };
  for (let n = 1; n <= 20; n++) s = add(s, smul(cpowReal(q, n * n), 2));
  return s;
}

function modularLambda(tau) {
  const q = cexp({ re: -Math.PI * tau.im, im: Math.PI * tau.re });
  const a = theta2(q);
  const b = theta3(q);
  const r = cdiv(a, b);
  const r2 = mul(r, r);
  return mul(r2, r2);
}

function schwarzChristoffelHex(n) {
  const out = alloc(n);
  const r = 0.992;
  let w = { re: 0, im: 0 };
  let arg = 0;
  let have = false;
  const dt = TWO_PI / n;
  for (let k = 0; k < n; k++) {
    const t = dt * k;
    const z6 = cis(6 * t);
    z6.re *= r ** 6;
    z6.im *= r ** 6;
    const om = { re: 1 - z6.re, im: -z6.im };
    let a = Math.atan2(om.im, om.re);
    if (have) {
      while (a - arg > Math.PI) a -= TWO_PI;
      while (a - arg < -Math.PI) a += TWO_PI;
    }
    arg = a;
    have = true;
    const mag = Math.pow(cabs(om) || 1e-18, -1 / 3);
    const deriv = { re: mag * Math.cos(-a / 3), im: mag * Math.sin(-a / 3) };
    const dz = { re: -r * Math.sin(t) * dt, im: r * Math.cos(t) * dt };
    w = add(w, mul(deriv, dz));
    out.L[k] = w.re;
    out.R[k] = w.im;
  }
  return closeLoop(normalizeTrace(out));
}

export function geodesicArc(alpha, beta, steps) {
  const a = cis(alpha);
  const b = cis(beta);
  const dot = a.re * b.re + a.im * b.im;
  if (dot < -0.999) {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      pts.push([a.re * (1 - t) + b.re * t, a.im * (1 - t) + b.im * t]);
    }
    return pts;
  }
  const den = 1 + dot;
  const center = smul(add(a, b), 1 / den);
  const R = Math.sqrt(Math.max(0, center.re * center.re + center.im * center.im - 1));
  let ang0 = Math.atan2(a.im - center.im, a.re - center.re);
  let ang1 = Math.atan2(b.im - center.im, b.re - center.re);
  let d = ang1 - ang0;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const ang = ang0 + t * d;
    pts.push([center.re + R * Math.cos(ang), center.im + R * Math.sin(ang)]);
  }
  return pts;
}

export function sampleFamily(preset, n = 4096) {
  const p = preset.params || {};
  const family = preset.family;
  if (family === 'lissajous') {
    return fillParam(n, t => ({
      x: Math.sin(p.a * t),
      y: Math.sin(p.b * t + p.phase),
    }));
  }
  if (family === 'polar') {
    if (p.kind === 'cassini') {
      const aa = p.a * p.a, bb = p.b * p.b, a4 = aa * aa, b4 = bb * bb;
      return polarR(n, t => {
        const c = aa * Math.cos(2 * t);
        const disc = b4 - a4 * Math.sin(2 * t) * Math.sin(2 * t);
        const r2 = c + (p.branch < 0 ? -1 : 1) * Math.sqrt(Math.max(0, disc));
        return r2 > 0 ? Math.sqrt(r2) : 0;
      });
    }
    if (p.kind === 'neumann') {
      return polarR(n, t => -p.a * Math.cos(3 * t));
    }
    if (p.kind === 'multiwell') {
      return polarR(n, t => {
        const c = p.a * Math.cos(6 * t);
        const A = c, B = 0.5, C = -p.E;
        if (Math.abs(A) < 1e-12) {
          const u = p.E * 2;
          return u > 0 ? Math.sqrt(u) : 0;
        }
        const disc = B * B - 4 * A * C;
        if (disc < 0) return 0;
        const u = (-B + Math.sqrt(disc)) / (2 * A);
        return u > 0 ? Math.sqrt(u) : 0;
      });
    }
    if (p.kind === 'gear') {
      return polarR(n, t => p.r0 * (1.2 + 0.22 * Math.tanh(6 * Math.cos(6 * t))));
    }
    if (p.kind === 'fejer') {
      const nn = p.n;
      return polarR(n, t => {
        const s = Math.sin(t / 2);
        if (Math.abs(s) < 1e-8) return nn;
        const v = Math.sin(nn * t / 2) / s;
        return (v * v) / nn;
      });
    }
    if (p.kind === 'dirichlet') {
      const nn = p.n;
      return polarR(n, t => {
        const s = Math.sin(t / 2);
        if (Math.abs(s) < 1e-8) return 2 * nn + 1;
        return Math.sin((nn + 0.5) * t) / s;
      });
    }
    if (p.kind === 'terms') {
      return polarR(n, t => {
        let r = p.scale || 1;
        let inner = p.offset != null ? p.offset : 1;
        for (const term of p.terms) {
          const ang = term.n * t;
          if (term.fn === 'sin2') inner += term.c * Math.sin(ang) * Math.sin(ang);
          else if (term.fn === 'sin') inner += term.c * Math.sin(ang);
          else inner += term.c * Math.cos(ang);
        }
        return r * inner;
      });
    }
    throw new Error('unknown polar kind');
  }
  if (family === 'gielis') {
    const gp = {
      m: p.m,
      a: p.a || 1,
      b: p.b || 1,
      n1: p.n1 != null ? p.n1 : p.n,
      n2: p.n2 != null ? p.n2 : p.n,
      n3: p.n3 != null ? p.n3 : p.n,
    };
    return polarR(n, t => gielisR(t, gp));
  }
  if (family === 'epicycle') {
    return fillParam(n, t => epicycleZ(t, p.terms));
  }
  if (family === 'knot') {
    return fillParam(n, t => {
      const rad = p.R + p.r * Math.cos(p.q * t);
      return { x: rad * Math.cos(p.p * t), y: rad * Math.sin(p.p * t) };
    });
  }
  if (family === 'parametric') {
    return fillParam(n, t => p.xy(t));
  }
  if (family === 'conformal') {
    if (p.kind === 'joukowski') {
      const c = { re: p.cx, im: p.cy };
      const R = p.R;
      return fillParam(n, t => {
        const z = add(c, smul(cis(t), R));
        const w = add(z, cdiv({ re: 1, im: 0 }, z));
        return { x: w.re, y: w.im };
      });
    }
    if (p.kind === 'blaschke') {
      return fillParam(n, t => {
        const z = cis(t);
        let w = z;
        for (const pole of p.poles) {
          const a = { re: pole[0], im: pole[1] };
          const na = cabs(a);
          if (na < 1e-9) continue;
          const phase = cdiv(a, { re: na, im: 0 });
          const num = sub(a, z);
          const den = sub({ re: 1, im: 0 }, mul({ re: a.re, im: -a.im }, z));
          w = mul(w, mul(phase, cdiv(num, den)));
        }
        return { x: w.re, y: w.im };
      });
    }
    if (p.kind === 'schwarz-christoffel') {
      return schwarzChristoffelHex(n);
    }
    if (p.kind === 'modular-lambda') {
      return fillParam(n, t => {
        const tau = { re: p.tx + p.tr * Math.cos(t), im: p.ty + p.tr * Math.sin(t) };
        const w = modularLambda(tau);
        return { x: w.re, y: w.im };
      });
    }
    throw new Error('unknown conformal kind');
  }
  if (family === 'ode') {
    if (p.kind === 'vanderpol') {
      const mu = p.mu;
      const deriv = (y) => [y[1], mu * (1 - y[0] * y[0]) * y[1] - y[0]];
      return limitCycle(deriv, [0.1, 0], p.dt, n, 2500, 20000);
    }
    if (p.kind === 'duffing') {
      const { delta, alpha, beta, gamma, omega } = p;
      const deriv = (y, t) => [
        y[1],
        -delta * y[1] - alpha * y[0] - beta * y[0] * y[0] * y[0] + gamma * Math.cos(omega * t),
      ];
      return limitCycle(deriv, [0.2, 0], p.dt, n, 4000, 40000);
    }
    if (p.kind === 'rossler') {
      const { a, b, c } = p;
      const deriv = (y) => [
        -y[1] - y[2],
        y[0] + a * y[1],
        b + y[2] * (y[0] - c),
      ];
      return orbitWindow(deriv, [0.1, 0, 0], p.dt, n, 4000);
    }
    throw new Error('unknown ode');
  }
  if (family === 'map') {
    const out = alloc(n);
    if (p.kind === 'ikeda') {
      let z = { re: 0.1, im: 0 };
      const U = p.U, k = p.k, aa = p.a;
      for (let i = 0; i < p.burn; i++) {
        const mag2 = z.re * z.re + z.im * z.im;
        const th = k - aa / (1 + mag2);
        z = add({ re: 1, im: 0 }, mul(smul(z, U), cis(th)));
      }
      for (let i = 0; i < n; i++) {
        const mag2 = z.re * z.re + z.im * z.im;
        const th = k - aa / (1 + mag2);
        z = add({ re: 1, im: 0 }, mul(smul(z, U), cis(th)));
        out.L[i] = z.re;
        out.R[i] = z.im;
        out.lift[i] = 1;
      }
    } else if (p.kind === 'dejong') {
      let x = 0.1, y = 0.1;
      const { a, b, c, d } = p;
      for (let i = 0; i < p.burn; i++) {
        const nx = Math.sin(a * y) - Math.cos(b * x);
        const ny = Math.sin(c * x) - Math.cos(d * y);
        x = nx; y = ny;
      }
      for (let i = 0; i < n; i++) {
        const nx = Math.sin(a * y) - Math.cos(b * x);
        const ny = Math.sin(c * x) - Math.cos(d * y);
        x = nx; y = ny;
        out.L[i] = x;
        out.R[i] = y;
        out.lift[i] = 1;
      }
    } else if (p.kind === 'arnold') {
      let x = 1 / Math.SQRT2, y = 1 / Math.PI;
      for (let i = 0; i < n; i++) {
        const nx = (2 * x + y) % 1;
        const ny = (x + y) % 1;
        x = nx < 0 ? nx + 1 : nx;
        y = ny < 0 ? ny + 1 : ny;
        out.L[i] = 2 * x - 1;
        out.R[i] = 2 * y - 1;
        out.lift[i] = 1;
      }
    } else {
      throw new Error('unknown map');
    }
    return normalizeTrace(out);
  }
  if (family === 'implicit') {
    const loops = marchingSquares(p.f, p.x0, p.x1, p.y0, p.y1, p.nx, p.ny, p.level);
    if (!loops.length) {
      const out = alloc(n);
      return out;
    }
    return loopsToTrace(loops, n);
  }
  if (family === 'polylines') {
    return concatPolylines(p.build(), n);
  }
  throw new Error('unknown family ' + family);
}

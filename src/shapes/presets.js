'use strict';

import { geodesicArc } from './families.js';

const TWO_PI = Math.PI * 2;

function circlePoly(cx, cy, r, steps) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = TWO_PI * i / (steps - 1);
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return pts;
}

export const SHAPE_PRESETS = [
  {
    id: 'ikeda', n: 1, title: 'Ikeda map',
    formula: "z' = 1 + U z exp(i(k - a/(1+|z|^2)))",
    family: 'map', closes: false,
    params: { kind: 'ikeda', U: 0.9, k: 0.4, a: 6, burn: 200 },
  },
  {
    id: 'dejong', n: 2, title: 'De Jong map',
    formula: "x' = sin(a y) - cos(b x),  y' = sin(c x) - cos(d y)",
    family: 'map', closes: false,
    params: { kind: 'dejong', a: 1.4, b: -2.3, c: 2.4, d: -2.1, burn: 200 },
  },
  {
    id: 'lissajous-9-13', n: 3, title: 'Lissajous 9:13',
    formula: 'x = sin(9t),  y = sin(13t + π/4)',
    family: 'lissajous', closes: true,
    params: { a: 9, b: 13, phase: Math.PI / 4 },
  },
  {
    id: 'cinquefoil', n: 4, title: 'Cinquefoil',
    formula: 'x = cos(2t)(2 + cos 5t),  y = sin(2t)(2 + cos 5t)',
    family: 'knot', closes: true,
    params: { p: 2, q: 5, R: 2, r: 1 },
  },
  {
    id: 'neumann', n: 5, title: 'Neumann quartic',
    formula: '(x²+y²)² + a x³ - 3a x y² = 0',
    family: 'polar', closes: true,
    params: { kind: 'neumann', a: 1 },
  },
  {
    id: 'super-leaf', n: 6, title: 'Super-leaf',
    formula: 'x = cos t (sin²t + 0.2 cos³ 5t),  y = sin t (1 + 0.3 sin 4t)',
    family: 'parametric', closes: true,
    params: {
      xy: (t) => {
        const c = Math.cos(t), s = Math.sin(t);
        const c5 = Math.cos(5 * t);
        return {
          x: c * (s * s + 0.2 * c5 * c5 * c5),
          y: s * (1 + 0.3 * Math.sin(4 * t)),
        };
      },
    },
  },
  {
    id: 'rayleigh-benard', n: 7, title: 'Rayleigh-Bénard',
    formula: 'ψ = sin(kx x) sin(kz z) = C',
    family: 'implicit', closes: false,
    params: {
      f: (x, z) => Math.sin(Math.PI * (x + 1)) * Math.sin(Math.PI * (z + 1)),
      x0: -1, x1: 1, y0: -1, y1: 1, nx: 48, ny: 48, level: 0.45,
    },
  },
  {
    id: 'deltoid', n: 8, title: 'Deltoid',
    formula: 'z = 2 e^{it} + e^{-2it} + ε e^{3it}',
    family: 'epicycle', closes: true,
    params: { terms: [{ a: 2, n: 1 }, { a: 1, n: -2 }, { a: 0.12, n: 3 }] },
  },
  {
    id: 'multi-well', n: 9, title: 'Multi-well contour',
    formula: 'r²/2 + a r⁴ cos 6θ = E',
    family: 'polar', closes: true,
    params: { kind: 'multiwell', a: 0.35, E: 0.45 },
  },
  {
    id: 'torus-3-8', n: 10, title: 'Torus knot (3,8)',
    formula: 'r = 1.5 + 0.5 cos 8t,  z = r e^{i 3t}',
    family: 'knot', closes: true,
    params: { p: 3, q: 8, R: 1.5, r: 0.5 },
  },
  {
    id: 'gielis-11', n: 11, title: 'Gielis m=11',
    formula: 'Gielis m=11, n=0.8',
    family: 'gielis', closes: true,
    params: { m: 11, n: 0.8 },
  },
  {
    id: 'van-der-pol', n: 12, title: 'Van der Pol',
    formula: "x'' − μ(1−x²)x' + x = 0",
    family: 'ode', closes: true,
    params: { kind: 'vanderpol', mu: 2, dt: 0.02 },
  },
  {
    id: 'figure8-knot', n: 13, title: 'Figure-8 knot',
    formula: 'z = (2 + cos 2t) e^{i 3t}',
    family: 'knot', closes: true,
    params: { p: 3, q: 2, R: 2, r: 1 },
  },
  {
    id: 'cassini', n: 14, title: 'Cassini oval',
    formula: 'r² = a² cos 2θ ± √(b⁴ − a⁴ sin² 2θ)',
    family: 'polar', closes: true,
    params: { kind: 'cassini', a: 1, b: 1.12, branch: 1 },
  },
  {
    id: 'polar-7', n: 15, title: 'Polar 7-lobe',
    formula: 'r = 1.8/1.3 (1 + 0.32 sin²(7t/2))',
    family: 'polar', closes: true,
    params: { kind: 'terms', scale: 1.8 / 1.3, offset: 1, terms: [{ c: 0.32, n: 3.5, fn: 'sin2' }] },
  },
  {
    id: 'polar-19', n: 16, title: 'Polar 19-lobe',
    formula: 'r = 1.8/1.22 (1 + 0.22 cos 19t)',
    family: 'polar', closes: true,
    params: { kind: 'terms', scale: 1.8 / 1.22, offset: 1, terms: [{ c: 0.22, n: 19, fn: 'cos' }] },
  },
  {
    id: 'trefoil', n: 17, title: 'Trefoil',
    formula: 'x = (sin t + 2 sin 2t)/3,  y = (cos t − 2 cos 2t)/3',
    family: 'parametric', closes: true,
    params: {
      xy: (t) => ({
        x: (Math.sin(t) + 2 * Math.sin(2 * t)) / 3,
        y: (Math.cos(t) - 2 * Math.cos(2 * t)) / 3,
      }),
    },
  },
  {
    id: 'henon-heiles', n: 18, title: 'Henon-Heiles',
    formula: 'V = (x²+y²)/2 + x² y − y³/3 = E',
    family: 'implicit', closes: false,
    params: {
      f: (x, y) => 0.5 * (x * x + y * y) + x * x * y - (y * y * y) / 3,
      x0: -1.2, x1: 1.2, y0: -1.2, y1: 1.2, nx: 56, ny: 56, level: 0.08,
    },
  },
  {
    id: 'polar-8-16', n: 19, title: 'Polar 8+16',
    formula: 'r = 1.8/1.4 (1 + 0.3 cos 8t + 0.12 cos 16t)',
    family: 'polar', closes: true,
    params: {
      kind: 'terms', scale: 1.8 / 1.4, offset: 1,
      terms: [{ c: 0.3, n: 8, fn: 'cos' }, { c: 0.12, n: 16, fn: 'cos' }],
    },
  },
  {
    id: 'joukowski', n: 20, title: 'Joukowski airfoil',
    formula: 'w = ζ + 1/ζ,  ζ = c + R e^{it}',
    family: 'conformal', closes: true,
    params: { kind: 'joukowski', cx: -0.12, cy: 0.22, R: 1.18 },
  },
  {
    id: 'epicycle-phi', n: 21, title: 'AM epicycle',
    formula: 'e^{it} + 0.3 e^{i Φ t} sin² t',
    family: 'parametric', closes: true,
    // Chosen Φ = 5 so tones 1, 5, 3, 7 close on [0, 2π].
    params: {
      xy: (t) => {
        const PHI = 5;
        const s2 = Math.sin(t) * Math.sin(t);
        const z1 = { re: Math.cos(t), im: Math.sin(t) };
        const z2 = { re: Math.cos(PHI * t), im: Math.sin(PHI * t) };
        return { x: z1.re + 0.3 * z2.re * s2, y: z1.im + 0.3 * z2.im * s2 };
      },
    },
  },
  {
    id: 'lissajous-7-11', n: 22, title: 'Lissajous 7:11',
    formula: 'x = sin(7t),  y = sin(11t + π/5)',
    family: 'lissajous', closes: true,
    params: { a: 7, b: 11, phase: Math.PI / 5 },
  },
  {
    id: 'gielis-17', n: 23, title: 'Gielis m=17',
    formula: 'Gielis m=17, n=2.2',
    family: 'gielis', closes: true,
    params: { m: 17, n: 2.2 },
  },
  {
    id: 'fejer', n: 24, title: 'Fejér kernel',
    formula: 'r(θ) = (1/n) (sin(nθ/2) / sin(θ/2))²',
    family: 'polar', closes: true,
    // Chosen n = 8 for a closed polar rose with a clear main lobe.
    params: { kind: 'fejer', n: 8 },
  },
  {
    id: 'epicycle-5', n: 25, title: '5-freq epicycle',
    formula: 'Σ a_k e^{i n_k t}',
    family: 'epicycle', closes: true,
    // Chosen terms close on one turn and fill a dense but readable curve.
    params: {
      terms: [
        { a: 1, n: 1 }, { a: 0.45, n: -4 }, { a: 0.22, n: 7 },
        { a: 0.12, n: -11 }, { a: 0.07, n: 18 },
      ],
    },
  },
  {
    id: 'gielis-9', n: 26, title: 'Gielis m=9',
    formula: 'Gielis m=9, n=1.5',
    family: 'gielis', closes: true,
    params: { m: 9, n: 1.5 },
  },
  {
    id: 'arnold-cat', n: 27, title: 'Arnold cat map',
    formula: '(x, y) → (2x+y, x+y) mod 1',
    family: 'map', closes: false,
    params: { kind: 'arnold' },
  },
  {
    id: 'duffing', n: 28, title: 'Duffing cycle',
    formula: "x'' + δ x' + α x + β x³ = γ cos(ω t)",
    family: 'ode', closes: true,
    // Chosen for a single attracting cycle in the double well, not chaos.
    params: { kind: 'duffing', delta: 0.25, alpha: -1, beta: 1, gamma: 0.28, omega: 1.2, dt: 0.02 },
  },
  {
    id: 'modulated-lissa', n: 29, title: 'Modulated Lissajous',
    formula: 'x = sin(at) + c cos(at) sin t,  y = sin(bt) + d cos(bt) cos t',
    family: 'parametric', closes: true,
    params: {
      xy: (t) => {
        const a = 3, b = 4, c = 0.4, d = 0.4;
        return {
          x: Math.sin(a * t) + c * Math.cos(a * t) * Math.sin(t),
          y: Math.sin(b * t) + d * Math.cos(b * t) * Math.cos(t),
        };
      },
    },
  },
  {
    id: 'epicycle-8-13', n: 30, title: 'Epicycles 8/−13',
    formula: 'e^{i 8t} + 0.4 e^{-i 13t}',
    family: 'epicycle', closes: true,
    params: { terms: [{ a: 1, n: 8 }, { a: 0.4, n: -13 }] },
  },
  {
    id: 'epicycle-2-5-13', n: 31, title: 'Epicycles 2+5+13',
    formula: 'e^{i 2t} + 0.3 e^{i 5t} + 0.15 e^{i 13t}',
    family: 'epicycle', closes: true,
    params: { terms: [{ a: 1, n: 2 }, { a: 0.3, n: 5 }, { a: 0.15, n: 13 }] },
  },
  {
    id: 'gear', n: 32, title: 'Gear',
    formula: 'r = r0 (1.2 + 0.22 tanh(6 cos 6t))',
    family: 'polar', closes: true,
    params: { kind: 'gear', r0: 1 },
  },
  {
    id: 'gielis-13', n: 33, title: 'Gielis m=13',
    formula: 'Gielis m=13, n=1.8',
    family: 'gielis', closes: true,
    params: { m: 13, n: 1.8 },
  },
  {
    id: 'epicycle-7-8-11', n: 34, title: 'Epicycles 7/−8+11',
    formula: 'e^{i 7t} + 0.35 e^{-i 8t} + 0.2 e^{i 11t}',
    family: 'epicycle', closes: true,
    params: { terms: [{ a: 1, n: 7 }, { a: 0.35, n: -8 }, { a: 0.2, n: 11 }] },
  },
  {
    id: 'septafoil', n: 35, title: 'Septafoil',
    formula: 'e^{i 3t} (2.2 + 0.8 cos 7t)',
    family: 'knot', closes: true,
    params: { p: 3, q: 7, R: 2.2, r: 0.8 },
  },
  {
    id: 'epicycle-1-7-49', n: 36, title: 'Epicycles 1/−7+49',
    formula: 'e^{it} + 0.25 e^{-i 7t} + 0.08 e^{i 49t}',
    family: 'epicycle', closes: true,
    params: { terms: [{ a: 1, n: 1 }, { a: 0.25, n: -7 }, { a: 0.08, n: 49 }] },
  },
  {
    id: 'dirichlet', n: 37, title: 'Dirichlet kernel',
    formula: 'r(θ) = sin((n+1/2)θ) / sin(θ/2)',
    family: 'polar', closes: true,
    // Chosen n = 7 for a polar Dirichlet kernel with seven side lobes.
    params: { kind: 'dirichlet', n: 7 },
  },
  {
    id: 'schwarz-christoffel', n: 38, title: 'Schwarz-Christoffel hexagon',
    formula: "w' ∝ (1 − ζ⁶)^{-1/3} on |ζ|≈1",
    family: 'conformal', closes: true,
    params: { kind: 'schwarz-christoffel' },
  },
  {
    id: 'rossler', n: 39, title: 'Rössler',
    formula: "x' = −y−z,  y' = x+a y,  z' = b + z(x−c)",
    family: 'ode', closes: false,
    params: { kind: 'rossler', a: 0.2, b: 0.2, c: 5.7, dt: 0.03 },
  },
  {
    id: 'polar-6', n: 40, title: 'Polar 6-lobe',
    formula: 'r = 1.8/1.25 (1 + 0.25 sin² 6t)',
    family: 'polar', closes: true,
    params: { kind: 'terms', scale: 1.8 / 1.25, offset: 1, terms: [{ c: 0.25, n: 6, fn: 'sin2' }] },
  },
  {
    id: 'epicycle-3', n: 41, title: '3-term epicycle',
    formula: 'Σ_{k=1}^{3} a_k e^{i n_k t}',
    family: 'epicycle', closes: true,
    // Chosen 2, −5, 9 so the curve closes and has three visible cusps.
    params: { terms: [{ a: 1, n: 2 }, { a: 0.35, n: -5 }, { a: 0.18, n: 9 }] },
  },
  {
    id: 'gielis-astroid', n: 42, title: 'Gielis astroid',
    formula: 'Gielis m=4, n=0.4',
    family: 'gielis', closes: true,
    params: { m: 4, n: 0.4 },
  },
  {
    id: 'cardioid', n: 43, title: 'Cardioid',
    formula: '(2/3) e^{it} − (1/3) e^{i 2t}',
    family: 'epicycle', closes: true,
    params: { terms: [{ a: 2 / 3, n: 1 }, { a: -1 / 3, n: 2 }] },
  },
  {
    id: 'modular-lambda', n: 44, title: 'Modular λ',
    formula: 'λ(τ),  τ = tx+i ty + tr e^{it}',
    family: 'conformal', closes: true,
    params: { kind: 'modular-lambda', tx: 0.5, ty: 1.15, tr: 0.32 },
  },
  {
    id: 'ninefoil', n: 45, title: 'Ninefoil',
    formula: 'e^{it} (1.8 + 0.6 cos 9t)',
    family: 'knot', closes: true,
    params: { p: 1, q: 9, R: 1.8, r: 0.6 },
  },
  {
    id: 'borromean', n: 46, title: 'Borromean rings',
    formula: 'three circles, 120° centers',
    family: 'polylines', closes: false,
    params: {
      build: () => {
        const r = 0.42, d = 0.32, steps = 96;
        return [0, 1, 2].map(k => {
          const ang = TWO_PI * k / 3;
          return circlePoly(d * Math.cos(ang), d * Math.sin(ang), r, steps);
        });
      },
    },
  },
  {
    id: 'torus-5-9', n: 47, title: 'Torus knot (5,9)',
    formula: 'e^{i 5t} (1.4 + 0.45 cos 9t)',
    family: 'knot', closes: true,
    params: { p: 5, q: 9, R: 1.4, r: 0.45 },
  },
  {
    id: 'blaschke', n: 48, title: 'Blaschke 3-pole',
    formula: 'B(e^{it}) with three poles in the disk',
    family: 'conformal', closes: true,
    params: {
      kind: 'blaschke',
      poles: [[0.55, 0], [-0.28, 0.42], [-0.28, -0.42]],
    },
  },
  {
    id: 'poincare', n: 49, title: 'Poincaré geodesics',
    formula: 'circular arcs orthogonal to |z|=1',
    family: 'polylines', closes: false,
    params: {
      build: () => [
        geodesicArc(0, Math.PI, 64),
        geodesicArc(Math.PI / 5, Math.PI / 5 + Math.PI, 64),
        geodesicArc(0.4, 2.2, 72),
        geodesicArc(1.1, 3.4, 72),
        geodesicArc(2.0, 5.1, 72),
      ],
    },
  },
  {
    id: 'fourier-cube', n: 50, title: 'Cube Fourier',
    formula: 'Σ (−1)^k e^{i(2k+1)t} / (2k+1)³',
    family: 'epicycle', closes: true,
    params: {
      terms: Array.from({ length: 12 }, (_, k) => ({
        a: ((k % 2 === 0) ? 1 : -1) / Math.pow(2 * k + 1, 3),
        n: 2 * k + 1,
      })),
    },
  },
];

const BY_ID = new Map(SHAPE_PRESETS.map(p => [p.id, p]));

export function getShape(id) {
  return BY_ID.get(id) || null;
}

export function listShapes() {
  return SHAPE_PRESETS;
}

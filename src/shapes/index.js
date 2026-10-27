'use strict';

import { sampleFamily } from './families.js';
import { SHAPE_PRESETS, getShape, listShapes } from './presets.js';

export { sampleFamily } from './families.js';
export { SHAPE_PRESETS, getShape, listShapes } from './presets.js';

export function sampleShape(idOrPreset, n = 4096) {
  const preset = typeof idOrPreset === 'string' ? getShape(idOrPreset) : idOrPreset;
  if (!preset) throw new Error('unknown shape');
  const trace = sampleFamily(preset, n);
  trace.id = preset.id;
  trace.title = preset.title;
  trace.formula = preset.formula;
  trace.family = preset.family;
  trace.closes = !!preset.closes;
  return trace;
}

export const SHAPE_COUNT = SHAPE_PRESETS.length;

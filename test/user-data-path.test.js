import { describe, it, expect } from 'vitest';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { resolveUserDataPath } = require('../src/user-data-path.js');

describe('userData folder identity', () => {
  it('keeps the historical Electron profile directory', () => {
    expect(resolveUserDataPath(path.join('/home', 'u', '.config'))).toBe(
      path.join('/home', 'u', '.config', 'dso1-oscilloscope'),
    );
  });
});

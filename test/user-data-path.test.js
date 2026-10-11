import { describe, it, expect } from 'vitest';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { resolveUserDataPath, shouldPinHistoricalUserData } = require('../src/user-data-path.js');

describe('userData folder identity', () => {
  it('keeps the historical Electron profile directory', () => {
    expect(resolveUserDataPath(path.join('/cfg', 'appdata'))).toBe(
      path.join('/cfg', 'appdata', 'dso1-oscilloscope'),
    );
  });

  it('leaves an explicit --user-data-dir in place', () => {
    expect(shouldPinHistoricalUserData(true)).toBe(false);
    expect(shouldPinHistoricalUserData(false)).toBe(true);
  });
});

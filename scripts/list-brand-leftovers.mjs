#!/usr/bin/env node
'use strict';

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = path.join(fileURLToPath(new URL('.', import.meta.url)), '..');

const result = spawnSync(
  'rg',
  [
    '-n',
    '--hidden',
    '-g', '!node_modules',
    '-g', '!.git',
    '-g', '!package-lock.json',
    '-g', '!docs/screenshots',
    '-g', '!*.png',
    '-g', '!*.ico',
    'Oscilloscope|DSO-1|DSO‑1|dso1|dso-1|dso1-oscilloscope',
    '.',
  ],
  { encoding: 'utf8', cwd },
);

process.stdout.write(result.stdout || '');
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status === null ? 1 : 0);

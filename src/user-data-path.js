'use strict';

const path = require('path');

// Electron reads app.name from package.json "name" (there is no other
// setName/setPath today). That folder is where Chromium keeps localStorage.
// Keep this string after the npm name becomes sound-lab so existing
// presets, themes, rigs, and patch boards stay put.
const HISTORICAL_USER_DATA_DIR = 'dso1-oscilloscope';

function resolveUserDataPath(appDataDir) {
  return path.join(appDataDir, HISTORICAL_USER_DATA_DIR);
}

function shouldPinHistoricalUserData(hasExplicitUserDataDir) {
  return hasExplicitUserDataDir !== true;
}

module.exports = {
  HISTORICAL_USER_DATA_DIR,
  resolveUserDataPath,
  shouldPinHistoricalUserData,
};

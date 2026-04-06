'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('displayAPI', {
  onFrame: (cb) => ipcRenderer.on('display-frame-fwd', (_e, dataURL) => cb(dataURL)),
});

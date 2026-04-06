'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDisplay:     ()        => ipcRenderer.invoke('open-display'),
  closeDisplay:    ()        => ipcRenderer.send('close-display'),
  sendFrame:       (dataURL) => ipcRenderer.send('display-frame', dataURL),
  onDisplayClosed: (cb)      => ipcRenderer.on('display-closed', (_e) => cb()),
});

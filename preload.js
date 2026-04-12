'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDisplays:     ()        => ipcRenderer.invoke('get-displays'),
  openDisplay:     (opts)    => ipcRenderer.invoke('open-display', opts),
  closeDisplay:    ()        => ipcRenderer.send('close-display'),
  sendFrame:       (dataURL) => ipcRenderer.send('display-frame', dataURL),
  onDisplayClosed: (cb)      => ipcRenderer.on('display-closed', (_e) => cb()),
});

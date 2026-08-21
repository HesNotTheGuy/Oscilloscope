'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDisplays:     ()        => ipcRenderer.invoke('get-displays'),
  openDisplay:     (opts)    => ipcRenderer.invoke('open-display', opts),
  closeDisplay:    ()        => ipcRenderer.send('close-display'),
  sendFrame:       (dataURL) => ipcRenderer.send('display-frame', dataURL),
  onDisplayClosed: (cb)      => ipcRenderer.on('display-closed', (_e) => cb()),
  readFile:        (p)       => ipcRenderer.invoke('read-file', p),
  // File.path was removed from the renderer in Electron 32; webUtils is the
  // supported way to recover the on-disk path of a dropped File.
  getPathForFile:  (file)    => webUtils.getPathForFile(file),
});

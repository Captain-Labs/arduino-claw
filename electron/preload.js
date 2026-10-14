// electron/preload.js — Preload Bridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktopApp: true,
  platform: process.platform,
  setTargetPort: (portAddress) => ipcRenderer.invoke('set-target-serial-port', portAddress),
  listPorts: () => ipcRenderer.invoke('get-serial-ports'),
  compile: (data) => ipcRenderer.invoke('compile-sketch', data),
  upload: (data) => ipcRenderer.invoke('upload-sketch', data)
});

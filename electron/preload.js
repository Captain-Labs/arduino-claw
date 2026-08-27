// electron/preload.js — Preload Bridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktopApp: true,
  platform: process.platform
});

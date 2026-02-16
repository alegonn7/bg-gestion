const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs seguras al renderer process
contextBridge.exposeInMainWorld('electron', {
  // Database operations
  db: {
    execute: (sql, params) => ipcRenderer.invoke('db:execute', sql, params),
    query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
    get: (sql, params) => ipcRenderer.invoke('db:get', sql, params),
  },
  
  // System info
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  
  // Platform
  platform: process.platform,
});
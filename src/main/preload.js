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

  // Changelog helpers
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getLastShownVersion: () => ipcRenderer.invoke('get-last-shown-version'),
  setLastShownVersion: (version) => ipcRenderer.invoke('set-last-shown-version', version),
  getChangelogText: () => ipcRenderer.invoke('get-changelog-text'),

  // Platform
  platform: process.platform,
});
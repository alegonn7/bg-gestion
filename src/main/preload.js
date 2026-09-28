const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs seguras al renderer process
contextBridge.exposeInMainWorld('electron', {
  // Database operations
  db: {
    execute: (sql, params) => ipcRenderer.invoke('db:execute', sql, params),
    query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
    get: (sql, params) => ipcRenderer.invoke('db:get', sql, params),
  },

  // Caché offline (productos + metadatos)
  cache: {
    saveProducts: (branchIds, products) => ipcRenderer.invoke('cache:save-products', { branchIds, products }),
    getProducts: (branchIds) => ipcRenderer.invoke('cache:get-products', { branchIds }),
    setMeta: (key, value) => ipcRenderer.invoke('cache:set-meta', { key, value }),
    getMeta: (key) => ipcRenderer.invoke('cache:get-meta', { key }),
  },

  // Login offline
  offlineAuth: {
    save: (email, password, payload) => ipcRenderer.invoke('offline-auth:save', { email, password, payload }),
    touch: (email, payload) => ipcRenderer.invoke('offline-auth:touch', { email, payload }),
    verify: (email, password) => ipcRenderer.invoke('offline-auth:verify', { email, password }),
    getSnapshot: (email) => ipcRenderer.invoke('offline-auth:get-snapshot', { email }),
    status: () => ipcRenderer.invoke('offline-auth:status'),
    clear: (email) => ipcRenderer.invoke('offline-auth:clear', { email }),
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

  // PDF export
  exportPdf: (html, filename) => ipcRenderer.invoke('export-pdf', { html, filename }),

  // Varios archivos juntos en una carpeta que elige el usuario
  guardarArchivos: (carpeta, archivos) => ipcRenderer.invoke('guardar-archivos', { carpeta, archivos }),
});
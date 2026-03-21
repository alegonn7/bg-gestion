'use strict';

// ============================================================
// REQUIRES - siempre primero, sin excepción
// ============================================================
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

let mainWindow;
let db;

// ============================================================
// BASE DE DATOS
// ============================================================
function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'inventario.db');

  console.log('Database path:', dbPath);

  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS local_products (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      data TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  console.log('Local database initialized');
}

// ============================================================
// VENTANA PRINCIPAL
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../../build/icons/win/icon.ico'),
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================
// CICLO DE VIDA DE LA APP
// ============================================================
app.whenReady().then(() => {
  initDatabase();
  createWindow();

  if (process.env.NODE_ENV !== 'development') {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // No hay releases publicados todavía, ignorar error
    });
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (db) db.close();
    app.quit();
  }
});

// ============================================================
// AUTO UPDATER
// ============================================================
autoUpdater.on('update-available', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update_available');
  }
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update_downloaded');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización lista',
      message: 'Hay una nueva versión disponible. ¿Deseas reiniciar para actualizar?',
      buttons: ['Reiniciar ahora', 'Después'],
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  }
});

// ============================================================
// IPC HANDLERS - BASE DE DATOS
// ============================================================
ipcMain.handle('db:execute', async (event, sql, params) => {
  try {
    const stmt = db.prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return { success: true, result };
  } catch (error) {
    console.error('Database error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:query', async (event, sql, params) => {
  try {
    const stmt = db.prepare(sql);
    const result = params ? stmt.all(...params) : stmt.all();
    return { success: true, data: result };
  } catch (error) {
    console.error('Database query error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:get', async (event, sql, params) => {
  try {
    const stmt = db.prepare(sql);
    const result = params ? stmt.get(...params) : stmt.get();
    return { success: true, data: result };
  } catch (error) {
    console.error('Database get error:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================
// IPC HANDLERS - SISTEMA
// ============================================================
ipcMain.handle('get-device-id', async () => {
  try {
    const result = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('device_id');

    if (result) return result.value;

    const deviceId = `desktop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('device_id', deviceId);

    return deviceId;
  } catch (error) {
    console.error('Error getting device ID:', error);
    return null;
  }
});

ipcMain.handle('get-system-info', async () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    electronVersion: process.versions.electron,
  };
});

// ============================================================
// IPC HANDLERS - CHANGELOG
// ============================================================
ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

ipcMain.handle('get-changelog-text', async () => {
  try {
    const publicPath = path.join(__dirname, '../../public/changelog.txt');
    if (fs.existsSync(publicPath)) {
      return fs.readFileSync(publicPath, 'utf8');
    }

    const prodPath = path.join(process.resourcesPath, 'public', 'changelog.txt');
    if (fs.existsSync(prodPath)) {
      return fs.readFileSync(prodPath, 'utf8');
    }

    return '';
  } catch (e) {
    return '';
  }
});

ipcMain.handle('set-last-shown-version', async (event, version) => {
  try {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('last_shown_version', version);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-last-shown-version', async () => {
  try {
    const result = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('last_shown_version');
    return result ? result.value : null;
  } catch (error) {
    return null;
  }
});
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

let mainWindow;
let db;

// Inicializar base de datos local SQLite
function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'inventario.db');
  
  console.log('Database path:', dbPath);
  
  db = new Database(dbPath);
  
  // Crear tablas locales (simplificadas para sincronización)
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
    icon: path.join(__dirname, '../../build/icon.ico'),
  });

  // En desarrollo, cargar desde Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // En producción, cargar el build
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Inicializar app
app.whenReady().then(() => {
  initDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (db) db.close();
    app.quit();
  }
});

// IPC Handlers para comunicación con el renderer
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

// Obtener device ID único
ipcMain.handle('get-device-id', async () => {
  try {
    const result = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('device_id');
    
    if (result) {
      return result.value;
    }
    
    // Generar nuevo device ID
    const deviceId = `desktop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('device_id', deviceId);
    
    return deviceId;
  } catch (error) {
    console.error('Error getting device ID:', error);
    return null;
  }
});

// Obtener información del sistema
ipcMain.handle('get-system-info', async () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    electronVersion: process.versions.electron,
  };
});
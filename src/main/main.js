
console.log('INICIO MAIN.JS');
'use strict';

// ============================================================
// REQUIRES - siempre primero, sin excepción
// ============================================================
require('dotenv').config();
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
const crypto = require('crypto');

let mainWindow;
let db;

// Días máximos que se permite ingresar sin conexión desde el último login online.
// Pasado ese plazo se exige internet (para respetar bajas de usuarios / suspensiones).
const OFFLINE_MAX_DAYS = 30;

// ============================================================
// BASE DE DATOS
// ============================================================
function initDatabase() {
  console.log('Iniciando base de datos...');
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'inventario.db');

  console.log('Database path:', dbPath);

  db = new Database(dbPath);
  console.log('Base de datos creada');

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

    -- Caché de productos por sucursal para consulta offline (precios / stock)
    CREATE TABLE IF NOT EXISTS cached_products (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL,
      barcode TEXT,
      name TEXT,
      data TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cached_products_branch ON cached_products(branch_id);
    CREATE INDEX IF NOT EXISTS idx_cached_products_barcode ON cached_products(barcode);

    -- Credenciales y perfil cacheados para poder ingresar sin conexión
    CREATE TABLE IF NOT EXISTS offline_auth (
      email TEXT PRIMARY KEY,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      payload TEXT NOT NULL,
      last_online_at INTEGER NOT NULL
    );
  `);

  console.log('Tablas creadas. Local database initialized');
}

// ============================================================
// OFFLINE AUTH - helpers de hashing (scrypt + salt aleatorio)
// ============================================================
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function daysSince(timestampSeconds) {
  return (Date.now() / 1000 - timestampSeconds) / 86400;
}

// ============================================================
// VENTANA PRINCIPAL
// ============================================================
function createWindow() {
  console.log('Creando ventana principal...');
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
    console.log('Cargando Vite dev server');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    console.log('Cargando build de producción');
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    console.log('Ventana principal cerrada');
    mainWindow = null;
  });
}

// ============================================================
// CICLO DE VIDA DE LA APP
// ============================================================

app.whenReady().then(() => {
  console.log('App ready');
  initDatabase();
  createWindow();

  // Forzar búsqueda de actualizaciones SIEMPRE y agregar logs
  console.log('Buscando actualizaciones...');
  autoUpdater.checkForUpdatesAndNotify()
    .then(() => {
      console.log('Chequeo de actualizaciones terminado');
    })
    .catch(err => {
      console.error('Error al buscar actualizaciones:', err);
    });
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
  console.log('Actualización disponible (update-available)');
  if (mainWindow) {
    mainWindow.webContents.send('update_available');
  }
});


autoUpdater.on('update-downloaded', () => {
  console.log('Actualización descargada (update-downloaded)');
  if (mainWindow) {
    mainWindow.webContents.send('update_downloaded');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización lista',
      message: 'Hay una nueva versión disponible. ¿Deseas reiniciar para actualizar?',
      buttons: ['Reiniciar ahora', 'Después'],
    }).then(result => {
      if (result.response === 0) {
        console.log('Usuario eligió reiniciar para instalar actualización');
        autoUpdater.quitAndInstall();
      } else {
        console.log('Usuario eligió actualizar después');
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
// IPC HANDLERS - CACHÉ OFFLINE DE PRODUCTOS
// ============================================================
ipcMain.handle('cache:save-products', async (event, { branchIds, products }) => {
  try {
    if (!Array.isArray(products)) return { success: false, error: 'products debe ser un array' };

    const ids = Array.isArray(branchIds) ? branchIds.filter(Boolean) : [];
    const now = Math.floor(Date.now() / 1000);

    const insert = db.prepare(`
      INSERT OR REPLACE INTO cached_products (id, branch_id, barcode, name, data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const replaceAll = db.transaction(() => {
      // Reemplazar solo el scope sincronizado (las sucursales consultadas)
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`DELETE FROM cached_products WHERE branch_id IN (${placeholders})`).run(...ids);
      }

      for (const p of products) {
        if (!p || !p.id || !p.branch_id) continue;
        insert.run(
          p.id,
          p.branch_id,
          p.barcode || null,
          (p.product && p.product.name) || null,
          JSON.stringify(p),
          now
        );
      }

      db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
        .run('products_synced_at', String(now));
    });

    replaceAll();

    return { success: true, count: products.length, syncedAt: now };
  } catch (error) {
    console.error('Error cache:save-products:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cache:get-products', async (event, { branchIds } = {}) => {
  try {
    const ids = Array.isArray(branchIds) ? branchIds.filter(Boolean) : [];

    const rows = ids.length > 0
      ? db.prepare(
          `SELECT data, updated_at FROM cached_products WHERE branch_id IN (${ids.map(() => '?').join(',')})`
        ).all(...ids)
      : db.prepare('SELECT data, updated_at FROM cached_products').all();

    const products = [];
    let syncedAt = null;

    for (const row of rows) {
      try {
        products.push(JSON.parse(row.data));
      } catch {
        // fila corrupta: se ignora
      }
      if (syncedAt === null || row.updated_at > syncedAt) syncedAt = row.updated_at;
    }

    return { success: true, data: products, syncedAt };
  } catch (error) {
    console.error('Error cache:get-products:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cache:set-meta', async (event, { key, value }) => {
  try {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
      .run(`meta:${key}`, JSON.stringify(value ?? null));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cache:get-meta', async (event, { key }) => {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(`meta:${key}`);
    return { success: true, data: row ? JSON.parse(row.value) : null };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================================
// IPC HANDLERS - LOGIN OFFLINE
// El hash de la contraseña (scrypt + salt) y el perfil del usuario se guardan
// localmente en cada login online exitoso, para poder validar sin internet.
// ============================================================
ipcMain.handle('offline-auth:save', async (event, { email, password, payload }) => {
  try {
    if (!email || !password || !payload) {
      return { success: false, error: 'Datos incompletos' };
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    db.prepare(`
      INSERT OR REPLACE INTO offline_auth (email, salt, password_hash, payload, last_online_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(normalizedEmail, salt, passwordHash, JSON.stringify(payload), Math.floor(Date.now() / 1000));

    return { success: true };
  } catch (error) {
    console.error('Error offline-auth:save:', error);
    return { success: false, error: error.message };
  }
});

// Refresca el perfil cacheado y la fecha de último acceso online sin tocar la contraseña
// (se usa cuando la sesión se restaura sola, sin que el usuario tipee su clave).
ipcMain.handle('offline-auth:touch', async (event, { email, payload }) => {
  try {
    if (!email) return { success: false, error: 'Falta email' };

    const normalizedEmail = String(email).trim().toLowerCase();
    const row = db.prepare('SELECT email FROM offline_auth WHERE email = ?').get(normalizedEmail);
    if (!row) return { success: false, error: 'no-cache' };

    db.prepare('UPDATE offline_auth SET payload = ?, last_online_at = ? WHERE email = ?')
      .run(JSON.stringify(payload), Math.floor(Date.now() / 1000), normalizedEmail);

    return { success: true };
  } catch (error) {
    console.error('Error offline-auth:touch:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('offline-auth:verify', async (event, { email, password }) => {
  try {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const row = db.prepare('SELECT * FROM offline_auth WHERE email = ?').get(normalizedEmail);

    if (!row) return { success: false, reason: 'no-cache' };

    if (daysSince(row.last_online_at) > OFFLINE_MAX_DAYS) {
      return { success: false, reason: 'expired', maxDays: OFFLINE_MAX_DAYS };
    }

    if (!verifyPassword(String(password || ''), row.salt, row.password_hash)) {
      return { success: false, reason: 'bad-password' };
    }

    return {
      success: true,
      payload: JSON.parse(row.payload),
      lastOnlineAt: row.last_online_at,
    };
  } catch (error) {
    console.error('Error offline-auth:verify:', error);
    return { success: false, reason: 'error', error: error.message };
  }
});

// Devuelve el perfil cacheado sin validar contraseña.
// Solo se usa cuando ya existe una sesión de Supabase válida en disco.
ipcMain.handle('offline-auth:get-snapshot', async (event, { email } = {}) => {
  try {
    const row = email
      ? db.prepare('SELECT * FROM offline_auth WHERE email = ?').get(String(email).trim().toLowerCase())
      : db.prepare('SELECT * FROM offline_auth ORDER BY last_online_at DESC LIMIT 1').get();

    if (!row) return { success: false, reason: 'no-cache' };

    if (daysSince(row.last_online_at) > OFFLINE_MAX_DAYS) {
      return { success: false, reason: 'expired', maxDays: OFFLINE_MAX_DAYS };
    }

    return {
      success: true,
      email: row.email,
      payload: JSON.parse(row.payload),
      lastOnlineAt: row.last_online_at,
    };
  } catch (error) {
    console.error('Error offline-auth:get-snapshot:', error);
    return { success: false, reason: 'error', error: error.message };
  }
});

// Info liviana para la pantalla de login (¿hay acceso offline disponible?)
ipcMain.handle('offline-auth:status', async () => {
  try {
    const row = db.prepare('SELECT email, last_online_at FROM offline_auth ORDER BY last_online_at DESC LIMIT 1').get();
    if (!row) return { available: false, maxDays: OFFLINE_MAX_DAYS };

    return {
      available: daysSince(row.last_online_at) <= OFFLINE_MAX_DAYS,
      email: row.email,
      lastOnlineAt: row.last_online_at,
      maxDays: OFFLINE_MAX_DAYS,
    };
  } catch (error) {
    return { available: false, maxDays: OFFLINE_MAX_DAYS, error: error.message };
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

// ============================================================
// IPC HANDLERS - ADMIN AUTH (operaciones privilegiadas)
// La service role key solo se usa aquí, en el proceso principal Node.js
// NUNCA se expone al renderer/frontend
// ============================================================
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }
  const { createClient } = require('@supabase/supabase-js');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

ipcMain.handle('admin:create-user', async (event, { email, password }) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, user: data.user };
  } catch (error) {
    console.error('Error admin:create-user:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('admin:delete-user', async (event, { authId }) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(authId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    console.error('Error admin:delete-user:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================
// IPC HANDLERS - EXPORTAR PDF
// ============================================================
ipcMain.handle('export-pdf', async (event, { html, filename }) => {
  try {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename || 'etiquetas.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { success: false, canceled: true };

    const tempPath = path.join(app.getPath('temp'), `bg_print_${Date.now()}.html`);
    fs.writeFileSync(tempPath, html, 'utf-8');

    const printWin = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
    await printWin.loadFile(tempPath);

    const pdfBuffer = await printWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: false,
      margins: { marginType: 'none' },
    });

    printWin.close();
    fs.unlinkSync(tempPath);
    fs.writeFileSync(filePath, pdfBuffer);

    return { success: true, path: filePath };
  } catch (error) {
    console.error('Error export-pdf:', error);
    return { success: false, error: error.message };
  }
});
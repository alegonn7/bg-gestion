/**
 * Modo offline en la versión web.
 *
 * Es la misma caché que la aplicación de escritorio guarda en SQLite (ver src/main/main.js),
 * pero en IndexedDB del navegador. Tiene la misma forma que window.electron.cache y
 * window.electron.offlineAuth, así lib/offline.ts usa una u otra sin cambiar nada más.
 */

const DB_NAME = 'bg-gestion-offline'
const DB_VERSION = 1
const OFFLINE_MAX_DAYS = 30
const PBKDF2_ITERATIONS = 210_000

type StoreName = 'cached_products' | 'meta' | 'offline_auth'

interface CachedProductRow {
  id: string
  branch_id: string
  data: any
  updated_at: number
}

interface OfflineAuthRow {
  email: string
  salt: string
  password_hash: string
  payload: any
  last_online_at: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        const products = db.createObjectStore('cached_products', { keyPath: 'id' })
        products.createIndex('branch_id', 'branch_id')
        db.createObjectStore('meta')
        db.createObjectStore('offline_auth', { keyPath: 'email' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        dbPromise = null
        reject(request.error)
      }
    })
  }
  return dbPromise
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function store(name: StoreName, mode: IDBTransactionMode) {
  const tx = (await openDb()).transaction(name, mode)
  return { tx, os: tx.objectStore(name) }
}

const nowSeconds = () => Math.floor(Date.now() / 1000)
const daysSince = (timestampSeconds: number) => (Date.now() / 1000 - timestampSeconds) / 86400
const normalize = (email: string) => String(email || '').trim().toLowerCase()
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

// ------------------------------------------------------------
// Contraseña: PBKDF2 (WebCrypto) + salt aleatorio
// ------------------------------------------------------------

const toHex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

async function hashPassword(password: string, saltHex: string): Promise<string> {
  const salt = new Uint8Array(saltHex.match(/../g)!.map(h => parseInt(h, 16)))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 512)
  return toHex(new Uint8Array(bits))
}

async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = await hashPassword(password, salt)
  if (actual.length !== expectedHash.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i)
  return diff === 0
}

// ------------------------------------------------------------
// Caché de productos y metadatos
// ------------------------------------------------------------

export const webCache: NonNullable<NonNullable<Window['electron']>['cache']> = {
  async saveProducts(branchIds, products) {
    try {
      if (!Array.isArray(products)) return { success: false, error: 'products debe ser un array' }
      const ids = Array.isArray(branchIds) ? branchIds.filter(Boolean) : []
      const now = nowSeconds()
      const { tx, os } = await store('cached_products', 'readwrite')

      // Reemplazar solo el scope sincronizado (las sucursales consultadas)
      if (ids.length > 0) {
        const keys = await Promise.all(ids.map(id => result(os.index('branch_id').getAllKeys(id))))
        for (const key of keys.flat()) os.delete(key)
      }
      for (const p of products) {
        if (!p || !p.id || !p.branch_id) continue
        os.put({ id: p.id, branch_id: p.branch_id, data: p, updated_at: now } satisfies CachedProductRow)
      }
      await done(tx)
      return { success: true, count: products.length, syncedAt: now }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  },

  async getProducts(branchIds) {
    try {
      const ids = Array.isArray(branchIds) ? branchIds.filter(Boolean) : []
      const { os } = await store('cached_products', 'readonly')
      const rows: CachedProductRow[] = ids.length > 0
        ? (await Promise.all(ids.map(id => result(os.index('branch_id').getAll(id))))).flat()
        : await result(os.getAll())

      let syncedAt: number | null = null
      for (const row of rows) {
        if (syncedAt === null || row.updated_at > syncedAt) syncedAt = row.updated_at
      }
      return { success: true, data: rows.map(r => r.data), syncedAt }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  },

  async setMeta(key, value) {
    try {
      const { tx, os } = await store('meta', 'readwrite')
      os.put(value ?? null, key)
      await done(tx)
      return { success: true }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  },

  async getMeta(key) {
    try {
      const { os } = await store('meta', 'readonly')
      const data = await result(os.get(key))
      return { success: true, data: data ?? null }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  },
}

// ------------------------------------------------------------
// Login sin conexión
// ------------------------------------------------------------

async function getAuthRow(email?: string): Promise<OfflineAuthRow | undefined> {
  const { os } = await store('offline_auth', 'readonly')
  if (email) return result(os.get(normalize(email)))
  const rows: OfflineAuthRow[] = await result(os.getAll())
  return rows.sort((a, b) => b.last_online_at - a.last_online_at)[0]
}

export const webOfflineAuth: NonNullable<NonNullable<Window['electron']>['offlineAuth']> = {
  async save(email, password, payload) {
    try {
      if (!email || !password || !payload) return { success: false, error: 'Datos incompletos' }
      const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
      const row: OfflineAuthRow = {
        email: normalize(email),
        salt,
        password_hash: await hashPassword(password, salt),
        payload,
        last_online_at: nowSeconds(),
      }
      const { tx, os } = await store('offline_auth', 'readwrite')
      os.put(row)
      await done(tx)
      return { success: true }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  },

  // Refresca el perfil y la fecha de último acceso online sin tocar la contraseña
  async touch(email, payload) {
    try {
      if (!email) return { success: false, error: 'Falta email' }
      const row = await getAuthRow(email)
      if (!row) return { success: false, error: 'no-cache' }
      const { tx, os } = await store('offline_auth', 'readwrite')
      os.put({ ...row, payload, last_online_at: nowSeconds() })
      await done(tx)
      return { success: true }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  },

  async verify(email, password) {
    try {
      const row = await getAuthRow(normalize(email))
      if (!row) return { success: false, reason: 'no-cache' }
      if (daysSince(row.last_online_at) > OFFLINE_MAX_DAYS) {
        return { success: false, reason: 'expired', maxDays: OFFLINE_MAX_DAYS }
      }
      if (!(await verifyPassword(String(password || ''), row.salt, row.password_hash))) {
        return { success: false, reason: 'bad-password' }
      }
      return { success: true, payload: row.payload, lastOnlineAt: row.last_online_at }
    } catch (err) {
      return { success: false, reason: 'error', error: errorMessage(err) }
    }
  },

  async clear(email) {
    try {
      const { tx, os } = await store('offline_auth', 'readwrite')
      os.delete(normalize(email))
      await done(tx)
      return { success: true }
    } catch (err) {
      return { success: false, error: errorMessage(err) }
    }
  },

  // Perfil guardado sin validar contraseña (solo con sesión de Supabase válida)
  async getSnapshot(email) {
    try {
      const row = await getAuthRow(email)
      if (!row) return { success: false, reason: 'no-cache' }
      if (daysSince(row.last_online_at) > OFFLINE_MAX_DAYS) {
        return { success: false, reason: 'expired', maxDays: OFFLINE_MAX_DAYS }
      }
      return { success: true, email: row.email, payload: row.payload, lastOnlineAt: row.last_online_at }
    } catch {
      return { success: false, reason: 'error' }
    }
  },

  // Info liviana para la pantalla de login (¿hay acceso offline disponible?)
  async status() {
    try {
      const row = await getAuthRow()
      if (!row) return { available: false, maxDays: OFFLINE_MAX_DAYS }
      return {
        available: daysSince(row.last_online_at) <= OFFLINE_MAX_DAYS,
        email: row.email,
        lastOnlineAt: row.last_online_at,
        maxDays: OFFLINE_MAX_DAYS,
      }
    } catch {
      return { available: false, maxDays: OFFLINE_MAX_DAYS }
    }
  },
}

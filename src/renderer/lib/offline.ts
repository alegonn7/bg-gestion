import type { User, Organization, Branch } from '@/lib/supabase'

/**
 * Utilidades para el modo offline.
 *
 * El sistema guarda en SQLite local (proceso principal de Electron):
 *  - el perfil del usuario + hash de su contraseña, para poder ingresar sin internet
 *  - la última copia de los productos de la sucursal, para consultar precios sin internet
 */

export interface OfflineSnapshot {
  user: User
  organization: Organization
  branch: Branch | null
  branches: Branch[]
  selectedBranch: Branch | null
}

/**
 * Distingue un fallo de red (sin WiFi, servidor inalcanzable) de un error real
 * de negocio (contraseña incorrecta, usuario suspendido, RLS, etc.).
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true

  const name = String(error.name || '')
  const message = String(error.message || '').toLowerCase()
  const code = String(error.code || '')

  if (name === 'AuthRetryableFetchError' || name === 'TypeError' || name === 'AbortError') {
    // TypeError: "Failed to fetch" es el error típico de fetch sin conexión
    if (name === 'TypeError' && !message.includes('fetch') && !message.includes('network')) {
      return false
    }
    return true
  }

  if (error.status === 0 || code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
    return true
  }

  return (
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('err_internet_disconnected') ||
    message.includes('err_name_not_resolved') ||
    message.includes('timeout')
  )
}

/**
 * Ejecuta una promesa con límite de tiempo.
 * Sin conexión, Supabase puede quedarse reintentando el refresh del token varios
 * segundos; esto evita que la app se quede colgada en "Cargando...".
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ------------------------------------------------------------
// Credenciales / perfil para acceso sin conexión
// ------------------------------------------------------------

/** Guarda usuario + hash de contraseña + perfil. Nunca lanza: es un paso auxiliar del login. */
export async function saveOfflineCredentials(
  email: string,
  password: string,
  snapshot: OfflineSnapshot
): Promise<void> {
  try {
    await window.electron?.offlineAuth?.save(email, password, snapshot)
  } catch (err) {
    console.warn('No se pudieron guardar las credenciales offline:', err)
  }
}

/** Refresca el perfil cacheado y la fecha del último acceso online. Nunca lanza. */
export async function touchOfflineSnapshot(email: string, snapshot: OfflineSnapshot): Promise<void> {
  try {
    await window.electron?.offlineAuth?.touch(email, snapshot)
  } catch (err) {
    console.warn('No se pudo refrescar el perfil offline:', err)
  }
}

/** Valida email + contraseña contra los datos guardados localmente. Nunca lanza. */
export async function verifyOfflineCredentials(email: string, password: string) {
  try {
    const result = await window.electron?.offlineAuth?.verify(email, password)
    return result ?? { success: false as const, reason: 'no-cache' as const }
  } catch (err) {
    console.error('Error validando credenciales offline:', err)
    return { success: false as const, reason: 'error' as const }
  }
}

/** Perfil cacheado sin validar contraseña (solo con sesión de Supabase válida). Nunca lanza. */
export async function getOfflineSnapshot(email?: string) {
  try {
    const result = await window.electron?.offlineAuth?.getSnapshot(email)
    return result ?? { success: false as const, reason: 'no-cache' as const }
  } catch (err) {
    console.error('Error leyendo el perfil offline:', err)
    return { success: false as const, reason: 'error' as const }
  }
}

// ------------------------------------------------------------
// Caché de productos
// ------------------------------------------------------------

export async function saveProductsCache(branchIds: string[], products: any[]): Promise<void> {
  const cache = window.electron?.cache
  if (!cache) return

  try {
    await cache.saveProducts(branchIds, products)
  } catch (err) {
    console.warn('No se pudo guardar la caché de productos:', err)
  }
}

export async function loadProductsCache(
  branchIds: string[]
): Promise<{ products: any[]; syncedAt: number | null }> {
  const cache = window.electron?.cache
  if (!cache) return { products: [], syncedAt: null }

  try {
    const result = await cache.getProducts(branchIds)
    if (!result?.success) return { products: [], syncedAt: null }
    return { products: result.data || [], syncedAt: result.syncedAt ?? null }
  } catch (err) {
    console.warn('No se pudo leer la caché de productos:', err)
    return { products: [], syncedAt: null }
  }
}

// ------------------------------------------------------------
// Metadatos genéricos (cotización del dólar, etc.)
// ------------------------------------------------------------

export async function saveMeta(key: string, value: any): Promise<void> {
  try {
    await window.electron?.cache?.setMeta(key, value)
  } catch (err) {
    console.warn(`No se pudo guardar meta "${key}":`, err)
  }
}

export async function loadMeta<T = any>(key: string): Promise<T | null> {
  try {
    const result = await window.electron?.cache?.getMeta(key)
    return (result?.success ? (result.data as T) : null) ?? null
  } catch (err) {
    console.warn(`No se pudo leer meta "${key}":`, err)
    return null
  }
}

// ------------------------------------------------------------
// Formato
// ------------------------------------------------------------

/** Convierte un timestamp UNIX (segundos) en texto legible: "hoy 14:32", "hace 2 días", etc. */
export function formatSyncAge(syncedAt: number | null): string {
  if (!syncedAt) return 'sin datos'

  const date = new Date(syncedAt * 1000)
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000)

  if (diffMinutes < 1) return 'hace instantes'
  if (diffMinutes < 60) return `hace ${diffMinutes} min`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `hace ${diffHours} h`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'ayer'
  if (diffDays < 30) return `hace ${diffDays} días`

  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Fecha y hora completa de una sincronización. */
export function formatSyncDate(syncedAt: number | null): string {
  if (!syncedAt) return '—'
  return new Date(syncedAt * 1000).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

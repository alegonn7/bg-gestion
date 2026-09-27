import { create } from 'zustand'

/**
 * Estado de conectividad real contra Supabase.
 *
 * No alcanza con `navigator.onLine`: una PC conectada a un router sin internet
 * reporta "online". Por eso se hace un ping liviano al backend.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const PROBE_TIMEOUT_MS = 6000
const RETRY_DELAY_MS = 1500
const INTERVAL_ONLINE_MS = 60000
const INTERVAL_OFFLINE_MS = 15000

interface NetworkState {
  isOnline: boolean
  isChecking: boolean
  lastOnlineAt: number | null
  lastCheckAt: number | null

  /** `quick`: sin reintento, para no demorar el login cuando no hay internet */
  checkConnection: (options?: { quick?: boolean }) => Promise<boolean>
  startMonitoring: () => () => void
  /** Callback que se dispara cuando se recupera la conexión (lo setea App). */
  onReconnect: (() => void) | null
  setOnReconnect: (cb: (() => void) | null) => void
}

async function probeOnce(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      cache: 'no-store',
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: controller.signal,
    })
    // Cualquier respuesta HTTP significa que el backend es alcanzable
    return response.status > 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function probeBackend(retry: boolean): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  if (!SUPABASE_URL) return false

  if (await probeOnce()) return true

  // Un corte de un segundo no debería sacar al usuario de lo que está haciendo:
  // se confirma con un segundo intento antes de pasar a modo offline.
  if (!retry) return false

  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
  return probeOnce()
}

let intervalId: ReturnType<typeof setInterval> | null = null

export const useNetworkStore = create<NetworkState>((set, get) => ({
  // Se asume conectado hasta que un sondeo diga lo contrario
  isOnline: typeof navigator === 'undefined' || navigator.onLine !== false,
  isChecking: false,
  lastOnlineAt: null,
  lastCheckAt: null,
  onReconnect: null,

  setOnReconnect: (cb) => set({ onReconnect: cb }),

  checkConnection: async (options) => {
    if (get().isChecking) return get().isOnline

    set({ isChecking: true })
    const reachable = await probeBackend(!options?.quick)
    const wasOnline = get().isOnline

    set({
      isOnline: reachable,
      isChecking: false,
      lastCheckAt: Date.now(),
      lastOnlineAt: reachable ? Date.now() : get().lastOnlineAt,
    })

    if (reachable && !wasOnline) {
      console.log('🌐 Conexión restablecida')
      get().onReconnect?.()
    } else if (!reachable && wasOnline) {
      console.warn('📴 Sin conexión con el servidor: modo offline')
    }

    return reachable
  },

  startMonitoring: () => {
    const scheduleNext = () => {
      if (intervalId) clearInterval(intervalId)
      const delay = get().isOnline ? INTERVAL_ONLINE_MS : INTERVAL_OFFLINE_MS
      intervalId = setInterval(async () => {
        const before = get().isOnline
        await get().checkConnection()
        // Si cambió el estado, reajustar la frecuencia del sondeo
        if (before !== get().isOnline) scheduleNext()
      }, delay)
    }

    const handleBrowserOnline = () => {
      void get().checkConnection().then(() => scheduleNext())
    }

    const handleBrowserOffline = () => {
      set({ isOnline: false, lastCheckAt: Date.now() })
      scheduleNext()
    }

    window.addEventListener('online', handleBrowserOnline)
    window.addEventListener('offline', handleBrowserOffline)

    void get().checkConnection().then(() => scheduleNext())

    return () => {
      window.removeEventListener('online', handleBrowserOnline)
      window.removeEventListener('offline', handleBrowserOffline)
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
  },
}))

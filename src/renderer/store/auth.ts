import { create } from 'zustand'
import { supabase, clearStoredSession, User, Organization, Branch } from '@/lib/supabase'
import { useNetworkStore } from './network'
import {
  clearOfflineCredentials,
  getOfflineSnapshot,
  isNetworkError,
  saveOfflineCredentials,
  touchOfflineSnapshot,
  verifyOfflineCredentials,
  withTimeout,
  type OfflineSnapshot,
} from '@/lib/offline'
import { useSalesStore } from './sales'
import { useReportsStore } from './reports'

interface AuthState {
  user: User | null
  organization: Organization | null
  branch: Branch | null
  branches: Branch[] // todas las sucursales de la org
  selectedBranch: Branch | null // sucursal actualmente seleccionada
  isLoading: boolean
  isAuthenticated: boolean
  deviceId: string | null

  /** Sesión validada localmente, sin conexión al backend (solo consulta) */
  isOffline: boolean
  /** Último acceso online exitoso (timestamp UNIX en segundos) */
  lastOnlineAt: number | null
  /** Hay conexión de nuevo pero la sesión sigue siendo local: hace falta re-loguear */
  needsRelogin: boolean

  // Actions
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  setDeviceId: (id: string) => void
  selectBranch: (branchId: string) => void
  /** Reintenta validar la sesión contra el servidor al recuperar la conexión */
  handleReconnect: () => Promise<void>
  /** Cambia el nombre propio (dueño o administrador; al resto se lo cambia el dueño) */
  actualizarMiNombre: (nombre: string) => Promise<void>
  /** Cambia la contraseña propia, confirmando antes la actual */
  cambiarMiClave: (actual: string, nueva: string) => Promise<void>
}

/** Datos que se guardan localmente para poder ingresar y operar sin conexión */
function buildSnapshot(state: {
  user: User
  organization: Organization
  branch: Branch | null
  branches: Branch[]
  selectedBranch: Branch | null
}): OfflineSnapshot {
  return {
    user: state.user,
    organization: state.organization,
    branch: state.branch,
    branches: state.branches,
    selectedBranch: state.selectedBranch,
  }
}

/**
 * Carga el perfil completo (usuario + organización + sucursales) desde Supabase.
 * Lanza error si no hay conexión o si la organización está suspendida.
 */
async function loadProfile(authId: string) {
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*, organizations(*), branches(*)')
    .eq('auth_id', authId)
    .single()

  if (userError) throw userError

  const org = userData.organizations as Organization

  // Sin acceso: se cierra la sesión y esta computadora deja de permitir el ingreso sin conexión
  const sinAcceso = !userData.is_active
    ? 'Tu usuario está desactivado. Pedile al dueño del negocio que lo vuelva a activar.'
    : org.subscription_status === 'suspended'
      ? 'Tu cuenta está suspendida. Contacta al administrador.'
      : null
  if (sinAcceso) {
    await clearOfflineCredentials(userData.email)
    await supabase.auth.signOut().catch(() => {})
    throw new Error(sinAcceso)
  }

  const { data: branchesData, error: branchesError } = await supabase
    .from('branches')
    .select('*')
    .eq('organization_id', org.id)
    .order('name')

  if (branchesError) throw branchesError

  const branches = (branchesData || []) as Branch[]
  const branch = (userData.branches as Branch | null) || null
  const selectedBranch = branch || (branches.length > 0 ? branches[0] : null)

  return {
    user: userData as User,
    organization: org,
    branch,
    branches,
    selectedBranch,
  }
}

/**
 * Valida el ingreso contra las credenciales guardadas en esta computadora y
 * devuelve el estado de sesión offline. Lanza error si no se puede validar.
 */
async function loginWithLocalCredentials(email: string, password: string) {
  const result = await verifyOfflineCredentials(email, password)

  if (!result.success || !result.payload) {
    throw offlineLoginError(result.reason, result.maxDays)
  }

  const snapshot = result.payload as OfflineSnapshot

  return {
    user: snapshot.user,
    organization: snapshot.organization,
    branch: snapshot.branch,
    branches: snapshot.branches || [],
    selectedBranch: snapshot.selectedBranch,
    isAuthenticated: true,
    isLoading: false,
    isOffline: true,
    needsRelogin: false,
    lastOnlineAt: result.lastOnlineAt ?? null,
  }
}

/** Mensajes de error del login offline según el motivo del rechazo */
function offlineLoginError(reason: string | undefined, maxDays?: number): Error {
  switch (reason) {
    case 'no-cache':
      return new Error(
        'Sin conexión a internet. Este usuario nunca inició sesión en esta computadora, ' +
        'así que no se puede validar el acceso offline.'
      )
    case 'expired':
      return new Error(
        `Sin conexión a internet. Pasaron más de ${maxDays ?? 30} días desde el último acceso online, ` +
        'por seguridad hace falta conectarse al menos una vez.'
      )
    case 'bad-password':
      return new Error('Contraseña incorrecta (validada con los datos guardados en esta computadora).')
    default:
      return new Error('Sin conexión a internet y no se pudo validar el acceso offline.')
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  organization: null,
  branch: null,
  branches: [],
  selectedBranch: null,
  isLoading: true,
  isAuthenticated: false,
  deviceId: null,
  isOffline: false,
  lastOnlineAt: null,
  needsRelogin: false,

  setDeviceId: (id: string) => {
    set({ deviceId: id })
  },

  selectBranch: (branchId: string) => {
    const state = useAuthStore.getState()
    const branch = state.branches.find(b => b.id === branchId)
    if (branch) {
      console.log('🏢 Sucursal seleccionada:', branch.name)
      set({ selectedBranch: branch })
    }
  },

  login: async (email: string, password: string) => {
    const enterOfflineMode = async () => {
      try {
        set(await loginWithLocalCredentials(email, password))
      } catch (error) {
        set({ isLoading: false })
        throw error
      }
    }

    // Confirmar el estado real de la conexión antes de elegir el camino: sin internet,
    // Supabase reintenta durante decenas de segundos antes de fallar.
    const online = await useNetworkStore.getState().checkConnection({ quick: true })

    if (!online) {
      console.warn('📴 Sin conexión: validando el ingreso con los datos locales')
      return enterOfflineMode()
    }

    try {
      // 1. Autenticar con Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) throw authError

      // 2. Cargar perfil (usuario, organización, sucursales)
      const profile = await loadProfile(authData.user.id)

      set({
        ...profile,
        isAuthenticated: true,
        isLoading: false,
        isOffline: false,
        needsRelogin: false,
        lastOnlineAt: Math.floor(Date.now() / 1000),
      })

      // 3. Guardar credenciales + perfil para poder ingresar sin conexión
      await saveOfflineCredentials(email, password, buildSnapshot(profile))

      // 4. Actualizar last_login
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', profile.user.id)

    } catch (error: any) {
      // Se cortó la conexión en medio del ingreso: validar con los datos locales
      if (isNetworkError(error)) {
        console.warn('📴 Se perdió la conexión durante el ingreso: validando localmente')
        return enterOfflineMode()
      }

      console.error('Login error:', error)
      set({ isLoading: false })
      throw error
    }
  },

  logout: async () => {
    try {
      const result = await withTimeout(supabase.auth.signOut(), 5000)
      // Sin conexión el servidor no puede invalidar el token: se borra la sesión local
      if (!result || result.error) clearStoredSession()
    } catch (error) {
      console.warn('No se pudo cerrar sesión en el servidor:', error)
      clearStoredSession()
    }
    useSalesStore.getState().reset()
    useReportsStore.getState().reset()
    set({
      user: null,
      organization: null,
      branch: null,
      branches: [],
      selectedBranch: null,
      isAuthenticated: false,
      isOffline: false,
      needsRelogin: false,
    })
  },

  checkAuth: async () => {
    let session = null

    try {
      // Sin conexión, refrescar el token puede tardar: si no responde se pide login
      const result = await withTimeout(supabase.auth.getSession(), 8000)
      session = result?.data.session ?? null
    } catch (error) {
      // Sin conexión y con token vencido, Supabase no puede refrescar la sesión
      console.warn('No se pudo leer la sesión:', error)
    }

    if (!session) {
      // Sin sesión válida se pide login (offline se valida con la contraseña guardada)
      set({ isLoading: false, isAuthenticated: false })
      return
    }

    try {
      const profile = await loadProfile(session.user.id)

      set({
        ...profile,
        isAuthenticated: true,
        isLoading: false,
        isOffline: false,
        needsRelogin: false,
        lastOnlineAt: Math.floor(Date.now() / 1000),
      })

      // Refrescar la copia local del perfil (sin tocar la contraseña guardada)
      const email = profile.user.email || session.user.email || ''
      if (email) {
        await touchOfflineSnapshot(email, buildSnapshot(profile))
      }

    } catch (error: any) {
      // La sesión guardada es válida pero no hay conexión: usar el perfil cacheado
      if (isNetworkError(error)) {
        console.warn('📴 Sesión restaurada sin conexión: usando datos locales')

        const snapshot = await getOfflineSnapshot(session.user.email)

        if (snapshot.success && snapshot.payload) {
          const data = snapshot.payload as OfflineSnapshot
          set({
            user: data.user,
            organization: data.organization,
            branch: data.branch,
            branches: data.branches || [],
            selectedBranch: data.selectedBranch,
            isAuthenticated: true,
            isLoading: false,
            isOffline: true,
            needsRelogin: false,
            lastOnlineAt: snapshot.lastOnlineAt ?? null,
          })
          return
        }
      }

      console.error('Check auth error:', error)
      set({ isLoading: false, isAuthenticated: false })
    }
  },

  handleReconnect: async () => {
    const { isOffline, isAuthenticated } = get()
    if (!isOffline || !isAuthenticated) return

    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        // El ingreso fue 100% offline: no hay sesión en el servidor
        set({ needsRelogin: true })
        return
      }

      const profile = await loadProfile(data.session.user.id)
      const previousBranchId = get().selectedBranch?.id
      const selectedBranch =
        profile.branches.find(b => b.id === previousBranchId) || profile.selectedBranch

      set({
        ...profile,
        selectedBranch,
        isOffline: false,
        needsRelogin: false,
        isAuthenticated: true,
        lastOnlineAt: Math.floor(Date.now() / 1000),
      })

      const email = profile.user.email || data.session.user.email || ''
      if (email) {
        await touchOfflineSnapshot(email, buildSnapshot({ ...profile, selectedBranch }))
      }

      console.log('✅ Sesión revalidada online')
    } catch (error) {
      console.warn('No se pudo revalidar la sesión al reconectar:', error)
      set({ needsRelogin: true })
    }
  },

  actualizarMiNombre: async (nombre: string) => {
    const { user, organization, branch, branches, selectedBranch } = get()
    if (!user || !organization) throw new Error('Tu sesión venció. Volvé a iniciar sesión.')
    const limpio = nombre.trim()
    if (!limpio) throw new Error('Escribí tu nombre')

    const { data, error } = await supabase
      .from('users')
      .update({ full_name: limpio })
      .eq('id', user.id)
      .select('id')
    if (error || !data?.length) {
      if (error) console.error('Error guardando el nombre:', error)
      throw new Error(isNetworkError(error) ? 'No hay conexión. Revisá tu internet y probá de nuevo.' : 'No se pudo guardar el nombre. Probá de nuevo.')
    }

    const actualizado = { ...user, full_name: limpio }
    set({ user: actualizado })
    await touchOfflineSnapshot(user.email, buildSnapshot({ user: actualizado, organization, branch, branches, selectedBranch }))
  },

  cambiarMiClave: async (actual: string, nueva: string) => {
    const { user, organization, branch, branches, selectedBranch } = get()
    if (!user || !organization) throw new Error('Tu sesión venció. Volvé a iniciar sesión.')
    if (nueva.length < 6) throw new Error('La contraseña nueva debe tener al menos 6 caracteres')

    // Confirmar la contraseña actual: nadie cambia la clave desde una computadora que quedó abierta
    const { error: errorActual } = await supabase.auth.signInWithPassword({ email: user.email, password: actual })
    if (errorActual) {
      throw new Error(isNetworkError(errorActual) ? 'No hay conexión. Revisá tu internet y probá de nuevo.' : 'La contraseña actual no es correcta')
    }

    const { error } = await supabase.auth.updateUser({ password: nueva })
    if (error) {
      if (error.code === 'same_password') throw new Error('La contraseña nueva tiene que ser distinta de la actual')
      if (error.code === 'weak_password') throw new Error('La contraseña nueva es muy débil: usá al menos 6 caracteres')
      console.error('Error cambiando la contraseña:', error)
      throw new Error('No se pudo cambiar la contraseña. Probá de nuevo.')
    }

    // El ingreso sin conexión en esta computadora pasa a usar la contraseña nueva
    await saveOfflineCredentials(user.email, nueva, buildSnapshot({ user, organization, branch, branches, selectedBranch }))
  },
}))

import { create } from 'zustand'
import { supabase, User, Organization, Branch } from '@/lib/supabase'

interface AuthState {
  user: User | null
  organization: Organization | null
  branch: Branch | null
  branches: Branch[] // todas las sucursales de la org
  selectedBranch: Branch | null // sucursal actualmente seleccionada
  isLoading: boolean
  isAuthenticated: boolean
  deviceId: string | null
  
  // Actions
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  setDeviceId: (id: string) => void
  selectBranch: (branchId: string) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  organization: null,
  branch: null,
  branches: [],
  selectedBranch: null,
  isLoading: true,
  isAuthenticated: false,
  deviceId: null,

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
    try {
      // 1. Autenticar con Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) throw authError

      // 2. Obtener datos del usuario desde nuestra tabla
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*, organizations(*), branches(*)')
        .eq('auth_id', authData.user.id)
        .single()

      if (userError) throw userError

      // 3. Verificar estado de la organización
      const org = userData.organizations as Organization
      
      if (org.subscription_status === 'suspended') {
        throw new Error('Tu cuenta está suspendida. Contacta al administrador.')
      }

      // 4. Cargar todas las sucursales de la organización
      const { data: branchesData, error: branchesError } = await supabase
        .from('branches')
        .select('*')
        .eq('organization_id', org.id)
        .order('name')

      if (branchesError) throw branchesError

      const branches = (branchesData || []) as Branch[]
      
      // Si el usuario tiene una rama asignada, seleccionarla. Si no, seleccionar la primera disponible
      const defaultBranch = userData.branches || (branches.length > 0 ? branches[0] : null)

      // 5. Actualizar estado
      set({
        user: userData as User,
        organization: org,
        branch: userData.branches as Branch | null,
        branches,
        selectedBranch: defaultBranch,
        isAuthenticated: true,
        isLoading: false,
      })

      // 6. Actualizar last_login
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userData.id)

    } catch (error: any) {
      console.error('Login error:', error)
      set({ isLoading: false })
      throw error
    }
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({
      user: null,
      organization: null,
      branch: null,
      isAuthenticated: false,
    })
  },

  checkAuth: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        set({ isLoading: false, isAuthenticated: false })
        return
      }

      // Obtener datos del usuario
      const { data: userData, error } = await supabase
        .from('users')
        .select('*, organizations(*), branches(*)')
        .eq('auth_id', session.user.id)
        .single()

      if (error) throw error

      const org = userData.organizations as Organization

      // Cargar todas las sucursales de la organización
      const { data: branchesData, error: branchesError } = await supabase
        .from('branches')
        .select('*')
        .eq('organization_id', org.id)
        .order('name')

      if (branchesError) throw branchesError

      const branches = (branchesData || []) as Branch[]
      const defaultBranch = userData.branches || (branches.length > 0 ? branches[0] : null)

      set({
        user: userData as User,
        organization: org,
        branch: userData.branches as Branch | null,
        branches,
        selectedBranch: defaultBranch,
        isAuthenticated: true,
        isLoading: false,
      })

    } catch (error) {
      console.error('Check auth error:', error)
      set({ isLoading: false, isAuthenticated: false })
    }
  },
}))
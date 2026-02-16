import { create } from 'zustand'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { useAuthStore } from './auth'

export interface User {
  id: string
  auth_id: string
  email: string
  full_name: string | null
  organization_id: string
  branch_id: string | null
  role: 'owner' | 'admin' | 'manager' | 'employee'
  is_active: boolean
  created_at: string
  updated_at: string
  
  // Datos relacionados
  branch?: {
    id: string
    name: string
  }
}

interface UsersState {
  users: User[]
  isLoading: boolean
  error: string | null
  searchQuery: string

  // Actions
  fetchUsers: () => Promise<void>
  inviteUser: (userData: {
    email: string
    password: string
    full_name: string
    role: 'admin' | 'manager' | 'employee'
    branch_id?: string
  }) => Promise<void>
  updateUser: (id: string, updates: Partial<User>) => Promise<void>
  toggleUserStatus: (id: string) => Promise<void>
  deleteUser: (id: string) => Promise<void>
  setSearchQuery: (query: string) => void
  getFilteredUsers: () => User[]
}

export const useUsersStore = create<UsersState>((set, get) => ({
  users: [],
  isLoading: false,
  error: null,
  searchQuery: '',

  fetchUsers: async () => {
    set({ isLoading: true, error: null })

    try {
      const { user, organization } = useAuthStore.getState()

      if (!user || !organization) throw new Error('No authenticated user')

      // Determinar qué usuarios puede ver según el rol
      let query = supabase
        .from('users')
        .select(`
          *,
          branches (
            id,
            name
          )
        `)
        .eq('organization_id', organization.id)

      // Si es Manager, solo ve usuarios de su sucursal
      if (user.role === 'manager' && user.branch_id) {
        query = query.eq('branch_id', user.branch_id)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error

      // Transformar datos para asegurar que branch sea un objeto o null
      const transformedData = (data || []).map((user: any) => ({
        ...user,
        branch: user.branches ? {
          id: user.branches.id,
          name: user.branches.name
        } : null
      }))

      set({ 
        users: transformedData as User[],
        isLoading: false 
      })

    } catch (error: any) {
      console.error('Error fetching users:', error)
      set({ 
        error: error.message,
        isLoading: false 
      })
    }
  },

  inviteUser: async (userData) => {
    try {
      const { user: currentUser, organization } = useAuthStore.getState()

      if (!currentUser || !organization) throw new Error('No user or organization')

      // Verificar permisos
      if (currentUser.role === 'employee') {
        throw new Error('No tienes permisos para invitar usuarios')
      }

      // Manager solo puede crear employees en su sucursal
      if (currentUser.role === 'manager') {
        if (userData.role !== 'employee') {
          throw new Error('Los managers solo pueden invitar employees')
        }
        if (!currentUser.branch_id) {
          throw new Error('No tienes una sucursal asignada')
        }
        userData.branch_id = currentUser.branch_id
      }

      // Owner y Admin pueden crear cualquier rol
      // Si el rol es manager o employee, requiere branch_id
      if ((userData.role === 'manager' || userData.role === 'employee') && !userData.branch_id) {
        throw new Error('Debes asignar una sucursal para este rol')
      }

      // 1. Crear usuario en Supabase Auth
      if (!supabaseAdmin) {
        throw new Error('No se puede crear usuarios. Falta configurar VITE_SUPABASE_SERVICE_ROLE_KEY')
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true, // Auto-confirmar el email
      })

      if (authError) throw authError
      if (!authData.user) throw new Error('No se pudo crear el usuario')

      // 2. Crear registro en la tabla users
      const { data: dbUser, error: dbError } = await supabase
        .from('users')
        .insert({
          auth_id: authData.user.id,
          email: userData.email,
          full_name: userData.full_name,
          organization_id: organization.id,
          branch_id: userData.branch_id || null,
          role: userData.role,
          is_active: true,
        })
        .select(`
          *,
          branches (
            id,
            name
          )
        `)
        .single()

      if (dbError) {
        // Si falla la creación en la BD, eliminar el usuario de Auth
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
        throw dbError
      }

      // Transformar datos para asegurar que branch sea correcto
      const transformedUser: User = {
        ...dbUser,
        branch: dbUser.branches ? {
          id: dbUser.branches.id,
          name: dbUser.branches.name
        } : null
      }

      // Agregar a la lista local
      set(state => ({
        users: [transformedUser, ...state.users]
      }))

    } catch (error: any) {
      console.error('Error inviting user:', error)
      throw error
    }
  },

  updateUser: async (id, updates) => {
    try {
      const { user: currentUser } = useAuthStore.getState()

      if (!currentUser) throw new Error('No user')

      // Verificar permisos
      if (currentUser.role === 'employee') {
        throw new Error('No tienes permisos para editar usuarios')
      }

      // Manager solo puede editar employees de su sucursal
      if (currentUser.role === 'manager') {
        const targetUser = get().users.find(u => u.id === id)
        if (!targetUser) throw new Error('Usuario no encontrado')
        
        if (targetUser.role !== 'employee') {
          throw new Error('Los managers solo pueden editar employees')
        }
        
        if (targetUser.branch_id !== currentUser.branch_id) {
          throw new Error('No puedes editar usuarios de otras sucursales')
        }
      }

      // Si cambia el rol a manager/employee, requiere branch_id
      if (updates.role && (updates.role === 'manager' || updates.role === 'employee')) {
        if (!updates.branch_id) {
          const currentBranchId = get().users.find(u => u.id === id)?.branch_id
          if (!currentBranchId) {
            throw new Error('Debes asignar una sucursal para este rol')
          }
        }
      }

      // Si cambia a owner/admin, limpiar branch_id
      if (updates.role && (updates.role === 'owner' || updates.role === 'admin')) {
        updates.branch_id = null
      }

      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          branches (
            id,
            name
          )
        `)
        .single()

      if (error) throw error

      // Transformar datos
      const transformedUser: User = {
        ...data,
        branch: data.branches ? {
          id: data.branches.id,
          name: data.branches.name
        } : null
      }

      // Actualizar en la lista local
      set(state => ({
        users: state.users.map(u => 
          u.id === id ? transformedUser : u
        )
      }))

    } catch (error: any) {
      console.error('Error updating user:', error)
      throw error
    }
  },

  toggleUserStatus: async (id) => {
    try {
      const { user: currentUser } = useAuthStore.getState()

      if (!currentUser) throw new Error('No user')

      // No se puede desactivar a sí mismo
      if (currentUser.id === id) {
        throw new Error('No puedes desactivarte a ti mismo')
      }

      // Obtener usuario objetivo
      const targetUser = get().users.find(u => u.id === id)
      if (!targetUser) throw new Error('Usuario no encontrado')

      // Verificar permisos
      if (currentUser.role === 'employee') {
        throw new Error('No tienes permisos para cambiar el estado de usuarios')
      }

      if (currentUser.role === 'manager') {
        if (targetUser.role !== 'employee' || targetUser.branch_id !== currentUser.branch_id) {
          throw new Error('Solo puedes gestionar employees de tu sucursal')
        }
      }

      const { data, error } = await supabase
        .from('users')
        .update({ is_active: !targetUser.is_active })
        .eq('id', id)
        .select(`
          *,
          branches (
            id,
            name
          )
        `)
        .single()

      if (error) throw error

      // Transformar datos
      const transformedUser: User = {
        ...data,
        branch: data.branches ? {
          id: data.branches.id,
          name: data.branches.name
        } : null
      }

      // Actualizar en la lista local
      set(state => ({
        users: state.users.map(u => 
          u.id === id ? transformedUser : u
        )
      }))

    } catch (error: any) {
      console.error('Error toggling user status:', error)
      throw error
    }
  },

  deleteUser: async (id) => {
    try {
      const { user: currentUser } = useAuthStore.getState()

      if (!currentUser) throw new Error('No user')

      // No se puede eliminar a sí mismo
      if (currentUser.id === id) {
        throw new Error('No puedes eliminarte a ti mismo')
      }

      // Solo owner puede eliminar usuarios
      if (currentUser.role !== 'owner') {
        throw new Error('Solo el dueño puede eliminar usuarios permanentemente')
      }

      const targetUser = get().users.find(u => u.id === id)
      if (!targetUser) throw new Error('Usuario no encontrado')

      // Eliminar de Auth primero
      if (!supabaseAdmin) {
        throw new Error('No se puede eliminar usuarios. Falta configurar VITE_SUPABASE_SERVICE_ROLE_KEY')
      }

      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(targetUser.auth_id)
      if (authError) throw authError

      // Eliminar de la base de datos (debería hacerse automáticamente por CASCADE)
      const { error: dbError } = await supabase
        .from('users')
        .delete()
        .eq('id', id)

      if (dbError) throw dbError

      // Remover de la lista local
      set(state => ({
        users: state.users.filter(u => u.id !== id)
      }))

    } catch (error: any) {
      console.error('Error deleting user:', error)
      throw error
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
  },

  getFilteredUsers: () => {
    const { users, searchQuery } = get()

    if (!searchQuery) return users

    const query = searchQuery.toLowerCase()

    return users.filter(user => 
      user.email?.toLowerCase().includes(query) ||
      user.full_name?.toLowerCase().includes(query) ||
      user.role?.toLowerCase().includes(query) ||
      user.branch?.name?.toLowerCase().includes(query)
    )
  },
}))
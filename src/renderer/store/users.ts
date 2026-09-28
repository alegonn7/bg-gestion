import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'
import { callEdgeFunction } from './fiscal'

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
  /** Contraseña nueva para otro usuario (por ejemplo, si se la olvidó) */
  cambiarClave: (id: string, password: string) => Promise<void>
  setSearchQuery: (query: string) => void

  // Devuelve los usuarios visibles según el rol
    getFilteredUsers: () => User[];
  }

export const useUsersStore = create<UsersState>((set, get) => ({
  users: [],
  isLoading: false,
  error: null,
  searchQuery: '',

  // ...existing code...

  fetchUsers: async () => {
    set({ isLoading: true, error: null });
    try {
      const { user: currentUser, organization } = useAuthStore.getState();
      if (!currentUser || !organization) throw new Error('No user or organization');

      let query = supabase
        .from('users')
        .select(`
          *,
          branches (
            id,
            name
          )
        `)
        .eq('organization_id', organization.id);

      // Managers solo pueden ver empleados de su sucursal y a sí mismos
      if (currentUser.role === 'manager') {
        query = query.or(`id.eq.${currentUser.id},and(role.eq.employee,branch_id.eq.${currentUser.branch_id})`);
      }
      // Employees solo pueden verse a sí mismos
      if (currentUser.role === 'employee') {
        query = query.eq('id', currentUser.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Transformar datos
      const users: User[] = (data || []).map((u: any) => ({
        ...u,
        branch: u.branches
          ? {
              id: u.branches.id,
              name: u.branches.name,
            }
          : null,
      }));

      set({ users, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      console.error('Error fetching users:', error);
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

      // La cuenta de acceso la crea el servidor: la app instalada no tiene permiso para hacerlo
      const { usuario: dbUser } = await callEdgeFunction('usuarios', { accion: 'crear', ...userData })

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

      // El servidor borra el usuario y su cuenta de acceso (si no tiene ventas u otros registros)
      await callEdgeFunction('usuarios', { accion: 'eliminar', id })

      // Remover de la lista local
      set(state => ({
        users: state.users.filter(u => u.id !== id)
      }))

    } catch (error: any) {
      console.error('Error deleting user:', error)
      throw error
    }
  },

  cambiarClave: async (id, password) => {
    await callEdgeFunction('usuarios', { accion: 'cambiar_clave', id, password })
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
  },

  getFilteredUsers: () => {
    const { user } = useAuthStore.getState();
    const { users, searchQuery } = get();
    if (!user) return [];
    let filtered = users;
    if (user.role === 'manager') {
      // Solo puede verse a sí mismo y a los empleados de su sucursal
      filtered = users.filter(
        u =>
          u.id === user.id ||
          (u.role === 'employee' && u.branch_id === user.branch_id)
      );
    }
    if (user.role === 'employee') {
      filtered = users.filter(u => u.id === user.id);
    }
    if (!searchQuery) return filtered;
    const query = searchQuery.toLowerCase();
    return filtered.filter(user =>
      user.email?.toLowerCase().includes(query) ||
      user.full_name?.toLowerCase().includes(query) ||
      user.role?.toLowerCase().includes(query) ||
      user.branch?.name?.toLowerCase().includes(query)
    );
  },
}))
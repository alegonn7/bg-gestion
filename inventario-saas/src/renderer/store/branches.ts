import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

export interface Branch {
  id: string
  organization_id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  
  // Stats calculadas
  products_count?: number
  total_stock?: number
  users_count?: number
}

interface BranchesState {
  branches: Branch[]
  isLoading: boolean
  error: string | null
  searchQuery: string

  // Actions
  fetchBranches: () => Promise<void>
  createBranch: (branch: Partial<Branch>) => Promise<void>
  updateBranch: (id: string, updates: Partial<Branch>) => Promise<void>
  toggleBranchStatus: (id: string) => Promise<void>
  deleteBranch: (id: string) => Promise<void>
  setSearchQuery: (query: string) => void
  getFilteredBranches: () => Branch[]
  fetchBranchStats: (branchId: string) => Promise<{
    products_count: number
    total_stock: number
    users_count: number
  }>
}

export const useBranchesStore = create<BranchesState>((set, get) => ({
  branches: [],
  isLoading: false,
  error: null,
  searchQuery: '',

  fetchBranches: async () => {
    set({ isLoading: true, error: null })

    try {
      const { user, organization } = useAuthStore.getState()

      if (!user || !organization) throw new Error('No authenticated user')

      // Obtener todas las sucursales de la organización
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Obtener stats para cada sucursal
      const branchesWithStats = await Promise.all(
        (data || []).map(async (branch) => {
          const stats = await get().fetchBranchStats(branch.id)
          return {
            ...branch,
            ...stats
          }
        })
      )

      set({ 
        branches: branchesWithStats,
        isLoading: false 
      })

    } catch (error: any) {
      console.error('Error fetching branches:', error)
      set({ 
        error: error.message,
        isLoading: false 
      })
    }
  },

  createBranch: async (branchData) => {
    try {
      const { user, organization } = useAuthStore.getState()

      if (!user || !organization) throw new Error('No user or organization')

      // Verificar límite de sucursales según el plan
      const currentBranches = get().branches.filter(b => b.is_active).length
      
      if (currentBranches >= organization.max_branches) {
        throw new Error(
          `Has alcanzado el límite de ${organization.max_branches} sucursales para tu plan ${organization.plan.toUpperCase()}. Actualiza tu plan para agregar más.`
        )
      }

      const { data, error } = await supabase
        .from('branches')
        .insert({
          ...branchData,
          organization_id: organization.id,
        })
        .select()
        .single()

      if (error) throw error

      // Agregar a la lista local con stats en 0
      set(state => ({
        branches: [
          { ...data, products_count: 0, total_stock: 0, users_count: 0 },
          ...state.branches
        ]
      }))

    } catch (error: any) {
      console.error('Error creating branch:', error)
      throw error
    }
  },

  updateBranch: async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Actualizar en la lista local manteniendo stats
      set(state => ({
        branches: state.branches.map(b => 
          b.id === id ? { ...b, ...data } : b
        )
      }))

    } catch (error: any) {
      console.error('Error updating branch:', error)
      throw error
    }
  },

  toggleBranchStatus: async (id) => {
    try {
      // Obtener estado actual
      const branch = get().branches.find(b => b.id === id)
      if (!branch) throw new Error('Branch not found')

      // Si está activa y tiene productos, advertir
      if (branch.is_active && branch.products_count && branch.products_count > 0) {
        const confirm = window.confirm(
          `⚠️ Esta sucursal tiene ${branch.products_count} productos. Al desactivarla, los productos quedarán inaccesibles. ¿Continuar?`
        )
        if (!confirm) return
      }

      const { data, error } = await supabase
        .from('branches')
        .update({ is_active: !branch.is_active })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Actualizar en la lista local
      set(state => ({
        branches: state.branches.map(b => 
          b.id === id ? { ...b, ...data } : b
        )
      }))

    } catch (error: any) {
      console.error('Error toggling branch status:', error)
      throw error
    }
  },

  deleteBranch: async (id) => {
    try {
      const branch = get().branches.find(b => b.id === id)
      if (!branch) throw new Error('Branch not found')

      // 1. Obtener todos los products_branch de esta sucursal
      const { data: branchProducts } = await supabase
        .from('products_branch')
        .select('id')
        .eq('branch_id', id)

      const productBranchIds = branchProducts?.map(p => p.id) || []

      // 2. Obtener todos los sale IDs de esta sucursal
      const { data: branchSales } = await supabase
        .from('sales')
        .select('id')
        .eq('branch_id', id)

      const saleIds = branchSales?.map(s => s.id) || []

      // 3. Eliminar inventory_movements por branch_id
      const { error: movementsError } = await supabase
        .from('inventory_movements')
        .delete()
        .eq('branch_id', id)

      if (movementsError) throw movementsError

      // 4. Eliminar inventory_movements restantes que referencian ventas de esta sucursal (por sale_id)
      if (saleIds.length > 0) {
        const { error: movementsBySaleError } = await supabase
          .from('inventory_movements')
          .delete()
          .in('sale_id', saleIds)

        if (movementsBySaleError) throw movementsBySaleError
      }

      // 5. Eliminar sale_items que referencian products_branch de esta sucursal
      if (productBranchIds.length > 0) {
        const { error: saleItemsError } = await supabase
          .from('sale_items')
          .delete()
          .in('product_branch_id', productBranchIds)

        if (saleItemsError) throw saleItemsError
      }

      // 6. Eliminar sale_items restantes que referencian ventas de esta sucursal (por sale_id)
      if (saleIds.length > 0) {
        const { error: saleItemsBySaleError } = await supabase
          .from('sale_items')
          .delete()
          .in('sale_id', saleIds)

        if (saleItemsBySaleError) throw saleItemsBySaleError
      }

      // 7. Eliminar scanned_items de esta sucursal (tabla legacy, puede tener datos históricos)
      const { error: scannedError } = await supabase
        .from('scanned_items')
        .delete()
        .eq('branch_id', id)

      if (scannedError) throw scannedError

      // 8. Eliminar ventas de esta sucursal (ya sin FKs apuntándoles)
      const { error: salesError } = await supabase
        .from('sales')
        .delete()
        .eq('branch_id', id)

      if (salesError) throw salesError

      // 9. Eliminar products_branch de esta sucursal
      if (productBranchIds.length > 0) {
        const { error: productsError } = await supabase
          .from('products_branch')
          .delete()
          .eq('branch_id', id)

        if (productsError) throw productsError
      }

      // 10. Desasignar usuarios de esta sucursal (poner branch_id en null)
      const { error: usersError } = await supabase
        .from('users')
        .update({ branch_id: null })
        .eq('branch_id', id)

      if (usersError) throw usersError

      // 11. Eliminar la sucursal
      const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', id)

      if (error) throw error

      // Remover de la lista local
      set(state => ({
        branches: state.branches.filter(b => b.id !== id)
      }))

    } catch (error: any) {
      console.error('Error deleting branch:', error)
      throw error
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
  },

  getFilteredBranches: () => {
    const { branches, searchQuery } = get()

    if (!searchQuery) return branches

    const query = searchQuery.toLowerCase()

    return branches.filter(branch => 
      branch.name?.toLowerCase().includes(query) ||
      branch.address?.toLowerCase().includes(query) ||
      branch.phone?.includes(query) ||
      branch.email?.toLowerCase().includes(query)
    )
  },

  fetchBranchStats: async (branchId: string) => {
    try {
      // Contar productos activos
      const { count: productsCount } = await supabase
        .from('products_branch')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', branchId)
        .eq('is_active', true)

      // Sumar stock total
      const { data: stockData } = await supabase
        .from('products_branch')
        .select('stock_quantity')
        .eq('branch_id', branchId)
        .eq('is_active', true)

      const totalStock = stockData?.reduce((sum, p) => sum + (p.stock_quantity || 0), 0) || 0

      // Contar usuarios
      const { count: usersCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', branchId)
        .eq('is_active', true)

      return {
        products_count: productsCount || 0,
        total_stock: totalStock,
        users_count: usersCount || 0
      }

    } catch (error) {
      console.error('Error fetching branch stats:', error)
      return {
        products_count: 0,
        total_stock: 0,
        users_count: 0
      }
    }
  }
}))
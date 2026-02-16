import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

export interface Product {
  id: string
  branch_id: string
  barcode: string | null
  name: string
  description: string | null
  category_id: string | null
  price_cost: number
  price_sale: number
  stock_quantity: number
  stock_min: number
  is_active: boolean
  created_at: string
  updated_at: string
  version: number
  created_by: string | null
  updated_by: string | null

  // Join con categoría
  category?: {
    id: string
    name: string
    color: string
  }

  // Join con sucursal (para vista consolidada Owner/Admin)
  branch?: {
    id: string
    name: string
  }
}

interface ProductsState {
  products: Product[]
  isLoading: boolean
  error: string | null
  searchQuery: string

  fetchProducts: () => Promise<void>
  createProduct: (product: Partial<Product>) => Promise<void>
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  setSearchQuery: (query: string) => void
  getFilteredProducts: () => Product[]
}

export const useProductsStore = create<ProductsState>((set, get) => ({
  products: [],
  isLoading: false,
  error: null,
  searchQuery: '',

  fetchProducts: async () => {
    set({ isLoading: true, error: null })

    try {
      const { user, branch } = useAuthStore.getState()
      if (!user) throw new Error('No authenticated user')

      let branchIds: string[] = []

      if (user.role === 'owner' || user.role === 'admin') {
        const { data: branches } = await supabase
          .from('branches')
          .select('id')
          .eq('organization_id', user.organization_id)
          .eq('is_active', true)

        branchIds = branches?.map(b => b.id) || []
      } else {
        if (branch?.id) branchIds = [branch.id]
      }

      if (branchIds.length === 0) {
        set({ products: [], isLoading: false })
        return
      }

      const { data, error } = await supabase
        .from('products_branch')
        .select(`
          *,
          categories (id, name, color),
          branches (id, name)
        `)
        .in('branch_id', branchIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      set({ products: data as Product[], isLoading: false })

    } catch (error: any) {
      console.error('Error fetching products:', error)
      set({ error: error.message, isLoading: false })
    }
  },

  createProduct: async (productData) => {
    try {
      const { user, branch, organization } = useAuthStore.getState()
      if (!user || !organization) throw new Error('No user or organization')

      let branchId = branch?.id

      if (!branchId) {
        const { data: branches } = await supabase
          .from('branches')
          .select('id')
          .eq('organization_id', organization.id)
          .eq('is_active', true)
          .limit(1)

        if (!branches?.length) throw new Error('No hay sucursales disponibles.')
        branchId = branches[0].id
      }

      const { data, error } = await supabase
        .from('products_branch')
        .insert({
          ...productData,
          branch_id: branchId,
          created_by: user.id,
          updated_by: user.id,
        })
        .select(`*, categories (id, name, color), branches (id, name)`)
        .single()

      if (error) throw error

      set(state => ({ products: [data as Product, ...state.products] }))

    } catch (error: any) {
      console.error('Error creating product:', error)
      throw error
    }
  },

  updateProduct: async (id, updates) => {
    try {
      const { user } = useAuthStore.getState()
      if (!user) throw new Error('No user')

      const { data: current } = await supabase
        .from('products_branch')
        .select('version')
        .eq('id', id)
        .single()

      const { data, error } = await supabase
        .from('products_branch')
        .update({
          ...updates,
          updated_by: user.id,
          version: (current?.version || 1) + 1,
        })
        .eq('id', id)
        .select(`*, categories (id, name, color), branches (id, name)`)
        .single()

      if (error) throw error

      set(state => ({
        products: state.products.map(p => p.id === id ? { ...p, ...data } : p)
      }))

    } catch (error: any) {
      console.error('Error updating product:', error)
      throw error
    }
  },

  deleteProduct: async (id) => {
    try {
      const { error } = await supabase
        .from('products_branch')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error

      set(state => ({ products: state.products.filter(p => p.id !== id) }))

    } catch (error: any) {
      console.error('Error deleting product:', error)
      throw error
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  getFilteredProducts: () => {
    const { products, searchQuery } = get()
    if (!searchQuery) return products

    const query = searchQuery.toLowerCase()
    return products.filter(p =>
      p.name?.toLowerCase().includes(query) ||
      p.barcode?.includes(query) ||
      p.description?.toLowerCase().includes(query)
    )
  },
}))
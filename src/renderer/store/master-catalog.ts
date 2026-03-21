import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

export interface MasterProduct {
  barcode: string | null
  name: string
  description: string | null
  total_stock: number
  branches_count: number
  avg_price_cost: number
  avg_price_sale: number
  categories: string[]
  branches: {
    branch_id: string
    branch_name: string
    stock: number
    price_cost: number
    price_sale: number
  }[]
}

interface MasterCatalogState {
  products: MasterProduct[]
  isLoading: boolean
  error: string | null
  searchQuery: string

  fetchMasterProducts: () => Promise<void>
  setSearchQuery: (query: string) => void
  getFilteredProducts: () => MasterProduct[]
}

export const useMasterCatalogStore = create<MasterCatalogState>((set, get) => ({
  products: [],
  isLoading: false,
  error: null,
  searchQuery: '',

  fetchMasterProducts: async () => {
    set({ isLoading: true, error: null })

    try {
      const { user, organization } = useAuthStore.getState()

      if (!user || !organization) throw new Error('No authenticated user')

      // Obtener todos los productos de todas las sucursales de la organización
      const { data: allProducts, error } = await supabase
        .from('products_branch')
        .select(`
          *,
          product:products (
            id,
            name,
            description,
            barcode,
            category_id,
            categories (
              name
            )
          ),
          branches!inner (
            id,
            name,
            organization_id
          )
        `)
        .eq('branches.organization_id', organization.id)
        .eq('is_active', true)

      if (error) throw error

      // Agrupar productos por barcode o por nombre si no tienen barcode
      const grouped = new Map<string, MasterProduct>()

      allProducts?.forEach((product: any) => {
        // La clave de agrupación: barcode si existe, sino el nombre del maestro
        const groupKey = product.barcode || product.product?.barcode || `NO_BARCODE_${product.product?.name || product.id}`

        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, {
            barcode: product.barcode || product.product?.barcode,
            name: product.product?.name || 'Sin nombre',
            description: product.product?.description || null,
            total_stock: 0,
            branches_count: 0,
            avg_price_cost: 0,
            avg_price_sale: 0,
            categories: [],
            branches: []
          })
        }

        const masterProduct = grouped.get(groupKey)!

        // Agregar stock de esta sucursal
        masterProduct.total_stock += product.stock_quantity

        // Agregar esta sucursal a la lista
        masterProduct.branches.push({
          branch_id: product.branch_id,
          branch_name: product.branches.name,
          stock: product.stock_quantity,
          price_cost: product.price_cost,
          price_sale: product.price_sale
        })

        masterProduct.branches_count = masterProduct.branches.length

        // Agregar categoría si existe y no está duplicada
        const catName = product.product?.categories?.name
        if (catName && !masterProduct.categories.includes(catName)) {
          masterProduct.categories.push(catName)
        }

        // Recalcular precios promedio
        const totalCost = masterProduct.branches.reduce((sum, b) => sum + b.price_cost, 0)
        const totalSale = masterProduct.branches.reduce((sum, b) => sum + b.price_sale, 0)
        masterProduct.avg_price_cost = totalCost / masterProduct.branches.length
        masterProduct.avg_price_sale = totalSale / masterProduct.branches.length
      })

      // Convertir el Map a array
      const masterProducts = Array.from(grouped.values())

      set({ 
        products: masterProducts,
        isLoading: false 
      })

    } catch (error: any) {
      console.error('Error fetching master products:', error)
      set({ 
        error: error.message,
        isLoading: false 
      })
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
  },

  getFilteredProducts: () => {
    const { products, searchQuery } = get()

    if (!searchQuery) return products

    const query = searchQuery.toLowerCase()

    return products.filter(product => 
      product.name?.toLowerCase().includes(query) ||
      product.barcode?.includes(query) ||
      product.description?.toLowerCase().includes(query) ||
      product.categories.some(cat => cat.toLowerCase().includes(query))
    )
  },
}))
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

// Producto maestro (catálogo)
export interface MasterProduct {
  id: string
  organization_id: string
  barcode: string | null
  sku: string | null
  name: string
  description: string | null
  category_id: string | null
  supplier_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

// Producto por sucursal (stock y precios)
export interface Product {
  id: string
  product_id: string
  branch_id: string
  barcode: string | null // denormalizado para búsquedas rápidas
  price_cost: number
  price_sale: number
  price_cost_usd: number | null // Precio de costo en dólares (manual)
  price_sale_usd: number | null // Precio de venta en dólares (manual)
  stock_quantity: number
  stock_min: number
  alicuota_iva: number // 3=0%, 4=10.5%, 5=21% (default), 6=27%
  is_active: boolean
  created_at: string
  updated_at: string
  version: number
  created_by: string | null
  updated_by: string | null

  // Joins
  product?: MasterProduct
  category?: {
    id: string
    name: string
    color: string
  }
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
  createProduct: (productData: {
    barcode?: string
    sku?: string
    name: string
    description?: string
    category_id?: string
    supplier_id?: string | null
    price_cost: number
    price_sale: number
    price_cost_usd?: number | null
    price_sale_usd?: number | null
    stock_quantity: number
    stock_min: number
    alicuota_iva?: number
  }) => Promise<void>
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
      const { user, selectedBranch } = useAuthStore.getState()
      if (!user) throw new Error('No authenticated user')

      let branchIds: string[] = []

      if (user.role === 'owner' || user.role === 'admin') {
        // Si hay una sucursal seleccionada, filtrar solo por esa
        if (selectedBranch?.id) {
          branchIds = [selectedBranch.id]
        } else {
          const { data: branches } = await supabase
            .from('branches')
            .select('id')
            .eq('organization_id', user.organization_id)
            .eq('is_active', true)

          branchIds = branches?.map(b => b.id) || []
        }
      } else {
        if (user.branch_id) branchIds = [user.branch_id]
      }

      if (branchIds.length === 0) {
        set({ products: [], isLoading: false })
        return
      }

      const { data, error } = await supabase
        .from('products_branch')
        .select(`
          *,
          product:products(*),
          branch:branches(id, name)
        `)
        .in('branch_id', branchIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Enriquecer con categoría desde el producto maestro
      const enrichedData = await Promise.all(
        (data || []).map(async (item: any) => {
          let category = null
          if (item.product?.category_id) {
            const { data: cat } = await supabase
              .from('categories')
              .select('id, name, color')
              .eq('id', item.product.category_id)
              .single()
            category = cat
          }
          return { ...item, category }
        })
      )

      set({ products: enrichedData as Product[], isLoading: false })

    } catch (error: any) {
      console.error('Error fetching products:', error)
      set({ error: error.message, isLoading: false })
    }
  },

  createProduct: async (productData) => {
    try {
      const { user, selectedBranch } = useAuthStore.getState()
      if (!user) throw new Error('No user')

      const branchId = user.role === 'owner' || user.role === 'admin' 
        ? selectedBranch?.id 
        : user.branch_id

      if (!branchId) {
        throw new Error('No hay sucursal seleccionada')
      }

      // 1. Buscar si el producto maestro ya existe (por barcode)
      let masterProduct: MasterProduct | null = null

      if (productData.barcode) {
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('barcode', productData.barcode)
          .eq('organization_id', user.organization_id)
          .single()

        masterProduct = data
      }

      // 2. Si no existe, crear producto maestro
      if (!masterProduct) {
        const { data: newMaster, error: masterError } = await supabase
          .from('products')
          .insert({
            organization_id: user.organization_id,
            barcode: productData.barcode || null,
            sku: productData.sku || null,
            name: productData.name,
            description: productData.description || null,
            category_id: productData.category_id || null,
            supplier_id: productData.supplier_id || null,
            created_by: user.id,
            updated_by: user.id,
          })
          .select()
          .single()

        if (masterError) throw masterError
        masterProduct = newMaster
      } else if (productData.supplier_id && masterProduct.supplier_id !== productData.supplier_id) {
        // Si el producto maestro existe pero el proveedor cambió, actualizar supplier_id
        await supabase
          .from('products')
          .update({ supplier_id: productData.supplier_id })
          .eq('id', masterProduct.id)
        masterProduct.supplier_id = productData.supplier_id
      }

      // 3. Crear products_branch con referencia al maestro
      const { data, error } = await supabase
        .from('products_branch')
        .insert({
          product_id: masterProduct!.id,
          branch_id: branchId,
          barcode: productData.barcode || null, // denormalizado
          price_cost: productData.price_cost,
          price_sale: productData.price_sale,
          price_cost_usd: productData.price_cost_usd || null,
          price_sale_usd: productData.price_sale_usd || null,
          stock_quantity: productData.stock_quantity || 0,
          stock_min: productData.stock_min || 0,
          alicuota_iva: productData.alicuota_iva ?? 5,
          created_by: user.id,
          updated_by: user.id,
        })
        .select(`
          *,
          product:products(*),
          branch:branches(id, name)
        `)
        .single()

      if (error) throw error

      // Enriquecer con categoría
      let category = null
      if (masterProduct?.category_id) {
        const { data: cat } = await supabase
          .from('categories')
          .select('id, name, color')
          .eq('id', masterProduct.category_id)
          .single()
        category = cat
      }

      const enrichedProduct = { ...data, category } as Product

      set(state => ({ products: [enrichedProduct, ...state.products] }))

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
        .select('version, product_id')
        .eq('id', id)
        .single()

      // Actualizar products_branch (precios, stock)
      const { data, error } = await supabase
        .from('products_branch')
        .update({
          price_cost: updates.price_cost,
          price_sale: updates.price_sale,
          price_cost_usd: updates.price_cost_usd !== undefined ? updates.price_cost_usd : undefined,
          price_sale_usd: updates.price_sale_usd !== undefined ? updates.price_sale_usd : undefined,
          stock_quantity: updates.stock_quantity,
          stock_min: updates.stock_min,
          is_active: updates.is_active,
          ...(updates.alicuota_iva !== undefined ? { alicuota_iva: updates.alicuota_iva } : {}),
          updated_by: user.id,
          version: (current?.version || 1) + 1,
        })
        .eq('id', id)
        .select(`
          *,
          product:products(*),
          branch:branches(id, name)
        `)
        .single()

      if (error) throw error

      // Si hay cambios en datos maestros (nombre, descripción, categoría), actualizar products
      if (updates.product && current?.product_id) {
        const masterUpdates: any = {}
        if (updates.product.name) masterUpdates.name = updates.product.name
        if (updates.product.description !== undefined) masterUpdates.description = updates.product.description
        if (updates.product.category_id !== undefined) masterUpdates.category_id = updates.product.category_id
        if (updates.product.supplier_id !== undefined) masterUpdates.supplier_id = updates.product.supplier_id
        
        if (Object.keys(masterUpdates).length > 0) {
          const { error: masterError } = await supabase
            .from('products')
            .update({ ...masterUpdates, updated_by: user.id })
            .eq('id', current.product_id)
          
          if (masterError) throw masterError

          // Re-fetch el producto con los datos maestros actualizados
          const { data: refreshed, error: refreshError } = await supabase
            .from('products_branch')
            .select(`
              *,
              product:products(*),
              branch:branches(id, name)
            `)
            .eq('id', id)
            .single()

          if (!refreshError && refreshed) {
            Object.assign(data, refreshed)
          }
        }
      }

      // Enriquecer con categoría
      let category = null
      if (data.product?.category_id) {
        const { data: cat } = await supabase
          .from('categories')
          .select('id, name, color')
          .eq('id', data.product.category_id)
          .single()
        category = cat
      }

      const enrichedProduct = { ...data, category } as Product

      set(state => ({
        products: state.products.map(p => p.id === id ? enrichedProduct : p)
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
      p.product?.name?.toLowerCase().includes(query) ||
      p.barcode?.includes(query) ||
      p.product?.description?.toLowerCase().includes(query)
    )
  },
}))
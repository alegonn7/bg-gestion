import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'
import { useNetworkStore } from './network'
import { isNetworkError, loadProductsCache, saveProductsCache } from '@/lib/offline'

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
  images?: string[] | null // URLs en el bucket store-product-images (las mismas que muestra bg-tienda)
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
  expiration_date: string | null // fecha de vencimiento (opcional, no todos los productos vencen)
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

/** Sucursales cuyos productos hay que traer, según el rol y la sucursal elegida */
async function resolveBranchIds(): Promise<string[]> {
  const { user, selectedBranch, branches } = useAuthStore.getState()
  if (!user) return []

  if (user.role !== 'owner' && user.role !== 'admin') {
    return user.branch_id ? [user.branch_id] : []
  }

  if (selectedBranch?.id) return [selectedBranch.id]

  try {
    const { data, error } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', user.organization_id)
      .eq('is_active', true)

    if (error) throw error
    return (data || []).map(b => b.id)
  } catch (error) {
    // Sin conexión: usar las sucursales que quedaron guardadas en la sesión
    if (isNetworkError(error)) {
      return branches.filter(b => b.is_active).map(b => b.id)
    }
    throw error
  }
}

/** Bloquea las operaciones de escritura mientras no haya conexión */
function assertOnline() {
  const { isOffline } = useAuthStore.getState()
  if (isOffline || !useNetworkStore.getState().isOnline) {
    throw new Error('Sin conexión: en modo offline solo se puede consultar productos y precios.')
  }
}

interface ProductsState {
  products: Product[]
  isLoading: boolean
  error: string | null
  searchQuery: string
  /** Los productos mostrados vienen de la caché local (sin conexión) */
  isFromCache: boolean
  /** Última sincronización con el servidor (timestamp UNIX en segundos) */
  lastSyncAt: number | null

  fetchProducts: () => Promise<void>
  createProduct: (productData: {
    barcode?: string
    sku?: string
    name: string
    description?: string
    category_id?: string
    supplier_id?: string | null
    images?: string[]
    price_cost: number
    price_sale: number
    price_cost_usd?: number | null
    price_sale_usd?: number | null
    stock_quantity: number
    stock_min: number
    expiration_date?: string | null
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
  isFromCache: false,
  lastSyncAt: null,

  fetchProducts: async () => {
    set({ isLoading: true, error: null })

    let branchIds: string[] = []

    try {
      const { user } = useAuthStore.getState()
      if (!user) throw new Error('No authenticated user')

      branchIds = await resolveBranchIds()

      if (branchIds.length === 0) {
        set({ products: [], isLoading: false })
        return
      }

      const { data, error } = await supabase
        .from('products_branch')
        .select(`
          *,
          product:products(
            *,
            category:categories(id, name, color)
          ),
          branch:branches(id, name)
        `)
        .in('branch_id', branchIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      const enrichedData = (data || []).map((item: any) => ({
        ...item,
        category: item.product?.category || null,
      }))

      set({
        products: enrichedData as Product[],
        isLoading: false,
        isFromCache: false,
        lastSyncAt: Math.floor(Date.now() / 1000),
      })

      // Guardar copia local para poder consultar precios sin conexión
      void saveProductsCache(branchIds, enrichedData)

    } catch (error: any) {
      console.error('Error fetching products:', error)

      // Sin conexión (o error del servidor): mostrar la última copia guardada
      const { products: cached, syncedAt } = branchIds.length > 0
        ? await loadProductsCache(branchIds)
        : { products: [] as any[], syncedAt: null }

      if (cached.length > 0) {
        console.warn(`📴 Productos cargados desde la caché local (${cached.length})`)
        set({
          products: cached as Product[],
          isLoading: false,
          isFromCache: true,
          lastSyncAt: syncedAt,
          error: isNetworkError(error) ? null : error.message,
        })
        return
      }

      set({
        error: isNetworkError(error)
          ? 'Sin conexión y todavía no hay productos guardados en esta computadora.'
          : error.message,
        isLoading: false,
        isFromCache: false,
      })
    }
  },

  createProduct: async (productData) => {
    try {
      assertOnline()
      const { user, selectedBranch, branches } = useAuthStore.getState()
      if (!user) throw new Error('No user')

      const branchId = user.role === 'owner' || user.role === 'admin'
        ? (selectedBranch?.id ?? branches[0]?.id)
        : user.branch_id

      if (!branchId) {
        throw new Error('No hay sucursal seleccionada')
      }

      // 1. Buscar si el producto maestro ya existe (por barcode)
      let masterProduct: MasterProduct | null = null

      if (productData.barcode) {
        const normalizedBarcode = productData.barcode.trim()
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('barcode', normalizedBarcode)
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
            barcode: productData.barcode ? productData.barcode.trim() : null,
            sku: productData.sku || null,
            name: productData.name,
            description: productData.description || null,
            category_id: productData.category_id || null,
            supplier_id: productData.supplier_id || null,
            ...(productData.images ? { images: productData.images } : {}),
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
          barcode: productData.barcode ? productData.barcode.trim() : null,
          price_cost: productData.price_cost,
          price_sale: productData.price_sale,
          price_cost_usd: productData.price_cost_usd || null,
          price_sale_usd: productData.price_sale_usd || null,
          stock_quantity: productData.stock_quantity || 0,
          stock_min: productData.stock_min || 0,
          expiration_date: productData.expiration_date || null,
          alicuota_iva: productData.alicuota_iva ?? 5,
          created_by: user.id,
          updated_by: user.id,
        })
        .select(`
          *,
          product:products(
            *,
            category:categories(id, name, color)
          ),
          branch:branches(id, name)
        `)
        .single()

      if (error) throw error

      const enrichedProduct = { ...data, category: (data as any).product?.category || null } as Product

      set(state => ({ products: [enrichedProduct, ...state.products] }))

    } catch (error: any) {
      console.error('Error creating product:', error)
      throw error
    }
  },

  updateProduct: async (id, updates) => {
    try {
      assertOnline()
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
          expiration_date: updates.expiration_date !== undefined ? updates.expiration_date : undefined,
          is_active: updates.is_active,
          ...(updates.alicuota_iva !== undefined ? { alicuota_iva: updates.alicuota_iva } : {}),
          updated_by: user.id,
          version: (current?.version || 1) + 1,
        })
        .eq('id', id)
        .select(`
          *,
          product:products(
            *,
            category:categories(id, name, color)
          ),
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
        if (updates.product.images !== undefined) masterUpdates.images = updates.product.images
        
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
              product:products(
                *,
                category:categories(id, name, color)
              ),
              branch:branches(id, name)
            `)
            .eq('id', id)
            .single()

          if (!refreshError && refreshed) {
            Object.assign(data, refreshed)
          }
        }
      }

      const enrichedProduct = { ...data, category: (data as any).product?.category || null } as Product

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
      assertOnline()
      const { user } = useAuthStore.getState()
      if (!user) throw new Error('No user')

      // Baja lógica: un borrado real falla si el producto ya tiene ventas (sale_items lo
      // referencia) y además se llevaría puesto el historial de movimientos de stock.
      // Los productos inactivos no aparecen ni en la app ni en bg-tienda.
      const { data, error } = await supabase
        .from('products_branch')
        .update({ is_active: false, updated_by: user.id })
        .eq('id', id)
        .select('id')

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('No tenés permiso para eliminar este producto.')
      }

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
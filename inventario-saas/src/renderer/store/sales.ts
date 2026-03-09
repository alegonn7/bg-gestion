import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

export interface SaleItem {
  product_id: string
  product_name: string
  quantity: number
  price: number
  cost: number
  subtotal: number
}

export interface Sale {
  id: string
  branch_id: string
  branch_name: string
  total: number
  subtotal: number
  discount: number
  payment_method: string
  cash_amount: number
  card_amount: number
  status: 'completed' | 'voided'
  items: SaleItem[]
  created_at: string
  created_by: string
  created_by_name?: string
}

interface SalesState {
  sales: Sale[]
  isLoading: boolean
  error: string | null
  
  // Filtros
  selectedBranchId: string | null
  startDate: Date | null
  endDate: Date | null
  searchQuery: string
  selectedUserId: string | null
  
  // Actions
  fetchSales: () => Promise<void>
  voidSale: (saleId: string) => Promise<{ success: boolean; error?: string }>
  setFilters: (filters: {
    branchId?: string | null
    startDate?: Date | null
    endDate?: Date | null
    searchQuery?: string
    userId?: string | null
  }) => void
  clearFilters: () => void
  getSaleById: (saleId: string) => Sale | undefined
}

// ✅ Fix: normaliza el string de fecha de Supabase a UTC explícito
// Supabase devuelve "2026-02-16 05:36:10.550567" sin timezone
// Al agregarle "+00:00" forzamos que sea interpretado como UTC
const normalizeUTCDate = (dateString: string): string => {
  if (!dateString) return dateString
  // Si ya tiene timezone info (Z, +00, -03, etc.), no tocar
  if (dateString.includes('Z') || dateString.includes('+') || dateString.match(/-\d{2}:\d{2}$/)) {
    return dateString
  }
  // Agregar +00:00 para forzar interpretación UTC
  return dateString + '+00:00'
}

export const useSalesStore = create<SalesState>((set, get) => ({
  sales: [],
  isLoading: false,
  error: null,
  selectedBranchId: null,
  startDate: null,
  endDate: null,
  searchQuery: '',
  selectedUserId: null,

  fetchSales: async () => {
    set({ isLoading: true, error: null })
    
    try {
      const { user } = useAuthStore.getState()
      if (!user) {
        throw new Error('Usuario no autenticado')
      }
      const { selectedBranchId, startDate, endDate, selectedUserId } = get()
      let query = supabase
        .from('sales')
        .select(`
          id,
          branch_id,
          total,
          subtotal,
          discount,
          payment_method,
          cash_amount,
          card_amount,
          status,
          created_at,
          created_by,
          branches!inner(
            id,
            name
          ),
          users(
            id,
            full_name
          ),
          sale_items(
            id,
            quantity,
            price,
            cost,
            subtotal,
            products_branch!inner(
              id,
              barcode,
              product:products(name)
            )
          )
        `)
        .order('created_at', { ascending: false })
      if (user.role === 'manager' || user.role === 'employee') {
        query = query.eq('branch_id', user.branch_id)
      } else {
        // Para owner/admin, usar la sucursal seleccionada del auth store
        const { selectedBranch: authBranch } = useAuthStore.getState()
        const branchFilter = selectedBranchId || authBranch?.id
        if (branchFilter) {
          query = query.eq('branch_id', branchFilter)
        }
      }
      if (startDate) {
        query = query.gte('created_at', startDate.toISOString())
      }
      if (endDate) {
        const endOfDay = new Date(endDate)
        endOfDay.setHours(23, 59, 59, 999)
        query = query.lte('created_at', endOfDay.toISOString())
      }
      if (selectedUserId) {
        query = query.eq('created_by', selectedUserId)
      }
      const { data: salesData, error } = await query

      if (error) throw error

      const sales: Sale[] = (salesData || []).map((sale: any) => ({
        id: sale.id,
        branch_id: sale.branch_id,
        branch_name: sale.branches.name,
        total: sale.total,
        subtotal: sale.subtotal,
        discount: sale.discount,
        payment_method: sale.payment_method,
        cash_amount: sale.cash_amount,
        card_amount: sale.card_amount,
        status: sale.status || 'completed',
        items: (sale.sale_items || []).map((item: any) => ({
          product_id: item.products_branch.id,
          product_name: item.products_branch.product?.name || 'Sin nombre',
          quantity: item.quantity,
          price: item.price,
          cost: item.cost,
          subtotal: item.subtotal
        })),
        // ✅ Normalizamos el created_at para que siempre sea UTC
        created_at: normalizeUTCDate(sale.created_at),
        created_by: sale.created_by,
        created_by_name: sale.users?.full_name
      }))

      set({ sales, isLoading: false })
      
    } catch (error: any) {
      console.error('Error fetching sales:', error)
      set({ error: error.message, isLoading: false })
    }
  },

  voidSale: async (saleId: string) => {
    try {
      const sale = get().sales.find(s => s.id === saleId)
      if (!sale) return { success: false, error: 'Venta no encontrada' }
      if (sale.status === 'voided') return { success: false, error: 'La venta ya fue anulada' }

      // 1. Marcar la venta como anulada
      const { error: updateError } = await supabase
        .from('sales')
        .update({ status: 'voided' })
        .eq('id', saleId)

      if (updateError) throw updateError

      // 2. Restaurar stock de cada producto vendido
      for (const item of sale.items) {
        // Obtener stock actual
        const { data: productBranch, error: fetchError } = await supabase
          .from('products_branch')
          .select('id, stock_quantity')
          .eq('id', item.product_id)
          .single()

        if (fetchError || !productBranch) continue

        const newStock = productBranch.stock_quantity + item.quantity

        // Actualizar stock
        const { error: stockError } = await supabase
          .from('products_branch')
          .update({ stock_quantity: newStock })
          .eq('id', item.product_id)

        if (stockError) {
          console.error('Error restoring stock for product:', item.product_id, stockError)
          continue
        }

        // Registrar movimiento de inventario (devolución)
        await supabase
          .from('inventory_movements')
          .insert({
            product_branch_id: item.product_id,
            branch_id: sale.branch_id,
            movement_type: 'entry',
            transaction_type: 'void',
            quantity: item.quantity,
            stock_before: productBranch.stock_quantity,
            stock_after: newStock,
            price_at_movement: item.price,
            cost_at_movement: item.cost,
            notes: `Devolucion por anulacion de venta ${saleId.slice(0, 8)}`,
            created_by: useAuthStore.getState().user?.id
          })
      }

      // 3. Actualizar el estado local
      set({
        sales: get().sales.map(s =>
          s.id === saleId ? { ...s, status: 'voided' as const } : s
        )
      })

      return { success: true }
    } catch (error: any) {
      console.error('Error voiding sale:', error)
      return { success: false, error: error.message }
    }
  },

  setFilters: (filters) => {
    set({
      selectedBranchId: filters.branchId !== undefined ? filters.branchId : get().selectedBranchId,
      startDate: filters.startDate !== undefined ? filters.startDate : get().startDate,
      endDate: filters.endDate !== undefined ? filters.endDate : get().endDate,
      searchQuery: filters.searchQuery !== undefined ? filters.searchQuery : get().searchQuery,
      selectedUserId: filters.userId !== undefined ? filters.userId : get().selectedUserId,
    })
    get().fetchSales()
  },

  clearFilters: () => {
    set({
      selectedBranchId: null,
      startDate: null,
      endDate: null,
      searchQuery: ''
    })
    get().fetchSales()
  },

  getSaleById: (saleId) => {
    return get().sales.find(sale => sale.id === saleId)
  }
}))
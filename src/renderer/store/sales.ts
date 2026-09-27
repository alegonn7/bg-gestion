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
  barcode?: string | null
  alicuota_iva: number  // 3=0%, 4=10.5%, 5=21%, 6=27%
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
  transfer_account_id?: string | null
  status: 'completed' | 'voided'
  items: SaleItem[]
  created_at: string
  created_by: string
  created_by_name?: string
  transfer_account_name?: string | null
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
  // Por defecto las anuladas/reembolsadas quedan afuera -- prendiendo esto se pueden ver,
  // incluidos los pedidos online reembolsados (que si no, desaparecen sin dejar rastro acá).
  showVoided: boolean
  // Cuántas hay anuladas/reembolsadas en el rango filtrado actual -- se calcula SIEMPRE,
  // independiente de showVoided, para que quede un rastro visible aunque el toggle esté
  // apagado (antes desaparecían del todo, sin ningún indicio).
  voidedCount: number

  // Actions
  fetchSales: () => Promise<void>
  voidSale: (saleId: string) => Promise<{ success: boolean; error?: string }>
  setFilters: (filters: {
    branchId?: string | null
    startDate?: Date | null
    endDate?: Date | null
    searchQuery?: string
    userId?: string | null
    showVoided?: boolean
  }) => void
  clearFilters: () => void
  getSaleById: (saleId: string) => Sale | undefined
  reset: () => void
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

const salesInitialState = {
  sales: [] as Sale[],
  isLoading: false,
  error: null as string | null,
  selectedBranchId: null as string | null,
  startDate: null as Date | null,
  endDate: null as Date | null,
  searchQuery: '',
  selectedUserId: null as string | null,
  showVoided: false,
  voidedCount: 0,
}

export const useSalesStore = create<SalesState>((set, get) => ({
  ...salesInitialState,

  fetchSales: async () => {
    set({ isLoading: true, error: null })
    
    try {
      const { user } = useAuthStore.getState()
      if (!user) {
        throw new Error('Usuario no autenticado')
      }
      const { selectedBranchId, startDate, endDate, selectedUserId, showVoided } = get()
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
          transfer_account_id,
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
              alicuota_iva,
              product:products(name)
            )
          )
        `)
        .order('created_at', { ascending: false })
      if (!showVoided) {
        query = query.neq('status', 'voided')
      }
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

      // Cuenta de anuladas/reembolsadas en el mismo rango, aparte de showVoided (ver comentario
      // en el estado) -- mismos filtros de sucursal/fecha/vendedor que la consulta principal.
      let voidedCountQuery = supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'voided')
      if (user.role === 'manager' || user.role === 'employee') {
        voidedCountQuery = voidedCountQuery.eq('branch_id', user.branch_id)
      } else {
        const { selectedBranch: authBranch } = useAuthStore.getState()
        const branchFilter = selectedBranchId || authBranch?.id
        if (branchFilter) voidedCountQuery = voidedCountQuery.eq('branch_id', branchFilter)
      }
      if (startDate) voidedCountQuery = voidedCountQuery.gte('created_at', startDate.toISOString())
      if (endDate) {
        const endOfDay = new Date(endDate)
        endOfDay.setHours(23, 59, 59, 999)
        voidedCountQuery = voidedCountQuery.lte('created_at', endOfDay.toISOString())
      }
      if (selectedUserId) voidedCountQuery = voidedCountQuery.eq('created_by', selectedUserId)

      const [{ data: salesData, error }, { count: voidedCount }] = await Promise.all([query, voidedCountQuery])

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
        transfer_account_id: sale.transfer_account_id,
        status: sale.status || 'completed',
        items: (sale.sale_items || []).map((item: any) => ({
          product_id: item.products_branch.id,
          product_name: item.products_branch.product?.name || 'Sin nombre',
          quantity: item.quantity,
          price: item.price,
          cost: item.cost,
          subtotal: item.subtotal,
          barcode: item.products_branch.barcode || null,
          alicuota_iva: item.products_branch.alicuota_iva ?? 5,
        })),
        // ✅ Normalizamos el created_at para que siempre sea UTC
        created_at: normalizeUTCDate(sale.created_at),
        created_by: sale.created_by,
        created_by_name: sale.users?.full_name,
        transfer_account_name: null // Se puede poblar luego en la UI
      }))

      set({ sales, isLoading: false, voidedCount: voidedCount ?? 0 })

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

      // Si esta venta viene de un pedido online pagado con Mercado Pago, anularla acá borraría
      // la venta sin devolverle la plata al cliente -- confirm_store_order_paid guarda
      // payment_method='Online' para CUALQUIER pedido online (WhatsApp o Mercado Pago), así que
      // hace falta ir a store_orders para saber si hubo un cobro real de por medio.
      if (sale.payment_method === 'Online') {
        const { data: linkedOrder, error: linkedOrderError } = await supabase
          .from('store_orders')
          .select('payment_method, status')
          .eq('sale_id', saleId)
          .maybeSingle()

        if (linkedOrderError) throw linkedOrderError

        if (linkedOrder?.payment_method === 'mercadopago') {
          return {
            success: false,
            error: 'Esta venta es de un pedido pagado con Mercado Pago. Para anularla hay que reembolsar el pago desde bg-tienda (Admin → Pedidos → Reembolsar), no desde acá.',
          }
        }
      }

      // 1. Restaurar stock de cada producto vendido (SIN dejar registro de movimiento)
      for (const item of sale.items) {
        // Obtener stock actual
        const { data: productBranch, error: fetchError } = await supabase
          .from('products_branch')
          .select('id, stock_quantity')
          .eq('id', item.product_id)
          .single()

        if (fetchError || !productBranch) continue

        const newStock = productBranch.stock_quantity + item.quantity

        // Actualizar stock SOLO (sin movimiento de inventario)
        const { error: stockError } = await supabase
          .from('products_branch')
          .update({ stock_quantity: newStock })
          .eq('id', item.product_id)

        if (stockError) {
          console.error('Error restoring stock for product:', item.product_id, stockError)
          continue
        }
      }

      // 2. Borrar todos los inventory_movements de esta venta
      const { error: deleteMovementsError } = await supabase
        .from('inventory_movements')
        .delete()
        .eq('sale_id', saleId)

      if (deleteMovementsError) throw deleteMovementsError

      // 3. Borrar todos los sale_items de esta venta
      const { error: deleteItemsError } = await supabase
        .from('sale_items')
        .delete()
        .eq('sale_id', saleId)

      if (deleteItemsError) throw deleteItemsError

      // 4. Borrar la venta completamente
      const { error: deleteSaleError } = await supabase
        .from('sales')
        .delete()
        .eq('id', saleId)

      if (deleteSaleError) throw deleteSaleError

      // 5. Actualizar el estado local
      set({
        sales: get().sales.filter(s => s.id !== saleId)
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
      showVoided: filters.showVoided !== undefined ? filters.showVoided : get().showVoided,
    })
    get().fetchSales()
  },

  clearFilters: () => {
    set({
      selectedBranchId: null,
      startDate: null,
      endDate: null,
      searchQuery: '',
      showVoided: false,
    })
    get().fetchSales()
  },

  getSaleById: (saleId) => {
    return get().sales.find(sale => sale.id === saleId)
  },

  reset: () => set(salesInitialState),
}))
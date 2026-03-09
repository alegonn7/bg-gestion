import { create } from 'zustand'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { useAuthStore } from './auth'

// Usar admin para bypasear RLS en cash_registers
const db = supabaseAdmin || supabase

export interface CashRegister {
  id: string
  branch_id: string
  branch_name?: string
  opened_by: string
  opened_by_name?: string
  closed_by?: string | null
  closed_by_name?: string | null
  opening_amount: number
  closing_amount: number | null
  expected_amount: number | null
  difference: number | null
  cash_sales_total: number | null
  card_sales_total: number | null
  sales_count: number | null
  notes_open: string | null
  notes_close: string | null
  status: 'open' | 'closed'
  opened_at: string
  closed_at: string | null
}

interface CashRegisterState {
  registers: CashRegister[]
  currentRegister: CashRegister | null
  isLoading: boolean
  error: string | null

  fetchRegisters: () => Promise<void>
  fetchCurrentRegister: () => Promise<void>
  openRegister: (openingAmount: number, notes?: string) => Promise<{ success: boolean; error?: string }>
  closeRegister: (closingAmount: number, notes?: string) => Promise<{ success: boolean; error?: string }>
}

export const useCashRegisterStore = create<CashRegisterState>((set, get) => ({
  registers: [],
  currentRegister: null,
  isLoading: false,
  error: null,

  fetchRegisters: async () => {
    set({ isLoading: true, error: null })
    try {
      const { user, selectedBranch } = useAuthStore.getState()
      if (!user) throw new Error('No autenticado')

      const branchId = (user.role === 'owner' || user.role === 'admin')
        ? selectedBranch?.id
        : user.branch_id

      if (!branchId) {
        set({ registers: [], isLoading: false })
        return
      }

      const { data, error } = await db
        .from('cash_registers')
        .select(`
          *,
          branches:branch_id(name),
          opener:opened_by(full_name),
          closer:closed_by(full_name)
        `)
        .eq('branch_id', branchId)
        .order('opened_at', { ascending: false })
        .limit(50)

      if (error) throw error

      const registers: CashRegister[] = (data || []).map((r: any) => ({
        id: r.id,
        branch_id: r.branch_id,
        branch_name: r.branches?.name || '',
        opened_by: r.opened_by,
        opened_by_name: r.opener?.full_name || '',
        closed_by: r.closed_by,
        closed_by_name: r.closer?.full_name || '',
        opening_amount: r.opening_amount,
        closing_amount: r.closing_amount,
        expected_amount: r.expected_amount,
        difference: r.difference,
        cash_sales_total: r.cash_sales_total,
        card_sales_total: r.card_sales_total,
        sales_count: r.sales_count,
        notes_open: r.notes_open,
        notes_close: r.notes_close,
        status: r.status,
        opened_at: r.opened_at,
        closed_at: r.closed_at,
      }))

      set({ registers, isLoading: false })
    } catch (error: any) {
      console.error('Error fetching cash registers:', error)
      set({ error: error.message, isLoading: false })
    }
  },

  fetchCurrentRegister: async () => {
    try {
      const { user, selectedBranch } = useAuthStore.getState()
      if (!user) return

      const branchId = (user.role === 'owner' || user.role === 'admin')
        ? selectedBranch?.id
        : user.branch_id

      if (!branchId) {
        set({ currentRegister: null })
        return
      }

      const { data, error } = await db
        .from('cash_registers')
        .select(`
          *,
          branches:branch_id(name),
          opener:opened_by(full_name)
        `)
        .eq('branch_id', branchId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error

      if (data) {
        set({
          currentRegister: {
            id: data.id,
            branch_id: data.branch_id,
            branch_name: (data.branches as any)?.name || '',
            opened_by: data.opened_by,
            opened_by_name: (data.opener as any)?.full_name || '',
            closed_by: null,
            closed_by_name: null,
            opening_amount: data.opening_amount,
            closing_amount: null,
            expected_amount: null,
            difference: null,
            cash_sales_total: data.cash_sales_total,
            card_sales_total: data.card_sales_total,
            sales_count: data.sales_count,
            notes_open: data.notes_open,
            notes_close: null,
            status: 'open',
            opened_at: data.opened_at,
            closed_at: null,
          }
        })
      } else {
        set({ currentRegister: null })
      }
    } catch (error: any) {
      console.error('Error fetching current register:', error)
    }
  },

  openRegister: async (openingAmount: number, notes?: string) => {
    try {
      const { user, selectedBranch } = useAuthStore.getState()
      if (!user) return { success: false, error: 'No autenticado' }

      const branchId = (user.role === 'owner' || user.role === 'admin')
        ? selectedBranch?.id
        : user.branch_id

      if (!branchId) return { success: false, error: 'Sin sucursal seleccionada' }

      // Verificar que no haya una caja abierta
      const current = get().currentRegister
      if (current && current.status === 'open') {
        return { success: false, error: 'Ya hay una caja abierta en esta sucursal' }
      }

      const { data, error } = await db
        .from('cash_registers')
        .insert({
          branch_id: branchId,
          opened_by: user.id,
          opening_amount: openingAmount,
          notes_open: notes || null,
          status: 'open',
        })
        .select()
        .single()

      if (error) throw error

      await get().fetchCurrentRegister()
      return { success: true }
    } catch (error: any) {
      console.error('Error opening register:', error)
      return { success: false, error: error.message }
    }
  },

  closeRegister: async (closingAmount: number, notes?: string) => {
    try {
      const { user, selectedBranch } = useAuthStore.getState()
      if (!user) return { success: false, error: 'No autenticado' }

      const current = get().currentRegister
      if (!current) return { success: false, error: 'No hay caja abierta' }

      const branchId = (user.role === 'owner' || user.role === 'admin')
        ? selectedBranch?.id
        : user.branch_id

      // Obtener ventas realizadas durante este turno de caja
      const { data: salesData } = await supabase
        .from('sales')
        .select('total, payment_method, status')
        .eq('branch_id', branchId!)
        .gte('created_at', current.opened_at)
        .neq('status', 'voided')

      const activeSales = (salesData || []).filter(s => s.status !== 'voided')
      const cashSales = activeSales
        .filter(s => s.payment_method === 'Efectivo' || s.payment_method === 'efectivo')
        .reduce((sum, s) => sum + s.total, 0)
      const cardSales = activeSales
        .filter(s => s.payment_method !== 'Efectivo' && s.payment_method !== 'efectivo')
        .reduce((sum, s) => sum + s.total, 0)
      const salesCount = activeSales.length

      // Obtener movimientos extraordinarios
      let extraIncomes = 0
      let extraExpenses = 0
      try {
        const { useExtraMovementsStore } = await import('./extra-movements')
        const extraMovements = useExtraMovementsStore.getState().movements.filter(m => m.cash_register_id === current.id)
        extraIncomes = extraMovements.filter(m => m.type === 'ingreso').reduce((sum, m) => sum + m.amount, 0)
        extraExpenses = extraMovements.filter(m => m.type === 'gasto').reduce((sum, m) => sum + m.amount, 0)
      } catch (e) {
        // Si falla, no suma nada
      }

      const expectedAmount = current.opening_amount + cashSales + extraIncomes - extraExpenses
      const difference = closingAmount - expectedAmount

      const { error } = await db
        .from('cash_registers')
        .update({
          closed_by: user.id,
          closing_amount: closingAmount,
          expected_amount: expectedAmount,
          difference: difference,
          cash_sales_total: cashSales,
          card_sales_total: cardSales,
          sales_count: salesCount,
          notes_close: notes || null,
          status: 'closed',
          closed_at: new Date().toISOString(),
        })
        .eq('id', current.id)

      if (error) throw error

      set({ currentRegister: null })
      await get().fetchRegisters()
      return { success: true }
    } catch (error: any) {
      console.error('Error closing register:', error)
      return { success: false, error: error.message }
    }
  },
}))

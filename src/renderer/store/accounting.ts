import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'
import { useFiscalStore, type Ambiente } from './fiscal'

export const EXPENSE_CATEGORIES = [
  { value: 'alquiler', label: 'Alquiler' },
  { value: 'servicios', label: 'Servicios (luz, agua, gas)' },
  { value: 'personal', label: 'Personal / Sueldos' },
  { value: 'mercaderia', label: 'Compra de mercadería' },
  { value: 'impuestos', label: 'Impuestos / AFIP' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'marketing', label: 'Marketing / Publicidad' },
  { value: 'transporte', label: 'Transporte / Flete' },
  { value: 'banco', label: 'Gastos bancarios' },
  { value: 'caja_fuerte', label: 'Caja fuerte' },
  { value: 'ajuste_saldo', label: 'Ajuste de saldo' },
  { value: 'otro', label: 'Otro' },
]

export const INCOME_CATEGORIES = [
  { value: 'caja_fuerte', label: 'Caja fuerte' },
  { value: 'devolucion', label: 'Devolución' },
  { value: 'prestamo', label: 'Préstamo recibido' },
  { value: 'ajuste_saldo', label: 'Ajuste de saldo' },
  { value: 'otro', label: 'Otro' },
]

export interface PLData {
  totalSalesRevenue: number
  totalOtherIncome: number
  totalIncome: number
  salesCount: number
  avgTicket: number
  totalCOGS: number
  grossProfit: number
  grossMarginPct: number
  expensesByCategory: { category: string; label: string; total: number; count: number }[]
  totalExpenses: number
  netResult: number
  netMarginPct: number
}

export interface CashFlowDay {
  date: string
  cashSales: number
  cardSales: number
  transferSales: number
  otherIncome: number
  expenses: number
  net: number
}

export interface BankBalance {
  account_id: string
  account_name: string
  salesIn: number
  incomesIn: number
  expensesOut: number
  net: number
}

export interface LibroIVAEntry {
  id: string
  fecha: string
  tipo_cbte: number
  tipo_label: string
  punto_venta: number
  numero: number
  cuit_receptor: string | null
  razon_social: string | null
  importe_neto: number
  importe_iva: number
  importe_total: number
  cae: string | null
}

export interface RawSale {
  id: string
  total: number
  cash_amount: number | null
  card_amount: number | null
  transfer_amount: number | null
  transfer_account_id: string | null
  created_at: string
}

export interface RawExtraMovement {
  id: string
  type: 'ingreso' | 'gasto'
  amount: number
  source: string
  category: string | null
  transfer_account_id: string | null
  created_at: string
  description: string
}

export interface PurchaseEntry {
  id: string
  fecha: string
  product_name: string
  barcode: string | null
  supplier_name: string | null
  supplier_id: string | null
  branch_name: string
  quantity: number
  unit_cost: number
  total_cost: number
  notes: string | null
  created_by_name: string | null
}

const TIPO_CBTE_LABELS: Record<number, string> = {
  1: 'Factura A', 2: 'Nota Débito A', 3: 'Nota Crédito A',
  6: 'Factura B', 7: 'Nota Débito B', 8: 'Nota Crédito B',
  11: 'Factura C', 12: 'Nota Débito C', 13: 'Nota Crédito C',
}

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) }
const monthEnd = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) }

async function getBranchIds(user: any, organization: any, selectedBranch: any): Promise<string[]> {
  if (user.role === 'owner' || user.role === 'admin') {
    if (selectedBranch?.id) return [selectedBranch.id]
    const { data } = await supabase.from('branches').select('id')
      .eq('organization_id', organization.id).eq('is_active', true)
    return data?.map((b: any) => b.id) || []
  }
  return user.branch_id ? [user.branch_id] : []
}

interface AccountingState {
  isLoading: boolean
  isLoadingLibro: boolean
  isLoadingPurchases: boolean
  error: string | null

  startDate: Date
  endDate: Date

  plData: PLData | null
  cashFlow: CashFlowDay[]
  bankBalances: BankBalance[]
  rawSales: RawSale[]
  rawExtraMovements: RawExtraMovement[]

  libroIVA: LibroIVAEntry[]
  totalLibroNeto: number
  totalLibroIVA: number
  totalLibroImporte: number
  libroAmbiente: Ambiente

  purchases: PurchaseEntry[]
  totalPurchasesAmount: number
  totalPurchasesQty: number

  fetchAccountingData: (start?: Date, end?: Date) => Promise<void>
  fetchLibroIVA: (start?: Date, end?: Date) => Promise<void>
  fetchPurchases: (start?: Date, end?: Date) => Promise<void>
  setDateRange: (start: Date, end: Date) => void
  createOperation: (data: {
    type: 'gasto' | 'ingreso'
    amount: number
    description: string
    category: string | null
    source: string
    transfer_account_id?: string | null
    fecha: string
  }) => Promise<void>
}

export const useAccountingStore = create<AccountingState>((set, get) => ({
  isLoading: false,
  isLoadingLibro: false,
  isLoadingPurchases: false,
  error: null,
  startDate: monthStart(),
  endDate: monthEnd(),
  purchases: [],
  totalPurchasesAmount: 0,
  totalPurchasesQty: 0,
  plData: null,
  cashFlow: [],
  bankBalances: [],
  rawSales: [],
  rawExtraMovements: [],
  libroIVA: [],
  totalLibroNeto: 0,
  totalLibroIVA: 0,
  totalLibroImporte: 0,
  libroAmbiente: 'prod',

  setDateRange: (start, end) => set({ startDate: start, endDate: end }),

  fetchAccountingData: async (start, end) => {
    set({ isLoading: true, error: null })
    try {
      const { user, organization, selectedBranch } = useAuthStore.getState()
      if (!user || !organization) throw new Error('No autenticado')

      const branchIds = await getBranchIds(user, organization, selectedBranch)
      if (branchIds.length === 0) { set({ isLoading: false }); return }

      const startDate = start || get().startDate
      const endDate = end || get().endDate
      const startISO = startDate.toISOString()
      const endISO = endDate.toISOString()

      // 1. Sales
      const { data: sales = [] } = await supabase
        .from('sales')
        .select('id, total, cash_amount, card_amount, transfer_amount, transfer_account_id, status, created_at')
        .in('branch_id', branchIds)
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .neq('status', 'voided')

      // 2. COGS via inventory_movements (same pattern as reports store)
      const { data: invMoves = [] } = await supabase
        .from('inventory_movements')
        .select('quantity, cost_at_movement, sales(status)')
        .eq('movement_type', 'exit')
        .eq('transaction_type', 'sale')
        .in('branch_id', branchIds)
        .gte('created_at', startISO)
        .lte('created_at', endISO)

      // 3. Cash registers for extra movements lookup
      const { data: registers = [] } = await supabase
        .from('cash_registers').select('id').in('branch_id', branchIds)

      // 4. Transfer accounts
      const { data: transferAccounts = [] } = await supabase
        .from('transfer_accounts').select('id, nombre').eq('organization_id', organization.id)

      // 5. Extra movements - via cash registers
      let extraMovements: any[] = []
      const registerIds = (registers || []).map((r: any) => r.id)
      if (registerIds.length > 0) {
        const { data: emByRegister = [] } = await supabase
          .from('extra_movements')
          .select('id, type, amount, source, category, transfer_account_id, created_at, description')
          .in('cash_register_id', registerIds)
          .gte('created_at', startISO)
          .lte('created_at', endISO)
        extraMovements = [...(emByRegister || [])]
      }
      // Also org-level movements not tied to a cash register
      const { data: emByOrg = [] } = await supabase
        .from('extra_movements')
        .select('id, type, amount, source, category, transfer_account_id, created_at, description')
        .eq('organization_id', organization.id)
        .is('cash_register_id', null)
        .gte('created_at', startISO)
        .lte('created_at', endISO)
      if (emByOrg && emByOrg.length > 0) {
        const existingIds = new Set(extraMovements.map((m: any) => m.id))
        extraMovements = [...extraMovements, ...(emByOrg || []).filter((m: any) => !existingIds.has(m.id))]
      }

      // ─── Compute P&L ──────────────────────────────────────────────
      const salesArr = sales || []
      const totalSalesRevenue = salesArr.reduce((s: number, r: any) => s + (Number(r.total) || 0), 0)
      const salesCount = salesArr.length
      const avgTicket = salesCount > 0 ? totalSalesRevenue / salesCount : 0

      const otherIncomes = extraMovements.filter(m => m.type === 'ingreso')
      const totalOtherIncome = otherIncomes.reduce((s, m) => s + (Number(m.amount) || 0), 0)
      const totalIncome = totalSalesRevenue + totalOtherIncome

      const totalCOGS = (invMoves || [])
        .filter((m: any) => (m.sales as any)?.status !== 'voided')
        .reduce((s: number, m: any) => s + ((Number(m.cost_at_movement) || 0) * (Number(m.quantity) || 0)), 0)

      const grossProfit = totalSalesRevenue - totalCOGS
      const grossMarginPct = totalSalesRevenue > 0 ? (grossProfit / totalSalesRevenue) * 100 : 0

      const expenseMovements = extraMovements.filter(m => m.type === 'gasto')
      const catMap = new Map<string, { total: number; count: number }>()
      expenseMovements.forEach(m => {
        const cat = m.category || 'otro'
        const prev = catMap.get(cat) || { total: 0, count: 0 }
        catMap.set(cat, { total: prev.total + (Number(m.amount) || 0), count: prev.count + 1 })
      })
      const expensesByCategory = Array.from(catMap.entries())
        .map(([category, data]) => ({
          category,
          label: EXPENSE_CATEGORIES.find(c => c.value === category)?.label || category,
          ...data,
        }))
        .sort((a, b) => b.total - a.total)
      const totalExpenses = expenseMovements.reduce((s, m) => s + (Number(m.amount) || 0), 0)
      const netResult = grossProfit + totalOtherIncome - totalExpenses
      const netMarginPct = totalIncome > 0 ? (netResult / totalIncome) * 100 : 0

      const plData: PLData = {
        totalSalesRevenue, totalOtherIncome, totalIncome, salesCount, avgTicket,
        totalCOGS, grossProfit, grossMarginPct,
        expensesByCategory, totalExpenses,
        netResult, netMarginPct,
      }

      // ─── Compute Cash Flow by Day ─────────────────────────────────
      const dayMap = new Map<string, CashFlowDay>()
      const day = (date: string): CashFlowDay => {
        if (!dayMap.has(date)) dayMap.set(date, { date, cashSales: 0, cardSales: 0, transferSales: 0, otherIncome: 0, expenses: 0, net: 0 })
        return dayMap.get(date)!
      }
      salesArr.forEach((s: any) => {
        const d = day(s.created_at.split('T')[0])
        d.cashSales += Number(s.cash_amount) || 0
        d.cardSales += Number(s.card_amount) || 0
        d.transferSales += Number(s.transfer_amount) || 0
        d.net += Number(s.total) || 0
      })
      extraMovements.forEach(m => {
        const d = day(m.created_at.split('T')[0])
        if (m.type === 'ingreso') { d.otherIncome += Number(m.amount) || 0; d.net += Number(m.amount) || 0 }
        else { d.expenses += Number(m.amount) || 0; d.net -= Number(m.amount) || 0 }
      })
      const cashFlow = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date))

      // ─── Compute Account Balances (all sources) ──────────────────
      const bankMap = new Map<string, BankBalance>()

      // Efectivo en caja
      const cashSales = salesArr.reduce((s: number, r: any) => s + (Number(r.cash_amount) || 0), 0)
      const cashIngresos = extraMovements.filter(m => m.source === 'cash' && m.type === 'ingreso').reduce((s, m) => s + (Number(m.amount) || 0), 0)
      const cashGastos = extraMovements.filter(m => m.source === 'cash' && m.type === 'gasto').reduce((s, m) => s + (Number(m.amount) || 0), 0)
      bankMap.set('__cash__', { account_id: '__cash__', account_name: 'Efectivo (caja)', salesIn: cashSales, incomesIn: cashIngresos, expensesOut: cashGastos, net: 0 })

      // Tarjeta
      const cardSales = salesArr.reduce((s: number, r: any) => s + (Number(r.card_amount) || 0), 0)
      bankMap.set('__card__', { account_id: '__card__', account_name: 'Tarjeta', salesIn: cardSales, incomesIn: 0, expensesOut: 0, net: 0 })

      // Efectivo fuera de caja (personal)
      const personalIngresos = extraMovements.filter(m => m.source === 'personal' && m.type === 'ingreso').reduce((s, m) => s + (Number(m.amount) || 0), 0)
      const personalGastos = extraMovements.filter(m => m.source === 'personal' && m.type === 'gasto').reduce((s, m) => s + (Number(m.amount) || 0), 0)
      if (personalIngresos > 0 || personalGastos > 0) {
        bankMap.set('__personal__', { account_id: '__personal__', account_name: 'Efectivo (fuera de caja)', salesIn: 0, incomesIn: personalIngresos, expensesOut: personalGastos, net: 0 })
      }

      // Otro
      const otherIngresos = extraMovements.filter(m => m.source === 'other' && m.type === 'ingreso').reduce((s, m) => s + (Number(m.amount) || 0), 0)
      const otherGastos = extraMovements.filter(m => m.source === 'other' && m.type === 'gasto').reduce((s, m) => s + (Number(m.amount) || 0), 0)
      if (otherIngresos > 0 || otherGastos > 0) {
        bankMap.set('__other__', { account_id: '__other__', account_name: 'Otro', salesIn: 0, incomesIn: otherIngresos, expensesOut: otherGastos, net: 0 })
      }

      // Cuentas bancarias / transferencias
      ;(transferAccounts || []).forEach((ta: any) => {
        bankMap.set(ta.id, { account_id: ta.id, account_name: ta.nombre, salesIn: 0, incomesIn: 0, expensesOut: 0, net: 0 })
      })
      salesArr.forEach((s: any) => {
        const amt = Number(s.transfer_amount) || 0
        if (amt <= 0) return
        const key = s.transfer_account_id || '__transfer_generic__'
        if (!bankMap.has(key)) {
          const name = (transferAccounts || []).find((ta: any) => ta.id === key)?.nombre || 'Transferencia'
          bankMap.set(key, { account_id: key, account_name: name, salesIn: 0, incomesIn: 0, expensesOut: 0, net: 0 })
        }
        bankMap.get(key)!.salesIn += amt
      })
      extraMovements.forEach(m => {
        if (m.source !== 'bank' && !m.transfer_account_id) return
        const key = m.transfer_account_id || '__transfer_generic__'
        if (!bankMap.has(key)) {
          const name = (transferAccounts || []).find((ta: any) => ta.id === key)?.nombre || 'Transferencia'
          bankMap.set(key, { account_id: key, account_name: name, salesIn: 0, incomesIn: 0, expensesOut: 0, net: 0 })
        }
        const b = bankMap.get(key)!
        if (m.type === 'ingreso') b.incomesIn += Number(m.amount) || 0
        else b.expensesOut += Number(m.amount) || 0
      })
      bankMap.forEach(b => { b.net = b.salesIn + b.incomesIn - b.expensesOut })

      const ACCOUNT_ORDER = ['__cash__', '__card__', '__personal__', '__other__']
      const bankBalances = Array.from(bankMap.values())
        .filter(b => b.salesIn > 0 || b.incomesIn > 0 || b.expensesOut > 0)
        .sort((a, b) => {
          const ai = ACCOUNT_ORDER.indexOf(a.account_id)
          const bi = ACCOUNT_ORDER.indexOf(b.account_id)
          if (ai >= 0 && bi >= 0) return ai - bi
          if (ai >= 0) return -1
          if (bi >= 0) return 1
          return b.net - a.net
        })

      set({ plData, cashFlow, bankBalances, rawSales: salesArr as RawSale[], rawExtraMovements: extraMovements as RawExtraMovement[], isLoading: false, startDate, endDate })
    } catch (error: any) {
      console.error('Error fetching accounting data:', error)
      set({ error: error.message, isLoading: false })
    }
  },

  createOperation: async (data) => {
    const { user, organization } = useAuthStore.getState()
    if (!user || !organization) throw new Error('No autenticado')
    const { error } = await supabase.from('extra_movements').insert({
      organization_id: organization.id,
      cash_register_id: null,
      type: data.type,
      amount: data.amount,
      description: data.description,
      category: data.category,
      source: data.source,
      transfer_account_id: data.transfer_account_id || null,
      created_by: user.id,
      created_at: data.fecha,
    })
    if (error) throw error
    await get().fetchAccountingData()
  },

  fetchLibroIVA: async (start, end) => {
    set({ isLoadingLibro: true })
    try {
      const { organization } = useAuthStore.getState()
      if (!organization) throw new Error('No autenticado')

      const startDate = start || get().startDate
      const endDate = end || get().endDate

      // En modo prueba el libro muestra los comprobantes de prueba; con facturación real, solo los reales
      const fiscal = useFiscalStore.getState()
      if (!fiscal.config) await fiscal.fetchConfig()
      const ambiente: Ambiente = useFiscalStore.getState().config?.ambiente ?? 'prod'

      const { data, error } = await supabase
        .from('fiscal_comprobantes')
        .select('id, fecha_emision, tipo_cbte, punto_venta, numero, cuit_receptor, razon_social_receptor, importe_neto, importe_iva, importe_total, cae, resultado')
        .eq('organization_id', organization.id)
        .in('resultado', ['A', 'O']) // 'O' = aprobado con observaciones: también es válido
        .eq('ambiente', ambiente)
        .gte('fecha_emision', startDate.toISOString().split('T')[0])
        .lte('fecha_emision', endDate.toISOString().split('T')[0])
        .order('fecha_emision', { ascending: true })
        .order('numero', { ascending: true })

      if (error) throw error

      // Las notas de crédito restan: devuelven venta e IVA ya facturados
      const NOTAS_CREDITO = [3, 8, 13]
      const libroIVA: LibroIVAEntry[] = (data || []).map((c: any) => {
        const signo = NOTAS_CREDITO.includes(c.tipo_cbte) ? -1 : 1
        return {
          id: c.id,
          fecha: c.fecha_emision,
          tipo_cbte: c.tipo_cbte,
          tipo_label: TIPO_CBTE_LABELS[c.tipo_cbte] || `Tipo ${c.tipo_cbte}`,
          punto_venta: c.punto_venta,
          numero: c.numero,
          cuit_receptor: c.cuit_receptor,
          razon_social: c.razon_social_receptor,
          importe_neto: signo * (c.importe_neto || 0),
          importe_iva: signo * (c.importe_iva || 0),
          importe_total: signo * (c.importe_total || 0),
          cae: c.cae,
        }
      })

      set({
        libroIVA,
        totalLibroNeto: libroIVA.reduce((s, e) => s + e.importe_neto, 0),
        totalLibroIVA: libroIVA.reduce((s, e) => s + e.importe_iva, 0),
        totalLibroImporte: libroIVA.reduce((s, e) => s + e.importe_total, 0),
        libroAmbiente: ambiente,
        isLoadingLibro: false,
      })
    } catch (error: any) {
      console.error('Error fetching libro IVA:', error)
      set({ isLoadingLibro: false })
    }
  },

  fetchPurchases: async (start, end) => {
    set({ isLoadingPurchases: true })
    try {
      const { user, organization, selectedBranch } = useAuthStore.getState()
      if (!user || !organization) throw new Error('No autenticado')

      const branchIds = await getBranchIds(user, organization, selectedBranch)
      if (branchIds.length === 0) { set({ isLoadingPurchases: false }); return }

      const startDate = start || get().startDate
      const endDate = end || get().endDate

      const { data, error } = await supabase
        .from('inventory_movements')
        .select(`
          id, quantity, cost_at_movement, reason, notes, created_at,
          products_branch!inner(
            barcode,
            product:products(
              id, name,
              supplier:suppliers(id, name)
            )
          ),
          branches:branch_id(name),
          creator:created_by(full_name)
        `)
        .eq('movement_type', 'entry')
        .eq('transaction_type', 'purchase')
        .in('branch_id', branchIds)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(500)

      if (error) throw error

      const purchases: PurchaseEntry[] = (data || []).map((m: any) => {
        const pb = m.products_branch
        const prod = pb?.product
        const supplier = prod?.supplier
        return {
          id: m.id,
          fecha: m.created_at,
          product_name: prod?.name || 'Sin nombre',
          barcode: pb?.barcode || null,
          supplier_name: supplier?.name || null,
          supplier_id: supplier?.id || null,
          branch_name: m.branches?.name || '',
          quantity: m.quantity,
          unit_cost: m.cost_at_movement || 0,
          total_cost: m.quantity * (m.cost_at_movement || 0),
          notes: m.notes || null,
          created_by_name: m.creator?.full_name || null,
        }
      })

      set({
        purchases,
        totalPurchasesAmount: purchases.reduce((s, p) => s + p.total_cost, 0),
        totalPurchasesQty: purchases.reduce((s, p) => s + p.quantity, 0),
        isLoadingPurchases: false,
      })
    } catch (error: any) {
      console.error('Error fetching purchases:', error)
      set({ isLoadingPurchases: false })
    }
  },
}))

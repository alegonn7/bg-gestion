import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'
import { TIPO_COMPROBANTE_LABELS } from './fiscal'

export interface ProductStats {
  product_id: string
  product_name: string
  barcode: string | null
  category_name: string | null
  category_color: string | null
  stock_quantity: number
  stock_value_cost: number
  stock_value_sale: number
  potential_profit: number
  branch_name: string
}

export interface StockAlert {
  product_id: string
  product_name: string
  barcode: string | null
  category_name: string | null
  stock_quantity: number
  stock_min: number
  branch_name: string
  shortage: number
}

export interface BranchStats {
  branch_id: string
  branch_name: string
  total_products: number
  total_stock: number
  stock_value_cost: number
  stock_value_sale: number
  potential_profit: number
  low_stock_count: number
  out_of_stock_count: number
}

export interface MovementSummary {
  date: string
  entries: number
  exits: number
  net: number
}

export interface CategoryStats {
  category_id: string | null
  category_name: string
  category_color: string | null
  products_count: number
  total_stock: number
  stock_value: number
}

export interface SalesData {
  product_id: string
  product_name: string
  barcode: string | null
  category_name: string | null
  total_quantity_sold: number
  total_revenue: number
  total_cost: number
  total_profit: number
  profit_margin: number
  branch_name: string
}

export interface PeriodRevenue {
  period: string
  revenue: number
  cost: number
  profit: number
  quantity_sold: number
}

export interface BranchRevenue {
  branch_id: string
  branch_name: string
  total_revenue: number
  total_cost: number
  total_profit: number
  profit_margin: number
  quantity_sold: number
  products_sold: number
}

export interface CategoryRevenue {
  category_id: string | null
  category_name: string
  category_color: string | null
  total_revenue: number
  total_profit: number
  profit_margin: number
  quantity_sold: number
}

export interface PurchaseBySupplier {
  supplier_id: string | null
  supplier_name: string
  total_quantity: number
  total_cost: number
  purchases_count: number
}

export interface DeadStockProduct {
  product_id: string
  product_name: string
  barcode: string | null
  category_name: string | null
  stock_quantity: number
  stock_value: number
  branch_name: string
}

export interface FiscalPeriodStat {
  period: string
  facturas: number
  notas_credito: number
  notas_debito: number
  total_facturas: number
  total_nc: number
  total_nd: number
  neto: number
}

export interface FiscalByType {
  tipo: number
  label: string
  count: number
  total: number
}

export interface CashExpense {
  description: string
  amount: number
  created_at: string
}

export interface PaymentMethodRevenue {
  method: string
  total: number
}

interface ReportsState {
  isLoading: boolean
  error: string | null

  totalProducts: number
  totalStock: number
  totalStockValueCost: number
  totalStockValueSale: number
  totalPotentialProfit: number
  lowStockCount: number
  outOfStockCount: number

  totalRevenue: number
  totalCost: number
  totalProfit: number
  totalQuantitySold: number

  topProductsByStock: ProductStats[]
  topProductsByValue: ProductStats[]
  stockAlerts: StockAlert[]
  branchStats: BranchStats[]
  movementsSummary: MovementSummary[]
  categoryStats: CategoryStats[]

  topProductsBySales: SalesData[]
  topProductsByRevenue: SalesData[]
  topProductsByProfit: SalesData[]
  revenueByPeriod: PeriodRevenue[]
  revenueByBranch: BranchRevenue[]
  revenueByCategory: CategoryRevenue[]
  revenueByPaymentMethod: PaymentMethodRevenue[]
  avgTicket: number
  totalSalesCount: number
  purchasesBySupplier: PurchaseBySupplier[]
  deadStock: DeadStockProduct[]
  cashExpenses: CashExpense[]

  fiscalByPeriod: FiscalPeriodStat[]
  fiscalByType: FiscalByType[]
  totalFacturado: number
  totalNC: number
  totalND: number
  comprobanteCount: number

  fetchReports: () => Promise<void>
  fetchMovementsSummary: (days: number) => Promise<void>
  fetchSalesData: (startDate?: Date, endDate?: Date, branchId?: string) => Promise<void>
  fetchPurchasesBySupplier: (startDate?: Date, endDate?: Date, branchId?: string) => Promise<void>
  fetchDeadStock: (startDate?: Date, endDate?: Date, branchId?: string) => Promise<void>
  fetchCashExpenses: (startDate?: Date, endDate?: Date, branchId?: string) => Promise<void>
  fetchFiscalData: (startDate?: Date, endDate?: Date) => Promise<void>
}

export const useReportsStore = create<ReportsState>((set) => ({
  isLoading: false,
  error: null,

  totalProducts: 0,
  totalStock: 0,
  totalStockValueCost: 0,
  totalStockValueSale: 0,
  totalPotentialProfit: 0,
  lowStockCount: 0,
  outOfStockCount: 0,

  totalRevenue: 0,
  totalCost: 0,
  totalProfit: 0,
  totalQuantitySold: 0,

  topProductsByStock: [],
  topProductsByValue: [],
  stockAlerts: [],
  branchStats: [],
  movementsSummary: [],
  categoryStats: [],

  topProductsBySales: [],
  topProductsByRevenue: [],
  topProductsByProfit: [],
  revenueByPeriod: [],
  revenueByBranch: [],
  revenueByCategory: [],
  revenueByPaymentMethod: [],
  avgTicket: 0,
  totalSalesCount: 0,
  purchasesBySupplier: [],
  deadStock: [],
  cashExpenses: [],

  fiscalByPeriod: [],
  fiscalByType: [],
  totalFacturado: 0,
  totalNC: 0,
  totalND: 0,
  comprobanteCount: 0,

  fetchReports: async () => {
    set({ isLoading: true, error: null })

    try {
      const { user, organization } = useAuthStore.getState()

      if (!user || !organization) throw new Error('No authenticated user')

      const { selectedBranch } = useAuthStore.getState()
      let branchIds: string[] = []

      if (user.role === 'owner' || user.role === 'admin') {
        if (selectedBranch?.id) {
          branchIds = [selectedBranch.id]
        } else {
          const { data: branches } = await supabase
            .from('branches')
            .select('id')
            .eq('organization_id', organization.id)
            .eq('is_active', true)

          branchIds = branches?.map(b => b.id) || []
        }
      } else if (user.branch_id) {
        branchIds = [user.branch_id]
      }

      if (branchIds.length === 0) {
        set({ isLoading: false })
        return
      }

      const { data: products, error: productsError } = await supabase
        .from('products_branch')
        .select(`
          id,
          barcode,
          stock_quantity,
          stock_min,
          price_cost,
          price_sale,
          branch_id,
          product:products (
            id,
            name,
            category_id,
            categories (
              id,
              name,
              color
            )
          ),
          branches (
            id,
            name
          )
        `)
        .in('branch_id', branchIds)
        .eq('is_active', true)

      if (productsError) throw productsError

      const totalProducts = products?.length || 0
      const totalStock = products?.reduce((sum, p) => sum + p.stock_quantity, 0) || 0
      const totalStockValueCost = products?.reduce((sum, p) => sum + (p.stock_quantity * p.price_cost), 0) || 0
      const totalStockValueSale = products?.reduce((sum, p) => sum + (p.stock_quantity * p.price_sale), 0) || 0
      const totalPotentialProfit = totalStockValueSale - totalStockValueCost
      const lowStockCount = products?.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.stock_min).length || 0
      const outOfStockCount = products?.filter(p => p.stock_quantity === 0).length || 0

      const topByStock = [...(products || [])]
        .sort((a, b) => b.stock_quantity - a.stock_quantity)
        .slice(0, 10)
        .map(p => ({
          product_id: p.id,
          product_name: (p.product as any)?.name || 'Sin nombre',
          barcode: p.barcode,
          category_name: (p.product as any)?.categories?.name || null,
          category_color: (p.product as any)?.categories?.color || null,
          stock_quantity: p.stock_quantity,
          stock_value_cost: p.stock_quantity * p.price_cost,
          stock_value_sale: p.stock_quantity * p.price_sale,
          potential_profit: (p.stock_quantity * p.price_sale) - (p.stock_quantity * p.price_cost),
          branch_name: (p.branches as any)?.name || 'Sin sucursal'
        }))

      const topByValue = [...(products || [])]
        .map(p => ({
          product_id: p.id,
          product_name: (p.product as any)?.name || 'Sin nombre',
          barcode: p.barcode,
          category_name: (p.product as any)?.categories?.name || null,
          category_color: (p.product as any)?.categories?.color || null,
          stock_quantity: p.stock_quantity,
          stock_value_cost: p.stock_quantity * p.price_cost,
          stock_value_sale: p.stock_quantity * p.price_sale,
          potential_profit: (p.stock_quantity * p.price_sale) - (p.stock_quantity * p.price_cost),
          branch_name: (p.branches as any)?.name || 'Sin sucursal'
        }))
        .sort((a, b) => b.stock_value_sale - a.stock_value_sale)
        .slice(0, 10)

      const alerts = products
        ?.filter(p => p.stock_quantity <= p.stock_min)
        .sort((a, b) => (a.stock_quantity - a.stock_min) - (b.stock_quantity - b.stock_min))
        .slice(0, 20)
        .map(p => ({
          product_id: p.id,
          product_name: (p.product as any)?.name || 'Sin nombre',
          barcode: p.barcode,
          category_name: (p.product as any)?.categories?.name || null,
          stock_quantity: p.stock_quantity,
          stock_min: p.stock_min,
          branch_name: (p.branches as any)?.name || 'Sin sucursal',
          shortage: p.stock_min - p.stock_quantity
        })) || []

      const branchStatsMap = new Map<string, BranchStats>()

      products?.forEach(p => {
        const branchId = p.branch_id
        const branchName = (p.branches as any)?.name || 'Sin sucursal'

        if (!branchStatsMap.has(branchId)) {
          branchStatsMap.set(branchId, {
            branch_id: branchId,
            branch_name: branchName,
            total_products: 0,
            total_stock: 0,
            stock_value_cost: 0,
            stock_value_sale: 0,
            potential_profit: 0,
            low_stock_count: 0,
            out_of_stock_count: 0
          })
        }

        const stats = branchStatsMap.get(branchId)!
        stats.total_products++
        stats.total_stock += p.stock_quantity
        stats.stock_value_cost += p.stock_quantity * p.price_cost
        stats.stock_value_sale += p.stock_quantity * p.price_sale
        stats.potential_profit += (p.stock_quantity * p.price_sale) - (p.stock_quantity * p.price_cost)

        if (p.stock_quantity === 0) stats.out_of_stock_count++
        else if (p.stock_quantity <= p.stock_min) stats.low_stock_count++
      })

      const branchStatsArray = Array.from(branchStatsMap.values())

      const categoryStatsMap = new Map<string, CategoryStats>()

      products?.forEach(p => {
        const categoryId = (p.product as any)?.category_id || 'sin-categoria'
        const categoryName = (p.product as any)?.categories?.name || 'Sin categoría'
        const categoryColor = (p.product as any)?.categories?.color || null

        if (!categoryStatsMap.has(categoryId)) {
          categoryStatsMap.set(categoryId, {
            category_id: categoryId === 'sin-categoria' ? null : categoryId,
            category_name: categoryName,
            category_color: categoryColor,
            products_count: 0,
            total_stock: 0,
            stock_value: 0
          })
        }

        const stats = categoryStatsMap.get(categoryId)!
        stats.products_count++
        stats.total_stock += p.stock_quantity
        stats.stock_value += p.stock_quantity * p.price_sale
      })

      const categoryStatsArray = Array.from(categoryStatsMap.values())
        .sort((a, b) => b.stock_value - a.stock_value)

      set({
        totalProducts,
        totalStock,
        totalStockValueCost,
        totalStockValueSale,
        totalPotentialProfit,
        lowStockCount,
        outOfStockCount,
        topProductsByStock: topByStock,
        topProductsByValue: topByValue,
        stockAlerts: alerts,
        branchStats: branchStatsArray,
        categoryStats: categoryStatsArray,
        isLoading: false
      })

    } catch (error: any) {
      console.error('Error fetching reports:', error)
      set({
        error: error.message,
        isLoading: false
      })
    }
  },

  fetchMovementsSummary: async (days: number = 30) => {
    try {
      const { user, organization } = useAuthStore.getState()

      if (!user || !organization) throw new Error('No authenticated user')

      const { selectedBranch: selBranch } = useAuthStore.getState()
      let branchIds: string[] = []

      if (user.role === 'owner' || user.role === 'admin') {
        if (selBranch?.id) {
          branchIds = [selBranch.id]
        } else {
          const { data: branches } = await supabase
            .from('branches')
            .select('id')
            .eq('organization_id', organization.id)
            .eq('is_active', true)

          branchIds = branches?.map(b => b.id) || []
        }
      } else if (user.branch_id) {
        branchIds = [user.branch_id]
      }

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const { data: movements, error } = await supabase
        .from('inventory_movements')
        .select('movement_type, quantity, created_at')
        .in('branch_id', branchIds)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true })

      if (error) throw error

      const summaryMap = new Map<string, MovementSummary>()

      movements?.forEach(m => {
        const date = new Date(m.created_at).toISOString().split('T')[0]

        if (!summaryMap.has(date)) {
          summaryMap.set(date, {
            date,
            entries: 0,
            exits: 0,
            net: 0
          })
        }

        const summary = summaryMap.get(date)!

        if (m.movement_type === 'entry') {
          summary.entries += m.quantity
          summary.net += m.quantity
        } else {
          summary.exits += m.quantity
          summary.net -= m.quantity
        }
      })

      const summaryArray = Array.from(summaryMap.values())

      set({ movementsSummary: summaryArray })

    } catch (error: any) {
      console.error('Error fetching movements summary:', error)
    }
  },

  fetchSalesData: async (startDate?: Date, endDate?: Date, branchId?: string) => {
    set({ isLoading: true, error: null })

    try {
      const { user, organization } = useAuthStore.getState()

      if (!user || !organization) throw new Error('No authenticated user')

      let branchIds: string[] = []

      if (branchId) {
        branchIds = [branchId]
      } else if (user.role === 'owner' || user.role === 'admin') {
        const { selectedBranch: selBranch2 } = useAuthStore.getState()
        if (selBranch2?.id) {
          branchIds = [selBranch2.id]
        } else {
          const { data: branches } = await supabase
            .from('branches')
            .select('id')
            .eq('organization_id', organization.id)
            .eq('is_active', true)

          branchIds = branches?.map(b => b.id) || []
        }
      } else if (user.branch_id) {
        branchIds = [user.branch_id]
      }

      if (branchIds.length === 0) {
        set({ isLoading: false })
        return
      }

      const end = endDate || new Date()
      const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)

      let query = supabase
        .from('inventory_movements')
        .select(`
          id,
          product_branch_id,
          quantity,
          price_at_movement,
          cost_at_movement,
          stock_before,
          stock_after,
          created_at,
          branch_id,
          products_branch!inner (
            id,
            barcode,
            price_cost,
            price_sale,
            product:products (
              id,
              name,
              category_id,
              categories (
                id,
                name,
                color
              )
            )
          ),
          branches!inner (
            id,
            name
          )
        `)
        .eq('movement_type', 'exit')
        .eq('transaction_type', 'sale')
        .in('branch_id', branchIds)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())

      const { data: sales, error: salesError } = await query

      if (salesError) throw salesError

      const totalRevenue = sales?.reduce((sum, s) => sum + (s.quantity * s.price_at_movement), 0) || 0
      const totalCost = sales?.reduce((sum, s) => sum + (s.quantity * s.cost_at_movement), 0) || 0
      const totalProfit = totalRevenue - totalCost
      const totalQuantitySold = sales?.reduce((sum, s) => sum + s.quantity, 0) || 0

      const productSalesMap = new Map<string, SalesData>()

      sales?.forEach(s => {
        const product = s.products_branch as any
        const branch = s.branches as any
        const masterProduct = product.product
        const category = masterProduct?.categories
        const productId = product.id

        if (!productSalesMap.has(productId)) {
          productSalesMap.set(productId, {
            product_id: productId,
            product_name: masterProduct?.name || 'Sin nombre',
            barcode: product.barcode,
            category_name: category?.name || null,
            total_quantity_sold: 0,
            total_revenue: 0,
            total_cost: 0,
            total_profit: 0,
            profit_margin: 0,
            branch_name: branch?.name || 'Sin sucursal'
          })
        }

        const data = productSalesMap.get(productId)!
        data.total_quantity_sold += s.quantity
        data.total_revenue += s.quantity * s.price_at_movement
        data.total_cost += s.quantity * s.cost_at_movement
        data.total_profit += (s.quantity * s.price_at_movement) - (s.quantity * s.cost_at_movement)
        data.profit_margin = data.total_revenue > 0 ? (data.total_profit / data.total_revenue) * 100 : 0
      })

      const salesArray = Array.from(productSalesMap.values())

      const topBySales = [...salesArray].sort((a, b) => b.total_quantity_sold - a.total_quantity_sold).slice(0, 10)
      const topByRevenue = [...salesArray].sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 10)
      const topByProfit = [...salesArray].sort((a, b) => b.total_profit - a.total_profit).slice(0, 10)

      const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const groupByMonth = daysDiff > 90

      const periodMap = new Map<string, PeriodRevenue>()

      sales?.forEach(s => {
        const date = new Date(s.created_at)
        const period = groupByMonth
          ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          : date.toISOString().split('T')[0]

        if (!periodMap.has(period)) {
          periodMap.set(period, {
            period,
            revenue: 0,
            cost: 0,
            profit: 0,
            quantity_sold: 0
          })
        }

        const data = periodMap.get(period)!
        data.revenue += s.quantity * s.price_at_movement
        data.cost += s.quantity * s.cost_at_movement
        data.profit += (s.quantity * s.price_at_movement) - (s.quantity * s.cost_at_movement)
        data.quantity_sold += s.quantity
      })

      const periodArray = Array.from(periodMap.values()).sort((a, b) => a.period.localeCompare(b.period))

      const branchRevenueMap = new Map<string, BranchRevenue>()

      sales?.forEach(s => {
        const branch = s.branches as any
        const branchId = s.branch_id

        if (!branchRevenueMap.has(branchId)) {
          branchRevenueMap.set(branchId, {
            branch_id: branchId,
            branch_name: branch?.name || 'Sin sucursal',
            total_revenue: 0,
            total_cost: 0,
            total_profit: 0,
            profit_margin: 0,
            quantity_sold: 0,
            products_sold: 0
          })
        }

        const data = branchRevenueMap.get(branchId)!
        data.total_revenue += s.quantity * s.price_at_movement
        data.total_cost += s.quantity * s.cost_at_movement
        data.total_profit += (s.quantity * s.price_at_movement) - (s.quantity * s.cost_at_movement)
        data.quantity_sold += s.quantity
      })

      branchRevenueMap.forEach(data => {
        data.profit_margin = data.total_revenue > 0 ? (data.total_profit / data.total_revenue) * 100 : 0
        data.products_sold = salesArray.filter(p => p.branch_name === data.branch_name).length
      })

      const branchRevenueArray = Array.from(branchRevenueMap.values())
        .sort((a, b) => b.total_revenue - a.total_revenue)

      const categoryRevenueMap = new Map<string, CategoryRevenue>()

      sales?.forEach(s => {
        const product = s.products_branch as any
        const masterProduct2 = product.product
        const category = masterProduct2?.categories
        const categoryId = masterProduct2?.category_id || 'sin-categoria'
        const categoryName = category?.name || 'Sin categoría'
        const categoryColor = category?.color || null

        if (!categoryRevenueMap.has(categoryId)) {
          categoryRevenueMap.set(categoryId, {
            category_id: categoryId === 'sin-categoria' ? null : categoryId,
            category_name: categoryName,
            category_color: categoryColor,
            total_revenue: 0,
            total_profit: 0,
            profit_margin: 0,
            quantity_sold: 0
          })
        }

        const data = categoryRevenueMap.get(categoryId)!
        data.total_revenue += s.quantity * s.price_at_movement
        data.total_profit += (s.quantity * s.price_at_movement) - (s.quantity * s.cost_at_movement)
        data.quantity_sold += s.quantity
      })

      categoryRevenueMap.forEach(data => {
        data.profit_margin = data.total_revenue > 0 ? (data.total_profit / data.total_revenue) * 100 : 0
      })

      const categoryRevenueArray = Array.from(categoryRevenueMap.values())
        .sort((a, b) => b.total_revenue - a.total_revenue)

      // Payment method breakdown from sales table (date-filtered)
      const { data: salesTable } = await supabase
        .from('sales')
        .select('payment_method, total')
        .in('branch_id', branchIds)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .eq('status', 'completed')

      const pmLabels: Record<string, string> = {
        'cash': 'Efectivo', 'debit': 'Débito', 'credit': 'Crédito',
        'transfer': 'Transferencia', 'mixed': 'Mixto',
        'Efectivo': 'Efectivo', 'Débito': 'Débito', 'Crédito': 'Crédito',
        'Transferencia': 'Transferencia', 'Mixto': 'Mixto'
      }
      const pmMap = new Map<string, number>()
      salesTable?.forEach(s => {
        const label = pmLabels[s.payment_method] || s.payment_method || 'Otro'
        pmMap.set(label, (pmMap.get(label) || 0) + (s.total || 0))
      })
      const revenueByPaymentMethod = Array.from(pmMap.entries()).map(([method, total]) => ({ method, total }))
      const totalSalesCount = salesTable?.length || 0
      const avgTicket = totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0

      set({
        totalRevenue,
        totalCost,
        totalProfit,
        totalQuantitySold,
        topProductsBySales: topBySales,
        topProductsByRevenue: topByRevenue,
        topProductsByProfit: topByProfit,
        revenueByPeriod: periodArray,
        revenueByBranch: branchRevenueArray,
        revenueByCategory: categoryRevenueArray,
        revenueByPaymentMethod,
        avgTicket,
        totalSalesCount,
        isLoading: false
      })

    } catch (error: any) {
      console.error('Error fetching sales data:', error)
      set({
        error: error.message,
        isLoading: false
      })
    }
  },

  fetchPurchasesBySupplier: async (startDate?: Date, endDate?: Date, branchId?: string) => {
    try {
      const { user, organization } = useAuthStore.getState()
      if (!user || !organization) return

      let branchIds: string[] = []
      if (branchId) {
        branchIds = [branchId]
      } else if (user.role === 'owner' || user.role === 'admin') {
        const { selectedBranch } = useAuthStore.getState()
        if (selectedBranch?.id) {
          branchIds = [selectedBranch.id]
        } else {
          const { data: branches } = await supabase
            .from('branches').select('id')
            .eq('organization_id', organization.id).eq('is_active', true)
          branchIds = branches?.map(b => b.id) || []
        }
      } else if (user.branch_id) {
        branchIds = [user.branch_id]
      }
      if (branchIds.length === 0) return

      const end = endDate || new Date()
      const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)

      const { data: movements, error } = await supabase
        .from('inventory_movements')
        .select(`
          quantity,
          cost_at_movement,
          products_branch!inner (
            product:products (
              id,
              name,
              supplier_id,
              suppliers (
                id,
                name
              )
            )
          )
        `)
        .eq('movement_type', 'entry')
        .in('branch_id', branchIds)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())

      if (error) throw error

      const supplierMap = new Map<string, PurchaseBySupplier>()

      movements?.forEach(m => {
        const product = (m.products_branch as any)?.product
        const supplier = product?.suppliers
        const supplierId = supplier?.id || 'sin-proveedor'
        const supplierName = supplier?.name || 'Sin proveedor'

        if (!supplierMap.has(supplierId)) {
          supplierMap.set(supplierId, {
            supplier_id: supplierId === 'sin-proveedor' ? null : supplierId,
            supplier_name: supplierName,
            total_quantity: 0,
            total_cost: 0,
            purchases_count: 0
          })
        }

        const data = supplierMap.get(supplierId)!
        data.total_quantity += m.quantity
        data.total_cost += m.quantity * (m.cost_at_movement || 0)
        data.purchases_count++
      })

      const purchasesBySupplier = Array.from(supplierMap.values())
        .sort((a, b) => b.total_cost - a.total_cost)

      set({ purchasesBySupplier })
    } catch (error: any) {
      console.error('Error fetching purchases by supplier:', error)
    }
  },

  fetchDeadStock: async (startDate?: Date, endDate?: Date, branchId?: string) => {
    try {
      const { user, organization } = useAuthStore.getState()
      if (!user || !organization) return

      let branchIds: string[] = []
      if (branchId) {
        branchIds = [branchId]
      } else if (user.role === 'owner' || user.role === 'admin') {
        const { selectedBranch } = useAuthStore.getState()
        if (selectedBranch?.id) {
          branchIds = [selectedBranch.id]
        } else {
          const { data: branches } = await supabase
            .from('branches').select('id')
            .eq('organization_id', organization.id).eq('is_active', true)
          branchIds = branches?.map(b => b.id) || []
        }
      } else if (user.branch_id) {
        branchIds = [user.branch_id]
      }
      if (branchIds.length === 0) return

      const end = endDate || new Date()
      const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)

      const [{ data: products }, { data: soldMovements }] = await Promise.all([
        supabase
          .from('products_branch')
          .select(`
            id, barcode, stock_quantity, price_cost, price_sale,
            product:products (name, categories (name)),
            branches (name)
          `)
          .in('branch_id', branchIds)
          .eq('is_active', true)
          .gt('stock_quantity', 0),
        supabase
          .from('inventory_movements')
          .select('product_branch_id')
          .eq('movement_type', 'exit')
          .eq('transaction_type', 'sale')
          .in('branch_id', branchIds)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
      ])

      const soldIds = new Set(soldMovements?.map(m => m.product_branch_id))

      const deadStock = (products || [])
        .filter(p => !soldIds.has(p.id))
        .map(p => ({
          product_id: p.id,
          product_name: (p.product as any)?.name || 'Sin nombre',
          barcode: p.barcode,
          category_name: (p.product as any)?.categories?.name || null,
          stock_quantity: p.stock_quantity,
          stock_value: p.stock_quantity * p.price_sale,
          branch_name: (p.branches as any)?.name || 'Sin sucursal'
        }))
        .sort((a, b) => b.stock_value - a.stock_value)

      set({ deadStock })
    } catch (error: any) {
      console.error('Error fetching dead stock:', error)
    }
  },

  fetchCashExpenses: async (startDate?: Date, endDate?: Date, branchId?: string) => {
    try {
      const { user, organization } = useAuthStore.getState()
      if (!user || !organization) return

      let branchIds: string[] = []
      if (branchId) {
        branchIds = [branchId]
      } else if (user.role === 'owner' || user.role === 'admin') {
        const { selectedBranch } = useAuthStore.getState()
        if (selectedBranch?.id) {
          branchIds = [selectedBranch.id]
        } else {
          const { data: branches } = await supabase
            .from('branches').select('id')
            .eq('organization_id', organization.id).eq('is_active', true)
          branchIds = branches?.map(b => b.id) || []
        }
      } else if (user.branch_id) {
        branchIds = [user.branch_id]
      }
      if (branchIds.length === 0) return

      const end = endDate || new Date()
      const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)

      const { data: registers } = await supabase
        .from('cash_registers')
        .select('id')
        .in('branch_id', branchIds)

      const registerIds = registers?.map(r => r.id) || []
      if (registerIds.length === 0) {
        set({ cashExpenses: [] })
        return
      }

      const { data: expenses, error } = await supabase
        .from('extra_movements')
        .select('description, amount, created_at')
        .eq('type', 'gasto')
        .in('cash_register_id', registerIds)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false })

      if (error) throw error

      set({ cashExpenses: expenses || [] })
    } catch (error: any) {
      console.error('Error fetching cash expenses:', error)
    }
  },

  fetchFiscalData: async (startDate?: Date, endDate?: Date) => {
    try {
      const end = endDate || new Date()
      const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)

      const { data, error } = await supabase
        .from('fiscal_comprobantes')
        .select('tipo_cbte, fecha_emision, importe_total, resultado')
        .eq('resultado', 'A')
        .gte('fecha_emision', start.toISOString().split('T')[0])
        .lte('fecha_emision', end.toISOString().split('T')[0])
        .order('fecha_emision', { ascending: true })

      if (error) throw error

      const FACTURA_TIPOS = new Set([1, 6, 11])
      const NC_TIPOS = new Set([3, 8, 13])
      const ND_TIPOS = new Set([2, 7, 12])

      const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const groupByMonth = daysDiff > 90

      const periodMap = new Map<string, FiscalPeriodStat>()
      data?.forEach(c => {
        const period = groupByMonth ? c.fecha_emision.slice(0, 7) : c.fecha_emision
        if (!periodMap.has(period)) {
          periodMap.set(period, { period, facturas: 0, notas_credito: 0, notas_debito: 0, total_facturas: 0, total_nc: 0, total_nd: 0, neto: 0 })
        }
        const p = periodMap.get(period)!
        const importe = c.importe_total || 0
        if (FACTURA_TIPOS.has(c.tipo_cbte)) { p.facturas++; p.total_facturas += importe }
        else if (NC_TIPOS.has(c.tipo_cbte)) { p.notas_credito++; p.total_nc += importe }
        else if (ND_TIPOS.has(c.tipo_cbte)) { p.notas_debito++; p.total_nd += importe }
      })
      periodMap.forEach(p => { p.neto = p.total_facturas + p.total_nd - p.total_nc })
      const fiscalByPeriod = Array.from(periodMap.values()).sort((a, b) => a.period.localeCompare(b.period))

      const typeMap = new Map<number, FiscalByType>()
      data?.forEach(c => {
        if (!typeMap.has(c.tipo_cbte)) {
          typeMap.set(c.tipo_cbte, { tipo: c.tipo_cbte, label: TIPO_COMPROBANTE_LABELS[c.tipo_cbte] || `Tipo ${c.tipo_cbte}`, count: 0, total: 0 })
        }
        const t = typeMap.get(c.tipo_cbte)!
        t.count++
        t.total += c.importe_total || 0
      })
      const fiscalByType = Array.from(typeMap.values()).sort((a, b) => b.total - a.total)

      const totalFacturado = (data || []).filter(c => FACTURA_TIPOS.has(c.tipo_cbte)).reduce((s, c) => s + (c.importe_total || 0), 0)
      const totalNC = (data || []).filter(c => NC_TIPOS.has(c.tipo_cbte)).reduce((s, c) => s + (c.importe_total || 0), 0)
      const totalND = (data || []).filter(c => ND_TIPOS.has(c.tipo_cbte)).reduce((s, c) => s + (c.importe_total || 0), 0)
      const comprobanteCount = data?.length || 0

      set({ fiscalByPeriod, fiscalByType, totalFacturado, totalNC, totalND, comprobanteCount })
    } catch (error: any) {
      console.error('Error fetching fiscal data:', error)
    }
  }
}))
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

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

  fetchReports: () => Promise<void>
  fetchMovementsSummary: (days: number) => Promise<void>
  fetchSalesData: (startDate?: Date, endDate?: Date, branchId?: string) => Promise<void>
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

  fetchReports: async () => {
    set({ isLoading: true, error: null })

    try {
      const { user, organization } = useAuthStore.getState()

      if (!user || !organization) throw new Error('No authenticated user')

      let branchIds: string[] = []

      if (user.role === 'owner' || user.role === 'admin') {
        const { data: branches } = await supabase
          .from('branches')
          .select('id')
          .eq('organization_id', organization.id)
          .eq('is_active', true)

        branchIds = branches?.map(b => b.id) || []
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
          name,
          barcode,
          stock_quantity,
          stock_min,
          price_cost,
          price_sale,
          category_id,
          branch_id,
          categories (
            id,
            name,
            color
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
          product_name: p.name || 'Sin nombre',
          barcode: p.barcode,
          category_name: (p.categories as any)?.name || null,
          category_color: (p.categories as any)?.color || null,
          stock_quantity: p.stock_quantity,
          stock_value_cost: p.stock_quantity * p.price_cost,
          stock_value_sale: p.stock_quantity * p.price_sale,
          potential_profit: (p.stock_quantity * p.price_sale) - (p.stock_quantity * p.price_cost),
          branch_name: (p.branches as any)?.name || 'Sin sucursal'
        }))

      const topByValue = [...(products || [])]
        .map(p => ({
          product_id: p.id,
          product_name: p.name || 'Sin nombre',
          barcode: p.barcode,
          category_name: (p.categories as any)?.name || null,
          category_color: (p.categories as any)?.color || null,
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
          product_name: p.name || 'Sin nombre',
          barcode: p.barcode,
          category_name: (p.categories as any)?.name || null,
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
        const categoryId = p.category_id || 'sin-categoria'
        const categoryName = (p.categories as any)?.name || 'Sin categoría'
        const categoryColor = (p.categories as any)?.color || null

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

      let branchIds: string[] = []

      if (user.role === 'owner' || user.role === 'admin') {
        const { data: branches } = await supabase
          .from('branches')
          .select('id')
          .eq('organization_id', organization.id)
          .eq('is_active', true)

        branchIds = branches?.map(b => b.id) || []
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
        const { data: branches } = await supabase
          .from('branches')
          .select('id')
          .eq('organization_id', organization.id)
          .eq('is_active', true)

        branchIds = branches?.map(b => b.id) || []
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
            name,
            barcode,
            price_cost,
            price_sale,
            category_id,
            categories (
              id,
              name,
              color
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
        const category = product.categories as any
        const productId = product.id

        if (!productSalesMap.has(productId)) {
          productSalesMap.set(productId, {
            product_id: productId,
            product_name: product.name || 'Sin nombre',
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
        const category = product.categories as any
        const categoryId = product.category_id || 'sin-categoria'
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
        isLoading: false
      })

    } catch (error: any) {
      console.error('Error fetching sales data:', error)
      set({
        error: error.message,
        isLoading: false
      })
    }
  }
}))
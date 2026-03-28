import { useEffect, useState } from 'react'
import { RefreshCw, Calendar, Filter, TrendingUp, DollarSign, Package, AlertTriangle, ShoppingCart, Truck, BarChart2 } from 'lucide-react'
import { useReportsStore } from '@/store/reports'
import { useCashRegisterStore } from '@/store/cash-register'
import { useBranchesStore } from '@/store/branches'
import { useAuthStore } from '@/store/auth'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'

type ChartType =
  | 'revenue-period'
  | 'revenue-branch'
  | 'revenue-category'
  | 'top-products'
  | 'profit-margin-category'
  | 'stock-alerts'
  | 'inventory-value'
  | 'cash-register-summary'
  | 'revenue-payment-method'
  | 'sales-count-per-day'
  | 'purchases-by-supplier'
  | 'dead-stock'
  | 'cash-expenses'

interface ChartOption {
  id: ChartType
  label: string
  icon: typeof TrendingUp
  description: string
  category: 'commercial' | 'inventory'
}

const chartOptions: ChartOption[] = [
  {
    id: 'revenue-period',
    label: 'Ingresos por Período',
    icon: TrendingUp,
    description: 'Evolución de ingresos, costos y ganancias en el tiempo',
    category: 'commercial'
  },
  {
    id: 'sales-count-per-day',
    label: 'Cantidad de Ventas por Día',
    icon: BarChart2,
    description: 'Número de transacciones realizadas cada día',
    category: 'commercial'
  },
  {
    id: 'revenue-payment-method',
    label: 'Ingresos por Método de Pago',
    icon: DollarSign,
    description: 'Comparativa de ingresos por tipo de pago',
    category: 'commercial'
  },
  {
    id: 'revenue-branch',
    label: 'Ingresos por Sucursal',
    icon: DollarSign,
    description: 'Comparativa de ingresos entre sucursales',
    category: 'commercial'
  },
  {
    id: 'revenue-category',
    label: 'Ingresos por Categoría',
    icon: Package,
    description: 'Distribución de ingresos por categoría de productos',
    category: 'commercial'
  },
  {
    id: 'top-products',
    label: 'Top Productos',
    icon: TrendingUp,
    description: 'Top 10 productos por ventas, ingresos y ganancia',
    category: 'commercial'
  },
  {
    id: 'profit-margin-category',
    label: 'Margen por Categoría',
    icon: Package,
    description: 'Margen de ganancia promedio por categoría',
    category: 'commercial'
  },
  {
    id: 'cash-register-summary',
    label: 'Arqueo de Caja por Usuario',
    icon: DollarSign,
    description: 'Faltantes/sobrantes y ranking de ventas por empleado',
    category: 'commercial'
  },
  {
    id: 'purchases-by-supplier',
    label: 'Compras por Proveedor',
    icon: Truck,
    description: 'A qué proveedores le comprás más',
    category: 'commercial'
  },
  {
    id: 'stock-alerts',
    label: 'Alertas de Stock',
    icon: AlertTriangle,
    description: 'Productos con stock bajo o agotados',
    category: 'inventory'
  },
  {
    id: 'inventory-value',
    label: 'Valor del Inventario',
    icon: Package,
    description: 'Valor en stock por producto y por categoría',
    category: 'inventory'
  },
  {
    id: 'dead-stock',
    label: 'Productos Sin Movimiento',
    icon: Package,
    description: 'Productos con stock pero sin ventas en el período',
    category: 'inventory'
  },
  {
    id: 'cash-expenses',
    label: 'Gastos de Caja',
    icon: ShoppingCart,
    description: 'Gastos registrados en cajas durante el período',
    category: 'inventory'
  }
]

export default function Reports() {
  const { user, selectedBranch: authSelectedBranch } = useAuthStore()
  const {
    isLoading,
    totalRevenue,
    totalCost,
    totalProfit,
    totalQuantitySold,
    lowStockCount,
    outOfStockCount,
    topProductsBySales,
    topProductsByRevenue,
    topProductsByProfit,
    revenueByPeriod,
    revenueByBranch,
    revenueByCategory,
    stockAlerts,
    topProductsByValue,
    categoryStats,
    revenueByPaymentMethod,
    avgTicket,
    totalSalesCount,
    purchasesBySupplier,
    deadStock,
    cashExpenses,
    fetchReports,
    fetchSalesData,
    fetchPurchasesBySupplier,
    fetchDeadStock,
    fetchCashExpenses
  } = useReportsStore()

  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  const { branches, fetchBranches } = useBranchesStore()
  const { registers: cashRegisters, isLoading: isLoadingCashRegisters, fetchRegisters } = useCashRegisterStore()

  const [selectedChart, setSelectedChart] = useState<ChartType>('revenue-period')
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | 'custom'>('30d')
  const [selectedBranch, setSelectedBranch] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [inventoryValueTab, setInventoryValueTab] = useState<'product' | 'category'>('product')
  const [topProductsSort, setTopProductsSort] = useState<'sales' | 'revenue' | 'profit'>('revenue')

  useEffect(() => {
    fetchReports()
    fetchBranches()
    handlePeriodChange('30d')
  }, [authSelectedBranch?.id])

  useEffect(() => {
    if (selectedChart === 'cash-register-summary' && cashRegisters.length === 0) {
      fetchRegisters()
    }
  }, [selectedChart])

  const getDateRange = (period: typeof selectedPeriod) => {
    const end = new Date()
    const start = new Date()
    if (period === '7d') start.setDate(end.getDate() - 7)
    else if (period === '30d') start.setDate(end.getDate() - 30)
    else if (period === '90d') start.setDate(end.getDate() - 90)
    return { start, end }
  }

  const handlePeriodChange = (period: typeof selectedPeriod) => {
    setSelectedPeriod(period)
    if (period === 'custom') return
    const { start, end } = getDateRange(period)
    const branchId = selectedBranch === 'all' ? undefined : selectedBranch
    fetchSalesData(start, end, branchId)
    fetchPurchasesBySupplier(start, end, branchId)
    fetchDeadStock(start, end, branchId)
    fetchCashExpenses(start, end, branchId)
  }

  const handleBranchChange = (branchId: string) => {
    setSelectedBranch(branchId)
    if (selectedPeriod === 'custom') return
    const { start, end } = getDateRange(selectedPeriod)
    const bid = branchId === 'all' ? undefined : branchId
    fetchSalesData(start, end, bid)
    fetchPurchasesBySupplier(start, end, bid)
    fetchDeadStock(start, end, bid)
    fetchCashExpenses(start, end, bid)
  }

  const handleCustomDateApply = () => {
    if (startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      const branchId = selectedBranch === 'all' ? undefined : selectedBranch
      fetchSalesData(start, end, branchId)
      fetchPurchasesBySupplier(start, end, branchId)
      fetchDeadStock(start, end, branchId)
      fetchCashExpenses(start, end, branchId)
    }
  }

  const handleRefresh = () => {
    fetchReports()
    handlePeriodChange(selectedPeriod)
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('es-AR').format(value)
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1']

  const renderChart = () => {
    switch (selectedChart) {
      case 'revenue-period':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Ingresos, Costos y Ganancias en el Tiempo</h3>
            {revenueByPeriod.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay datos de ventas en el período seleccionado.</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={revenueByPeriod}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} width={120} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" name="Ingresos" strokeWidth={2} />
                  <Line type="monotone" dataKey="cost" stroke="#ef4444" name="Costos" strokeWidth={2} />
                  <Line type="monotone" dataKey="profit" stroke="#3b82f6" name="Ganancia" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )

      case 'sales-count-per-day': {
        const salesCountData = revenueByPeriod.map(p => ({ period: p.period, quantity: p.quantity_sold }))
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-1">Unidades Vendidas por Período</h3>
            <p className="text-sm text-gray-500 mb-4">Total: {formatNumber(totalQuantitySold)} unidades · {formatNumber(totalSalesCount)} transacciones</p>
            {salesCountData.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay datos de ventas en el período seleccionado.</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={salesCountData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value) => `${formatNumber(Number(value))} unidades`} />
                  <Legend />
                  <Bar dataKey="quantity" fill="#3b82f6" name="Unidades Vendidas" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )
      }

      case 'revenue-payment-method':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Ingresos por Método de Pago</h3>
            {revenueByPaymentMethod.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay datos de ventas en el período seleccionado.</div>
            ) : (
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={revenueByPaymentMethod} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="method" tick={{ fontSize: 14, fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={120} />
                  <Tooltip formatter={(value) => [formatCurrency(Number(value)), 'Ingresos']} cursor={{ fill: 'rgba(59,130,246,0.07)' }} />
                  <Bar dataKey="total" name="Ingresos" radius={[6, 6, 0, 0]} maxBarSize={80}>
                    {revenueByPaymentMethod.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )

      case 'revenue-branch':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Comparativa de Ingresos por Sucursal</h3>
            {revenueByBranch.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay datos de ventas en el período seleccionado.</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={revenueByBranch} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} width={120} />
                  <YAxis dataKey="branch_name" type="category" width={150} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                  <Bar dataKey="total_revenue" fill="#10b981" name="Ingresos" />
                  <Bar dataKey="total_profit" fill="#3b82f6" name="Ganancia" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )

      case 'revenue-category':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Distribución de Ingresos por Categoría</h3>
            {revenueByCategory.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay datos de ventas en el período seleccionado.</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={revenueByCategory}
                    dataKey="total_revenue"
                    nameKey="category_name"
                    cx="50%"
                    cy="50%"
                    outerRadius={150}
                    label={(entry) => {
                      const d = entry as any
                      return `${d.category_name}: ${formatCurrency(d.total_revenue)}`
                    }}
                  >
                    {revenueByCategory.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        )

      case 'top-products': {
        const sortedProducts =
          topProductsSort === 'sales' ? topProductsBySales
          : topProductsSort === 'revenue' ? topProductsByRevenue
          : topProductsByProfit

        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Top 10 Productos</h3>
              <div className="flex gap-2">
                {(['revenue', 'sales', 'profit'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setTopProductsSort(opt)}
                    className={`px-3 py-1.5 text-sm rounded-lg ${topProductsSort === opt ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {opt === 'revenue' ? 'Ingresos' : opt === 'sales' ? 'Unidades' : 'Ganancia'}
                  </button>
                ))}
              </div>
            </div>
            {sortedProducts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay datos de ventas en el período seleccionado.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-600">
                      <th className="text-left py-3 px-3">#</th>
                      <th className="text-left py-3 px-3">Producto</th>
                      <th className="text-left py-3 px-3">Categoría</th>
                      <th className="text-right py-3 px-3">Unidades</th>
                      <th className="text-right py-3 px-3">Ingresos</th>
                      <th className="text-right py-3 px-3">Ganancia</th>
                      <th className="text-right py-3 px-3">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProducts.map((p, i) => (
                      <tr key={p.product_id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-3 px-3 text-gray-400">{i + 1}</td>
                        <td className="py-3 px-3">
                          <p className="font-medium">{p.product_name}</p>
                          {p.barcode && <p className="text-xs text-gray-400">{p.barcode}</p>}
                        </td>
                        <td className="py-3 px-3 text-gray-600">{p.category_name || '—'}</td>
                        <td className="text-right py-3 px-3">{formatNumber(p.total_quantity_sold)}</td>
                        <td className="text-right py-3 px-3 font-medium text-green-700">{formatCurrency(p.total_revenue)}</td>
                        <td className="text-right py-3 px-3 font-medium text-blue-700">{formatCurrency(p.total_profit)}</td>
                        <td className="text-right py-3 px-3">
                          <span className={`font-medium ${p.profit_margin >= 30 ? 'text-green-600' : p.profit_margin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {p.profit_margin.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      }

      case 'profit-margin-category':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Margen de Ganancia por Categoría</h3>
            {revenueByCategory.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay datos de ventas en el período seleccionado.</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={revenueByCategory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category_name" />
                  <YAxis tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} />
                  <Legend />
                  <Bar dataKey="profit_margin" fill="#8b5cf6" name="Margen %" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )

      case 'cash-register-summary': {
        const resumenPorUsuario: Record<string, { nombre: string; arqueos: number; ventas: number; diferencia: number }> = {}
        cashRegisters
          .filter((r: any) => r.status === 'closed')
          .forEach((r: any) => {
            const key = r.closed_by_name || r.opened_by_name || 'Desconocido'
            if (!resumenPorUsuario[key]) {
              resumenPorUsuario[key] = { nombre: key, arqueos: 0, ventas: 0, diferencia: 0 }
            }
            resumenPorUsuario[key].arqueos += 1
            resumenPorUsuario[key].ventas += r.sales_count || 0
            resumenPorUsuario[key].diferencia += r.difference || 0
          })
        const resumenArray = Object.values(resumenPorUsuario).sort((a, b) => b.ventas - a.ventas)
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Arqueo de Caja por Usuario</h3>
            {isLoadingCashRegisters ? (
              <div className="text-center py-12 text-gray-500">Cargando arqueos...</div>
            ) : resumenArray.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay datos de arqueos cerrados.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Empleado</th>
                      <th className="text-right py-3 px-4">Arqueos</th>
                      <th className="text-right py-3 px-4">Ventas</th>
                      <th className="text-right py-3 px-4">Neto Faltante/Sobrante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenArray.map((u) => (
                      <tr key={u.nombre}>
                        <td className="py-3 px-4 font-medium">{u.nombre}</td>
                        <td className="text-right py-3 px-4">{u.arqueos}</td>
                        <td className="text-right py-3 px-4">{u.ventas}</td>
                        <td className={`text-right py-3 px-4 font-semibold ${u.diferencia < 0 ? 'text-red-600' : u.diferencia > 0 ? 'text-blue-600' : 'text-gray-700'}`}>
                          {formatCurrency(u.diferencia)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      }

      case 'purchases-by-supplier':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Compras por Proveedor</h3>
            {purchasesBySupplier.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay compras registradas en el período seleccionado.</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={purchasesBySupplier} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} width={120} />
                    <YAxis dataKey="supplier_name" type="category" width={160} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Bar dataKey="total_cost" fill="#6366f1" name="Monto Total" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-gray-600">
                        <th className="text-left py-2 px-3">Proveedor</th>
                        <th className="text-right py-2 px-3">Entradas</th>
                        <th className="text-right py-2 px-3">Unidades</th>
                        <th className="text-right py-2 px-3">Monto Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchasesBySupplier.map((s) => (
                        <tr key={s.supplier_id || 'sin'} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium">{s.supplier_name}</td>
                          <td className="text-right py-2 px-3">{s.purchases_count}</td>
                          <td className="text-right py-2 px-3">{formatNumber(s.total_quantity)}</td>
                          <td className="text-right py-2 px-3 font-medium text-indigo-700">{formatCurrency(s.total_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )

      case 'stock-alerts':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Productos que Requieren Atención</h3>
            {stockAlerts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay productos con alertas de stock.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Producto</th>
                      <th className="text-left py-3 px-4">Sucursal</th>
                      <th className="text-right py-3 px-4">Stock</th>
                      <th className="text-right py-3 px-4">Mínimo</th>
                      <th className="text-right py-3 px-4">Faltante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockAlerts.map((alert) => (
                      <tr key={alert.product_id} className={alert.stock_quantity === 0 ? 'bg-red-50' : 'bg-yellow-50'}>
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium">{alert.product_name}</p>
                            {alert.barcode && <p className="text-sm text-gray-500">{alert.barcode}</p>}
                          </div>
                        </td>
                        <td className="py-3 px-4">{alert.branch_name}</td>
                        <td className="text-right py-3 px-4">
                          <span className={alert.stock_quantity === 0 ? 'text-red-600 font-semibold' : 'text-yellow-600'}>
                            {alert.stock_quantity}
                          </span>
                        </td>
                        <td className="text-right py-3 px-4">{alert.stock_min}</td>
                        <td className="text-right py-3 px-4 font-semibold text-red-600">{alert.shortage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )

      case 'inventory-value': {
        const totalInventoryValue = topProductsByValue.reduce((acc, p) => acc + (p.stock_value_sale || 0), 0)
        const inventoryValueByCategory = categoryStats.map(c => ({ category: c.category_name, total: c.stock_value }))

        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Valor del Inventario</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setInventoryValueTab('product')}
                  className={`px-3 py-1.5 text-sm rounded-lg ${inventoryValueTab === 'product' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  Por Producto
                </button>
                <button
                  onClick={() => setInventoryValueTab('category')}
                  className={`px-3 py-1.5 text-sm rounded-lg ${inventoryValueTab === 'category' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  Por Categoría
                </button>
              </div>
            </div>
            <div className="mb-4 text-lg font-bold text-green-700">
              Valor total: {formatCurrency(totalInventoryValue)}
            </div>
            {inventoryValueTab === 'product' ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={topProductsByValue} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis dataKey="product_name" type="category" width={200} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                  <Bar dataKey="stock_value_sale" fill="#10b981" name="Valor de Venta" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={inventoryValueByCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis dataKey="category" type="category" width={200} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                  <Bar dataKey="total" fill="#6366f1" name="Valor de Inventario" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )
      }

      case 'dead-stock':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-1">Productos Sin Movimiento</h3>
            <p className="text-sm text-gray-500 mb-4">Tienen stock pero no registraron ventas en el período seleccionado</p>
            {deadStock.length === 0 ? (
              <div className="text-center py-12 text-green-600 font-medium">
                ¡Excelente! Todos los productos con stock tuvieron ventas en el período.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-600">
                      <th className="text-left py-3 px-3">Producto</th>
                      <th className="text-left py-3 px-3">Categoría</th>
                      <th className="text-left py-3 px-3">Sucursal</th>
                      <th className="text-right py-3 px-3">Stock</th>
                      <th className="text-right py-3 px-3">Valor Inmovilizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deadStock.map((p) => (
                      <tr key={p.product_id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-3 px-3">
                          <p className="font-medium">{p.product_name}</p>
                          {p.barcode && <p className="text-xs text-gray-400">{p.barcode}</p>}
                        </td>
                        <td className="py-3 px-3 text-gray-600">{p.category_name || '—'}</td>
                        <td className="py-3 px-3 text-gray-600">{p.branch_name}</td>
                        <td className="text-right py-3 px-3">{p.stock_quantity}</td>
                        <td className="text-right py-3 px-3 font-medium text-orange-600">{formatCurrency(p.stock_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-gray-50">
                      <td colSpan={4} className="py-3 px-3 font-semibold text-gray-700">{deadStock.length} productos · Capital inmovilizado:</td>
                      <td className="text-right py-3 px-3 font-bold text-orange-700">
                        {formatCurrency(deadStock.reduce((sum, p) => sum + p.stock_value, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )

      case 'cash-expenses': {
        const totalExpenses = cashExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
        const expensesByDesc: Record<string, number> = {}
        cashExpenses.forEach(e => {
          const key = e.description || 'Sin descripción'
          expensesByDesc[key] = (expensesByDesc[key] || 0) + (e.amount || 0)
        })
        const expensesSummary = Object.entries(expensesByDesc)
          .map(([description, total]) => ({ description, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10)

        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-1">Gastos de Caja</h3>
            <p className="text-sm text-gray-500 mb-4">Gastos registrados en cajas durante el período</p>
            {cashExpenses.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay gastos registrados en el período seleccionado.</div>
            ) : (
              <>
                <div className="mb-4 text-lg font-bold text-red-700">
                  Total gastos: {formatCurrency(totalExpenses)}
                </div>
                {expensesSummary.length > 0 && (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={expensesSummary} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                      <YAxis dataKey="description" type="category" width={200} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Bar dataKey="total" fill="#ef4444" name="Monto" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-gray-600">
                        <th className="text-left py-2 px-3">Descripción</th>
                        <th className="text-left py-2 px-3">Método</th>
                        <th className="text-left py-2 px-3">Fecha</th>
                        <th className="text-right py-2 px-3">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashExpenses.slice(0, 50).map((e, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 px-3">{e.description || '—'}</td>
                          <td className="py-2 px-3 text-gray-600">{e.payment_method || '—'}</td>
                          <td className="py-2 px-3 text-gray-600">{new Date(e.created_at).toLocaleDateString('es-AR')}</td>
                          <td className="text-right py-2 px-3 font-medium text-red-600">{formatCurrency(e.amount || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reportes y Estadísticas</h1>
          <p className="text-gray-500 mt-1">Análisis detallado del negocio</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Período:</span>
            <div className="flex gap-2">
              {(['7d', '30d', '90d', 'custom'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => handlePeriodChange(period)}
                  className={`px-3 py-1.5 text-sm rounded-lg ${
                    selectedPeriod === period
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {period === '7d' ? '7 días' : period === '30d' ? '30 días' : period === '90d' ? '90 días' : 'Personalizado'}
                </button>
              ))}
            </div>
          </div>

          {selectedPeriod === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
              <span className="text-gray-500">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={handleCustomDateApply}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Aplicar
              </button>
            </div>
          )}

          {(user?.role === 'owner' || user?.role === 'admin') && (
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Sucursal:</span>
              <select
                value={selectedBranch}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">Todas</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-5 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs opacity-90">Ingresos Totales</span>
            <DollarSign className="h-4 w-4 opacity-90" />
          </div>
          <p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs opacity-90 mt-1">{formatNumber(totalQuantitySold)} unidades</p>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-5 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs opacity-90">Costos Totales</span>
            <TrendingUp className="h-4 w-4 opacity-90" />
          </div>
          <p className="text-xl font-bold">{formatCurrency(totalCost)}</p>
          <p className="text-xs opacity-90 mt-1">Costo de ventas</p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-5 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs opacity-90">Ganancia Total</span>
            <TrendingUp className="h-4 w-4 opacity-90" />
          </div>
          <p className="text-xl font-bold">{formatCurrency(totalProfit)}</p>
          <p className="text-xs opacity-90 mt-1">Margen: {profitMargin.toFixed(1)}%</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-5 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs opacity-90">Ticket Promedio</span>
            <ShoppingCart className="h-4 w-4 opacity-90" />
          </div>
          <p className="text-xl font-bold">{formatCurrency(avgTicket)}</p>
          <p className="text-xs opacity-90 mt-1">{formatNumber(totalSalesCount)} transacciones</p>
        </div>

        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg p-5 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs opacity-90">Alertas de Stock</span>
            <AlertTriangle className="h-4 w-4 opacity-90" />
          </div>
          <p className="text-xl font-bold">{lowStockCount + outOfStockCount}</p>
          <p className="text-xs opacity-90 mt-1">{outOfStockCount} sin stock, {lowStockCount} bajo</p>
        </div>
      </div>

      {/* Chart Selector and Display */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="sticky top-0 bg-white p-4 border-b z-10">
              <h3 className="font-semibold">Análisis Disponibles</h3>
            </div>
            <div className="p-4 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Análisis Comercial</p>
                <div className="space-y-1">
                  {chartOptions.filter((opt) => opt.category === 'commercial').map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setSelectedChart(option.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                        selectedChart === option.id
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <option.icon className="h-4 w-4 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{option.label}</p>
                          <p className="text-xs text-gray-500 truncate">{option.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Análisis de Inventario</p>
                <div className="space-y-1">
                  {chartOptions.filter((opt) => opt.category === 'inventory').map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setSelectedChart(option.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                        selectedChart === option.id
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <option.icon className="h-4 w-4 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{option.label}</p>
                          <p className="text-xs text-gray-500 truncate">{option.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chart Display */}
        <div className="lg:col-span-3">
          {isLoading ? (
            <div className="bg-white rounded-lg p-12 shadow-sm flex items-center justify-center">
              <div className="text-center">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-gray-500">Cargando datos...</p>
              </div>
            </div>
          ) : (
            renderChart()
          )}
        </div>
      </div>
    </div>
  )
}

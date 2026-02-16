import { useEffect, useState } from 'react'
import { RefreshCw, Calendar, Filter, TrendingUp, DollarSign, Package, AlertTriangle } from 'lucide-react'
import { useReportsStore } from '@/store/reports'
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
  | 'top-sales'
  | 'top-revenue'
  | 'top-profit'
  | 'profit-margin-category'
  | 'stock-alerts'
  | 'inventory-value'
  | 'movements'

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
    id: 'top-sales',
    label: 'Productos Más Vendidos',
    icon: TrendingUp,
    description: 'Top 10 productos por cantidad vendida',
    category: 'commercial'
  },
  {
    id: 'top-revenue',
    label: 'Productos con Mayor Ingreso',
    icon: DollarSign,
    description: 'Top 10 productos que generan más ingresos',
    category: 'commercial'
  },
  {
    id: 'top-profit',
    label: 'Productos con Mayor Ganancia',
    icon: TrendingUp,
    description: 'Top 10 productos más rentables',
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
    description: 'Top productos por valor en stock',
    category: 'inventory'
  },
  {
    id: 'movements',
    label: 'Movimientos de Inventario',
    icon: TrendingUp,
    description: 'Entradas y salidas de inventario',
    category: 'inventory'
  }
]

export default function Reports() {
  const { user } = useAuthStore()
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
    movementsSummary,
    fetchReports,
    fetchMovementsSummary,
    fetchSalesData
  } = useReportsStore()

  const { branches, fetchBranches } = useBranchesStore()

  const [selectedChart, setSelectedChart] = useState<ChartType>('revenue-period')
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | 'custom'>('30d')
  const [selectedBranch, setSelectedBranch] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  useEffect(() => {
    fetchReports()
    fetchBranches()
    handlePeriodChange('30d')
  }, [])

  const handlePeriodChange = (period: typeof selectedPeriod) => {
    setSelectedPeriod(period)
    const end = new Date()
    let start = new Date()

    if (period === '7d') {
      start.setDate(end.getDate() - 7)
    } else if (period === '30d') {
      start.setDate(end.getDate() - 30)
    } else if (period === '90d') {
      start.setDate(end.getDate() - 90)
    }

    if (period !== 'custom') {
      fetchSalesData(start, end, selectedBranch === 'all' ? undefined : selectedBranch)
      fetchMovementsSummary(period === '7d' ? 7 : period === '30d' ? 30 : 90)
    }
  }

  const handleBranchChange = (branchId: string) => {
    setSelectedBranch(branchId)
    
    const end = new Date()
    let start = new Date()

    if (selectedPeriod === '7d') {
      start.setDate(end.getDate() - 7)
    } else if (selectedPeriod === '30d') {
      start.setDate(end.getDate() - 30)
    } else if (selectedPeriod === '90d') {
      start.setDate(end.getDate() - 90)
    }

    fetchSalesData(start, end, branchId === 'all' ? undefined : branchId)
  }

  const handleCustomDateApply = () => {
    if (startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      fetchSalesData(start, end, selectedBranch === 'all' ? undefined : selectedBranch)
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
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={revenueByPeriod}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" name="Ingresos" strokeWidth={2} />
                <Line type="monotone" dataKey="cost" stroke="#ef4444" name="Costos" strokeWidth={2} />
                <Line type="monotone" dataKey="profit" stroke="#3b82f6" name="Ganancia" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )

      case 'revenue-branch':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Comparativa de Ingresos por Sucursal</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={revenueByBranch} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="branch_name" type="category" width={150} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="total_revenue" fill="#10b981" name="Ingresos" />
                <Bar dataKey="total_profit" fill="#3b82f6" name="Ganancia" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )

      case 'revenue-category':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Distribución de Ingresos por Categoría</h3>
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
                    const data = entry as any
                    return `${data.category_name}: ${formatCurrency(data.total_revenue)}`
                  }}
                >
                  {revenueByCategory.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )

      case 'top-sales':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Top 10 Productos Más Vendidos</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={topProductsBySales} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="product_name" type="category" width={200} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total_quantity_sold" fill="#3b82f6" name="Cantidad Vendida" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )

      case 'top-revenue':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Top 10 Productos con Mayor Ingreso</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={topProductsByRevenue} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="product_name" type="category" width={200} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="total_revenue" fill="#10b981" name="Ingresos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )

      case 'top-profit':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Top 10 Productos Más Rentables</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={topProductsByProfit} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="product_name" type="category" width={200} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="total_profit" fill="#f59e0b" name="Ganancia" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )

      case 'profit-margin-category':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Margen de Ganancia por Categoría</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={revenueByCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category_name" />
                <YAxis />
                <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} />
                <Legend />
                <Bar dataKey="profit_margin" fill="#8b5cf6" name="Margen %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )

      case 'stock-alerts':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Productos que Requieren Atención</h3>
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
                    <tr
                      key={alert.product_id}
                      className={alert.stock_quantity === 0 ? 'bg-red-50' : 'bg-yellow-50'}
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{alert.product_name}</p>
                          {alert.barcode && (
                            <p className="text-sm text-gray-500">{alert.barcode}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">{alert.branch_name}</td>
                      <td className="text-right py-3 px-4">
                        <span className={alert.stock_quantity === 0 ? 'text-red-600 font-semibold' : 'text-yellow-600'}>
                          {alert.stock_quantity}
                        </span>
                      </td>
                      <td className="text-right py-3 px-4">{alert.stock_min}</td>
                      <td className="text-right py-3 px-4 font-semibold text-red-600">
                        {alert.shortage}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )

      case 'inventory-value':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Top 10 Productos por Valor en Stock</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={topProductsByValue} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="product_name" type="category" width={200} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="stock_value_sale" fill="#10b981" name="Valor de Venta" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )

      case 'movements':
        return (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Movimientos de Inventario</h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={movementsSummary}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="entries" stroke="#10b981" name="Entradas" strokeWidth={2} />
                <Line type="monotone" dataKey="exits" stroke="#ef4444" name="Salidas" strokeWidth={2} />
                <Line type="monotone" dataKey="net" stroke="#3b82f6" name="Neto" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )

      default:
        return null
    }
  }

  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

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
              {['7d', '30d', '90d', 'custom'].map((period) => (
                <button
                  key={period}
                  onClick={() => handlePeriodChange(period as any)}
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Ingresos Totales</span>
            <DollarSign className="h-5 w-5 opacity-90" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
          <p className="text-sm opacity-90 mt-1">{formatNumber(totalQuantitySold)} unidades vendidas</p>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Costos Totales</span>
            <TrendingUp className="h-5 w-5 opacity-90" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalCost)}</p>
          <p className="text-sm opacity-90 mt-1">Costo de ventas</p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Ganancia Total</span>
            <TrendingUp className="h-5 w-5 opacity-90" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalProfit)}</p>
          <p className="text-sm opacity-90 mt-1">Margen: {profitMargin.toFixed(1)}%</p>
        </div>

        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Alertas de Stock</span>
            <AlertTriangle className="h-5 w-5 opacity-90" />
          </div>
          <p className="text-2xl font-bold">{lowStockCount + outOfStockCount}</p>
          <p className="text-sm opacity-90 mt-1">
            {outOfStockCount} sin stock, {lowStockCount} stock bajo
          </p>
        </div>
      </div>

      {/* Chart Selector and Display */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar con selector de charts */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="sticky top-0 bg-white p-4 border-b z-10">
              <h3 className="font-semibold">Análisis Disponibles</h3>
            </div>
            <div className="p-4 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
              {/* Comerciales */}
              <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Análisis Comercial</p>
              <div className="space-y-1">
                {chartOptions
                  .filter((opt) => opt.category === 'commercial')
                  .map((option) => (
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
                        <option.icon className="h-4 w-4" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{option.label}</p>
                          <p className="text-xs text-gray-500">{option.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            {/* Inventario */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Análisis de Inventario</p>
              <div className="space-y-1">
                {chartOptions
                  .filter((opt) => opt.category === 'inventory')
                  .map((option) => (
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
                        <option.icon className="h-4 w-4" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{option.label}</p>
                          <p className="text-xs text-gray-500">{option.description}</p>
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
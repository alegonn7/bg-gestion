import SuppliersPage from './Suppliers'
import { useAuthStore } from '@/store/auth'
import { useReportsStore } from '@/store/reports'
import { useSalesStore } from '@/store/sales'
import { Package, LayoutDashboard, Building2, Users, Settings, LogOut, BarChart3, BookOpen, CreditCard, Receipt, ChevronLeft, ChevronRight, AlertTriangle, TrendingUp, DollarSign, ShoppingCart, ArrowUp, ArrowDown, Wallet, ScanLine } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import Products from './Products'
import MasterCatalog from './MasterCatalog'
import Branches from './Branches'
import UsersPage from './Users'
import Reports from './Reports'
import POS from './POS'
import SalesHistory from './SalesHistory'
import SettingsPage from './Settings'
import CashRegisterPage from './CashRegister'
import ScannerPage from './ScannerPage'
import logoImg from '@/assets/logo.png'

type Page = 'dashboard' | 'products' | 'master-catalog' | 'branches' | 'users' | 'reports' | 'pos' | 'sales-history' | 'settings' | 'cash-register' | 'scanner' | 'suppliers'

export default function Dashboard() {
  const { user, organization, logout, branches, selectedBranch, selectBranch } = useAuthStore()
  const { lowStockCount, outOfStockCount, fetchReports } = useReportsStore()
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const stockAlertTotal = lowStockCount + outOfStockCount

  useEffect(() => {
    fetchReports()
  }, [selectedBranch?.id])

  const menuItems = [
    { id: 'dashboard' as Page, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pos' as Page, label: 'Punto de Venta', icon: CreditCard, roles: ['owner', 'admin', 'manager', 'employee'] },
    { id: 'sales-history' as Page, label: 'Historial de Ventas', icon: Receipt, roles: ['owner', 'admin', 'manager', 'employee'] },
    { id: 'cash-register' as Page, label: 'Arqueo de Caja', icon: Wallet, roles: ['owner', 'admin', 'manager'] },
    { id: 'scanner' as Page, label: 'Escáner', icon: ScanLine, roles: ['owner', 'admin', 'manager', 'employee'] },
    { id: 'products' as Page, label: 'Productos', icon: Package, stockBadge: true },
    { id: 'master-catalog' as Page, label: 'Catálogo Maestro', icon: BookOpen, roles: ['owner', 'admin', 'manager', 'employee'] },
    { id: 'branches' as Page, label: 'Sucursales', icon: Building2, roles: ['owner', 'admin'] },
    { id: 'users' as Page, label: 'Usuarios', icon: Users, roles: ['owner', 'admin', 'manager'] },
    { id: 'suppliers' as Page, label: 'Proveedores', icon: Building2, roles: ['owner', 'admin', 'manager'] },
    { id: 'reports' as Page, label: 'Reportes', icon: BarChart3, roles: ['owner', 'admin', 'manager'] },
    { id: 'settings' as Page, label: 'Configuración', icon: Settings },
  ]

  // Filtrar menú según rol
  const filteredMenu = menuItems.filter(item =>
    !item.roles || item.roles.includes(user?.role || '')
  )

  const renderContent = () => {
    switch (currentPage) {
      case 'products':
        return <Products />
      case 'master-catalog':
        return <MasterCatalog />
      case 'branches':
        return <Branches />
      case 'users':
        return <UsersPage />
      case 'suppliers':
        return <SuppliersPage />
      case 'reports':
        return <Reports />
      case 'pos':
        return <POS />
      case 'sales-history':
        return <SalesHistory />
      case 'cash-register':
        return <CashRegisterPage />
      case 'scanner':
        return <ScannerPage />
      case 'settings':
        return <SettingsPage />
      case 'dashboard':
        return <DashboardHome />
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {menuItems.find(m => m.id === currentPage)?.label}
              </h2>
              <p className="text-gray-600">Próximamente...</p>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-[68px]' : 'w-64'} bg-white border-r border-gray-200 flex flex-col transition-all duration-200 relative flex-shrink-0`}>
        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-20 z-10 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-50 shadow-sm"
          title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {sidebarCollapsed
            ? <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
            : <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
          }
        </button>

        {/* Logo/Brand */}
        <div className={`border-b border-gray-200 ${sidebarCollapsed ? 'p-3 flex flex-col items-center' : 'p-5'}`}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center">
              <img src={logoImg} alt="BG Gestión" className="w-12 h-12 rounded-full object-cover" />
              <span className="text-[9px] font-bold text-gray-400 mt-1">BG</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <img src={logoImg} alt="BG Gestión" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h1 className="font-bold text-gray-900 text-lg leading-tight">BG Gestión</h1>
                  <p className="text-xs text-gray-500 truncate">{organization?.name}</p>
                </div>
              </div>

              {/* Branch Selector - Solo para owner/admin con múltiples sucursales */}
              {branches.length > 1 && (user?.role === 'owner' || user?.role === 'admin') && (
                <select
                  value={selectedBranch?.id || ''}
                  onChange={(e) => selectBranch(e.target.value)}
                  className="w-full mt-3 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      📍 {branch.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className={`flex-1 ${sidebarCollapsed ? 'p-2' : 'p-4'} space-y-1 overflow-y-auto`}>
          {filteredMenu.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id
            const showStockBadge = (item as any).stockBadge && stockAlertTotal > 0

            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 ${sidebarCollapsed ? 'px-2 py-3' : 'px-4 py-3'} rounded-lg transition relative ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-700' : 'text-gray-400'}`} />
                {!sidebarCollapsed && <span className="flex-1 text-left">{item.label}</span>}
                {/* Badge de stock bajo */}
                {showStockBadge && (
                  <span className={`flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex-shrink-0 ${sidebarCollapsed ? 'absolute -top-0.5 -right-0.5' : ''}`}>
                    {stockAlertTotal > 99 ? '99+' : stockAlertTotal}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* User Footer */}
        <div className={`border-t border-gray-200 ${sidebarCollapsed ? 'p-2' : 'p-4'}`}>
          {!sidebarCollapsed && (
            <div className="mb-3 px-2">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.full_name || user?.email}
              </p>
              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
            </div>
          )}
          <button
            onClick={logout}
            title={sidebarCollapsed ? 'Cerrar Sesión' : undefined}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 ${sidebarCollapsed ? 'px-2 py-2' : 'px-4 py-2'} text-red-600 hover:bg-red-50 rounded-lg transition`}
          >
            <LogOut className="w-5 h-5" />
            {!sidebarCollapsed && <span>Cerrar Sesión</span>}
          </button>
          {!sidebarCollapsed && (
            <p className="text-[10px] text-gray-400 text-center mt-3 leading-tight">
              © {new Date().getFullYear()} Binary Goats<br/>Todos los derechos reservados.
            </p>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {renderContent()}
      </main>
    </div>
  )
}

// Dashboard Home Component
function DashboardHome() {
  const { user, organization, branches } = useAuthStore()
  const { 
    totalProducts, totalStock, totalStockValueCost, totalStockValueSale, totalPotentialProfit,
    lowStockCount, outOfStockCount, stockAlerts, branchStats,
    fetchReports, isLoading: reportsLoading 
  } = useReportsStore()
  const { sales, fetchSales, isLoading: salesLoading } = useSalesStore()

  useEffect(() => {
    fetchReports()
    fetchSales()
  }, [])

  // Ventas de hoy
  const todayStats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todaySales = sales.filter(s => {
      const saleDate = new Date(s.created_at)
      saleDate.setHours(0, 0, 0, 0)
      return saleDate.getTime() === today.getTime()
    })
    const revenue = todaySales.reduce((sum, s) => sum + s.total, 0)
    const profit = todaySales.reduce((sum, s) => {
      const cost = s.items.reduce((c, item) => c + (item.cost * item.quantity), 0)
      return sum + (s.total - cost)
    }, 0)
    return { count: todaySales.length, revenue, profit }
  }, [sales])

  // Últimas 5 ventas
  const recentSales = useMemo(() => sales.slice(0, 5), [sales])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(value)

  const isLoading = reportsLoading || salesLoading

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Bienvenido, {user?.full_name || user?.email}
          </h2>
          <p className="text-gray-600">Resumen general de tu negocio</p>
        </div>
        {isLoading && (
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        )}
      </div>

      {/* KPIs principales - solo para owner/admin/manager */}
      {(user?.role === 'owner' || user?.role === 'admin' || user?.role === 'manager') ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{totalProducts}</span>
            </div>
            <h3 className="text-sm font-medium text-gray-600">Productos</h3>
            <p className="text-xs text-gray-400 mt-1">{totalStock} unidades en stock</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{todayStats.count}</span>
            </div>
            <h3 className="text-sm font-medium text-gray-600">Ventas Hoy</h3>
            <p className="text-xs text-gray-400 mt-1">{formatCurrency(todayStats.revenue)}</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-2xl font-bold text-emerald-700">{formatCurrency(todayStats.profit)}</span>
            </div>
            <h3 className="text-sm font-medium text-gray-600">Ganancia Hoy</h3>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{branches.length}</span>
            </div>
            <h3 className="text-sm font-medium text-gray-600">Sucursales</h3>
          </div>

          <div className={`rounded-lg border p-5 ${(lowStockCount + outOfStockCount) > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${(lowStockCount + outOfStockCount) > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                <AlertTriangle className={`w-5 h-5 ${(lowStockCount + outOfStockCount) > 0 ? 'text-red-600' : 'text-gray-400'}`} />
              </div>
              <span className={`text-2xl font-bold ${(lowStockCount + outOfStockCount) > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                {lowStockCount + outOfStockCount}
              </span>
            </div>
            <h3 className="text-sm font-medium text-gray-600">Alertas Stock</h3>
            {outOfStockCount > 0 && (
              <p className="text-xs text-red-500 mt-1">{outOfStockCount} sin stock</p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-2xl font-bold text-gray-900">{totalProducts}</span>
            </div>
            <h3 className="text-sm font-medium text-gray-600">Productos</h3>
            <p className="text-xs text-gray-400 mt-1">{totalStock} unidades en stock</p>
          </div>
          <div className={`rounded-lg border p-5 ${(lowStockCount + outOfStockCount) > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${(lowStockCount + outOfStockCount) > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                <AlertTriangle className={`w-5 h-5 ${(lowStockCount + outOfStockCount) > 0 ? 'text-red-600' : 'text-gray-400'}`} />
              </div>
              <span className={`text-2xl font-bold ${(lowStockCount + outOfStockCount) > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                {lowStockCount + outOfStockCount}
              </span>
            </div>
            <h3 className="text-sm font-medium text-gray-600">Alertas Stock</h3>
            {outOfStockCount > 0 && (
              <p className="text-xs text-red-500 mt-1">{outOfStockCount} sin stock</p>
            )}
          </div>
        </div>
      )}

      {/* Valor del inventario: solo owner/admin/manager */}
      {(user?.role === 'owner' || user?.role === 'admin' || user?.role === 'manager') && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg p-5 text-white">
            <div className="flex items-center gap-2 mb-2 opacity-80">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm">Valor Inventario (Costo)</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totalStockValueCost)}</p>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-700 rounded-lg p-5 text-white">
            <div className="flex items-center gap-2 mb-2 opacity-80">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm">Valor Inventario (Venta)</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totalStockValueSale)}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-lg p-5 text-white">
            <div className="flex items-center gap-2 mb-2 opacity-80">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm">Ganancia Potencial</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totalPotentialProfit)}</p>
          </div>
        </div>
      )}

      {/* Dos columnas: Alertas Stock + Últimas ventas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas de stock bajo */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Alertas de Stock
            </h3>
            <span className="text-sm text-gray-500">{stockAlerts.length} productos</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {stockAlerts.length === 0 ? (
              <div className="p-6 text-center text-gray-400">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Todo el stock está en orden</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {stockAlerts.slice(0, 10).map((alert) => (
                  <div key={alert.product_id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{alert.product_name}</p>
                      <p className="text-xs text-gray-500">{alert.branch_name}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <div className="text-right">
                        <p className={`text-sm font-bold ${alert.stock_quantity === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                          {alert.stock_quantity}
                        </p>
                        <p className="text-xs text-gray-400">min: {alert.stock_min}</p>
                      </div>
                      {alert.stock_quantity === 0 ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">Agotado</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">Bajo</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Últimas ventas */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-500" />
              Últimas Ventas
            </h3>
            <span className="text-sm text-gray-500">{sales.length} total</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {recentSales.length === 0 ? (
              <div className="p-6 text-center text-gray-400">
                <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sin ventas registradas</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-900">{formatCurrency(sale.total)}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(sale.created_at).toLocaleDateString('es-AR', {
                          timeZone: 'America/Argentina/Buenos_Aires',
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500">
                        {sale.items.length} producto{sale.items.length !== 1 ? 's' : ''} · {sale.payment_method}
                      </p>
                      <p className="text-xs text-gray-400">{sale.branch_name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Información del Plan</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Plan Actual:</span>
              <span className="font-medium uppercase">{organization?.plan}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Estado:</span>
              <span className={`font-medium ${
                organization?.subscription_status === 'active'
                  ? 'text-green-600'
                  : 'text-yellow-600'
              }`}>
                {organization?.subscription_status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Límite Sucursales:</span>
              <span className="font-medium">{organization?.max_branches}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Límite Productos:</span>
              <span className="font-medium">{organization?.max_products_per_branch}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Información del Sistema</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Sucursales activas:</span>
              <span className="font-medium">{branches.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total productos:</span>
              <span className="font-medium">{totalProducts}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Unidades en stock:</span>
              <span className="font-medium">{totalStock}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
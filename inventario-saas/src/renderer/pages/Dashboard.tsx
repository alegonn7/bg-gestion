import { useAuthStore } from '@/store/auth'
import { useScannerStore } from '@/store/scanner'
import { Package, LayoutDashboard, Building2, Users, Settings, LogOut, BarChart3, BookOpen, CreditCard, Receipt, Scan } from 'lucide-react'
import { useState, useEffect } from 'react'
import Products from './Products'
import MasterCatalog from './MasterCatalog'
import Branches from './Branches'
import UsersPage from './Users'
import Reports from './Reports'
import POS from './POS'
import SalesHistory from './SalesHistory'
import ScannerPage from './ScannerPage'

type Page = 'dashboard' | 'products' | 'master-catalog' | 'branches' | 'users' | 'reports' | 'pos' | 'sales-history' | 'scanner' | 'settings'

export default function Dashboard() {
  const { user, organization, logout } = useAuthStore()
  const { startListening, stopListening, unviewedCount } = useScannerStore()
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')

  // Iniciar listener de scanner al montar el Dashboard
  useEffect(() => {
    startListening()
    return () => stopListening()
  }, [])

  const menuItems = [
    { id: 'dashboard' as Page, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pos' as Page, label: 'Punto de Venta', icon: CreditCard, roles: ['owner', 'admin', 'manager', 'employee'] },
    { id: 'sales-history' as Page, label: 'Historial de Ventas', icon: Receipt, roles: ['owner', 'admin', 'manager', 'employee'] },
    { id: 'scanner' as Page, label: 'Escaneados', icon: Scan, roles: ['owner', 'admin', 'manager', 'employee'], badge: true },
    { id: 'products' as Page, label: 'Productos', icon: Package },
    { id: 'master-catalog' as Page, label: 'Catálogo Maestro', icon: BookOpen, roles: ['owner', 'admin'] },
    { id: 'branches' as Page, label: 'Sucursales', icon: Building2, roles: ['owner', 'admin'] },
    { id: 'users' as Page, label: 'Usuarios', icon: Users, roles: ['owner', 'admin'] },
    { id: 'reports' as Page, label: 'Reportes', icon: BarChart3 },
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
      case 'reports':
        return <Reports />
      case 'pos':
        return <POS />
      case 'sales-history':
        return <SalesHistory />
      case 'scanner':
        return <ScannerPage />
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
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo/Brand */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-gray-900 truncate">
                {organization?.name}
              </h1>
              <p className="text-xs text-gray-500 uppercase">{organization?.plan}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {filteredMenu.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id
            const showBadge = item.badge && unviewedCount > 0

            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-700' : 'text-gray-400'}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {/* Badge de no vistos */}
                {showBadge && (
                  <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {unviewedCount > 99 ? '99+' : unviewedCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-gray-200">
          <div className="mb-3 px-2">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.full_name || user?.email}
            </p>
            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
          >
            <LogOut className="w-5 h-5" />
            <span>Cerrar Sesión</span>
          </button>
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
  const { user, organization } = useAuthStore()
  const { lastScan } = useScannerStore()

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Bienvenido, {user?.full_name || user?.email}
        </h2>
        <p className="text-gray-600">
          Resumen general de tu negocio
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Card 1 */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-2xl font-bold text-gray-900">0</span>
          </div>
          <h3 className="text-sm font-medium text-gray-600">Total Productos</h3>
        </div>

        {/* Card 2 */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-2xl font-bold text-gray-900">1</span>
          </div>
          <h3 className="text-sm font-medium text-gray-600">Sucursales</h3>
        </div>

        {/* Card 3 */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-2xl font-bold text-gray-900">1</span>
          </div>
          <h3 className="text-sm font-medium text-gray-600">Usuarios</h3>
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

        {/* Último escaneo en el dashboard */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Scan className="h-5 w-5 text-blue-600" />
            Último producto escaneado
          </h3>
          {lastScan ? (
            <div className="space-y-2">
              <p className="font-bold text-gray-900">
                {lastScan.product?.name || 'Producto no encontrado'}
              </p>
              <p className="text-sm text-gray-500 font-mono">{lastScan.barcode}</p>
              {lastScan.product && (
                <p className="text-lg font-bold text-blue-600">
                  {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(lastScan.product.price_sale)}
                </p>
              )}
              <p className="text-xs text-gray-400">
                {new Date(lastScan.created_at).toLocaleTimeString('es-AR', {
                  timeZone: 'America/Argentina/Buenos_Aires',
                  hour: '2-digit', minute: '2-digit'
                })}
              </p>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-400">
              <Scan className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Ningún escaneo aún</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
import { useEffect, useState } from 'react'
import { Download, Filter, Building2, DollarSign, FileText} from 'lucide-react'
import { useSalesStore } from '@/store/sales'
import { useBranchesStore } from '@/store/branches'
import { useAuthStore } from '@/store/auth'
import jsPDF from 'jspdf'

export default function SalesHistory() {
  const {
    sales,
    isLoading,
    selectedBranchId,
    searchQuery,
    fetchSales,
    setFilters,
    clearFilters
  } = useSalesStore()

  const { branches, fetchBranches } = useBranchesStore()
  const { user } = useAuthStore()

  const [showFilters, setShowFilters] = useState(false)
  const [localStartDate, setLocalStartDate] = useState('')
  const [localEndDate, setLocalEndDate] = useState('')
  const [localSearchQuery, setLocalSearchQuery] = useState('')

  const isOwnerOrAdmin = user?.role === 'owner' || user?.role === 'admin'

  useEffect(() => {
    fetchSales()
    if (isOwnerOrAdmin) {
      fetchBranches()
    }
  }, [])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(value)
  }

  // ✅ Fix timezone: fuerza America/Argentina/Buenos_Aires
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleApplyFilters = () => {
    setFilters({
      branchId: selectedBranchId,
      startDate: localStartDate ? new Date(localStartDate) : null,
      endDate: localEndDate ? new Date(localEndDate) : null,
      searchQuery: localSearchQuery
    })
    setShowFilters(false)
  }

  const handleClearFilters = () => {
    setLocalStartDate('')
    setLocalEndDate('')
    setLocalSearchQuery('')
    clearFilters()
  }

  const generatePDF = (sale: any) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, 200],
    })

    // ✅ Fix timezone en el PDF: convertir created_at de UTC a Argentina
    const saleDate = new Date(sale.created_at)
    const fechaVenta = saleDate.toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
    const horaVenta = saleDate.toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })

    // Header
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('COMPROBANTE DE VENTA', 40, 10, { align: 'center' })

    // Info del negocio
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Mi Negocio', 40, 18, { align: 'center' })
    doc.text(sale.branch_name, 40, 23, { align: 'center' })

    // Fecha y hora ✅ corregida
    doc.setFontSize(8)
    doc.text(`Fecha: ${fechaVenta}`, 5, 30)
    doc.text(`Hora: ${horaVenta}`, 5, 34)

    // Separador
    doc.line(5, 38, 75, 38)

    // Items header
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('PRODUCTOS', 5, 44)

    // Items
    let yPos = 50
    sale.items.forEach((item: any) => {
      doc.setFont('helvetica', 'normal')
      doc.text(`${item.product_name}`, 5, yPos)
      doc.text(`${item.quantity} x ${formatCurrency(item.price)}`, 5, yPos + 4, { align: 'left' })
      doc.text(formatCurrency(item.subtotal), 75, yPos + 4, { align: 'right' })
      yPos += 10
    })

    // Separador
    doc.line(5, yPos, 75, yPos)
    yPos += 5

    // Subtotal
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('Subtotal:', 5, yPos)
    doc.text(formatCurrency(sale.subtotal), 75, yPos, { align: 'right' })
    yPos += 5

    // Descuento (si hay)
    if (sale.discount > 0) {
      doc.text('Descuento:', 5, yPos)
      doc.text(`-${formatCurrency(sale.discount)}`, 75, yPos, { align: 'right' })
      yPos += 5
    }

    // Línea antes del total
    doc.line(5, yPos, 75, yPos)
    yPos += 5

    // Total
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('TOTAL:', 5, yPos)
    doc.text(formatCurrency(sale.total), 75, yPos, { align: 'right' })
    yPos += 8

    // Método de pago
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Método de pago: ${sale.payment_method}`, 5, yPos)
    yPos += 6

    // Empleado
    if (sale.created_by_name) {
      doc.text(`Atendió: ${sale.created_by_name}`, 5, yPos)
      yPos += 6
    }

    // Footer
    doc.setFontSize(8)
    doc.text('¡Gracias por su compra!', 40, yPos, { align: 'center' })

    // Guardar
    doc.save(`venta-${sale.id.slice(0, 8)}-${Date.now()}.pdf`)
  }

  // Filtrar ventas por búsqueda
  const filteredSales = sales.filter(sale => {
    if (!searchQuery) return true
    
    const searchLower = searchQuery.toLowerCase()
    return (
      sale.branch_name.toLowerCase().includes(searchLower) ||
      sale.items.some(item => item.product_name.toLowerCase().includes(searchLower)) ||
      formatCurrency(sale.total).includes(searchLower)
    )
  })

  // Estadísticas
  const totalSales = filteredSales.length
  const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0)
  const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Historial de Ventas</h1>
            <p className="text-sm text-gray-500 mt-1">Consulta y descarga comprobantes de ventas realizadas</p>
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Filter className="h-5 w-5" />
            Filtros
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Ventas</p>
                <p className="text-2xl font-bold text-gray-900">{totalSales}</p>
              </div>
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Ingresos Totales</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Venta Promedio</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(averageSale)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white border-b px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {isOwnerOrAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sucursal
                </label>
                <select
                  value={selectedBranchId || ''}
                  onChange={(e) => setFilters({ branchId: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Todas las sucursales</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha Desde
              </label>
              <input
                type="date"
                value={localStartDate}
                onChange={(e) => setLocalStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha Hasta
              </label>
              <input
                type="date"
                value={localEndDate}
                onChange={(e) => setLocalEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buscar
              </label>
              <input
                type="text"
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                placeholder="Producto, sucursal..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleApplyFilters}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Aplicar Filtros
            </button>
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}

      {/* Sales List */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando ventas...</p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">No se encontraron ventas</p>
            <p className="text-sm text-gray-500 mt-1">Intenta ajustar los filtros</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSales.map((sale) => (
              <div key={sale.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                {/* Sale Header */}
                <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(sale.created_at)}
                      </p>
                      <p className="text-xs text-gray-500">
                        ID: {sale.id.slice(0, 8)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Building2 className="h-4 w-4" />
                      {sale.branch_name}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => generatePDF(sale)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                  >
                    <Download className="h-4 w-4" />
                    Descargar
                  </button>
                </div>

                {/* Sale Items */}
                <div className="p-4">
                  <div className="space-y-2 mb-4">
                    {sale.items.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <div className="flex-1">
                          <span className="font-medium">{item.product_name}</span>
                          <span className="text-gray-500 ml-2">
                            x{item.quantity} × {formatCurrency(item.price)}
                          </span>
                        </div>
                        <span className="font-medium">{formatCurrency(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal:</span>
                      <span>{formatCurrency(sale.subtotal)}</span>
                    </div>
                    {sale.discount > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Descuento:</span>
                        <span>-{formatCurrency(sale.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold pt-1 border-t">
                      <span>Total:</span>
                      <span className="text-blue-600">{formatCurrency(sale.total)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600 pt-2">
                      <span>Método de pago:</span>
                      <span className="font-medium">{sale.payment_method}</span>
                    </div>
                    {sale.created_by_name && (
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Atendió:</span>
                        <span>{sale.created_by_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
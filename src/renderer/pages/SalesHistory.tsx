
import { useEffect, useState } from 'react'
import { Download, Filter, Building2, DollarSign, FileText, XCircle, AlertTriangle } from 'lucide-react'
import { useSalesStore } from '@/store/sales'
import { fetchTransferAccountById } from '@/lib/fetch-transfer-account'
import { useBranchesStore } from '@/store/branches'
import { useAuthStore } from '@/store/auth'
import jsPDF from 'jspdf'
import { useUsersStore } from '@/store/users'
import { useFiscalStore } from '@/store/fiscal'
import FiscalInvoiceModal from '@/components/FiscalInvoiceModal'
import FiscalCreditNoteModal from '@/components/FiscalCreditNoteModal'
import FiscalDebitNoteModal from '@/components/FiscalDebitNoteModal'




export default function SalesHistory() {
  const {
    sales,
    isLoading,
    selectedBranchId,
    searchQuery,
    fetchSales,
    voidSale,
    setFilters,
    clearFilters
  } = useSalesStore()

  const { branches, fetchBranches } = useBranchesStore()
  const { user, selectedBranch, organization } = useAuthStore()
  const { users, fetchUsers } = useUsersStore()

  const [showFilters, setShowFilters] = useState(false)
  // Por defecto: mes actual
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const [localStartDate, setLocalStartDate] = useState(firstDay.toISOString().slice(0, 10))
  const [localEndDate, setLocalEndDate] = useState(lastDay.toISOString().slice(0, 10))
  const [localSearchQuery, setLocalSearchQuery] = useState('')
  const [voidConfirmId, setVoidConfirmId] = useState<string | null>(null)
  const [isVoiding, setIsVoiding] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [invoicingSale, setInvoicingSale] = useState<any | null>(null)
  const [creditNoteSale, setCreditNoteSale] = useState<any | null>(null)
  const [debitNoteSale, setDebitNoteSale] = useState<any | null>(null)

  const { config: fiscalConfig, comprobantes, fetchComprobantes, getComprobanteBySaleId } = useFiscalStore()

  const isOwnerOrAdmin = user?.role === 'owner' || user?.role === 'admin'
  const canVoidSale = user?.role === 'owner' || user?.role === 'manager'

  useEffect(() => {
    fetchSales()
    if (isOwnerOrAdmin) {
      fetchBranches()
      fetchUsers()
    }
    if (fiscalConfig?.fiscal_enabled) {
      fetchComprobantes(200)
    }
  }, [selectedBranch?.id, fiscalConfig?.fiscal_enabled])

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
      searchQuery: localSearchQuery,
      userId: selectedUserId || undefined
    })
    setShowFilters(false)
  }

  const handleClearFilters = () => {
    setLocalStartDate('')
    setLocalEndDate('')
    setLocalSearchQuery('')
    setSelectedUserId(null)
    clearFilters()
  }

  const handleVoidSale = async (saleId: string) => {
    setIsVoiding(true)
    const result = await voidSale(saleId)
    setIsVoiding(false)
    setVoidConfirmId(null)
    if (!result.success) {
      alert(result.error || 'Error al anular la venta')
    }
  }

  const generatePDF = async (sale: any) => {
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

    const companyName = organization?.name || 'Mi Negocio'
    let startY = 8

    // Logo de la empresa (si existe)
    if (organization?.logo_url) {
      try {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject()
          img.src = organization.logo_url!
        })
        const maxH = 18
        const maxW = 30
        const ratio = Math.min(maxW / img.width, maxH / img.height)
        const imgW = img.width * ratio
        const imgH = img.height * ratio
        const imgX = (80 - imgW) / 2
        doc.addImage(img, 'PNG', imgX, startY, imgW, imgH)
        startY += imgH + 5
      } catch {
        // Si falla la carga del logo, continuar sin él
      }
    }

    // Nombre de la empresa
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(companyName, 40, startY, { align: 'center' })
    startY += 5

    // Sucursal
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(sale.branch_name, 40, startY, { align: 'center' })
    startY += 6

    // Título del comprobante
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('COMPROBANTE DE VENTA', 40, startY, { align: 'center' })
    startY += 4

    // Leyenda: documento no fiscal
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.text('DOCUMENTO NO VALIDO COMO FACTURA', 40, startY, { align: 'center' })
    startY += 5

    // Fecha y hora
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`Fecha: ${fechaVenta}`, 5, startY)
    startY += 4
    doc.text(`Hora: ${horaVenta}`, 5, startY)
    startY += 4

    // Separador
    doc.line(5, startY, 75, startY)

    // Items header
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('PRODUCTOS', 5, startY + 6)

    // Items
    let yPos = startY + 12
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
    doc.text(`Metodo de pago: ${sale.payment_method}`, 5, yPos)
    yPos += 6

    // Empleado
    if (sale.created_by_name) {
      doc.text(`Atendio: ${sale.created_by_name}`, 5, yPos)
      yPos += 6
    }

    // Footer
    doc.setFontSize(8)
    doc.text('Gracias por su compra!', 40, yPos, { align: 'center' })
    yPos += 5
    doc.setFontSize(6)
    doc.setFont('helvetica', 'italic')
    doc.text('Este ticket no tiene validez fiscal. No constituye factura.', 40, yPos, { align: 'center' })
    yPos += 3
    doc.text('Segun Ley 11.683, RG AFIP 1415 y normativas vigentes.', 40, yPos, { align: 'center' })

    // Guardar
    doc.save(`venta-${sale.id.slice(0, 8)}-${Date.now()}.pdf`)
  }

  // Cargar nombre de cuenta de transferencia si corresponde
  useEffect(() => {
    (async () => {
      for (const sale of sales) {
        if (sale.transfer_account_id && !sale.transfer_account_name) {
          const acc = await fetchTransferAccountById(sale.transfer_account_id)
          if (acc && acc.nombre) {
            sale.transfer_account_name = acc.nombre + (acc.alias ? ` (${acc.alias})` : '')
          }
        }
      }
    })()
  }, [sales])

  // Filtrar ventas por búsqueda y por mes seleccionado
  const filteredSales = sales.filter((sale) => {
    // Filtrar por mes (estadísticas SIEMPRE mensuales)
    const saleDate = new Date(sale.created_at)
    const start = new Date(localStartDate)
    const end = new Date(localEndDate)
    if (saleDate < start || saleDate > end) return false
    if (!searchQuery) return true
    const searchLower = searchQuery.toLowerCase()
    return (
      sale.branch_name.toLowerCase().includes(searchLower) ||
      sale.items.some((item) => item.product_name.toLowerCase().includes(searchLower)) ||
      formatCurrency(sale.total).includes(searchLower)
    )
  })

  // Paginación
  const PAGE_SIZE = 15
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.ceil(filteredSales.length / PAGE_SIZE)
  const paginatedSales = filteredSales.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Estadísticas (excluir anuladas, solo del mes)
  const activeSales = filteredSales.filter((s) => s.status !== 'voided')
  const totalSales = activeSales.length
  const totalRevenue = activeSales.reduce((sum, sale) => sum + sale.total, 0)
  const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0
  const voidedCount = filteredSales.filter((s) => s.status === 'voided').length

  // Resetear página al cambiar filtros o fechas
  useEffect(() => {
    setCurrentPage(1)
  }, [localStartDate, localEndDate, searchQuery, selectedBranchId, selectedUserId])

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
        <div className="mb-2">
          <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded">Estadísticas del mes seleccionado</span>
        </div>
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
                Vendedor
              </label>
              <select
                value={selectedUserId || ''}
                onChange={e => setSelectedUserId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todos</option>
                {users.filter(u => u.is_active).map(user => (
                  <option key={user.id} value={user.id}>{user.full_name || user.email}</option>
                ))}
              </select>
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
        {/* Paginación arriba */}
        {totalPages > 1 && (
          <div className="flex justify-end mb-4 gap-2">
            <button
              className="px-3 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-50"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >Anterior</button>
            <span className="px-2 py-1 text-sm text-gray-600">Página {currentPage} de {totalPages}</span>
            <button
              className="px-3 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-50"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >Siguiente</button>
          </div>
        )}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando ventas...</p>
          </div>
        ) : paginatedSales.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">No se encontraron ventas</p>
            <p className="text-sm text-gray-500 mt-1">Intenta ajustar los filtros</p>
          </div>
        ) : (
          <div className="space-y-4">
            {paginatedSales.map((sale) => {
              const isVoided = sale.status === 'voided';
              return (
                <div key={sale.id} className={`bg-white rounded-lg shadow-sm border overflow-hidden ${isVoided ? 'border-red-200 opacity-70' : 'border-gray-200'}`}>
                  {/* Sale Header */}
                  <div className={`px-4 py-3 border-b flex items-center justify-between ${isVoided ? 'bg-red-50' : 'bg-gray-50'}`}>
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
                      {isVoided && (
                        <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          ANULADA
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isVoided && canVoidSale && (
                        <>
                          {voidConfirmId === sale.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-600 font-medium">¿Anular?</span>
                              <button
                                onClick={() => handleVoidSale(sale.id)}
                                disabled={isVoiding}
                                className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                              >
                                {isVoiding ? 'Anulando...' : 'Confirmar'}
                              </button>
                              <button
                                onClick={() => setVoidConfirmId(null)}
                                className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-300"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setVoidConfirmId(sale.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-sm rounded-lg hover:bg-red-100 border border-red-200"
                            >
                              <XCircle className="h-4 w-4" />
                              Anular
                            </button>
                          )}
                        </>
                      )}
                      {fiscalConfig?.fiscal_enabled && !isVoided && (
                        <button
                          onClick={() => setInvoicingSale(sale)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
                        >
                          <FileText className="h-4 w-4" />
                          Factura
                        </button>
                      )}
                      {fiscalConfig?.fiscal_enabled && (() => {
                        const cbte = getComprobanteBySaleId(sale.id)
                        if (!cbte) return null
                        return (<>
                          {isVoided && (
                            <button
                              onClick={() => setCreditNoteSale({ sale, comprobante: cbte })}
                              className="flex items-center gap-2 px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700"
                            >
                              <FileText className="h-4 w-4" />
                              NC
                            </button>
                          )}
                          {!isVoided && (
                            <button
                              onClick={() => setDebitNoteSale({ sale, comprobante: cbte })}
                              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                            >
                              <FileText className="h-4 w-4" />
                              ND
                            </button>
                          )}
                        </>)
                      })()}
                      <button
                        onClick={() => generatePDF(sale)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                      >
                        <Download className="h-4 w-4" />
                        Descargar
                      </button>
                    </div>
                  </div>
                  {/* Sale Items */}
                  <div className="p-4">
                    <div className="space-y-2 mb-4">
                      {sale.items.map((item, index: number) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <div className="flex-1">
                            <span className={`font-medium ${isVoided ? 'line-through text-gray-400' : ''}`}>{item.product_name}</span>
                            <span className="text-gray-500 ml-2">
                              x{item.quantity} × {formatCurrency(item.price)}
                            </span>
                          </div>
                          <span className={`font-medium ${isVoided ? 'line-through text-gray-400' : ''}`}>{formatCurrency(item.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Subtotal:</span>
                        <span className={isVoided ? 'line-through text-gray-400' : ''}>{formatCurrency(sale.subtotal)}</span>
                      </div>
                      {sale.discount > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Descuento:</span>
                          <span>-{formatCurrency(sale.discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-lg font-bold pt-1 border-t">
                        <span>Total:</span>
                        <span className={isVoided ? 'text-red-400 line-through' : 'text-blue-600'}>{formatCurrency(sale.total)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-600 pt-2">
                        <span>Método de pago:</span>
                        <span className="font-medium">{sale.payment_method}</span>
                      </div>
                      {sale.payment_method.toLowerCase().includes('transfer') && sale.transfer_account_name && (
                        <div className="flex justify-between text-sm text-blue-700">
                          <span>Cuenta destino:</span>
                          <span>{sale.transfer_account_name}</span>
                        </div>
                      )}
                      {sale.created_by_name && (
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>Atendió:</span>
                          <span>{sale.created_by_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Paginación abajo */}
        {totalPages > 1 && (
          <div className="flex justify-end mt-6 gap-2">
            <button
              className="px-3 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-50"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >Anterior</button>
            <span className="px-2 py-1 text-sm text-gray-600">Página {currentPage} de {totalPages}</span>
            <button
              className="px-3 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-50"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >Siguiente</button>
          </div>
        )}
      </div>

      {invoicingSale && (
        <FiscalInvoiceModal
          sale={invoicingSale}
          onClose={() => setInvoicingSale(null)}
        />
      )}
      {creditNoteSale && (
        <FiscalCreditNoteModal
          comprobante={creditNoteSale.comprobante}
          saleItems={creditNoteSale.sale.items}
          onClose={() => setCreditNoteSale(null)}
        />
      )}
      {debitNoteSale && (
        <FiscalDebitNoteModal
          comprobante={debitNoteSale.comprobante}
          saleId={debitNoteSale.sale.id}
          onClose={() => setDebitNoteSale(null)}
        />
      )}
    </div>
  )
}
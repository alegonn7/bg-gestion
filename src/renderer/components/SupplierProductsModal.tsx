import { useEffect, useMemo, useState } from 'react'
import { X, Download, Loader2, Search, Package, ChevronLeft, ChevronRight } from 'lucide-react'
import { exportProductsToExcel } from '@/lib/excelExport'
import type { Product } from '@/store/products'

interface SupplierProductsModalProps {
  isOpen: boolean
  onClose: () => void
  supplierName: string
  products: Product[]
}

const PAGE_SIZE = 15

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(value)

export default function SupplierProductsModal({ isOpen, onClose, supplierName, products }: SupplierProductsModalProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  // Si hay productos de varias sucursales, se muestra de cuál es cada uno
  const multipleBranches = useMemo(() => new Set(products.map(p => p.branch_id)).size > 1, [products])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = term
      ? products.filter(p =>
          (p.product?.name || '').toLowerCase().includes(term) ||
          (p.barcode || '').toLowerCase().includes(term) ||
          (p.product?.sku || '').toLowerCase().includes(term))
      : products
    return [...list].sort((a, b) => (a.product?.name || '').localeCompare(b.product?.name || '', 'es', { numeric: true }))
  }, [products, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(currentPage, totalPages)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Al buscar, volver a la primera página
  useEffect(() => { setCurrentPage(1) }, [search])

  // Al abrir otro proveedor, arrancar limpio
  useEffect(() => {
    if (isOpen) { setSearch(''); setCurrentPage(1) }
  }, [isOpen, supplierName])

  if (!isOpen) return null

  const handleExport = async () => {
    if (isExporting) return
    setIsExporting(true)
    try {
      await exportProductsToExcel(products, {
        contextLabel: `Proveedor: ${supplierName}`,
        fileBaseName: `productos_${supplierName}`,
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Encabezado */}
        <div className="p-4 md:p-6 border-b border-gray-200 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900 break-words">Productos de {supplierName}</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {products.length === 1 ? '1 producto' : `${products.length} productos`}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition flex-shrink-0" aria-label="Cerrar">
              <X className="w-6 h-6" />
            </button>
          </div>

          {products.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, código o SKU"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium"
                title="Exportar productos a Excel, con una hoja por categoría"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isExporting ? 'Exportando...' : 'Exportar Excel'}
              </button>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {products.length === 0 ? (
            <div className="p-6 text-center text-gray-500">Este proveedor no tiene productos asociados.</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No hay productos que coincidan con la búsqueda.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {paginated.map(product => {
                const lowStock = product.stock_quantity < product.stock_min
                return (
                  <li key={product.id} className="px-4 md:px-6 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 bg-gray-100 rounded-lg items-center justify-center flex-shrink-0 hidden sm:flex">
                      <Package className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 break-words">{product.product?.name || 'Sin nombre'}</div>
                      <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {product.barcode && <span className="font-mono break-all">{product.barcode}</span>}
                        {multipleBranches && product.branch && <span>{product.branch.name}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-semibold text-gray-900 text-sm">{formatCurrency(product.price_sale)}</div>
                      <div className={`text-xs ${lowStock ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        Stock: {product.stock_quantity}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Paginación */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-3 border-t border-gray-200">
            <button
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm disabled:opacity-50"
              onClick={() => setCurrentPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <span className="text-sm text-gray-600 whitespace-nowrap">Página {page} de {totalPages}</span>
            <button
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm disabled:opacity-50"
              onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

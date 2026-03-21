import { useEffect, useState, useRef, useCallback } from 'react'
import { Plus, Search, Package, AlertTriangle, RefreshCw, Tag, X, Download, Upload, FileText, Loader2, CheckCircle, XCircle, Percent } from 'lucide-react'
import { useProductsStore, type Product } from '@/store/products'
import { useSuppliersStore } from '@/store/suppliers'
import { useCategoriesStore } from '@/store/categories'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useDollarStore } from '@/store/dollar'
import { exportProductsToCSV, parseCSV, importProductsFromCSV, type ImportResult } from '@/lib/csv'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { playScanSuccess, playScanError } from '@/lib/scan-sound'
import ProductCard from '@/components/ProductCard'
import ProductDetailModal from '@/components/ProductDetailModal'
import CreateProductModal from '@/components/CreateProductModal'
import EditProductModal from '@/components/EditProductModal'
import InventoryMovementModal from '@/components/InventoryMovementModal'
import MovementHistoryModal from '@/components/MovementHistoryModal'
import ManageCategoriesModal from '@/components/ManageCategoriesModal'
import BulkPriceUpdateModal from '@/components/BulkPriceUpdateModal'

export default function Products() {
  const { isLoading, error, searchQuery, fetchProducts, setSearchQuery, getFilteredProducts, deleteProduct } = useProductsStore()
  const { categories, fetchCategories } = useCategoriesStore()
  const { suppliers, fetchSuppliers } = useSuppliersStore()

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isMovementOpen, setIsMovementOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false)
  const [isBulkPriceOpen, setIsBulkPriceOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ product: Product; inputValue: string } | null>(null)

  // Duplicar producto
  const [duplicateData, setDuplicateData] = useState<any | null>(null)

  const { selectedBranch } = useAuthStore()
  const { fetchBlueRate } = useDollarStore()

  // CSV Import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null)
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

  // Escáner físico: busca producto o abre modal de creación
  const handleBarcodeScan = useCallback((barcode: string) => {
    const allProducts = getFilteredProducts()
    const product = allProducts.find(p => p.barcode === barcode)
    if (product) {
      setSelectedProduct(product)
      setIsDetailOpen(true)
      setScanFeedback({ type: 'success', message: `✓ ${product.product?.name || barcode}` })
      playScanSuccess()
    } else {
      setScannedBarcode(barcode)
      setIsCreateOpen(true)
      setScanFeedback({ type: 'info', message: `Producto no encontrado, creando con código: ${barcode}` })
      playScanError()
    }
  }, [getFilteredProducts])

  useBarcodeScanner(handleBarcodeScan)

  useEffect(() => {
    fetchProducts()
    fetchCategories()
    fetchSuppliers()
    fetchBlueRate()
  }, [fetchProducts, selectedBranch?.id])

  // ✅ Ahora category_id viene de product.product.category_id
  let filteredProducts = getFilteredProducts()
  if (selectedCategory) {
    filteredProducts = filteredProducts.filter(p => p.product?.category_id === selectedCategory)
  }
  if (selectedSupplier) {
    filteredProducts = filteredProducts.filter(p => p.product?.supplier_id === selectedSupplier)
  }

  // Paginación
  const PAGE_SIZE = 15
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE)
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Resetear página al cambiar filtros
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedCategory, selectedSupplier, getFilteredProducts])

  const lowStockCount = filteredProducts.filter(p => p.stock_quantity <= p.stock_min).length

  // ✅ nombre del producto viene de product.product.name
  const getProductName = (product: Product) => product.product?.name || ''

  const handleProductClick = (product: Product) => { setSelectedProduct(product); setIsDetailOpen(true) }
  const handleEdit = () => { setIsDetailOpen(false); setIsEditOpen(true) }
  const handleMovement = () => { setIsDetailOpen(false); setIsMovementOpen(true) }
  const handleViewHistory = () => { setIsDetailOpen(false); setIsHistoryOpen(true) }
  const handleDuplicate = () => {
    if (!selectedProduct) return
    setDuplicateData({
      name: selectedProduct.product?.name || '',
      description: selectedProduct.product?.description || '',
      category_id: selectedProduct.product?.category_id || '',
      price_cost: selectedProduct.price_cost,
      price_sale: selectedProduct.price_sale,
      price_cost_usd: selectedProduct.price_cost_usd,
      price_sale_usd: selectedProduct.price_sale_usd,
      stock_min: selectedProduct.stock_min,
    })
    setIsDetailOpen(false)
    setIsCreateOpen(true)
  }
  const handleDeleteRequest = () => {
    if (!selectedProduct) return
    setIsDetailOpen(false)
    setDeleteConfirm({ product: selectedProduct, inputValue: '' })
  }
  const handleDeleteConfirm = async () => {
    // ✅ nombre viene de product.product.name
    if (!deleteConfirm || deleteConfirm.inputValue !== getProductName(deleteConfirm.product)) return
    await deleteProduct(deleteConfirm.product.id)
    setDeleteConfirm(null)
    setSelectedProduct(null)
  }

  const handleCategoriesClose = () => {
    setIsCategoriesOpen(false)
    fetchProducts()
    fetchCategories()
  }

  const handleCreateClose = () => {
    setIsCreateOpen(false)
    setDuplicateData(null)
    setScannedBarcode(null)
  }

  // Auto-ocultar feedback del escáner
  useEffect(() => {
    if (scanFeedback) {
      const timer = setTimeout(() => setScanFeedback(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [scanFeedback])

  // CSV Export
  const handleExport = () => {
    const products = filteredProducts
    if (products.length === 0) return
    exportProductsToCSV(products, selectedBranch?.name)
  }

  // CSV Import
  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset
    e.target.value = ''
    setIsImporting(true)
    setImportProgress(null)
    setImportResult(null)

    try {
      const text = await file.text()
      const rows = parseCSV(text)

      if (rows.length === 0) {
        setImportResult({
          total: 0,
          imported: 0,
          skipped: 0,
          errors: [{ row: 0, name: '', error: 'El archivo esta vacio o no tiene el formato correcto' }],
        })
        setIsImporting(false)
      }

      const result = await importProductsFromCSV(rows, (current, total) => {
        setImportProgress({ current, total })
      })

      setImportResult(result)
      // Refrescar lista de productos
      await fetchProducts()
    } catch (err: any) {
      setImportResult({
        total: 0,
        imported: 0,
        skipped: 0,
        errors: [{ row: 0, name: '', error: err.message || 'Error al procesar el archivo' }],
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Feedback del escáner */}
      {scanFeedback && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
          scanFeedback.type === 'success' ? 'bg-green-600' : scanFeedback.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          {scanFeedback.message}
        </div>
      )}

      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
              <p className="text-sm text-gray-500 mt-1">
                {filteredProducts.length} productos
                {lowStockCount > 0 && <span className="ml-2 text-red-600 font-medium">· {lowStockCount} con stock bajo</span>}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setIsCategoriesOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg transition font-medium"
              >
                <Tag className="w-5 h-5" /> Categorías
              </button>

              {/* CSV Export */}
              <button
                onClick={handleExport}
                disabled={filteredProducts.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition font-medium"
                title="Exportar productos a CSV"
              >
                <Download className="w-5 h-5" /> Exportar
              </button>

              {/* Bulk Price Update */}
              <button
                onClick={() => setIsBulkPriceOpen(true)}
                disabled={filteredProducts.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition font-medium"
                title="Actualizar precios masivamente"
              >
                <Percent className="w-5 h-5" /> Precios
              </button>

              {/* CSV Import */}
              <button
                onClick={handleImportClick}
                disabled={isImporting}
                className="flex items-center gap-2 px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 disabled:opacity-50 rounded-lg transition font-medium"
                title="Importar productos desde CSV"
              >
                {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                {isImporting ? 'Importando...' : 'Importar'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelected}
                className="hidden"
              />

              <button
                onClick={() => fetchProducts()}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                <RefreshCw className="w-5 h-5" />
              </button>

              <button
                onClick={() => setIsCreateOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
              >
                <Plus className="w-5 h-5" /> Nuevo Producto
              </button>
            </div>
          </div>


          <div className="flex gap-3 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, código de barras..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none min-w-[180px]"
              value={selectedSupplier || ''}
              onChange={e => setSelectedSupplier(e.target.value || null)}
            >
              <option value="">Todos los proveedores</option>
              {suppliers.map(sup => (
                <option key={sup.id} value={sup.id}>{sup.name}</option>
              ))}
            </select>
          </div>

          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  selectedCategory === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todas
              </button>
              {categories.map(category => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                    selectedCategory === category.id ? 'text-white' : 'hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: selectedCategory === category.id ? category.color : category.color + '20',
                    color: selectedCategory === category.id ? 'white' : category.color
                  }}
                >
                  <Tag className="w-4 h-4" />
                  {category.name}
                  {selectedCategory === category.id && <X className="w-3 h-3" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /><span>{error}</span>
          </div>
        )}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        )}
        {!isLoading && filteredProducts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchQuery || selectedCategory ? 'Sin resultados' : 'No hay productos aún'}
            </h3>
            <p className="text-gray-500 mb-6 max-w-sm">
              {searchQuery || selectedCategory ? 'Intenta con otro filtro o búsqueda' : 'Creá tu primer producto'}
            </p>
            {!searchQuery && !selectedCategory && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
              >
                <Plus className="w-5 h-5" />Crear primer producto
              </button>
            )}
          </div>
        )}
        {/* Controles de paginación arriba */}
        {!isLoading && totalPages > 1 && (
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
        {!isLoading && filteredProducts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedProducts.map(product => (
              <ProductCard key={product.id} product={product} onClick={() => handleProductClick(product)} />
            ))}
          </div>
        )}
        {/* Controles de paginación abajo */}
        {!isLoading && totalPages > 1 && (
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

      <ProductDetailModal
        product={selectedProduct} isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)} onEdit={handleEdit}
        onDelete={handleDeleteRequest} onMovement={handleMovement}
        onViewHistory={handleViewHistory}
        onDuplicate={handleDuplicate}
      />

      <CreateProductModal
        isOpen={isCreateOpen}
        onClose={handleCreateClose}
        initialBarcode={scannedBarcode || undefined}
        duplicateFrom={duplicateData || undefined}
      />

      <EditProductModal
        product={selectedProduct} isOpen={isEditOpen}
        onClose={() => { setIsEditOpen(false); setIsDetailOpen(true) }}
      />
      <InventoryMovementModal
        product={selectedProduct} isOpen={isMovementOpen}
        onClose={() => { setIsMovementOpen(false); setIsDetailOpen(true) }}
      />
      <MovementHistoryModal
        product={selectedProduct} isOpen={isHistoryOpen}
        onClose={() => { setIsHistoryOpen(false); setIsDetailOpen(true) }}
      />
      <ManageCategoriesModal isOpen={isCategoriesOpen} onClose={handleCategoriesClose} />

      <BulkPriceUpdateModal
        isOpen={isBulkPriceOpen}
        onClose={() => setIsBulkPriceOpen(false)}
        products={filteredProducts}
        categories={categories}
        onComplete={() => fetchProducts()}
      />

      {/* Import Progress */}
      {isImporting && importProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              <h3 className="text-lg font-bold text-gray-900">Importando productos...</h3>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all"
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 text-center">
              {importProgress.current} de {importProgress.total}
            </p>
          </div>
        </div>
      )}

      {/* Import Result */}
      {importResult && !isImporting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Resultado de importacion
            </h3>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{importResult.total}</p>
                <p className="text-xs text-blue-600">Total filas</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{importResult.imported}</p>
                <p className="text-xs text-green-600">Importados</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{importResult.skipped}</p>
                <p className="text-xs text-red-600">Omitidos</p>
              </div>
            </div>

            {importResult.imported > 0 && (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg mb-3">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">{importResult.imported} productos importados correctamente</span>
              </div>
            )}

            {importResult.errors.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Errores ({importResult.errors.length}):</p>
                <div className="max-h-48 overflow-y-auto border border-red-200 rounded-lg">
                  {importResult.errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm border-b border-red-100 last:border-b-0">
                      <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        {err.row > 0 && <span className="text-gray-500">Fila {err.row}</span>}
                        {err.name && <span className="text-gray-700 font-medium"> {err.name}</span>}
                        <span className="text-red-600"> — {err.error}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setImportResult(null)}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Eliminar producto</h3>
            <p className="text-gray-600 mb-4">Para confirmar, escribí el nombre exacto:</p>
            {/* ✅ nombre viene de product.product.name */}
            <p className="font-mono font-semibold text-gray-900 bg-gray-100 px-3 py-2 rounded mb-4">
              {getProductName(deleteConfirm.product)}
            </p>
            <input
              type="text" placeholder="Escribí el nombre..."
              value={deleteConfirm.inputValue}
              onChange={(e) => setDeleteConfirm(prev => prev ? { ...prev, inputValue: e.target.value } : null)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteConfirm(null); setIsDetailOpen(true) }}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteConfirm.inputValue !== getProductName(deleteConfirm.product)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg transition"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
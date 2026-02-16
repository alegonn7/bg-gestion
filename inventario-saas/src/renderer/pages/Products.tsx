import { useEffect, useState } from 'react'
import { Plus, Search, Package, AlertTriangle, RefreshCw, Tag, X, Scan } from 'lucide-react'
import { useProductsStore, type Product } from '@/store/products'
import { useCategoriesStore } from '@/store/categories'
import { useScannerStore } from '@/store/scanner'
import ProductCard from '@/components/ProductCard'
import ProductDetailModal from '@/components/ProductDetailModal'
import CreateProductModal from '@/components/CreateProductModal'
import EditProductModal from '@/components/EditProductModal'
import InventoryMovementModal from '@/components/InventoryMovementModal'
import MovementHistoryModal from '@/components/MovementHistoryModal'
import ManageCategoriesModal from '@/components/ManageCategoriesModal'

export default function Products() {
  const { isLoading, error, searchQuery, fetchProducts, setSearchQuery, getFilteredProducts, deleteProduct } = useProductsStore()
  const { categories, fetchCategories } = useCategoriesStore()
  const { lastScan } = useScannerStore()

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isMovementOpen, setIsMovementOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ product: Product; inputValue: string } | null>(null)

  // Scanner
  const [scannerMode, setScannerMode] = useState(false)
  const [lastProcessedScanId, setLastProcessedScanId] = useState<string | null>(null)
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null) // barcode prellenado para CreateProductModal

  useEffect(() => {
    fetchProducts()
    fetchCategories()
  }, [fetchProducts])

  // ✅ Escuchar escaneos desde la app cuando scannerMode está activo
  useEffect(() => {
    if (!scannerMode) return
    if (!lastScan) return
    if (lastScan.id === lastProcessedScanId) return

    setLastProcessedScanId(lastScan.id)

    const barcode = lastScan.barcode
    if (!barcode) return

    // Buscar si el producto ya existe
    const allProducts = getFilteredProducts()
    const existingProduct = allProducts.find(p => p.barcode === barcode)

    if (existingProduct) {
      // Producto ya existe → abrir detalle
      setSelectedProduct(existingProduct)
      setIsDetailOpen(true)
      setScannerMode(false)
    } else {
      // Producto no existe → abrir formulario de creación con código prellenado
      setScannedBarcode(barcode)
      setIsCreateOpen(true)
      setScannerMode(false)
    }
  }, [lastScan])

  const filteredProducts = selectedCategory
    ? getFilteredProducts().filter(p => p.category_id === selectedCategory)
    : getFilteredProducts()

  const lowStockCount = filteredProducts.filter(p => p.stock_quantity <= p.stock_min).length

  const handleProductClick = (product: Product) => { setSelectedProduct(product); setIsDetailOpen(true) }
  const handleEdit = () => { setIsDetailOpen(false); setIsEditOpen(true) }
  const handleMovement = () => { setIsDetailOpen(false); setIsMovementOpen(true) }
  const handleViewHistory = () => { setIsDetailOpen(false); setIsHistoryOpen(true) }
  const handleDeleteRequest = () => {
    if (!selectedProduct) return
    setIsDetailOpen(false)
    setDeleteConfirm({ product: selectedProduct, inputValue: '' })
  }
  const handleDeleteConfirm = async () => {
    if (!deleteConfirm || deleteConfirm.inputValue !== deleteConfirm.product.name) return
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
    setScannedBarcode(null) // limpiar barcode prellenado
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
              <button
                onClick={() => fetchProducts()}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                <RefreshCw className="w-5 h-5" />
              </button>

              {/* Botón scanner app */}
              <button
                onClick={() => setScannerMode(!scannerMode)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition font-medium ${
                  scannerMode
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                }`}
              >
                <Scan className={`w-5 h-5 ${scannerMode ? 'animate-pulse' : ''}`} />
                {scannerMode ? 'Esperando escaneo...' : 'Agregar con scanner'}
              </button>

              <button
                onClick={() => setIsCreateOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium"
              >
                <Plus className="w-5 h-5" /> Nuevo Producto
              </button>
            </div>
          </div>

          {/* Banner modo scanner activo */}
          {scannerMode && (
            <div className="mb-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700">
                <Scan className="h-5 w-5 animate-pulse" />
                <span className="font-medium">Listo para escanear</span>
                <span className="text-sm text-green-600">— Escaneá un producto desde la app móvil</span>
              </div>
              <button
                onClick={() => setScannerMode(false)}
                className="text-green-600 hover:text-green-800 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, código de barras..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category Filters */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  selectedCategory === null
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
        {!isLoading && filteredProducts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map(product => (
              <ProductCard key={product.id} product={product} onClick={() => handleProductClick(product)} />
            ))}
          </div>
        )}
      </div>

      <ProductDetailModal
        product={selectedProduct} isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)} onEdit={handleEdit}
        onDelete={handleDeleteRequest} onMovement={handleMovement}
        onViewHistory={handleViewHistory}
      />

      {/* CreateProductModal recibe el barcode prellenado si viene del scanner */}
      <CreateProductModal
        isOpen={isCreateOpen}
        onClose={handleCreateClose}
        initialBarcode={scannedBarcode || undefined}
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

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Eliminar producto</h3>
            <p className="text-gray-600 mb-4">Para confirmar, escribí el nombre exacto:</p>
            <p className="font-mono font-semibold text-gray-900 bg-gray-100 px-3 py-2 rounded mb-4">
              {deleteConfirm.product.name}
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
                disabled={deleteConfirm.inputValue !== deleteConfirm.product.name}
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
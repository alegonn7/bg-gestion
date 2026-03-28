import { useEffect, useState, useCallback } from 'react'
import { Search, Package, Store, RefreshCw, BarChart, Tag, X } from 'lucide-react'
import { useMasterCatalogStore } from '@/store/master-catalog'
import { useCategoriesStore } from '@/store/categories'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { playScanSuccess, playScanError } from '@/lib/scan-sound'
import MasterProductDetailModal from '../components/MasterProductDetailModal'
import type { MasterProduct } from '@/store/master-catalog'

export default function MasterCatalog() {
  const { 
    isLoading, 
    error, 
    searchQuery, 
    fetchMasterProducts, 
    setSearchQuery, 
    getFilteredProducts 
  } = useMasterCatalogStore()

  const { categories, fetchCategories } = useCategoriesStore()

  const [selectedProduct, setSelectedProduct] = useState<MasterProduct | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  // Paginación
  const PAGE_SIZE = 15
  const [currentPage, setCurrentPage] = useState(1)

  // Escáner físico: buscar producto por código de barras
  const handleBarcodeScan = useCallback((barcode: string) => {
    const allProducts = getFilteredProducts()
    const product = allProducts.find(p => p.barcode === barcode)
    if (product) {
      setSelectedProduct(product)
      setShowDetailModal(true)
      setScanFeedback({ type: 'success', message: `✓ ${product.name}` })
      playScanSuccess()
    } else {
      setScanFeedback({ type: 'error', message: `Producto no encontrado: ${barcode}` })
      playScanError()
    }
  }, [getFilteredProducts])

  useBarcodeScanner(handleBarcodeScan)

  useEffect(() => {
    fetchMasterProducts()
    fetchCategories()
  }, [])

  // Auto-ocultar feedback del escáner
  useEffect(() => {
    if (scanFeedback) {
      const timer = setTimeout(() => setScanFeedback(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [scanFeedback])

  // Filtrar productos primero por búsqueda y luego por categoría
  const baseFilteredProducts = getFilteredProducts()
  const filteredProducts = selectedCategory
    ? baseFilteredProducts.filter(p => p.categories.some(cat => {
        const category = categories.find(c => c.name === cat)
        return category?.id === selectedCategory
      }))
    : baseFilteredProducts

  // Resetear página al cambiar filtros
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedCategory])

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE)
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const handleRefresh = () => {
    fetchMasterProducts()
    fetchCategories()
  }

  const handleProductClick = (product: MasterProduct) => {
    setSelectedProduct(product)
    setShowDetailModal(true)
  }

  const handleCloseDetail = () => {
    setShowDetailModal(false)
    setSelectedProduct(null)
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Feedback del escáner */}
      {scanFeedback && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
          scanFeedback.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {scanFeedback.message}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Package className="w-7 h-7 text-blue-600" />
              Catálogo Maestro
            </h1>
            <p className="text-gray-600 mt-1">
              Vista consolidada de productos de todas las sucursales
            </p>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por nombre, código de barras o categoría..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>

        {/* Category Filters */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4">
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
                  selectedCategory === category.id
                    ? 'text-white'
                    : 'hover:opacity-80'
                }`}
                style={{
                  backgroundColor: selectedCategory === category.id ? category.color : category.color + '20',
                  color: selectedCategory === category.id ? 'white' : category.color
                }}
              >
                <Tag className="w-4 h-4" />
                {category.name}
                {selectedCategory === category.id && (
                  <X className="w-3 h-3" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Package className="w-4 h-4" />
              <span className="text-sm font-medium">Total Productos</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{filteredProducts.length}</p>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <BarChart className="w-4 h-4" />
              <span className="text-sm font-medium">Stock Total</span>
            </div>
            <p className="text-2xl font-bold text-green-900">
              {filteredProducts.reduce((sum, p) => sum + p.total_stock, 0)}
            </p>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-purple-600 mb-1">
              <Store className="w-4 h-4" />
              <span className="text-sm font-medium">Sucursales Activas</span>
            </div>
            <p className="text-2xl font-bold text-purple-900">
              {new Set(filteredProducts.flatMap(p => p.branches.map(b => b.branch_id))).size}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-gray-600">Cargando catálogo maestro...</p>
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchQuery || selectedCategory ? 'No se encontraron productos' : 'No hay productos'}
              </h3>
              <p className="text-gray-600">
                {searchQuery || selectedCategory
                  ? 'Intenta con otro término de búsqueda o filtro'
                  : 'Los productos creados en las sucursales aparecerán aquí automáticamente'
                }
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedProducts.map((product, idx) => (
                <ProductCard 
                  key={product.barcode || idx} 
                  product={product} 
                  onClick={() => handleProductClick(product)}
                />
              ))}
            </div>
            {/* Controles de paginación */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-6">
                <button
                  className="px-3 py-1 rounded bg-gray-200 text-gray-700 disabled:opacity-50"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </button>
                <span className="mx-2 text-sm">Página {currentPage} de {totalPages}</span>
                <button
                  className="px-3 py-1 rounded bg-gray-200 text-gray-700 disabled:opacity-50"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      <MasterProductDetailModal
        product={selectedProduct}
        isOpen={showDetailModal}
        onClose={handleCloseDetail}
      />
    </div>
  )
}

// Product Card Component
interface ProductCardProps {
  product: MasterProduct
  onClick: () => void
}

function ProductCard({ product, onClick }: ProductCardProps) {
  const hasLowStock = product.total_stock < 10

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition cursor-pointer p-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">
            {product.name}
          </h3>
          {product.barcode && (
            <p className="text-sm text-gray-500 font-mono mt-1">
              {product.barcode}
            </p>
          )}
        </div>
        
        {hasLowStock && (
          <span className="ml-2 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">
            Bajo Stock
          </span>
        )}
      </div>

      {/* Categories */}
      {product.categories.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {product.categories.map((cat, idx) => (
            <span 
              key={idx}
              className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs text-gray-500">Stock Total</p>
          <p className={`text-lg font-bold ${hasLowStock ? 'text-red-600' : 'text-gray-900'}`}>
            {product.total_stock}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Sucursales</p>
          <p className="text-lg font-bold text-gray-900 flex items-center gap-1">
            <Store className="w-4 h-4 text-blue-600" />
            {product.branches_count}
          </p>
        </div>
      </div>

      {/* Prices */}
      <div className="pt-3 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Precio prom.</span>
          <span className="font-semibold text-gray-900">
            ${product.avg_price_sale.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
          <span>Costo prom.</span>
          <span>${product.avg_price_cost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
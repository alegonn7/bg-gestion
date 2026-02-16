import { useState, useEffect, useRef } from 'react'
import { ShoppingCart, Search, Trash2, DollarSign, Hash, Scan } from 'lucide-react'
import { usePOSStore } from '@/store/pos'
import { useProductsStore } from '@/store/products'
import { useScannerStore } from '@/store/scanner'
import CheckoutModal from '@/components/CheckoutModal'

export default function POS() {
  const {
    items,
    discount,
    discountType,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    setDiscount,
    getSubtotal,
    getDiscountAmount,
    getTotal,
    getTotalItems
  } = usePOSStore()

  const { products, fetchProducts } = useProductsStore()
  const { lastScan } = useScannerStore()

  const [barcodeInput, setBarcodeInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCheckout, setShowCheckout] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [scannerMode, setScannerMode] = useState(false) // true = esperando escaneo desde app
  const [lastProcessedScanId, setLastProcessedScanId] = useState<string | null>(null)
  const [scanFeedback, setScanFeedback] = useState<{ message: string, type: 'success' | 'error' } | null>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchProducts()
  }, [])

  // Auto-focus barcode input
  useEffect(() => {
    barcodeRef.current?.focus()
  }, [items])

  // ✅ Escuchar escaneos desde la app móvil cuando scannerMode está activo
  useEffect(() => {
    if (!scannerMode) return
    if (!lastScan) return
    if (lastScan.id === lastProcessedScanId) return // evitar procesar el mismo escaneo dos veces

    setLastProcessedScanId(lastScan.id)

    const barcode = lastScan.barcode
    if (!barcode) return

    const product = products.find(p => p.barcode === barcode)

    if (product) {
      addToCart(product, 1)
      setScanFeedback({ message: `✅ ${product.name} agregado al carrito`, type: 'success' })
    } else {
      setScanFeedback({ message: `❌ Producto con código ${barcode} no encontrado`, type: 'error' })
    }

    // Limpiar feedback después de 3 segundos
    setTimeout(() => setScanFeedback(null), 3000)

  }, [lastScan])

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!barcodeInput.trim()) return

    const product = products.find(p => p.barcode === barcodeInput.trim())

    if (product) {
      addToCart(product, 1)
      setBarcodeInput('')
    } else {
      alert(`Producto con código ${barcodeInput} no encontrado`)
      setBarcodeInput('')
    }
  }

  const handleDiscountApply = () => {
    const value = parseFloat(discountInput) || 0
    setDiscount(value, discountType)
  }

  const filteredProducts = products.filter(p =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.barcode?.includes(searchQuery)
  ).slice(0, 12)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(value)
  }

  const subtotal = getSubtotal()
  const discountAmount = getDiscountAmount()
  const total = getTotal()
  const totalItems = getTotalItems()

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Punto de Venta</h1>
            <p className="text-sm text-gray-500 mt-1">Escanea o busca productos para agregar al carrito</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Botón modo scanner app */}
            <button
              onClick={() => {
                setScannerMode(!scannerMode)
                setScanFeedback(null)
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition font-medium ${
                scannerMode
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
              }`}
            >
              <Scan className="h-5 w-5" />
              {scannerMode ? 'Escuchando app...' : 'Usar scanner app'}
            </button>

            {/* Barcode manual Input */}
            <form onSubmit={handleBarcodeSubmit} className="flex items-center gap-3">
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  ref={barcodeRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Código de barras..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-56 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Buscar
              </button>
            </form>
          </div>
        </div>

        {/* Feedback del scanner */}
        {scannerMode && (
          <div className="mt-3">
            {scanFeedback ? (
              <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
                scanFeedback.type === 'success'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {scanFeedback.message}
              </div>
            ) : (
              <div className="px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                <Scan className="h-4 w-4 animate-pulse" />
                Listo para recibir escaneos desde la app móvil...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Products Grid */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar productos..."
                className="pl-10 pr-4 py-3 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Products */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product, 1)}
                className="bg-white p-4 rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition text-left"
              >
                <div className="flex flex-col h-full">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2">
                      {product.name}
                    </h3>
                    {product.barcode && (
                      <p className="text-xs text-gray-500 mb-2">{product.barcode}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-2 border-t">
                    <span className="text-lg font-bold text-blue-600">
                      {formatCurrency(product.price_sale)}
                    </span>
                    <span className="text-xs text-gray-500">
                      Stock: {product.stock_quantity}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Cart Sidebar */}
        <div className="w-96 bg-white border-l flex flex-col">
          {/* Cart Header */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Carrito ({totalItems})
              </h2>
              {items.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-red-600 hover:text-red-700 text-sm flex items-center gap-1"
                >
                  <Trash2 className="h-4 w-4" />
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {items.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p>Carrito vacío</p>
                <p className="text-sm mt-1">Escanea o selecciona productos</p>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.product.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{item.product.name}</h3>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(item.product.price_sale)} c/u
                      </p>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="w-7 h-7 bg-white border rounded hover:bg-gray-100"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="w-7 h-7 bg-white border rounded hover:bg-gray-100"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-bold">{formatCurrency(item.subtotal)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Footer */}
          {items.length > 0 && (
            <div className="border-t p-4 space-y-4">
              {/* Discount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descuento
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 flex gap-2">
                    <input
                      type="number"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      placeholder="0"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={discountType}
                      onChange={(e) => setDiscount(discount, e.target.value as any)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="amount">$</option>
                      <option value="percentage">%</option>
                    </select>
                  </div>
                  <button
                    onClick={handleDiscountApply}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm"
                  >
                    Aplicar
                  </button>
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm text-green-600">
                    <span>Descuento:</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex items-center justify-between">
                  <span className="font-bold text-lg">TOTAL:</span>
                  <span className="font-bold text-2xl text-blue-600">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              {/* Checkout Button */}
              <button
                onClick={() => setShowCheckout(true)}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-lg flex items-center justify-center gap-2"
              >
                <DollarSign className="h-6 w-6" />
                COBRAR
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Checkout Modal */}
      {showCheckout && (
        <CheckoutModal
          isOpen={showCheckout}
          onClose={() => setShowCheckout(false)}
          cartItems={items}
          cartTotal={total}
          cartSubtotal={subtotal}
          cartDiscount={discountAmount}
        />
      )}
    </div>
  )
}
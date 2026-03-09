import { useState, useEffect, useRef, useCallback } from 'react'
import { ShoppingCart, Search, Trash2, DollarSign, Hash } from 'lucide-react'
import { usePOSStore, getEffectivePrice } from '@/store/pos'
import { useProductsStore } from '@/store/products'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useDollarStore } from '@/store/dollar'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { playScanSuccess, playScanError } from '@/lib/scan-sound'
import CheckoutModal from '@/components/CheckoutModal'

export default function POS() {
  const {
    items,
    discount,
    discountType,
    priceMode,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    setDiscount,
    setPriceMode,
    getSubtotal,
    getDiscountAmount,
    getTotal,
    getTotalItems
  } = usePOSStore()

  const { products, fetchProducts } = useProductsStore()

  const [barcodeInput, setBarcodeInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCheckout, setShowCheckout] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const barcodeRef = useRef<HTMLInputElement>(null)
  const { selectedBranch } = useAuthStore()
  const { blueRate, fetchBlueRate } = useDollarStore()
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Escáner físico: captura cuando ningún input tiene foco
  const handleBarcodeScan = useCallback((barcode: string) => {
    const product = products.find(p => p.barcode === barcode)
    if (product) {
      addToCart(product, 1)
      setScanFeedback({ type: 'success', message: `✓ ${product.product?.name || barcode}` })
      playScanSuccess()
    } else {
      setScanFeedback({ type: 'error', message: `Producto no encontrado: ${barcode}` })
      playScanError()
    }
    // Re-enfocar el input de código de barras
    barcodeRef.current?.focus()
  }, [products, addToCart])

  useBarcodeScanner(handleBarcodeScan)

  useEffect(() => {
    fetchProducts()
    fetchBlueRate()
    clearCart() // Limpiar carrito al cambiar de sucursal
  }, [selectedBranch?.id])

  useEffect(() => {
    barcodeRef.current?.focus()
  }, [items])

  // Auto-ocultar feedback del escáner
  useEffect(() => {
    if (scanFeedback) {
      const timer = setTimeout(() => setScanFeedback(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [scanFeedback])

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!barcodeInput.trim()) return

    const product = products.find(p => p.barcode === barcodeInput.trim())

    if (product) {
      addToCart(product, 1)
      setBarcodeInput('')
      setScanFeedback({ type: 'success', message: `✓ ${product.product?.name || barcodeInput}` })
      playScanSuccess()
    } else {
      setScanFeedback({ type: 'error', message: `Producto no encontrado: ${barcodeInput}` })
      setBarcodeInput('')
      playScanError()
    }
  }

  const handleDiscountApply = () => {
    const value = parseFloat(discountInput) || 0
    setDiscount(value, discountType)
  }

  // Ahora name viene de product.product.name
  const filteredProducts = products.filter(p =>
    p.product?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
    <div className="h-screen flex flex-col bg-gray-50" onClick={(e) => {
      const target = e.target as HTMLElement
      if (target.tagName !== 'INPUT' && target.tagName !== 'BUTTON' && target.tagName !== 'TEXTAREA') {
        barcodeRef.current?.focus()
      }
    }}>
      {/* Feedback del escáner */}
      {scanFeedback && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${
          scanFeedback.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {scanFeedback.message}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Punto de Venta</h1>
            <p className="text-sm text-gray-500 mt-1">Escanea o busca productos para agregar al carrito</p>
          </div>

          <div className="flex items-center gap-3">
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
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Products Grid */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="mb-4 flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar productos..."
                className="pl-10 pr-4 py-3 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Selector de modo de precio */}
            <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
              <button
                onClick={() => setPriceMode('ars')}
                className={`px-3 py-2 rounded-md text-xs font-semibold transition whitespace-nowrap ${
                  priceMode === 'ars'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                $ Pesos
              </button>
              <button
                onClick={() => setPriceMode('usd')}
                className={`px-3 py-2 rounded-md text-xs font-semibold transition whitespace-nowrap ${
                  priceMode === 'usd'
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                US$ Dólar
              </button>
              <button
                onClick={() => setPriceMode('usd_to_ars')}
                className={`px-3 py-2 rounded-md text-xs font-semibold transition whitespace-nowrap ${
                  priceMode === 'usd_to_ars'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                USD→ARS
              </button>
            </div>
          </div>

          {/* Indicador del modo de precio activo */}
          {priceMode === 'usd' && (
            <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-green-700">
                Modo <strong>Dólar Venta</strong> — precios y total en US$
              </span>
            </div>
          )}
          {priceMode === 'usd_to_ars' && blueRate && (
            <div className="mb-4 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-600" />
              <span className="text-purple-700">
                Modo <strong>Conversión</strong> — USD × <strong>${blueRate.toLocaleString('es-AR')}</strong> (Blue) = ARS
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.map((product) => {
              const effectivePrice = getEffectivePrice(product, priceMode, blueRate)
              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product, 1)}
                  className="bg-white p-4 rounded-xl border border-gray-200 hover:border-blue-500 hover:shadow-lg transition text-left"
                >
                  <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1 text-sm">
                    {product.product?.name}
                  </h3>
                  {product.barcode && (
                    <p className="text-xs text-gray-400 font-mono mb-2">{product.barcode}</p>
                  )}
                  <div className="flex items-end justify-between pt-2 border-t border-gray-100">
                    <div>
                      <span className={`text-lg font-bold ${
                        priceMode === 'ars' ? 'text-blue-600' :
                        priceMode === 'usd' ? 'text-green-600' : 'text-purple-600'
                      }`}>
                        {priceMode === 'usd'
                          ? `US$ ${effectivePrice.toFixed(2)}`
                          : formatCurrency(effectivePrice)
                        }
                      </span>
                      {priceMode === 'usd' && (
                        <span className="block text-xs text-gray-400">
                          ARS: {formatCurrency(product.price_sale)}
                        </span>
                      )}
                      {priceMode === 'usd_to_ars' && product.price_sale_usd && (
                        <span className="block text-xs text-gray-400">
                          US$ {product.price_sale_usd.toFixed(2)} × blue
                        </span>
                      )}
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      product.stock_quantity <= product.stock_min
                        ? 'bg-red-50 text-red-600'
                        : 'bg-green-50 text-green-600'
                    }`}>
                      {product.stock_quantity}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Cart Sidebar */}
        <div className="w-96 bg-white border-l flex flex-col">
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

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {items.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p>Carrito vacío</p>
                <p className="text-sm mt-1">Escanea o selecciona productos</p>
              </div>
            ) : (
              items.map((item) => {
                const unitPrice = getEffectivePrice(item.product, priceMode, blueRate)
                return (
                <div key={item.product.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">
                        {item.product.product?.name}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {priceMode === 'usd'
                          ? `US$ ${unitPrice.toFixed(2)} c/u`
                          : `${formatCurrency(unitPrice)} c/u`
                        }
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
                    <span className="font-bold">
                      {priceMode === 'usd'
                        ? `US$ ${item.subtotal.toFixed(2)}`
                        : formatCurrency(item.subtotal)
                      }
                    </span>
                  </div>
                </div>
                )
              })
            )}
          </div>

          {items.length > 0 && (
            <div className="border-t p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Descuento</label>
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

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>{priceMode === 'usd' ? `US$ ${subtotal.toFixed(2)}` : formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm text-green-600">
                    <span>Descuento:</span>
                    <span>-{priceMode === 'usd' ? `US$ ${discountAmount.toFixed(2)}` : formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex items-center justify-between">
                  <span className="font-bold text-lg">TOTAL:</span>
                  <span className="font-bold text-2xl text-blue-600">
                    {priceMode === 'usd' ? `US$ ${total.toFixed(2)}` : formatCurrency(total)}
                  </span>
                </div>
              </div>

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

      {showCheckout && (
        <CheckoutModal
          isOpen={showCheckout}
          onClose={() => setShowCheckout(false)}
          cartItems={items}
          cartTotal={total}
          cartSubtotal={subtotal}
          cartDiscount={discountAmount}
          priceMode={priceMode}
        />
      )}
    </div>
  )
}
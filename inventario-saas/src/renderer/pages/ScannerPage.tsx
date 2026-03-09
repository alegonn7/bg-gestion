import { useState, useCallback } from 'react'
import { ScanLine, Package, AlertTriangle, DollarSign, Hash, Tag, Building2, TrendingUp, TrendingDown, Box } from 'lucide-react'
import { useProductsStore, type Product } from '@/store/products'
import { useDollarStore } from '@/store/dollar'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { playScanSuccess, playScanError } from '@/lib/scan-sound'

export default function ScannerPage() {
  const { products } = useProductsStore()
  const { blueRate } = useDollarStore()
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null)
  const [lastBarcode, setLastBarcode] = useState<string | null>(null)
  const [scanStatus, setScanStatus] = useState<'waiting' | 'found' | 'not-found'>('waiting')
  const [scanHistory, setScanHistory] = useState<{ barcode: string; name: string | null; time: Date }[]>([])

  const handleBarcodeScan = useCallback((barcode: string) => {
    setLastBarcode(barcode)
    const product = products.find(p => p.barcode === barcode)

    if (product) {
      setScannedProduct(product)
      setScanStatus('found')
      playScanSuccess()
      setScanHistory(prev => [
        { barcode, name: product.product?.name || barcode, time: new Date() },
        ...prev.slice(0, 19)
      ])
    } else {
      setScannedProduct(null)
      setScanStatus('not-found')
      playScanError()
      setScanHistory(prev => [
        { barcode, name: null, time: new Date() },
        ...prev.slice(0, 19)
      ])
    }
  }, [products])

  useBarcodeScanner(handleBarcodeScan)

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(value)

  const formatUSD = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value)

  const margin = scannedProduct
    ? ((scannedProduct.price_sale - scannedProduct.price_cost) / scannedProduct.price_cost * 100)
    : 0

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <ScanLine className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Escáner</h1>
            <p className="text-sm text-gray-500">Escaneá un producto para ver su información detallada</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Panel principal */}
        <div className="flex-1 p-6 overflow-y-auto">
          {scanStatus === 'waiting' && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ScanLine className="h-24 w-24 mb-6 animate-pulse" />
              <h2 className="text-2xl font-semibold mb-2">Esperando escaneo...</h2>
              <p className="text-gray-500">Usá el escáner físico para leer un código de barras</p>
            </div>
          )}

          {scanStatus === 'not-found' && (
            <div className="flex flex-col items-center justify-center h-full">
              <AlertTriangle className="h-20 w-20 text-amber-500 mb-6" />
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Producto no encontrado</h2>
              <p className="text-gray-500 mb-2">No se encontró ningún producto con el código:</p>
              <span className="font-mono text-xl bg-gray-100 px-4 py-2 rounded-lg">{lastBarcode}</span>
              <p className="text-sm text-gray-400 mt-6">Podés darlo de alta desde la sección de Productos</p>
            </div>
          )}

          {scanStatus === 'found' && scannedProduct && (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Nombre y código */}
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {scannedProduct.product?.name || 'Sin nombre'}
                    </h2>
                    {scannedProduct.product?.description && (
                      <p className="text-gray-500 mt-1">{scannedProduct.product.description}</p>
                    )}
                  </div>
                  {scannedProduct.stock_quantity <= scannedProduct.stock_min && (
                    <span className="flex items-center gap-1 bg-red-100 text-red-700 text-xs font-semibold px-3 py-1 rounded-full">
                      <AlertTriangle className="h-3 w-3" />
                      Stock bajo
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 mt-4">
                  {scannedProduct.barcode && (
                    <span className="flex items-center gap-1 bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-lg">
                      <Hash className="h-4 w-4" />
                      {scannedProduct.barcode}
                    </span>
                  )}
                  {scannedProduct.product?.sku && (
                    <span className="flex items-center gap-1 bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-lg">
                      <Tag className="h-4 w-4" />
                      SKU: {scannedProduct.product.sku}
                    </span>
                  )}
                  {scannedProduct.category && (
                    <span
                      className="text-sm px-3 py-1.5 rounded-lg font-medium"
                      style={{ backgroundColor: scannedProduct.category.color + '20', color: scannedProduct.category.color }}
                    >
                      {scannedProduct.category.name}
                    </span>
                  )}
                  {scannedProduct.branch && (
                    <span className="flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-3 py-1.5 rounded-lg">
                      <Building2 className="h-4 w-4" />
                      {scannedProduct.branch.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Precios */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <DollarSign className="h-4 w-4" />
                    Costo (ARS)
                  </div>
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(scannedProduct.price_cost)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <DollarSign className="h-4 w-4" />
                    Venta (ARS)
                  </div>
                  <p className="text-xl font-bold text-green-600">{formatCurrency(scannedProduct.price_sale)}</p>
                </div>
                {scannedProduct.price_cost_usd != null && (
                  <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                      <DollarSign className="h-4 w-4" />
                      Costo (USD)
                    </div>
                    <p className="text-xl font-bold text-gray-900">{formatUSD(scannedProduct.price_cost_usd)}</p>
                  </div>
                )}
                {scannedProduct.price_sale_usd != null && (
                  <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                      <DollarSign className="h-4 w-4" />
                      Venta (USD)
                    </div>
                    <p className="text-xl font-bold text-green-600">{formatUSD(scannedProduct.price_sale_usd)}</p>
                  </div>
                )}
              </div>

              {/* Stock y Margen */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Box className="h-4 w-4" />
                    Stock actual
                  </div>
                  <p className={`text-3xl font-bold ${scannedProduct.stock_quantity <= scannedProduct.stock_min ? 'text-red-600' : 'text-gray-900'}`}>
                    {scannedProduct.stock_quantity}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Mínimo: {scannedProduct.stock_min}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    {margin >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    Margen
                  </div>
                  <p className={`text-3xl font-bold ${margin >= 30 ? 'text-green-600' : margin >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {scannedProduct.price_cost > 0 ? `${margin.toFixed(1)}%` : 'N/A'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Ganancia: {formatCurrency(scannedProduct.price_sale - scannedProduct.price_cost)}
                  </p>
                </div>
                {blueRate && (
                  <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                      <DollarSign className="h-4 w-4" />
                      Precio en USD (blue)
                    </div>
                    <p className="text-3xl font-bold text-blue-600">
                      {formatUSD(scannedProduct.price_sale / blueRate)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Cotización: {formatCurrency(blueRate)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Historial lateral */}
        <div className="w-72 bg-white border-l border-gray-200 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 text-sm">Historial de escaneos</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {scanHistory.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                Los productos escaneados aparecerán aquí
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {scanHistory.map((item, i) => (
                  <div key={i} className="px-4 py-3 hover:bg-gray-50">
                    <p className={`text-sm font-medium ${item.name ? 'text-gray-900' : 'text-red-600'}`}>
                      {item.name || 'No encontrado'}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs font-mono text-gray-500">{item.barcode}</span>
                      <span className="text-xs text-gray-400">
                        {item.time.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

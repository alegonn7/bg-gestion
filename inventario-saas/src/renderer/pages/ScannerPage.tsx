import { useEffect } from 'react'
import { Scan, Trash2, Package, Hash, Clock, Wifi } from 'lucide-react'
import { useScannerStore } from '@/store/scanner'

export default function ScannerPage() {
  const {
    lastScan,
    history,
    isListening,
    unviewedCount,
    markAsViewed,
    clearHistory,
    fetchHistory
  } = useScannerStore()

  useEffect(() => {
    fetchHistory()
  }, [])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(value)
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }


  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Scan className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Escaneados</h1>
              <p className="text-sm text-gray-500">Productos escaneados desde la app móvil</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Estado de conexión */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              isListening
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              <Wifi className="h-4 w-4" />
              {isListening ? 'Escuchando...' : 'Desconectado'}
            </div>

            {/* Limpiar historial */}
            {history.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('¿Eliminar todo el historial de escaneos?')) {
                    clearHistory()
                  }
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm transition"
              >
                <Trash2 className="h-4 w-4" />
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Panel izquierdo: último escaneo */}
        <div className="w-96 bg-white border-r flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Último escaneo
            </h2>
          </div>

          {lastScan ? (
            <div className="p-4 flex-1">
              {/* Código de barras */}
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 text-blue-700">
                  <Hash className="h-4 w-4" />
                  <span className="font-mono font-bold text-lg">{lastScan.barcode}</span>
                </div>
                <p className="text-xs text-blue-500 mt-1">{formatTime(lastScan.created_at)}</p>
              </div>

              {lastScan.product ? (
                // Producto encontrado
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs text-green-600 font-medium mb-1">✅ Producto encontrado</p>
                    <h3 className="font-bold text-gray-900 text-lg">{lastScan.product.name}</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Precio venta</p>
                      <p className="font-bold text-blue-600">{formatCurrency(lastScan.product.price_sale)}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Precio costo</p>
                      <p className="font-bold text-gray-700">{formatCurrency(lastScan.product.price_cost)}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg col-span-2">
                      <p className="text-xs text-gray-500 mb-1">Stock actual</p>
                      <p className={`font-bold text-lg ${
                        lastScan.product.stock_quantity <= 0 ? 'text-red-600' :
                        lastScan.product.stock_quantity <= 5 ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        {lastScan.product.stock_quantity} unidades
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                // Producto no encontrado
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm font-medium text-yellow-700">⚠️ Producto no encontrado</p>
                  <p className="text-xs text-yellow-600 mt-1">
                    El código <span className="font-mono font-bold">{lastScan.barcode}</span> no está registrado en esta sucursal.
                  </p>
                </div>
              )}
            </div>
          ) : (
            // Sin escaneos
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center text-gray-400">
                <Scan className="h-16 w-16 mx-auto mb-3 opacity-20" />
                <p className="font-medium">Esperando escaneo...</p>
                <p className="text-sm mt-1">Escaneá un producto desde la app móvil</p>
              </div>
            </div>
          )}
        </div>

        {/* Panel derecho: historial */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b bg-white flex items-center justify-between">
            <h2 className="font-semibold text-gray-700">
              Historial del día
              {unviewedCount > 0 && (
                <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                  {unviewedCount} nuevos
                </span>
              )}
            </h2>
            <span className="text-sm text-gray-500">{history.length} escaneos</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {history.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No hay escaneos hoy</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => !item.is_viewed && markAsViewed(item.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition ${
                      item.is_viewed
                        ? 'bg-white border-gray-200 opacity-70'
                        : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Indicador visto/no visto */}
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          item.is_viewed ? 'bg-gray-300' : 'bg-blue-500'
                        }`} />

                        <div>
                          <p className="font-medium text-sm text-gray-900">
                            {item.product?.name || (
                              <span className="text-yellow-600">Producto no encontrado</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">{item.barcode}</p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        {item.product && (
                          <p className="text-sm font-bold text-blue-600">
                            {formatCurrency(item.product.price_sale)}
                          </p>
                        )}
                        <p className="text-xs text-gray-400">{formatTime(item.created_at)}</p>
                      </div>
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
import { X, Barcode, TrendingUp, DollarSign, Clock, Copy } from 'lucide-react'
import type { Product } from '@/store/products'
import { useDollarStore } from '@/store/dollar'

interface ProductDetailModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
  onEdit?: () => void
  onDelete?: () => void
  onMovement?: () => void
  onViewHistory?: () => void
  onDuplicate?: () => void
}

export default function ProductDetailModal({ product, isOpen, onClose, onEdit, onDelete, onMovement, onViewHistory, onDuplicate }: ProductDetailModalProps) {
  if (!isOpen || !product) return null

  const { blueRate, manualMode, manualBlueRate, convertUsdToArs, lastUpdated } = useDollarStore()
  const effectiveBlueRate = manualMode && manualBlueRate ? manualBlueRate : blueRate;
  // Conversión usando el valor efectivo
  const convertUsdToArsEffective = (usd: number) => {
    if (!effectiveBlueRate || !usd) return null;
    return Math.round(usd * effectiveBlueRate * 100) / 100;
  };

  // Determinar datos según si es del maestro o propio
  const displayName = product.product?.name

  const displayBarcode =  product.barcode

  const displayDescription = product.product?.description

  // Calcular margen
  const margin = product.price_sale > 0
    ? ((product.price_sale - product.price_cost) / product.price_sale) * 100
    : 0

  const marginAmount = product.price_sale - product.price_cost

  // Estado del stock
  const isLowStock = product.stock_quantity <= product.stock_min
  const stockPercentage = product.stock_min > 0 
    ? (product.stock_quantity / product.stock_min) * 100 
    : 100

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {displayName}
            </h2>
            {displayBarcode && (
              <div className="flex items-center gap-2 text-gray-600">
                <Barcode className="w-5 h-5" />
                <span className="font-mono text-lg">{displayBarcode}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition ml-4"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Descripción */}
          {displayDescription && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Descripción</h3>
              <p className="text-gray-600">{displayDescription}</p>
            </div>
          )}

          {/* Categoría */}
          {product.category && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Categoría</h3>
              <div 
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ 
                  backgroundColor: `${product.category.color}20`,
                  color: product.category.color 
                }}
              >
                {product.category.name}
              </div>
            </div>
          )}

          {/* Stock */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Inventario</h3>
              {onViewHistory && (
                <button
                  onClick={onViewHistory}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Ver historial →
                </button>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm text-gray-600">Stock Actual</div>
                  <div className={`text-3xl font-bold ${isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
                    {product.stock_quantity}
                  </div>
                  <div className="text-sm text-gray-500">unidades</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Stock Mínimo</div>
                  <div className="text-2xl font-semibold text-gray-700">
                    {product.stock_min}
                  </div>
                </div>
              </div>

              {/* Barra de progreso */}
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    isLowStock ? 'bg-red-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                />
              </div>

              {isLowStock && (
                <div className="flex items-center gap-2 text-sm text-red-600 mt-2">
                  <TrendingUp className="w-4 h-4 rotate-180" />
                  <span className="font-medium">¡Stock bajo! Necesita reposición</span>
                </div>
              )}
            </div>
          </div>

          {/* Precios y Margen */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Precios</h3>
            <div className="grid grid-cols-3 gap-4">
              {/* Precio de Costo */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-orange-600 mb-2">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs font-medium">Precio Costo</span>
                </div>
                <div className="text-2xl font-bold text-orange-900">
                  ${product.price_cost.toFixed(2)}
                </div>
              </div>

              {/* Precio de Venta */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-600 mb-2">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs font-medium">Precio Venta</span>
                </div>
                <div className="text-2xl font-bold text-green-900">
                  ${product.price_sale.toFixed(2)}
                </div>
              </div>

              {/* Margen */}
              <div className={`border rounded-lg p-4 ${
                margin > 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'
              }`}>
                <div className={`flex items-center gap-2 mb-2 ${
                  margin > 0 ? 'text-blue-600' : 'text-red-600'
                }`}>
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs font-medium">Margen</span>
                </div>
                <div className={`text-2xl font-bold ${
                  margin > 0 ? 'text-blue-900' : 'text-red-900'
                }`}>
                  {margin.toFixed(1)}%
                </div>
                <div className={`text-xs ${
                  margin > 0 ? 'text-blue-700' : 'text-red-700'
                }`}>
                  ${marginAmount.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Precios en USD */}
            {((product.price_sale_usd && product.price_sale_usd > 0) || (product.price_cost_usd && product.price_cost_usd > 0)) && (
              <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-purple-700 mb-3">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs font-medium">Conversión USD → ARS (Blue)</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {product.price_cost_usd && product.price_cost_usd > 0 && (
                    <div>
                      <div className="text-xs text-purple-600 mb-1">Costo</div>
                      {effectiveBlueRate ? (
                        <div className="text-xl font-bold text-purple-800">
                          ${convertUsdToArsEffective(product.price_cost_usd)?.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">Sin cotización</div>
                      )}
                      <div className="text-xs text-green-600 mt-1">
                        US$ {product.price_cost_usd.toFixed(2)}
                      </div>
                    </div>
                  )}
                  {product.price_sale_usd && product.price_sale_usd > 0 && (
                    <div>
                      <div className="text-xs text-purple-600 mb-1">Venta</div>
                      {effectiveBlueRate ? (
                        <div className="text-xl font-bold text-purple-800">
                          ${convertUsdToArsEffective(product.price_sale_usd)?.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">Sin cotización</div>
                      )}
                      <div className="text-xs text-green-600 mt-1">
                        US$ {product.price_sale_usd.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
                {effectiveBlueRate && (
                  <div className="mt-3 pt-2 border-t border-purple-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-purple-600">Cotización Blue</span>
                      <span className="text-sm font-semibold text-purple-800">${effectiveBlueRate.toLocaleString('es-AR')}</span>
                    </div>
                    {lastUpdated && (
                      <p className="text-xs text-purple-600 mt-1">
                        {new Date(lastUpdated).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Información</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Creado
                </span>
                <span className="font-medium text-gray-900">
                  {new Date(product.created_at).toLocaleDateString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Última actualización
                </span>
                <span className="font-medium text-gray-900">
                  {new Date(product.updated_at).toLocaleDateString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">ID</span>
                <span className="font-mono text-xs text-gray-500">{product.id}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Versión</span>
                <span className="font-medium text-gray-900">v{product.version}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition"
          >
            Cerrar
          </button>
          
          <div className="flex-1 flex gap-3">
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                Editar
              </button>
            )}
            {onDuplicate && (
              <button
                onClick={onDuplicate}
                className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Duplicar
              </button>
            )}
            {onMovement && (
              <button
                onClick={onMovement}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
              >
                Movimiento
              </button>
            )}
          </div>

          {onDelete && (
            <button
              onClick={onDelete}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
            >
              Eliminar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
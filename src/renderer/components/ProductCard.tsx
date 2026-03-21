import { Barcode, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import type { Product } from '@/store/products'
import { useDollarStore } from '@/store/dollar'

interface ProductCardProps {
  product: Product
  onClick?: () => void
}

export default function ProductCard({ product, onClick }: ProductCardProps) {
  const { convertUsdToArs } = useDollarStore()
  
  // Determinar nombre y código según si es del maestro o propio
  const displayName = product.product?.name

  const displayBarcode =  product.barcode

  // Calcular margen
  const margin = product.price_sale > 0
    ? ((product.price_sale - product.price_cost) / product.price_sale) * 100
    : 0

  // Determinar si stock es bajo
  const isLowStock = product.stock_quantity <= product.stock_min

  // Conversión USD a ARS
  const costUsdToArs = product.price_cost_usd ? convertUsdToArs(product.price_cost_usd) : null
  const saleUsdToArs = product.price_sale_usd ? convertUsdToArs(product.price_sale_usd) : null

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 text-lg mb-1">
            {displayName || 'Sin nombre'}
          </h3>
          
          {displayBarcode && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Barcode className="w-4 h-4" />
              <span className="font-mono">{displayBarcode}</span>
            </div>
          )}

        </div>

        {product.category && (
          <div 
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{ 
              backgroundColor: `${product.category.color}20`,
              color: product.category.color 
            }}
          >
            {product.category.name}
          </div>
        )}
      </div>

      {/* Stock */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-gray-600">Stock</span>
          <span className={`font-semibold ${isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
            {product.stock_quantity} unidades
          </span>
        </div>
        
        {isLowStock && (
          <div className="flex items-center gap-1 text-xs text-red-600">
            <TrendingDown className="w-3 h-3" />
            <span>Stock bajo (mín: {product.stock_min})</span>
          </div>
        )}
      </div>

      {/* Precios y Margen */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
        <div>
          <div className="text-xs text-gray-500 mb-1">Costo</div>
          <div className="font-semibold text-gray-900">
            ${product.price_cost.toFixed(2)}
          </div>
        </div>
        
        <div>
          <div className="text-xs text-gray-500 mb-1">Venta ARS</div>
          <div className="font-semibold text-green-600">
            ${product.price_sale.toFixed(2)}
          </div>
        </div>
        
        <div>
          <div className="text-xs text-gray-500 mb-1">Margen</div>
          <div className={`font-semibold flex items-center gap-1 ${margin > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {margin > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {margin.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Conversión USD → ARS */}
      {((product.price_cost_usd && product.price_cost_usd > 0) || (product.price_sale_usd && product.price_sale_usd > 0)) && (
        <div className="mt-3 pt-3 border-t border-purple-200 bg-purple-50 -mx-4 px-4 -mb-4 pb-4 rounded-b-lg text-center">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <DollarSign className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-xs font-medium text-purple-500">Conversión Blue</span>
          </div>
          <div className="flex items-center justify-center gap-6">
            {product.price_cost_usd && product.price_cost_usd > 0 && (
              <div className="text-center">
                <div className="text-[11px] text-purple-400 uppercase tracking-wide">Costo</div>
                {costUsdToArs ? (
                  <div className="font-bold text-purple-700 text-lg leading-tight">
                    ${costUsdToArs.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">—</div>
                )}
                <div className="text-[10px] text-gray-400 mt-0.5">US$ {product.price_cost_usd.toFixed(2)}</div>
              </div>
            )}
            {product.price_cost_usd && product.price_cost_usd > 0 && product.price_sale_usd && product.price_sale_usd > 0 && (
              <div className="w-px h-8 bg-purple-200" />
            )}
            {product.price_sale_usd && product.price_sale_usd > 0 && (
              <div className="text-center">
                <div className="text-[11px] text-purple-400 uppercase tracking-wide">Venta</div>
                {saleUsdToArs ? (
                  <div className="font-bold text-purple-700 text-lg leading-tight">
                    ${saleUsdToArs.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">—</div>
                )}
                <div className="text-[10px] text-gray-400 mt-0.5">US$ {product.price_sale_usd.toFixed(2)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
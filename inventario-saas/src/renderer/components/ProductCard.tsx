import { Barcode, TrendingUp, TrendingDown } from 'lucide-react'
import type { Product } from '@/store/products'

interface ProductCardProps {
  product: Product
  onClick?: () => void
}

export default function ProductCard({ product, onClick }: ProductCardProps) {
  // Determinar nombre y código según si es del maestro o propio
  const displayName = product.name

  const displayBarcode =  product.barcode

  // Calcular margen
  const margin = product.price_sale > 0
    ? ((product.price_sale - product.price_cost) / product.price_sale) * 100
    : 0

  // Determinar si stock es bajo
  const isLowStock = product.stock_quantity <= product.stock_min

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
          <div className="text-xs text-gray-500 mb-1">Venta</div>
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
    </div>
  )
}
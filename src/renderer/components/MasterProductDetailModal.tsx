import { X, Store, Package, DollarSign, TrendingUp, BarChart } from 'lucide-react'
import type { MasterProduct } from '@/store/master-catalog'

interface MasterProductDetailModalProps {
  product: MasterProduct | null
  isOpen: boolean
  onClose: () => void
}

export default function MasterProductDetailModal({ product, isOpen, onClose }: MasterProductDetailModalProps) {
  if (!isOpen || !product) return null

  const totalRevenue = product.branches.reduce((sum, b) => sum + (b.stock * b.price_sale), 0)
  const totalCost = product.branches.reduce((sum, b) => sum + (b.stock * b.price_cost), 0)
  const potentialProfit = totalRevenue - totalCost

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{product.name}</h2>
                {product.barcode && (
                  <p className="text-sm text-gray-500 font-mono mt-1">{product.barcode}</p>
                )}
              </div>
            </div>

            {product.description && (
              <p className="text-gray-600 mt-2">{product.description}</p>
            )}

            {product.categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {product.categories.map((cat, idx) => (
                  <span 
                    key={idx}
                    className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full"
                  >
                    {cat}
                  </span>
                ))}
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

        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 p-6 bg-gray-50">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-blue-600 mb-2">
              <Package className="w-5 h-5" />
              <span className="text-sm font-medium">Stock Total</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{product.total_stock}</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-green-600 mb-2">
              <Store className="w-5 h-5" />
              <span className="text-sm font-medium">Sucursales</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{product.branches_count}</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-purple-600 mb-2">
              <DollarSign className="w-5 h-5" />
              <span className="text-sm font-medium">Precio Prom.</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              ${product.avg_price_sale.toFixed(2)}
            </p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-orange-600 mb-2">
              <TrendingUp className="w-5 h-5" />
              <span className="text-sm font-medium">Ganancia Pot.</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              ${potentialProfit.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Branches Detail */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Detalle por Sucursal
            </h3>
          </div>

          <div className="space-y-3">
            {product.branches.map((branch, idx) => {
              const revenue = branch.stock * branch.price_sale
              const cost = branch.stock * branch.price_cost
              const profit = revenue - cost
              const margin = branch.price_sale > 0 
                ? ((branch.price_sale - branch.price_cost) / branch.price_sale) * 100 
                : 0

              return (
                <div 
                  key={idx}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Store className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{branch.branch_name}</h4>
                        <p className="text-sm text-gray-500">Stock: {branch.stock} unidades</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm text-gray-500">Margen</p>
                      <p className={`text-lg font-bold ${margin > 30 ? 'text-green-600' : margin > 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {margin.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Precio Costo</p>
                      <p className="text-sm font-semibold text-gray-900">
                        ${branch.price_cost.toFixed(2)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 mb-1">Precio Venta</p>
                      <p className="text-sm font-semibold text-gray-900">
                        ${branch.price_sale.toFixed(2)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 mb-1">Valor Stock</p>
                      <p className="text-sm font-semibold text-blue-600">
                        ${revenue.toFixed(2)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 mb-1">Ganancia Pot.</p>
                      <p className="text-sm font-semibold text-green-600">
                        ${profit.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
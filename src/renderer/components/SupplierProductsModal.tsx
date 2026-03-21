import { X, Download } from 'lucide-react'
import { exportProductsToCSV } from '@/lib/exportProducts'
import type { Product } from '@/store/products'

interface SupplierProductsModalProps {
  isOpen: boolean
  onClose: () => void
  supplierName: string
  products: Product[]
}

export default function SupplierProductsModal({ isOpen, onClose, supplierName, products }: SupplierProductsModalProps) {
  if (!isOpen) return null

  const handleExport = () => {
    exportProductsToCSV(products, `productos_${supplierName}.csv`)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Productos de {supplierName}</h2>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={products.length === 0}
              className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded text-sm"
              title="Exportar productos a CSV"
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        <div className="p-6">
          {products.length === 0 ? (
            <div className="text-gray-500">Este proveedor no tiene productos asociados.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {products.map(product => (
                <li key={product.id} className="py-3">
                  <div className="font-semibold text-gray-900">{product.product?.name || 'Sin nombre'}</div>
                  <div className="text-sm text-gray-500">Stock: {product.stock_quantity} · Precio venta: ${product.price_sale.toFixed(2)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

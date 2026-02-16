import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useProductsStore, Product } from '@/store/products'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'

interface EditProductModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
}

interface Category {
  id: string
  name: string
  color: string
}

export default function EditProductModal({ product, isOpen, onClose }: EditProductModalProps) {
  const { updateProduct } = useProductsStore()
  const { organization } = useAuthStore()
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  
  // Form state
  const [formData, setFormData] = useState({
    barcode: '',
    name: '',
    description: '',
    category_id: '',
    price_cost: '',
    price_sale: '',
    stock_quantity: '',
    stock_min: '',
  })

  // Cargar datos del producto cuando se abre el modal
  useEffect(() => {
    if (isOpen && product) {
      // Determinar datos según si es del maestro o propio
      
      setFormData({
        barcode: product.barcode || '',
        name: product.name || '',
        description: product.description || '',
        category_id: product.category_id || '',
        price_cost: product.price_cost.toString(),
        price_sale: product.price_sale.toString(),
        stock_quantity: product.stock_quantity.toString(),
        stock_min: product.stock_min.toString(),
      })
      
      loadCategories()
    }
  }, [isOpen, product])

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, color')
        .eq('organization_id', organization!.id)
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      setCategories(data || [])
    } catch (err) {
      console.error('Error loading categories:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!product) return
    
    setError('')
    setLoading(true)

    try {
      // Validaciones
      const priceCost = parseFloat(formData.price_cost) || 0
      const priceSale = parseFloat(formData.price_sale) || 0

      if (priceSale > 0 && priceCost > priceSale) {
        const confirm = window.confirm(
          '⚠️ El precio de venta es menor al precio de costo. ¿Continuar de todos modos?'
        )
        if (!confirm) {
          setLoading(false)
          return
        }
      }

      // Si el producto es del maestro, solo podemos editar precios y stock
      const updates: any = {
        category_id: formData.category_id || null,
        price_cost: priceCost,
        price_sale: priceSale,
        stock_quantity: parseInt(formData.stock_quantity) || 0,
        stock_min: parseInt(formData.stock_min) || 0,
      }


      await updateProduct(product.id, updates)

      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  if (!isOpen || !product) return null


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Editar Producto</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Código de Barras - Solo editable si es producto propio */}
          <div>
            <label htmlFor="barcode" className="block text-sm font-medium text-gray-700 mb-2">
              Código de Barras
            </label>
            <input
              type="text"
              id="barcode"
              name="barcode"
              value={formData.barcode}
              onChange={handleChange}
              placeholder="7790123456789"
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                 ''
              }`}
              pattern="[0-9]*"
              maxLength={13}
            />
          </div>

          {/* Nombre - Solo editable si es producto propio */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Nombre del Producto *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                 ''
              }`}
              required
            />
          </div>

          {/* Descripción - Solo editable si es producto propio */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Descripción
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none ${
                 ''
              }`}
            />
          </div>

          {/* Categoría */}
          <div>
            <label htmlFor="category_id" className="block text-sm font-medium text-gray-700 mb-2">
              Categoría
            </label>
            <select
              id="category_id"
              name="category_id"
              value={formData.category_id}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="">Sin categoría</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Precios */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="price_cost" className="block text-sm font-medium text-gray-700 mb-2">
                Precio de Costo
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  id="price_cost"
                  name="price_cost"
                  value={formData.price_cost}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="price_sale" className="block text-sm font-medium text-gray-700 mb-2">
                Precio de Venta
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  id="price_sale"
                  name="price_sale"
                  value={formData.price_sale}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
          </div>

          {/* Margen calculado */}
          {formData.price_cost && formData.price_sale && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-700">Margen de ganancia:</span>
                <span className="font-semibold text-blue-900">
                  {(() => {
                    const cost = parseFloat(formData.price_cost)
                    const sale = parseFloat(formData.price_sale)
                    if (sale > 0) {
                      const margin = ((sale - cost) / sale) * 100
                      return `${margin.toFixed(1)}% ($${(sale - cost).toFixed(2)})`
                    }
                    return '-'
                  })()}
                </span>
              </div>
            </div>
          )}

          {/* Stock */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="stock_quantity" className="block text-sm font-medium text-gray-700 mb-2">
                Stock Actual
              </label>
              <input
                type="number"
                id="stock_quantity"
                name="stock_quantity"
                value={formData.stock_quantity}
                onChange={handleChange}
                min="0"
                step="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                💡 Usa "Registrar Movimiento" para cambios de stock
              </p>
            </div>

            <div>
              <label htmlFor="stock_min" className="block text-sm font-medium text-gray-700 mb-2">
                Stock Mínimo
              </label>
              <input
                type="number"
                id="stock_min"
                name="stock_min"
                value={formData.stock_min}
                onChange={handleChange}
                min="0"
                step="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
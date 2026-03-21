import { useState, useEffect } from 'react'
import { X, DollarSign } from 'lucide-react'
import { useProductsStore, Product } from '@/store/products'
import { useSuppliersStore } from '@/store/suppliers'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useDollarStore } from '@/store/dollar'

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
  const { blueRate, fetchBlueRate, convertUsdToArs, lastUpdated } = useDollarStore()
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  
  // Proveedores
  const { suppliers, fetchSuppliers, isLoading: loadingSuppliers } = useSuppliersStore()
  const [selectedSupplier, setSelectedSupplier] = useState('')
  // Form state
  const [formData, setFormData] = useState({
    barcode: '',
    name: '',
    description: '',
    category_id: '',
    price_cost: '',
    price_sale: '',
    price_cost_usd: '',
    price_sale_usd: '',
    stock_quantity: '',
    stock_min: '',
  })

  const [markupArs, setMarkupArs] = useState('')
  const [markupUsd, setMarkupUsd] = useState('')
  // Autofill toggle para sincronizar costos
  const [autofillCost, setAutofillCost] = useState(true)

  // Cargar datos del producto cuando se abre el modal
  useEffect(() => {
    if (isOpen && product) {
      setFormData({
        barcode: product.barcode || '',
        name: product.product?.name || '',
        description: product.product?.description || '',
        category_id: product.product?.category_id || '',
        price_cost: product.price_cost.toString(),
        price_sale: product.price_sale.toString(),
        price_cost_usd: product.price_cost_usd ? product.price_cost_usd.toString() : '',
        price_sale_usd: product.price_sale_usd ? product.price_sale_usd.toString() : '',
        stock_quantity: product.stock_quantity.toString(),
        stock_min: product.stock_min.toString(),
      })
      setSelectedSupplier(product.product?.supplier_id || '')
      // Calcular margen ARS inicial
      if (product.price_cost > 0 && product.price_sale > 0) {
        setMarkupArs(((product.price_sale - product.price_cost) / product.price_cost * 100).toFixed(1))
      } else {
        setMarkupArs('')
      }
      // Calcular margen USD inicial
      if (product.price_cost_usd && product.price_sale_usd && product.price_cost_usd > 0) {
        setMarkupUsd(((product.price_sale_usd - product.price_cost_usd) / product.price_cost_usd * 100).toFixed(1))
      } else {
        setMarkupUsd('')
      }
      loadCategories()
      fetchBlueRate()
      fetchSuppliers()
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
        price_cost: priceCost,
        price_sale: priceSale,
        price_cost_usd: parseFloat(formData.price_cost_usd) || null,
        price_sale_usd: parseFloat(formData.price_sale_usd) || null,
        stock_quantity: parseInt(formData.stock_quantity) || 0,
        stock_min: parseInt(formData.stock_min) || 0,
        // Datos del producto maestro (nombre, descripción, categoría, proveedor)
        product: {
          name: formData.name,
          description: formData.description || null,
          category_id: formData.category_id || null,
          supplier_id: selectedSupplier || null,
        },
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
    setFormData(prev => {
      let next = { ...prev, [name]: value }

      // --- AUTOFILL COSTOS ---
      if (autofillCost && blueRate) {
        if (name === 'price_cost') {
          // Si se edita costo ARS, autocompletar USD
          const costArs = parseFloat(value)
          if (!isNaN(costArs) && costArs > 0) {
            next.price_cost_usd = (costArs / blueRate).toFixed(2)
          } else {
            next.price_cost_usd = ''
          }
        }
        if (name === 'price_cost_usd') {
          // Si se edita costo USD, autocompletar ARS
          const costUsd = parseFloat(value)
          if (!isNaN(costUsd) && costUsd > 0) {
            next.price_cost = Math.round(costUsd * blueRate).toString()
          } else {
            next.price_cost = ''
          }
        }
      }

      // Si cambia precio costo ARS y hay margen, recalcular venta ARS
      if (name === 'price_cost' && markupArs) {
        const cost = parseFloat(next.price_cost)
        const pct = parseFloat(markupArs)
        if (!isNaN(cost) && !isNaN(pct) && cost > 0) {
          next.price_sale = Math.round(cost * (1 + pct / 100)).toString()
        }
      }

      // Si cambia precio venta ARS, recalcular margen ARS
      if (name === 'price_sale') {
        const cost = parseFloat(next.price_cost)
        const sale = parseFloat(value)
        if (!isNaN(cost) && !isNaN(sale) && cost > 0) {
          setMarkupArs(((sale - cost) / cost * 100).toFixed(1))
        } else {
          setMarkupArs('')
        }
      }

      // Si cambia precio costo USD y hay margen, recalcular venta USD
      if (name === 'price_cost_usd' && markupUsd) {
        const cost = parseFloat(next.price_cost_usd)
        const pct = parseFloat(markupUsd)
        if (!isNaN(cost) && !isNaN(pct) && cost > 0) {
          next.price_sale_usd = (Math.round(cost * (1 + pct / 100) * 100) / 100).toString()
        }
      }

      // Si cambia precio venta USD, recalcular margen USD
      if (name === 'price_sale_usd') {
        const cost = parseFloat(next.price_cost_usd)
        const sale = parseFloat(value)
        if (!isNaN(cost) && !isNaN(sale) && cost > 0) {
          setMarkupUsd(((sale - cost) / cost * 100).toFixed(1))
        } else {
          setMarkupUsd('')
        }
      }

      return next
    })
  }

  const handleMarkupArsChange = (value: string) => {
    setMarkupArs(value)
    const cost = parseFloat(formData.price_cost)
    const pct = parseFloat(value)
    if (!isNaN(cost) && !isNaN(pct) && cost > 0) {
      setFormData(prev => ({ ...prev, price_sale: Math.round(cost * (1 + pct / 100)).toString() }))
    }
  }

  const handleMarkupUsdChange = (value: string) => {
    setMarkupUsd(value)
    const cost = parseFloat(formData.price_cost_usd)
    const pct = parseFloat(value)
    if (!isNaN(cost) && !isNaN(pct) && cost > 0) {
      setFormData(prev => ({ ...prev, price_sale_usd: (Math.round(cost * (1 + pct / 100) * 100) / 100).toString() }))
    }
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

          {/* Categoría y Proveedor */}
          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label htmlFor="supplier_id" className="block text-sm font-medium text-gray-700 mb-2">Proveedor</label>
              <select
                id="supplier_id"
                name="supplier_id"
                value={selectedSupplier}
                onChange={e => setSelectedSupplier(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                disabled={loadingSuppliers}
              >
                <option value="">Sin proveedor</option>
                {suppliers.map(sup => (
                  <option key={sup.id} value={sup.id}>{sup.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Precios */}
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                Precios en Pesos (ARS)
              </h3>
              <label className="flex items-center gap-1 text-xs select-none cursor-pointer">
                <input type="checkbox" checked={autofillCost} onChange={e => setAutofillCost(e.target.checked)} className="accent-blue-600" />
                Autofill
              </label>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="price_cost" className="block text-sm font-medium text-gray-700 mb-2">
                  Costo (ARS)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number" id="price_cost" name="price_cost"
                    value={formData.price_cost} onChange={handleChange}
                    step="0.01" min="0"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Margen %</label>
                <div className="relative">
                  <input
                    type="number"
                    value={markupArs}
                    onChange={(e) => handleMarkupArsChange(e.target.value)}
                    placeholder="Ej: 30"
                    step="0.1"
                    min="0"
                    className="w-full pl-4 pr-8 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none bg-amber-50"
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-amber-600 font-medium">%</span>
                </div>
                {markupArs && formData.price_cost && (
                  <p className="text-xs text-amber-600 mt-1">
                    +${(parseFloat(formData.price_sale || '0') - parseFloat(formData.price_cost)).toFixed(0)} ganancia
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="price_sale" className="block text-sm font-medium text-gray-700 mb-2">
                  Venta (ARS)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number" id="price_sale" name="price_sale"
                    value={formData.price_sale} onChange={handleChange}
                    step="0.01" min="0"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Precios en USD */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-green-600" />
              Precios en Dólares (USD)
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="price_cost_usd" className="block text-sm font-medium text-gray-700 mb-2">Costo (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-green-600 font-medium">US$</span>
                  <input type="number" id="price_cost_usd" name="price_cost_usd" value={formData.price_cost_usd} onChange={handleChange}
                    placeholder="0.00" step="0.01" min="0"
                    className="w-full pl-14 pr-4 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none bg-green-50" />
                </div>
                {formData.price_cost_usd && blueRate && (
                  <p className="text-xs text-green-700 mt-1">
                    ≈ ${convertUsdToArs(parseFloat(formData.price_cost_usd))?.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Margen %</label>
                <div className="relative">
                  <input
                    type="number"
                    value={markupUsd}
                    onChange={(e) => handleMarkupUsdChange(e.target.value)}
                    placeholder="Ej: 30"
                    step="0.1"
                    min="0"
                    className="w-full pl-4 pr-8 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none bg-amber-50"
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-amber-600 font-medium">%</span>
                </div>
                {markupUsd && formData.price_cost_usd && (
                  <p className="text-xs text-amber-600 mt-1">
                    +US${(parseFloat(formData.price_sale_usd || '0') - parseFloat(formData.price_cost_usd)).toFixed(2)} ganancia
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="price_sale_usd" className="block text-sm font-medium text-gray-700 mb-2">Venta (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-green-600 font-medium">US$</span>
                  <input type="number" id="price_sale_usd" name="price_sale_usd" value={formData.price_sale_usd} onChange={handleChange}
                    placeholder="0.00" step="0.01" min="0"
                    className="w-full pl-14 pr-4 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none bg-green-50" />
                </div>
                {formData.price_sale_usd && blueRate && (
                  <p className="text-xs text-green-700 mt-1">
                    ≈ ${convertUsdToArs(parseFloat(formData.price_sale_usd))?.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
                  </p>
                )}
              </div>
            </div>
            
            {/* Conversión automática detallada */}
            {(formData.price_cost_usd || formData.price_sale_usd) && blueRate && (
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                {formData.price_sale_usd && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-700">
                      💵 Venta: US$ {parseFloat(formData.price_sale_usd).toFixed(2)} × ${blueRate.toLocaleString('es-AR')} (blue)
                    </span>
                    <span className="font-bold text-blue-900 text-lg">
                      = ${convertUsdToArs(parseFloat(formData.price_sale_usd))?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {formData.price_cost_usd && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-blue-700">
                      💵 Costo: US$ {parseFloat(formData.price_cost_usd).toFixed(2)} × ${blueRate.toLocaleString('es-AR')} (blue)
                    </span>
                    <span className="font-bold text-blue-900 text-lg">
                      = ${convertUsdToArs(parseFloat(formData.price_cost_usd))?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {lastUpdated && (
                  <p className="text-xs text-blue-500 mt-1">
                    Cotización actualizada: {new Date(lastUpdated).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
                  </p>
                )}
              </div>
            )}
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
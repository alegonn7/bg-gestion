import { useState, useEffect } from 'react'
import { X, Scan, DollarSign } from 'lucide-react'
import { useProductsStore } from '@/store/products'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useDollarStore } from '@/store/dollar'

interface CreateProductModalProps {
  isOpen: boolean
  onClose: () => void
  initialBarcode?: string
  duplicateFrom?: {
    name: string
    description?: string
    category_id?: string
    barcode?: string
    sku?: string
    price_cost: number
    price_sale: number
    price_cost_usd?: number | null
    price_sale_usd?: number | null
    stock_min: number
  }
}

interface Category {
  id: string
  name: string
  color: string
}

export default function CreateProductModal({ isOpen, onClose, initialBarcode, duplicateFrom }: CreateProductModalProps) {
  const { createProduct } = useProductsStore()
  const { organization } = useAuthStore()
  const { blueRate, fetchBlueRate, convertUsdToArs, lastUpdated } = useDollarStore()
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  
  const [formData, setFormData] = useState({
    barcode: '',
    sku: '',
    name: '',
    description: '',
    category_id: '',
    price_cost: '',
    price_sale: '',
    price_cost_usd: '',
    price_sale_usd: '',
    stock_quantity: '',
    stock_min: '10',
  })

  const [markupArs, setMarkupArs] = useState('')
  const [markupUsd, setMarkupUsd] = useState('')

  useEffect(() => {
    if (isOpen && organization) {
      loadCategories()
      fetchBlueRate()
    }
  }, [isOpen, organization])

  useEffect(() => {
    if (isOpen && initialBarcode) {
      setFormData(prev => ({ ...prev, barcode: initialBarcode }))
    }
  }, [isOpen, initialBarcode])

  // Pre-llenar datos al duplicar
  useEffect(() => {
    if (isOpen && duplicateFrom) {
      setFormData({
        barcode: '',  // No copiar barcode, debe ser único
        sku: '',
        name: duplicateFrom.name + ' (copia)',
        description: duplicateFrom.description || '',
        category_id: duplicateFrom.category_id || '',
        price_cost: duplicateFrom.price_cost.toString(),
        price_sale: duplicateFrom.price_sale.toString(),
        price_cost_usd: duplicateFrom.price_cost_usd ? duplicateFrom.price_cost_usd.toString() : '',
        price_sale_usd: duplicateFrom.price_sale_usd ? duplicateFrom.price_sale_usd.toString() : '',
        stock_quantity: '0',
        stock_min: duplicateFrom.stock_min.toString(),
      })
      // Calcular markup ARS
      if (duplicateFrom.price_cost > 0 && duplicateFrom.price_sale > 0) {
        const m = ((duplicateFrom.price_sale - duplicateFrom.price_cost) / duplicateFrom.price_cost) * 100
        setMarkupArs(m.toFixed(1))
      }
      // Calcular markup USD
      if (duplicateFrom.price_cost_usd && duplicateFrom.price_sale_usd && duplicateFrom.price_cost_usd > 0) {
        const m = ((duplicateFrom.price_sale_usd - duplicateFrom.price_cost_usd) / duplicateFrom.price_cost_usd) * 100
        setMarkupUsd(m.toFixed(1))
      }
    }
  }, [isOpen, duplicateFrom])

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        barcode: '',
        sku: '',
        name: '',
        description: '',
        category_id: '',
        price_cost: '',
        price_sale: '',
        price_cost_usd: '',
        price_sale_usd: '',
        stock_quantity: '',
        stock_min: '10',
      })
      setMarkupArs('')
      setMarkupUsd('')
      setError('')
    }
  }, [isOpen])

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
    setError('')
    setLoading(true)

    try {
      if (!formData.name.trim()) throw new Error('El nombre es obligatorio')
      if (formData.barcode && formData.barcode.length < 8) throw new Error('El código de barras debe tener al menos 8 dígitos')

      const priceCost = parseFloat(formData.price_cost) || 0
      const priceSale = parseFloat(formData.price_sale) || 0

      if (priceSale > 0 && priceCost > priceSale) {
        const confirm = window.confirm('⚠️ El precio de venta es menor al precio de costo. ¿Continuar de todos modos?')
        if (!confirm) { setLoading(false); return }
      }

      await createProduct({
        barcode: formData.barcode.trim() || undefined,
        sku: formData.sku.trim() || undefined,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        category_id: formData.category_id || undefined,
        price_cost: priceCost,
        price_sale: priceSale,
        price_cost_usd: parseFloat(formData.price_cost_usd) || null,
        price_sale_usd: parseFloat(formData.price_sale_usd) || null,
        stock_quantity: parseInt(formData.stock_quantity) || 0,
        stock_min: parseInt(formData.stock_min) || 0,
      })

      setFormData({ 
        barcode: '', 
        sku: '',
        name: '', 
        description: '', 
        category_id: '', 
        price_cost: '', 
        price_sale: '', 
        price_cost_usd: '',
        price_sale_usd: '',
        stock_quantity: '', 
        stock_min: '10' 
      })
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
      const next = { ...prev, [name]: value }

      // Si cambia precio costo ARS y hay margen, recalcular venta ARS
      if (name === 'price_cost' && markupArs) {
        const cost = parseFloat(value)
        const pct = parseFloat(markupArs)
        if (!isNaN(cost) && !isNaN(pct) && cost > 0) {
          next.price_sale = Math.round(cost * (1 + pct / 100)).toString()
        }
      }

      // Si cambia precio venta ARS, recalcular margen ARS
      if (name === 'price_sale') {
        const cost = parseFloat(prev.price_cost)
        const sale = parseFloat(value)
        if (!isNaN(cost) && !isNaN(sale) && cost > 0) {
          setMarkupArs(((sale - cost) / cost * 100).toFixed(1))
        } else {
          setMarkupArs('')
        }
      }

      // Si cambia precio costo USD y hay margen, recalcular venta USD
      if (name === 'price_cost_usd' && markupUsd) {
        const cost = parseFloat(value)
        const pct = parseFloat(markupUsd)
        if (!isNaN(cost) && !isNaN(pct) && cost > 0) {
          next.price_sale_usd = (Math.round(cost * (1 + pct / 100) * 100) / 100).toString()
        }
      }

      // Si cambia precio venta USD, recalcular margen USD
      if (name === 'price_sale_usd') {
        const cost = parseFloat(prev.price_cost_usd)
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Nuevo Producto</h2>
            {initialBarcode && (
              <p className="text-sm text-green-600 flex items-center gap-1 mt-1">
                <Scan className="h-4 w-4" />
                Código escaneado: <span className="font-mono font-bold">{initialBarcode}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          {/* Código de Barras */}
          <div>
            <label htmlFor="barcode" className="block text-sm font-medium text-gray-700 mb-2">
              Código de Barras (opcional)
            </label>
            <input
              type="text" id="barcode" name="barcode"
              value={formData.barcode} onChange={handleChange}
              placeholder="7790123456789"
              readOnly={!!initialBarcode}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                initialBarcode ? 'border-green-300 bg-green-50 text-green-800 font-mono' : 'border-gray-300'
              }`}
              pattern="[0-9]*" maxLength={13}
            />
            <p className="mt-1 text-xs text-gray-500">
              {initialBarcode ? 'Código prellenado desde el scanner' : '8 a 13 dígitos. Déjalo vacío si el producto no tiene código.'}
            </p>
          </div>

          {/* Nombre */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Nombre del Producto *
            </label>
            <input
              type="text" id="name" name="name"
              value={formData.name} onChange={handleChange}
              placeholder="Ej: Coca Cola 500ml"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              autoFocus={!!initialBarcode}
            />
          </div>

          {/* Descripción */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">Descripción (opcional)</label>
            <textarea id="description" name="description" value={formData.description} onChange={handleChange}
              placeholder="Descripción del producto..." rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* Categoría */}
          <div>
            <label htmlFor="category_id" className="block text-sm font-medium text-gray-700 mb-2">Categoría (opcional)</label>
            <select id="category_id" name="category_id" value={formData.category_id} onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="">Sin categoría</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>

          {/* Precios */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Precios</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="price_cost" className="block text-sm font-medium text-gray-700 mb-2">Costo (ARS)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input type="number" id="price_cost" name="price_cost" value={formData.price_cost} onChange={handleChange}
                    placeholder="0.00" step="0.01" min="0"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
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
                <label htmlFor="price_sale" className="block text-sm font-medium text-gray-700 mb-2">Venta (ARS)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input type="number" id="price_sale" name="price_sale" value={formData.price_sale} onChange={handleChange}
                    placeholder="0.00" step="0.01" min="0"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
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

          {/* Margen */}
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
              <label htmlFor="stock_quantity" className="block text-sm font-medium text-gray-700 mb-2">Stock Inicial</label>
              <input type="number" id="stock_quantity" name="stock_quantity" value={formData.stock_quantity} onChange={handleChange}
                placeholder="0" min="0" step="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label htmlFor="stock_min" className="block text-sm font-medium text-gray-700 mb-2">Stock Mínimo</label>
              <input type="number" id="stock_min" name="stock_min" value={formData.stock_min} onChange={handleChange}
                placeholder="10" min="0" step="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Creando...' : 'Crear Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
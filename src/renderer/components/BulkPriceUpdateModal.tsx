import { useState, useMemo } from 'react'
import { X, Percent, Search, CheckSquare, Square, MinusSquare, ArrowUp, ArrowDown, Loader2, CheckCircle, AlertTriangle, Tag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Product } from '@/store/products'

interface Props {
  isOpen: boolean
  onClose: () => void
  products: Product[]
  categories: { id: string; name: string; color: string }[]
  onComplete: () => void
}

type PriceField = 'price_sale' | 'price_cost' | 'price_sale_usd' | 'price_cost_usd'
type Direction = 'increase' | 'decrease'

const PRICE_FIELDS: { key: PriceField; label: string }[] = [
  { key: 'price_sale', label: 'Precio venta (ARS)' },
  { key: 'price_cost', label: 'Precio costo (ARS)' },
  { key: 'price_sale_usd', label: 'Precio venta (USD)' },
  { key: 'price_cost_usd', label: 'Precio costo (USD)' },
]

export default function BulkPriceUpdateModal({ isOpen, onClose, products, categories, onComplete }: Props) {
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)

  // Config
  const [percentage, setPercentage] = useState('')
  const [direction, setDirection] = useState<Direction>('increase')
  const [selectedFields, setSelectedFields] = useState<Set<PriceField>>(new Set(['price_sale']))
  const [roundTo, setRoundTo] = useState<number>(0) // 0 = entero, 2 = centavos

  // State
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateProgress, setUpdateProgress] = useState<{ current: number; total: number } | null>(null)
  const [result, setResult] = useState<{ updated: number; errors: number } | null>(null)

  const filteredProducts = useMemo(() => {
    let list = products
    if (filterCategory) {
      list = list.filter(p => p.product?.category_id === filterCategory)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(p =>
        p.product?.name?.toLowerCase().includes(q) ||
        p.barcode?.includes(q)
      )
    }
    return list
  }, [products, searchQuery, filterCategory])

  const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id))
  const someFilteredSelected = filteredProducts.some(p => selectedIds.has(p.id))

  const toggleAll = () => {
    if (allFilteredSelected) {
      // Deselect all filtered
      const newSet = new Set(selectedIds)
      filteredProducts.forEach(p => newSet.delete(p.id))
      setSelectedIds(newSet)
    } else {
      // Select all filtered
      const newSet = new Set(selectedIds)
      filteredProducts.forEach(p => newSet.add(p.id))
      setSelectedIds(newSet)
    }
  }

  const toggleOne = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const toggleField = (field: PriceField) => {
    const newSet = new Set(selectedFields)
    if (newSet.has(field)) {
      if (newSet.size > 1) newSet.delete(field) // Al menos 1
    } else {
      newSet.add(field)
    }
    setSelectedFields(newSet)
  }

  const pctValue = parseFloat(percentage)
  const isValidPct = !isNaN(pctValue) && pctValue > 0 && pctValue <= 1000
  const canApply = selectedIds.size > 0 && isValidPct && selectedFields.size > 0

  // Preview: show first 5 selected products with before/after
  const previewProducts = useMemo(() => {
    if (!isValidPct) return []
    const factor = direction === 'increase'
      ? 1 + pctValue / 100
      : 1 - pctValue / 100
    return products
      .filter(p => selectedIds.has(p.id))
      .slice(0, 5)
      .map(p => {
        const changes: { field: string; before: number; after: number }[] = []
        selectedFields.forEach(field => {
          const before = (p as any)[field]
          if (before != null && before > 0) {
            let after = before * factor
            if (roundTo === 0) after = Math.round(after)
            else after = Math.round(after * 100) / 100
            changes.push({
              field: PRICE_FIELDS.find(f => f.key === field)!.label,
              before,
              after,
            })
          }
        })
        return { name: p.product?.name || '(sin nombre)', changes }
      })
  }, [selectedIds, percentage, direction, selectedFields, roundTo, products])

  const handleApply = async () => {
    if (!canApply) return
    const { user } = useAuthStore.getState()
    if (!user) return

    setIsUpdating(true)
    setUpdateProgress(null)
    setResult(null)

    const factor = direction === 'increase'
      ? 1 + pctValue / 100
      : 1 - pctValue / 100

    const toUpdate = products.filter(p => selectedIds.has(p.id))
    let updated = 0
    let errors = 0

    for (let i = 0; i < toUpdate.length; i++) {
      const p = toUpdate[i]
      setUpdateProgress({ current: i + 1, total: toUpdate.length })

      const updates: any = { updated_by: user.id }

      selectedFields.forEach(field => {
        const before = (p as any)[field]
        if (before != null && before > 0) {
          let after = before * factor
          if (roundTo === 0) after = Math.round(after)
          else after = Math.round(after * 100) / 100
          updates[field] = after
        }
      })

      // Incrementar version
      updates.version = (p.version || 1) + 1

      const { error } = await supabase
        .from('products_branch')
        .update(updates)
        .eq('id', p.id)

      if (error) {
        console.error('Error updating product:', p.id, error)
        errors++
      } else {
        updated++
      }
    }

    setResult({ updated, errors })
    setIsUpdating(false)
  }

  const handleClose = () => {
    if (isUpdating) return
    if (result && result.updated > 0) {
      onComplete()
    }
    // Reset
    setSelectedIds(new Set())
    setSearchQuery('')
    setFilterCategory(null)
    setPercentage('')
    setDirection('increase')
    setSelectedFields(new Set(['price_sale']))
    setResult(null)
    setUpdateProgress(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Actualizar precios masivamente</h2>
            <p className="text-sm text-gray-500 mt-1">
              {selectedIds.size} producto{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Step 1: Select products */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">1. Seleccionar productos</h3>

            {/* Search + Category filter */}
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <select
                value={filterCategory || ''}
                onChange={(e) => setFilterCategory(e.target.value || null)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas las categorías</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Select all / none */}
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 mb-2 font-medium"
            >
              {allFilteredSelected ? (
                <><CheckSquare className="w-4 h-4" /> Deseleccionar todos ({filteredProducts.length})</>
              ) : someFilteredSelected ? (
                <><MinusSquare className="w-4 h-4" /> Seleccionar todos ({filteredProducts.length})</>
              ) : (
                <><Square className="w-4 h-4" /> Seleccionar todos ({filteredProducts.length})</>
              )}
            </button>

            {/* Product list */}
            <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
              {filteredProducts.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No hay productos</p>
              )}
              {filteredProducts.map(p => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleOne(p.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.product?.name}</p>
                    <p className="text-xs text-gray-500">
                      ${p.price_sale.toLocaleString('es-AR')}
                      {p.price_sale_usd != null && ` · U$D ${p.price_sale_usd}`}
                      {p.barcode && ` · ${p.barcode}`}
                    </p>
                  </div>
                  {p.category && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: p.category.color + '20', color: p.category.color }}
                    >
                      {p.category.name}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Step 2: Configure update */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">2. Configurar ajuste</h3>

            {/* Direction */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setDirection('increase')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 font-medium transition ${
                  direction === 'increase'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <ArrowUp className="w-4 h-4" /> Aumentar
              </button>
              <button
                onClick={() => setDirection('decrease')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 font-medium transition ${
                  direction === 'decrease'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <ArrowDown className="w-4 h-4" /> Reducir
              </button>
            </div>

            {/* Percentage */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Porcentaje</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.1"
                    max="1000"
                    step="0.1"
                    placeholder="Ej: 15"
                    value={percentage}
                    onChange={(e) => setPercentage(e.target.value)}
                    className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Redondeo</label>
                <select
                  value={roundTo}
                  onChange={(e) => setRoundTo(Number(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>Entero ($100)</option>
                  <option value={2}>Centavos ($100.50)</option>
                </select>
              </div>
            </div>

            {/* Fields to update */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Campos a actualizar</label>
              <div className="grid grid-cols-2 gap-2">
                {PRICE_FIELDS.map(f => (
                  <label
                    key={f.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                      selectedFields.has(f.key)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFields.has(f.key)}
                      onChange={() => toggleField(f.key)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm">{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          {canApply && previewProducts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">3. Vista previa</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Producto</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Campo</th>
                      <th className="text-right px-3 py-2 text-gray-600 font-medium">Actual</th>
                      <th className="text-right px-3 py-2 text-gray-600 font-medium">Nuevo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewProducts.map((p, pi) =>
                      p.changes.map((c, ci) => (
                        <tr key={`${pi}-${ci}`} className="border-t border-gray-100">
                          {ci === 0 && (
                            <td className="px-3 py-2 font-medium text-gray-900" rowSpan={p.changes.length}>
                              {p.name}
                            </td>
                          )}
                          <td className="px-3 py-2 text-gray-500">{c.field}</td>
                          <td className="px-3 py-2 text-right text-gray-500">${c.before.toLocaleString('es-AR')}</td>
                          <td className={`px-3 py-2 text-right font-medium ${
                            direction === 'increase' ? 'text-green-700' : 'text-red-700'
                          }`}>
                            ${c.after.toLocaleString('es-AR')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                {selectedIds.size > 5 && (
                  <p className="text-xs text-gray-400 text-center py-2 border-t border-gray-100">
                    ...y {selectedIds.size - 5} productos mas
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Progress */}
          {isUpdating && updateProgress && (
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <span className="text-sm font-medium text-blue-700">Actualizando precios...</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${(updateProgress.current / updateProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-blue-500 mt-1 text-center">
                {updateProgress.current} de {updateProgress.total}
              </p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`rounded-lg p-4 ${result.errors > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.errors > 0 ? (
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                )}
                <span className={`font-medium ${result.errors > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
                  {result.updated} producto{result.updated !== 1 ? 's' : ''} actualizado{result.updated !== 1 ? 's' : ''}
                  {result.errors > 0 && ` · ${result.errors} error${result.errors !== 1 ? 'es' : ''}`}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Se {direction === 'increase' ? 'aumento' : 'redujo'} un {pctValue}% en {Array.from(selectedFields).map(f => PRICE_FIELDS.find(pf => pf.key === f)?.label).join(', ')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-between items-center">
          <p className="text-sm text-gray-500">
            {selectedIds.size > 0 && isValidPct && (
              <>
                {direction === 'increase' ? '↑' : '↓'} {pctValue}% a {selectedIds.size} producto{selectedIds.size !== 1 ? 's' : ''}
              </>
            )}
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              disabled={isUpdating}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-800 rounded-lg transition font-medium"
            >
              {result ? 'Cerrar' : 'Cancelar'}
            </button>
            {!result && (
              <button
                onClick={handleApply}
                disabled={!canApply || isUpdating}
                className={`px-6 py-2 rounded-lg transition font-medium text-white ${
                  direction === 'increase'
                    ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-300'
                    : 'bg-red-600 hover:bg-red-700 disabled:bg-red-300'
                }`}
              >
                {direction === 'increase' ? 'Aumentar precios' : 'Reducir precios'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

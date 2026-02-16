import { useState } from 'react'
import { X, TrendingUp, TrendingDown, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useProductsStore, Product } from '@/store/products'

interface InventoryMovementModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
}

type MovementType = 'entry' | 'exit'

// Mapeo de motivos a transaction_type
const MOVEMENT_OPTIONS = {
  entry: [
    { label: 'Compra', value: 'compra', transactionType: 'purchase' },
    { label: 'Devolución de cliente', value: 'devolucion_in', transactionType: 'return_in' },
    { label: 'Transferencia (entrada)', value: 'transfer_in', transactionType: 'transfer_in' },
    { label: 'Ajuste positivo', value: 'ajuste_pos', transactionType: 'adjustment' },
  ],
  exit: [
    { label: '⭐ Venta', value: 'venta', transactionType: 'sale' },
    { label: 'Pérdida/Merma', value: 'merma', transactionType: 'loss' },
    { label: 'Producto dañado', value: 'danado', transactionType: 'damage' },
    { label: 'Robo', value: 'robo', transactionType: 'theft' },
    { label: 'Devolución a proveedor', value: 'devolucion_out', transactionType: 'return_out' },
    { label: 'Transferencia (salida)', value: 'transfer_out', transactionType: 'transfer_out' },
    { label: 'Muestra gratis', value: 'muestra', transactionType: 'sample' },
    { label: 'Uso interno', value: 'uso_interno', transactionType: 'internal_use' },
    { label: 'Ajuste negativo', value: 'ajuste_neg', transactionType: 'adjustment' },
  ]
}

export default function InventoryMovementModal({ product, isOpen, onClose }: InventoryMovementModalProps) {
  const { user, branch } = useAuthStore()
  const { updateProduct } = useProductsStore()
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const [movementType, setMovementType] = useState<MovementType>('entry')
  const [quantity, setQuantity] = useState('')
  const [selectedOption, setSelectedOption] = useState('')
  const [notes, setNotes] = useState('')

  if (!isOpen || !product) return null

  const currentStock = product.stock_quantity
  const newStock = movementType === 'entry' 
    ? currentStock + (parseInt(quantity) || 0)
    : currentStock - (parseInt(quantity) || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const qty = parseInt(quantity)
      
      if (!qty || qty <= 0) {
        throw new Error('La cantidad debe ser mayor a 0')
      }

      if (!selectedOption) {
        throw new Error('Debes seleccionar un tipo de movimiento')
      }

      // Validar si es salida y no hay stock suficiente
      if (movementType === 'exit' && qty > currentStock) {
        const confirmed = window.confirm(
          `⚠️ ADVERTENCIA: Intentas retirar ${qty} unidades pero solo hay ${currentStock} en stock.\n\n` +
          `Esto dejará el stock en ${newStock} (negativo).\n\n` +
          `¿Continuar de todos modos?`
        )
        
        if (!confirmed) {
          setLoading(false)
          return
        }
      }

      // Obtener el transaction_type del option seleccionado
      const allOptions = [...MOVEMENT_OPTIONS.entry, ...MOVEMENT_OPTIONS.exit]
      const option = allOptions.find(opt => opt.value === selectedOption)
      const transactionType = option?.transactionType || 'adjustment'

      const stockAfter = movementType === 'entry' 
        ? currentStock + qty 
        : currentStock - qty

      // 1. Registrar el movimiento CON transaction_type y precios históricos
      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert({
          product_branch_id: product.id,
          branch_id: branch?.id || product.branch_id,
          movement_type: movementType,
          transaction_type: transactionType,           // ← NUEVO
          quantity: qty,
          stock_before: currentStock,
          stock_after: stockAfter,
          price_at_movement: product.price_sale,       // ← NUEVO: Precio histórico
          cost_at_movement: product.price_cost,        // ← NUEVO: Costo histórico
          reason: option?.label || selectedOption,
          notes: notes.trim() || null,
          created_by: user?.id,
        })

      if (movementError) throw movementError

      // 2. Actualizar el stock del producto
      await updateProduct(product.id, {
        stock_quantity: stockAfter
      })

      // Resetear y cerrar
      setQuantity('')
      setSelectedOption('')
      setNotes('')
      setMovementType('entry')
      onClose()

    } catch (err: any) {
      console.error('Error registering movement:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const productName = product.name
  const currentOptions = MOVEMENT_OPTIONS[movementType]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Registrar Movimiento</h2>
            <p className="text-sm text-gray-600 mt-1">{productName}</p>
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

          {/* Stock Actual */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-600">
                <Package className="w-5 h-5" />
                <span className="text-sm font-medium">Stock Actual</span>
              </div>
              <span className="text-2xl font-bold text-gray-900">
                {currentStock} <span className="text-sm font-normal text-gray-500">unidades</span>
              </span>
            </div>
          </div>

          {/* Tipo de Movimiento */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Movimiento *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setMovementType('entry')
                  setSelectedOption('')
                }}
                className={`flex items-center justify-center gap-2 px-4 py-3 border-2 rounded-lg transition ${
                  movementType === 'entry'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <TrendingUp className="w-5 h-5" />
                <span className="font-medium">Entrada</span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setMovementType('exit')
                  setSelectedOption('')
                }}
                className={`flex items-center justify-center gap-2 px-4 py-3 border-2 rounded-lg transition ${
                  movementType === 'exit'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <TrendingDown className="w-5 h-5" />
                <span className="font-medium">Salida</span>
              </button>
            </div>
          </div>

          {/* Cantidad */}
          <div>
            <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-2">
              Cantidad *
            </label>
            <input
              type="number"
              id="quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              min="1"
              step="1"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Tipo de Transacción */}
          <div>
            <label htmlFor="transaction" className="block text-sm font-medium text-gray-700 mb-2">
              {movementType === 'exit' ? '¿Qué tipo de salida es? *' : '¿Qué tipo de entrada es? *'}
            </label>
            <select
              id="transaction"
              value={selectedOption}
              onChange={(e) => setSelectedOption(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="">Selecciona una opción</option>
              {currentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {movementType === 'exit' && (
              <p className="text-xs text-gray-500 mt-1">
                ⭐ Solo las <strong>ventas</strong> aparecen en reportes comerciales
              </p>
            )}
          </div>

          {/* Notas */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              Notas (opcional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Información adicional..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* Resumen */}
          {quantity && parseInt(quantity) > 0 && (
            <div className={`rounded-lg p-4 border-2 ${
              movementType === 'entry' 
                ? 'bg-green-50 border-green-200' 
                : newStock < 0 
                  ? 'bg-red-50 border-red-200'
                  : 'bg-orange-50 border-orange-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${
                  movementType === 'entry' ? 'text-green-700' : 'text-orange-700'
                }`}>
                  Stock después del movimiento:
                </span>
                <span className={`text-2xl font-bold ${
                  movementType === 'entry' 
                    ? 'text-green-900' 
                    : newStock < 0 
                      ? 'text-red-900'
                      : 'text-orange-900'
                }`}>
                  {newStock}
                </span>
              </div>
              <div className="text-xs text-gray-600">
                {currentStock} {movementType === 'entry' ? '+' : '-'} {parseInt(quantity) || 0} = {newStock}
              </div>
              
              {newStock < 0 && (
                <div className="mt-2 text-xs text-red-700 font-medium">
                  ⚠️ El stock quedará negativo
                </div>
              )}
            </div>
          )}

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
              className={`flex-1 px-4 py-2 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                movementType === 'entry'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
              disabled={loading}
            >
              {loading ? 'Registrando...' : 'Registrar Movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
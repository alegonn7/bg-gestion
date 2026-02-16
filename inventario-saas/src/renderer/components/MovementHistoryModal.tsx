import { useState, useEffect } from 'react'
import { X, TrendingUp, TrendingDown, Clock, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/store/products'

interface MovementHistoryModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
}

interface Movement {
  id: string
  movement_type: string
  quantity: number
  stock_before: number
  stock_after: number
  reason: string
  notes: string | null
  created_at: string
  created_by: string
  users?: {
    full_name: string | null
    email: string
  }
}

export default function MovementHistoryModal({ product, isOpen, onClose }: MovementHistoryModalProps) {
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && product) {
      loadMovements()
    }
  }, [isOpen, product])

  const loadMovements = async () => {
    if (!product) return
    
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select(`
          *,
          users (
            full_name,
            email
          )
        `)
        .eq('product_branch_id', product.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setMovements(data || [])
    } catch (error) {
      console.error('Error loading movements:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !product) return null

  const productName =  product.name

  const getMovementIcon = (type: string) => {
    return type === 'entry' ? TrendingUp : TrendingDown
  }

  const getMovementColor = (type: string) => {
    return type === 'entry' 
      ? 'text-green-600 bg-green-50' 
      : 'text-red-600 bg-red-50'
  }

  const getMovementLabel = (type: string) => {
    const labels = {
      entry: 'Entrada',
      exit: 'Salida',
      adjustment: 'Ajuste'
    }
    return labels[type as keyof typeof labels] || type
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Historial de Movimientos</h2>
            <p className="text-sm text-gray-600 mt-1">{productName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {!loading && movements.length === 0 && (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No hay movimientos registrados</p>
            </div>
          )}

          {!loading && movements.length > 0 && (
            <div className="space-y-3">
              {movements.map((movement) => {
                const Icon = getMovementIcon(movement.movement_type)
                const colorClass = getMovementColor(movement.movement_type)
                
                return (
                  <div
                    key={movement.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-full ${colorClass} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">
                                {getMovementLabel(movement.movement_type)}
                              </span>
                              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded capitalize">
                                {movement.reason}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                              <Clock className="w-4 h-4" />
                              <span>
                                {new Date(movement.created_at).toLocaleString('es-AR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          </div>

                          {/* Quantity */}
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${
                              movement.movement_type === 'entry' 
                                ? 'text-green-600' 
                                : 'text-red-600'
                            }`}>
                              {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                            </div>
                            <div className="text-xs text-gray-500">unidades</div>
                          </div>
                        </div>

                        {/* Stock Change */}
                        <div className="flex items-center gap-2 text-sm mb-2">
                          <span className="text-gray-600">Stock:</span>
                          <span className="font-mono font-medium text-gray-900">
                            {movement.stock_before}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className={`font-mono font-bold ${
                            movement.stock_after > movement.stock_before 
                              ? 'text-green-600' 
                              : movement.stock_after < movement.stock_before
                                ? 'text-red-600'
                                : 'text-gray-900'
                          }`}>
                            {movement.stock_after}
                          </span>
                        </div>

                        {/* Notes */}
                        {movement.notes && (
                          <div className="bg-gray-50 rounded p-2 text-sm text-gray-700 mb-2">
                            💬 {movement.notes}
                          </div>
                        )}

                        {/* User */}
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <User className="w-3 h-3" />
                          <span>
                            {movement.users?.full_name || movement.users?.email || 'Usuario desconocido'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">
              Total de movimientos: <span className="font-semibold text-gray-900">{movements.length}</span>
            </div>
            {movements.length > 0 && (
              <button
                onClick={() => {
                  // TODO: Exportar a CSV
                  alert('Función de exportación próximamente...')
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Exportar a CSV
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
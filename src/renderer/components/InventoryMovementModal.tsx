import { useState, useEffect } from 'react'
import { X, TrendingUp, TrendingDown, Package, ShoppingCart, Banknote, ArrowLeftRight, AlertCircle, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useProductsStore, Product } from '@/store/products'
import { useCashRegisterStore } from '@/store/cash-register'
import { useTransferAccounts } from '@/store/transfer-accounts'
import type { NuevoRemito } from '@/store/remitos'
import type { MotivoRemito } from '@/lib/remitos'
import RemitoModal from './RemitoModal'

interface InventoryMovementModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
}

type MovementType = 'entry' | 'exit'

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
  ],
}

type PaymentSource = 'cash' | 'personal' | 'bank'

// Salidas de mercadería que viajan con remito
const REMITO_POR_MOVIMIENTO: Record<string, MotivoRemito> = {
  venta: 'venta',
  transfer_out: 'traslado',
  devolucion_out: 'devolucion',
  muestra: 'sin_cargo',
}

export default function InventoryMovementModal({ product, isOpen, onClose }: InventoryMovementModalProps) {
  const { user, branch, organization } = useAuthStore()
  const { updateProduct } = useProductsStore()
  const { currentRegister } = useCashRegisterStore()
  const { accounts, fetchAccounts } = useTransferAccounts()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [movementType, setMovementType] = useState<MovementType>('entry')
  const [quantity, setQuantity] = useState('')
  const [selectedOption, setSelectedOption] = useState('')
  const [notes, setNotes] = useState('')

  // Campos extra solo para compras
  const [purchaseCost, setPurchaseCost] = useState('')
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('cash')
  const [transferAccountId, setTransferAccountId] = useState('')

  const isPurchase = selectedOption === 'compra'

  // Remito del movimiento: se abre al registrar una salida que lo lleva
  const motivoRemito = REMITO_POR_MOVIMIENTO[selectedOption]
  const [generarRemito, setGenerarRemito] = useState(true)
  const [remitoInicial, setRemitoInicial] = useState<Partial<NuevoRemito> | null>(null)

  useEffect(() => {
    fetchAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-calcular costo cuando cambia la cantidad en una compra
  useEffect(() => {
    if (isPurchase && quantity && product) {
      const auto = (parseInt(quantity) || 0) * product.price_cost
      setPurchaseCost(auto > 0 ? auto.toFixed(2) : '')
    }
  }, [quantity, isPurchase, product])

  // Resetear campos de compra al cambiar el tipo de movimiento
  useEffect(() => {
    setPurchaseCost('')
    setPaymentSource('cash')
    setTransferAccountId('')
  }, [selectedOption])

  const recalculateCost = () => {
    if (product && quantity) {
      const auto = (parseInt(quantity) || 0) * product.price_cost
      setPurchaseCost(auto > 0 ? auto.toFixed(2) : '')
    }
  }

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

      if (!qty || qty <= 0) throw new Error('La cantidad debe ser mayor a 0')
      if (!selectedOption) throw new Error('Debes seleccionar un tipo de movimiento')

      if (movementType === 'exit' && qty > currentStock) {
        const confirmed = window.confirm(
          `⚠️ ADVERTENCIA: Intentas retirar ${qty} unidades pero solo hay ${currentStock} en stock.\n\n` +
          `Esto dejará el stock en ${newStock} (negativo).\n\n¿Continuar de todos modos?`
        )
        if (!confirmed) { setLoading(false); return }
      }

      const allOptions = [...MOVEMENT_OPTIONS.entry, ...MOVEMENT_OPTIONS.exit]
      const option = allOptions.find(opt => opt.value === selectedOption)
      const transactionType = option?.transactionType || 'adjustment'
      const stockAfter = movementType === 'entry' ? currentStock + qty : currentStock - qty

      // En una compra, purchaseCost es el costo TOTAL pagado; el costo unitario real es total/cantidad.
      // Ese es el costo que se guarda en el movimiento (antes se usaba el costo viejo del producto).
      const purchaseTotal = isPurchase ? (parseFloat(purchaseCost) || 0) : 0
      const purchaseUnitCost = isPurchase && qty > 0 && purchaseTotal > 0 ? purchaseTotal / qty : product.price_cost

      // 1. Registrar movimiento de inventario
      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert({
          product_branch_id: product.id,
          branch_id: branch?.id || product.branch_id,
          movement_type: movementType,
          transaction_type: transactionType,
          quantity: qty,
          stock_before: currentStock,
          stock_after: stockAfter,
          price_at_movement: product.price_sale,
          cost_at_movement: purchaseUnitCost,
          reason: option?.label || selectedOption,
          notes: notes.trim() || null,
          created_by: user?.id,
        })

      if (movementError) throw movementError

      // 2. Actualizar stock del producto. En una compra con costo, además se actualiza el costo del
      // producto al último costo pagado (antes quedaba con el costo viejo).
      await updateProduct(product.id, {
        stock_quantity: stockAfter,
        ...(isPurchase && purchaseTotal > 0 ? { price_cost: purchaseUnitCost } : {}),
      })

      // 3. Registrar egreso de compra
      if (isPurchase && purchaseTotal > 0) {
        const sourceLabel = paymentSource === 'cash' ? 'caja' : paymentSource === 'bank' ? 'transferencia' : 'efectivo (fuera)'
        const movData: any = {
          type: 'gasto',
          amount: purchaseTotal,
          description: `Compra: ${product.product?.name} x${qty} unid. — pago ${sourceLabel}`,
          source: paymentSource,
          category: 'mercaderia',
          created_by: user?.id,
          created_by_name: user?.full_name || user?.email || '',
        }

        // Solo el pago en efectivo con una caja abierta afecta el arqueo de esa caja. En cualquier
        // otro caso (banco, efectivo fuera, o caja sin registro abierto) queda como movimiento de la
        // organización: antes, pagar "de caja" sin caja abierta descartaba el egreso por completo.
        if (paymentSource === 'cash' && currentRegister) {
          movData.cash_register_id = currentRegister.id
        } else {
          movData.organization_id = organization?.id
        }

        if (paymentSource === 'bank' && transferAccountId) {
          movData.transfer_account_id = transferAccountId
        }

        const { error: expenseError } = await supabase.from('extra_movements').insert(movData)
        if (expenseError) throw expenseError
      }

      // Si la salida lleva remito, se abre con el producto y la cantidad ya cargados
      if (motivoRemito && generarRemito) {
        setRemitoInicial({
          motivo: motivoRemito,
          items: [{ codigo: product.barcode || '', descripcion: product.product?.name || '', cantidad: qty }],
          observaciones: notes.trim() || undefined,
        })
      }

      // Resetear y cerrar
      setQuantity('')
      setSelectedOption('')
      setNotes('')
      setMovementType('entry')
      setPurchaseCost('')
      setPaymentSource('cash')
      setTransferAccountId('')
      if (!(motivoRemito && generarRemito)) onClose()

    } catch (err: any) {
      console.error('Error registering movement:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const productName = product.product?.name
  const currentOptions = MOVEMENT_OPTIONS[movementType]

  if (remitoInicial) {
    return <RemitoModal inicial={remitoInicial} onClose={() => { setRemitoInicial(null); onClose() }} />
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Registrar Movimiento</h2>
            <p className="text-sm text-gray-600 mt-1">{productName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Stock actual */}
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

          {/* Tipo entrada/salida */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Movimiento *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setMovementType('entry'); setSelectedOption('') }}
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
                onClick={() => { setMovementType('exit'); setSelectedOption('') }}
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
              onChange={e => setQuantity(e.target.value)}
              placeholder="0"
              min="1"
              step="1"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Tipo de transacción */}
          <div>
            <label htmlFor="transaction" className="block text-sm font-medium text-gray-700 mb-2">
              {movementType === 'exit' ? '¿Qué tipo de salida es? *' : '¿Qué tipo de entrada es? *'}
            </label>
            <select
              id="transaction"
              value={selectedOption}
              onChange={e => setSelectedOption(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="">Selecciona una opción</option>
              {currentOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {movementType === 'exit' && (
              <p className="text-xs text-gray-500 mt-1">
                ⭐ Solo las <strong>ventas</strong> aparecen en reportes comerciales
              </p>
            )}
          </div>

          {/* ── SECCIÓN COMPRA ── */}
          {isPurchase && (
            <div className="border-2 border-blue-200 bg-blue-50 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm">
                <ShoppingCart className="w-4 h-4" />
                Datos de la compra
              </div>

              {/* Costo total */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Costo total pagado
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                    <input
                      type="number"
                      value={purchaseCost}
                      onChange={e => setPurchaseCost(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={recalculateCost}
                    title={`Recalcular: ${parseInt(quantity) || 0} × $${product.price_cost.toFixed(2)}`}
                    className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Auto
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Precio de costo: {parseInt(quantity) || 0} × ${product.price_cost.toFixed(2)} = ${((parseInt(quantity) || 0) * product.price_cost).toFixed(2)}
                </p>
              </div>

              {/* ¿De dónde sale la plata? */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">¿De dónde sale la plata?</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'cash',     icon: Banknote,      label: '💵 Caja actual',     sub: 'Afecta arqueo' },
                    { value: 'personal', icon: Banknote,      label: '💵 Efectivo',         sub: 'Fuera de caja' },
                    { value: 'bank',     icon: ArrowLeftRight, label: '🏦 Transferencia',   sub: 'Elegir cuenta' },
                  ] as { value: PaymentSource; icon: any; label: string; sub: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setPaymentSource(opt.value); if (opt.value !== 'bank') setTransferAccountId('') }}
                      className={`flex flex-col items-center px-2 py-2 border-2 rounded-lg text-xs transition ${
                        paymentSource === opt.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className={`mt-0.5 ${paymentSource === opt.value ? 'text-blue-400' : 'text-gray-400'}`}>{opt.sub}</span>
                    </button>
                  ))}
                </div>

                {/* Selector de cuenta */}
                {paymentSource === 'bank' && (
                  <div className="mt-2">
                    <select
                      value={transferAccountId}
                      onChange={e => setTransferAccountId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="">— Elegir cuenta —</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>{a.nombre}{a.alias ? ` (${a.alias})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Info de registro */}
              <div className="text-xs text-gray-500 pt-1">
                {paymentSource === 'cash' && !currentRegister && (
                  <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <p className="text-yellow-700">No hay caja abierta. El egreso igual queda registrado en contabilidad, pero no afecta ningún arqueo de caja.</p>
                  </div>
                )}
                {paymentSource === 'cash' && currentRegister && (
                  <p className="text-green-600">✓ El pago se descuenta de la caja actual</p>
                )}
                {paymentSource === 'personal' && (
                  <p>El pago queda registrado en contabilidad — no afecta el arqueo de caja</p>
                )}
                {paymentSource === 'bank' && (
                  <p>El pago queda registrado en la cuenta seleccionada</p>
                )}
              </div>
            </div>
          )}

          {/* Notas */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              Notas (opcional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Información adicional..."
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {motivoRemito && (
            <label className="flex items-center gap-2 text-sm text-gray-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <input type="checkbox" checked={generarRemito} onChange={e => setGenerarRemito(e.target.checked)} />
              Generar remito para acompañar la mercadería
            </label>
          )}

          {/* Resumen stock */}
          {quantity && parseInt(quantity) > 0 && (
            <div className={`rounded-lg p-4 border-2 ${
              movementType === 'entry'
                ? 'bg-green-50 border-green-200'
                : newStock < 0
                  ? 'bg-red-50 border-red-200'
                  : 'bg-orange-50 border-orange-200'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-medium ${
                  movementType === 'entry' ? 'text-green-700' : 'text-orange-700'
                }`}>
                  Stock después del movimiento:
                </span>
                <span className={`text-2xl font-bold ${
                  movementType === 'entry' ? 'text-green-900' : newStock < 0 ? 'text-red-900' : 'text-orange-900'
                }`}>
                  {newStock}
                </span>
              </div>
              <div className="text-xs text-gray-600">
                {currentStock} {movementType === 'entry' ? '+' : '-'} {parseInt(quantity) || 0} = {newStock}
              </div>
              {isPurchase && purchaseCost && parseFloat(purchaseCost) > 0 && (
                <div className="mt-2 pt-2 border-t border-green-200 text-xs text-green-700">
                  Egreso: <strong>${parseFloat(purchaseCost).toFixed(2)}</strong>
                  {' — '}{paymentSource === 'cash' ? '💵 Caja actual' : paymentSource === 'bank' ? '🏦 Transferencia' : '💵 Efectivo (fuera)'}
                </div>
              )}
              {newStock < 0 && (
                <div className="mt-2 text-xs text-red-700 font-medium">⚠️ El stock quedará negativo</div>
              )}
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 px-4 py-2 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                movementType === 'entry' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {loading ? 'Registrando...' : 'Registrar Movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

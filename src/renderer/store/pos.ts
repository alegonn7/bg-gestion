import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'
import { useDollarStore } from './dollar'
import { withTimeout } from '@/lib/offline'

// Si el servidor no responde en este tiempo (típico sin internet), cortamos y avisamos en vez de
// dejar el "Cobrando..." colgado para siempre.
const SALE_TIMEOUT_MS = 15000

// Devuelve el blueRate efectivo según modo manual/auto
function getEffectiveBlueRate() {
  const { manualMode, manualBlueRate, blueRate } = useDollarStore.getState();
  return manualMode && manualBlueRate ? manualBlueRate : blueRate;
}
import type { Product } from './products'

export type PriceMode = 'ars' | 'usd' | 'usd_to_ars'

// Devuelve el precio efectivo según el modo.
// 'ars' → price_sale (manual ARS)
// 'usd' → price_sale_usd tal cual (en dólares). Fallback a price_sale.
// 'usd_to_ars' → price_sale_usd × blueRate (conversión automática). Fallback a price_sale.
export function getEffectivePrice(product: Product, mode: PriceMode, blueRate?: number | null): number {
  // Si no se pasa blueRate, usar el efectivo
  const rate = blueRate !== undefined ? blueRate : getEffectiveBlueRate();
  if (mode === 'usd' && product.price_sale_usd) {
    return product.price_sale_usd // devuelve USD puro
  }
  if (mode === 'usd_to_ars' && product.price_sale_usd && rate) {
    return product.price_sale_usd * rate;
  }
  return product.price_sale;
}

// Etiqueta legible del modo de precio
export function priceModeLabel(mode: PriceMode): string {
  switch (mode) {
    case 'ars': return 'Pesos (ARS)'
    case 'usd': return 'Dólares (USD)'
    case 'usd_to_ars': return 'USD → ARS (Blue)'
  }
}

// Símbolo de moneda según modo
export function priceModeCurrency(mode: PriceMode): string {
  return mode === 'usd' ? 'US$' : '$'
}

export interface CartItem {
  product: Product
  quantity: number
  subtotal: number
}

interface POSState {
  items: CartItem[]
  discount: number
  discountType: 'amount' | 'percentage'
  priceMode: PriceMode
  isProcessing: boolean
  error: string | null
  /** Id propio de la venta en curso. Se reutiliza si hay que reintentar, para no duplicar. */
  pendingSaleId: string | null

  addToCart: (product: Product, quantity?: number) => boolean
  removeFromCart: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  setDiscount: (value: number, type: 'amount' | 'percentage') => void
  setPriceMode: (mode: PriceMode) => void
  
  getSubtotal: () => number
  getDiscountAmount: () => number
  getTotal: () => number
  getTotalItems: () => number
  
  processSale: (
    paymentMethod: string,
    cashReceived?: number,
    cardReceived?: number,
    transferReceived?: number,
    transferAccount?: { id: string } | null
  ) => Promise<{ success: boolean, error?: string, saleId?: string }>
}

export const usePOSStore = create<POSState>((set, get) => ({
  items: [],
  discount: 0,
  discountType: 'amount',
  priceMode: 'ars',
  isProcessing: false,
  error: null,
  pendingSaleId: null,

  /**
   * Agrega un producto al carrito solo si hay stock suficiente.
   * Si no hay stock suficiente, retorna false. Si agrega, retorna true.
   */
  addToCart: (product, quantity = 1) => {
    const { items, priceMode } = get()
    const unitPrice = getEffectivePrice(product, priceMode)
    const existingItem = items.find(item => item.product.id === product.id)
    const currentQty = existingItem ? existingItem.quantity : 0
    const newQty = currentQty + quantity
    if (newQty > product.stock_quantity) {
      // No permitir agregar más de lo disponible
      set({ error: `Stock insuficiente para "${product.product?.name || product.barcode || 'Producto'}"` })
      return false
    }
    set({ error: null })
    if (existingItem) {
      set({
        items: items.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: newQty, subtotal: newQty * unitPrice }
            : item
        )
      })
    } else {
      set({
        items: [...items, { product, quantity, subtotal: quantity * unitPrice }]
      })
    }
    return true
  },

  removeFromCart: (productId) => {
    set({ items: get().items.filter(item => item.product.id !== productId) })
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(productId)
      return
    }
    const { priceMode } = get()
    set({
      items: get().items.map(item =>
        item.product.id === productId
          ? { ...item, quantity, subtotal: quantity * getEffectivePrice(item.product, priceMode) }
          : item
      )
    })
  },

  clearCart: () => {
    set({ items: [], discount: 0, discountType: 'amount', error: null, pendingSaleId: null })
  },

  setDiscount: (value, type) => {
    set({ discount: value, discountType: type })
  },

  setPriceMode: (mode) => {
    const { items } = get()
    // Recalcular todos los subtotales con el nuevo modo y blueRate efectivo
    set({
      priceMode: mode,
      items: items.map(item => ({
        ...item,
        subtotal: item.quantity * getEffectivePrice(item.product, mode)
      }))
    })
  },

  getSubtotal: () => get().items.reduce((sum, item) => sum + item.subtotal, 0),
  
  getDiscountAmount: () => {
    const { discount, discountType } = get()
    const subtotal = get().getSubtotal()
    const monto = discountType === 'percentage' ? (subtotal * discount) / 100 : discount
    // Nunca negativo ni mayor que lo que se está vendiendo (por ejemplo, si después se sacan productos)
    return Math.min(subtotal, Math.max(0, monto))
  },

  getTotal: () => Math.max(0, get().getSubtotal() - get().getDiscountAmount()),
  
  getTotalItems: () => get().items.reduce((sum, item) => sum + item.quantity, 0),

  processSale: async (paymentMethod, cashReceived = 0, cardReceived = 0, transferReceived = 0, transferAccount?: { id: string } | null) => {
    const { items, priceMode, getTotal, getSubtotal, getDiscountAmount, clearCart } = get()
    const { user } = useAuthStore.getState()

    if (items.length === 0) {
      return { success: false, error: 'El carrito está vacío' }
    }

    if (!user) {
      return { success: false, error: 'Usuario no autenticado' }
    }

    // Modo "US$ Dólar": la venta se muestra en dólares, pero lo que se GUARDA (contabilidad, caja,
    // reportes) se convierte a pesos al blue — es lo que representa. Así no se mezclan monedas.
    // En 'ars' y 'usd_to_ars' los importes ya vienen en pesos, así que el factor es 1.
    const isUsd = priceMode === 'usd'
    const rate = (isUsd ? getEffectiveBlueRate() : 1) ?? 0
    if (isUsd && rate <= 0) {
      return { success: false, error: 'No hay cotización del dólar cargada. Configurala antes de vender en dólares.' }
    }
    const toArs = (n: number) => Math.round((n * rate) * 100) / 100

    const subtotal = toArs(getSubtotal())
    const discountAmount = toArs(getDiscountAmount())
    const total = toArs(getTotal())
    const cardArs = toArs(cardReceived)
    const transferArs = toArs(transferReceived)

    // Montos por método. El vuelto se devuelve, no queda en la caja: lo registrado por método
    // suma el total, no lo que entregó el cliente.
    let cash_amount = 0, card_amount = 0, transfer_amount = 0
    if (paymentMethod === 'Efectivo') {
      cash_amount = total
    } else if (paymentMethod === 'Transferencia') {
      transfer_amount = transferArs || total
    } else if (paymentMethod === 'Mixto') {
      card_amount = cardArs
      transfer_amount = transferArs
      cash_amount = Math.max(0, total - card_amount - transfer_amount)
    } else {
      // Cualquier pago con tarjeta: 'Tarjeta', 'Débito' o 'Crédito'. Antes solo se contemplaba
      // 'Tarjeta', así que las ventas con Débito/Crédito quedaban con card_amount = 0 y no
      // figuraban en la cuenta "Tarjeta" ni en el flujo por método.
      card_amount = cardArs || total
    }

    // Un id propio por venta. Si esta llamada se cuelga (sin internet) y hay que reintentar, se
    // reutiliza el mismo id: el servidor detecta el duplicado y devuelve la venta ya hecha en vez
    // de crear otra. Solo se limpia cuando la venta se confirma bien.
    const clientSaleId = get().pendingSaleId ?? crypto.randomUUID()

    const saleItems = items.map(item => ({
      product_branch_id: item.product.id,
      quantity: item.quantity,
      price: toArs(getEffectivePrice(item.product, priceMode)),
      cost: item.product.price_cost,
      subtotal: toArs(item.subtotal),
    }))

    set({ isProcessing: true, error: null, pendingSaleId: clientSaleId })

    try {
      // Toda la venta (cabecera + ítems + descuento de stock + movimientos) en una sola operación
      // atómica del servidor: o queda todo o no queda nada. Con timeout para no colgar la caja.
      const response = await withTimeout(
        Promise.resolve(supabase.rpc('process_pos_sale', {
          p_client_sale_id: clientSaleId,
          p_branch_id: items[0].product.branch_id,
          p_total: total,
          p_subtotal: subtotal,
          p_discount: discountAmount,
          p_payment_method: paymentMethod,
          p_cash_amount: cash_amount,
          p_card_amount: card_amount,
          p_transfer_amount: transfer_amount,
          p_transfer_account_id: transferAccount && transferAccount.id !== 'generica' ? transferAccount.id : null,
          p_price_mode: isUsd ? `usd (blue $${rate})` : priceMode,
          p_items: saleItems,
        })),
        SALE_TIMEOUT_MS
      )

      if (response === null) {
        // Se agotó el tiempo: no sabemos si el servidor la registró. Conservamos pendingSaleId para
        // que un reintento use el mismo id y no duplique.
        set({ isProcessing: false, error: 'timeout' })
        return { success: false, error: 'Sin conexión: no pudimos confirmar la venta. Revisá tu internet y volvé a cobrar — no se va a duplicar.' }
      }

      const { data, error } = response as { data: any; error: any }
      if (error) throw error

      const saleId = Array.isArray(data) ? data[0]?.id : data?.id
      clearCart()
      set({ isProcessing: false, pendingSaleId: null })
      return { success: true, saleId }

    } catch (error: any) {
      console.error('Error processing sale:', error)
      // Conservamos pendingSaleId: si fue un corte de red, el reintento reutiliza el id y no duplica.
      set({ isProcessing: false, error: error.message })
      return { success: false, error: error.message }
    }
  }
}))
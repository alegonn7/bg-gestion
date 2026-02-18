import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'
import { useDollarStore } from './dollar'
import type { Product } from './products'

export type PriceMode = 'ars' | 'usd' | 'usd_to_ars'

// Devuelve el precio efectivo según el modo.
// 'ars' → price_sale (manual ARS)
// 'usd' → price_sale_usd tal cual (en dólares). Fallback a price_sale.
// 'usd_to_ars' → price_sale_usd × blueRate (conversión automática). Fallback a price_sale.
export function getEffectivePrice(product: Product, mode: PriceMode, blueRate: number | null): number {
  if (mode === 'usd' && product.price_sale_usd) {
    return product.price_sale_usd // devuelve USD puro
  }
  if (mode === 'usd_to_ars' && product.price_sale_usd && blueRate) {
    return product.price_sale_usd * blueRate
  }
  return product.price_sale
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

  addToCart: (product: Product, quantity?: number) => void
  removeFromCart: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  setDiscount: (value: number, type: 'amount' | 'percentage') => void
  setPriceMode: (mode: PriceMode) => void
  
  getSubtotal: () => number
  getDiscountAmount: () => number
  getTotal: () => number
  getTotalItems: () => number
  
  processSale: (paymentMethod: string, cashReceived?: number) => Promise<{ success: boolean, error?: string, saleId?: string }>
}

export const usePOSStore = create<POSState>((set, get) => ({
  items: [],
  discount: 0,
  discountType: 'amount',
  priceMode: 'ars',
  isProcessing: false,
  error: null,

  addToCart: (product, quantity = 1) => {
    const { items, priceMode } = get()
    const blueRate = useDollarStore.getState().blueRate
    const unitPrice = getEffectivePrice(product, priceMode, blueRate)
    const existingItem = items.find(item => item.product.id === product.id)

    if (existingItem) {
      set({
        items: items.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity, subtotal: (item.quantity + quantity) * unitPrice }
            : item
        )
      })
    } else {
      set({
        items: [...items, { product, quantity, subtotal: quantity * unitPrice }]
      })
    }
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
    const blueRate = useDollarStore.getState().blueRate
    set({
      items: get().items.map(item =>
        item.product.id === productId
          ? { ...item, quantity, subtotal: quantity * getEffectivePrice(item.product, priceMode, blueRate) }
          : item
      )
    })
  },

  clearCart: () => {
    set({ items: [], discount: 0, discountType: 'amount', error: null })
  },

  setDiscount: (value, type) => {
    set({ discount: value, discountType: type })
  },

  setPriceMode: (mode) => {
    const blueRate = useDollarStore.getState().blueRate
    const { items } = get()
    // Recalcular todos los subtotales con el nuevo modo
    set({
      priceMode: mode,
      items: items.map(item => ({
        ...item,
        subtotal: item.quantity * getEffectivePrice(item.product, mode, blueRate)
      }))
    })
  },

  getSubtotal: () => get().items.reduce((sum, item) => sum + item.subtotal, 0),
  
  getDiscountAmount: () => {
    const { discount, discountType } = get()
    const subtotal = get().getSubtotal()
    return discountType === 'percentage' ? (subtotal * discount) / 100 : discount
  },

  getTotal: () => Math.max(0, get().getSubtotal() - get().getDiscountAmount()),
  
  getTotalItems: () => get().items.reduce((sum, item) => sum + item.quantity, 0),

  processSale: async (paymentMethod, cashReceived = 0) => {
    const { items, priceMode, getTotal, getSubtotal, getDiscountAmount, clearCart } = get()
    const { user } = useAuthStore.getState()
    const blueRate = useDollarStore.getState().blueRate

    if (items.length === 0) {
      return { success: false, error: 'El carrito está vacío' }
    }

    if (!user) {
      return { success: false, error: 'Usuario no autenticado' }
    }

    const subtotal = getSubtotal()
    const discountAmount = getDiscountAmount()
    const total = getTotal()

    set({ isProcessing: true, error: null })

    try {
      // 1. Crear registro de venta principal
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          branch_id: items[0].product.branch_id,
          total: total,
          subtotal: subtotal,
          discount: discountAmount,
          payment_method: paymentMethod,
          cash_amount: paymentMethod === 'Efectivo' ? cashReceived : 
                       paymentMethod === 'Mixto' ? cashReceived : 0,
          card_amount: paymentMethod === 'Tarjeta' ? total : 
                       paymentMethod === 'Mixto' ? (total - cashReceived) : 0,
          created_by: user.id
        })
        .select()
        .single()

      if (saleError) throw saleError

      // 2. Crear items de venta y movimientos de inventario
      for (const item of items) {
        const { product, quantity } = item
        const effectivePrice = getEffectivePrice(product, priceMode, blueRate)
        
        // Insertar item de venta con precio efectivo
        const { error: itemError } = await supabase
          .from('sale_items')
          .insert({
            sale_id: sale.id,
            product_branch_id: product.id,
            quantity: quantity,
            price: effectivePrice,
            cost: product.price_cost,
            subtotal: item.subtotal
          })

        if (itemError) throw itemError
        
        // Obtener stock actual
        const { data: currentProduct } = await supabase
          .from('products_branch')
          .select('stock_quantity, branch_id')
          .eq('id', product.id)
          .single()

        if (!currentProduct) {
          throw new Error(`Producto ${product.product?.name || 'desconocido'} no encontrado`)
        }

        const newStock = currentProduct.stock_quantity - quantity

        // Registrar movimiento de inventario vinculado a la venta
        const { error: movementError } = await supabase
          .from('inventory_movements')
          .insert({
            product_branch_id: product.id,
            branch_id: currentProduct.branch_id,
            movement_type: 'exit',
            transaction_type: 'sale',
            quantity: quantity,
            stock_before: currentProduct.stock_quantity,
            stock_after: newStock,
            price_at_movement: effectivePrice,
            cost_at_movement: product.price_cost,
            sale_id: sale.id,
            reason: `Venta #${sale.id.slice(0, 8)}`,
            notes: `Método: ${paymentMethod} | Modo precio: ${priceMode}`,
            created_by: user.id
          })

        if (movementError) throw movementError

        // Actualizar stock
        const { error: updateError } = await supabase
          .from('products_branch')
          .update({ 
            stock_quantity: newStock,
            updated_at: new Date().toISOString()
          })
          .eq('id', product.id)

        if (updateError) throw updateError
      }

      clearCart()
      set({ isProcessing: false })
      return { success: true, saleId: sale.id }

    } catch (error: any) {
      console.error('Error processing sale:', error)
      set({ isProcessing: false, error: error.message })
      return { success: false, error: error.message }
    }
  }
}))
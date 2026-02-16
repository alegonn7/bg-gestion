import { useState } from 'react'
import { X, CreditCard, Banknote, DollarSign } from 'lucide-react'
import { usePOSStore } from '@/store/pos'
import jsPDF from 'jspdf'

interface CheckoutModalProps {
    isOpen: boolean
    onClose: () => void
    cartItems: any[]
    cartTotal: number
    cartSubtotal: number
    cartDiscount: number
}

type PaymentMethod = 'cash' | 'card' | 'mixed'

export default function CheckoutModal({ isOpen, onClose, cartItems, cartTotal, cartSubtotal, cartDiscount }: CheckoutModalProps) {
    const store = usePOSStore()

    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
    const [cashAmount, setCashAmount] = useState('')
    const [cardAmount, setCardAmount] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const [saleCompleted, setSaleCompleted] = useState(false)
    const [lastSaleData, setLastSaleData] = useState<any>(null)

    if (!isOpen) return null

    // Usar valores de props (ya calculados en POS.tsx)
    const items = cartItems
    const total = cartTotal
    const subtotal = cartSubtotal
    const discount = cartDiscount

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0
        }).format(amount)
    }

    const calculateChange = () => {
        if (paymentMethod === 'cash') {
            const cash = parseFloat(cashAmount) || 0
            return Math.max(0, cash - total)
        }
        return 0
    }

    const handleExactAmount = () => {
        setCashAmount(total.toString())
    }

    const isValidPayment = () => {
        if (paymentMethod === 'cash') {
            const cash = parseFloat(cashAmount) || 0
            return cash >= total
        } else if (paymentMethod === 'card') {
            return true
        } else if (paymentMethod === 'mixed') {
            const cash = parseFloat(cashAmount) || 0
            const card = parseFloat(cardAmount) || 0
            return (cash + card) >= total
        }
        return false
    }

    const generatePDF = (saleTotal: number, saleSubtotal: number, saleDiscount: number, saleItems: any[]) => {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [80, 200], // Ancho de ticket térmico
        })

        // Header
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text('COMPROBANTE DE VENTA', 40, 10, { align: 'center' })

        // Info del negocio
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.text('Mi Negocio', 40, 18, { align: 'center' })
        doc.text('Sucursal Principal', 40, 23, { align: 'center' })

        // Fecha y hora
        doc.setFontSize(8)
        const now = new Date()
        // ✅ Fix - fuerza zona horaria Argentina
        doc.text(`Fecha: ${now.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`, 5, 30)
        doc.text(`Hora: ${now.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`, 5, 34)
        // Separador
        doc.line(5, 38, 75, 38)

        // Items header
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.text('PRODUCTOS', 5, 44)

        // Items
        let yPos = 50
        saleItems.forEach((item) => {
            doc.text(`${item.product.name}`, 5, yPos)
            doc.text(`${item.quantity} x ${formatCurrency(item.product.price_sale)}`, 5, yPos + 4, { align: 'left' })
            doc.text(formatCurrency(item.subtotal), 75, yPos + 4, { align: 'right' })
            yPos += 10
        })

        // Separador
        doc.line(5, yPos, 75, yPos)
        yPos += 5

        // Subtotal
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.text('Subtotal:', 5, yPos)
        doc.text(formatCurrency(saleSubtotal), 75, yPos, { align: 'right' })
        yPos += 5

        // Descuento (si hay)
        if (saleDiscount > 0) {
            doc.text('Descuento:', 5, yPos)
            doc.text(`-${formatCurrency(saleDiscount)}`, 75, yPos, { align: 'right' })
            yPos += 5
        }

        // Línea antes del total
        doc.line(5, yPos, 75, yPos)
        yPos += 5

        // Total
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text('TOTAL:', 5, yPos)
        doc.text(formatCurrency(saleTotal), 75, yPos, { align: 'right' })
        yPos += 8

        // Método de pago
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')

        if (lastSaleData?.paymentMethod === 'cash') {
            doc.text('Método de pago: Efectivo', 5, yPos)
            yPos += 4
            doc.text(`Recibido: ${formatCurrency(lastSaleData.cashAmount)}`, 5, yPos)
            yPos += 4
            const change = Math.max(0, lastSaleData.cashAmount - saleTotal)
            doc.text(`Vuelto: ${formatCurrency(change)}`, 5, yPos)
        } else if (lastSaleData?.paymentMethod === 'card') {
            doc.text('Método de pago: Tarjeta', 5, yPos)
        } else {
            doc.text('Método de pago: Mixto', 5, yPos)
            yPos += 4
            doc.text(`Efectivo: ${formatCurrency(lastSaleData?.cashAmount || 0)}`, 5, yPos)
            yPos += 4
            doc.text(`Tarjeta: ${formatCurrency(lastSaleData?.cardAmount || 0)}`, 5, yPos)
        }
        yPos += 8

        // Footer
        doc.setFontSize(8)
        doc.text('¡Gracias por su compra!', 40, yPos, { align: 'center' })

        // Guardar
        doc.save(`ticket-${Date.now()}.pdf`)
    }

    const handleCheckout = async () => {
        if (!isValidPayment()) return

        setIsProcessing(true)

        // Guardar los valores ANTES de procesar (porque clearCart los borrará)
        const saleTotal = total
        const saleSubtotal = subtotal
        const saleDiscount = discount
        const saleItems = [...items] // Copiar items antes de que se borren

        try {
            const paymentMethodStr = paymentMethod === 'cash' ? 'Efectivo' :
                paymentMethod === 'card' ? 'Tarjeta' : 'Mixto'

            const result = await store.processSale(
                paymentMethodStr,
                paymentMethod !== 'card' ? parseFloat(cashAmount) : 0
            )

            if (result.success) {
                const saleData = {
                    paymentMethod,
                    cashAmount: paymentMethod !== 'card' ? parseFloat(cashAmount) : 0,
                    cardAmount: paymentMethod !== 'cash' ? parseFloat(cardAmount || String(total)) : 0,
                    total: saleTotal,
                    subtotal: saleSubtotal,
                    discount: saleDiscount,
                    items: saleItems
                }

                setLastSaleData(saleData)
                setSaleCompleted(true)
            } else {
                alert(result.error || 'Error al procesar la venta')
            }
        } catch (error) {
            console.error('Error processing sale:', error)
            alert('Error al procesar la venta')
        } finally {
            setIsProcessing(false)
        }
    }

    const handleClose = () => {
        setSaleCompleted(false)
        setLastSaleData(null)
        setCashAmount('')
        setCardAmount('')
        setPaymentMethod('cash')
        onClose()
    }

    if (saleCompleted) {
        const saleTotal = lastSaleData?.total || 0
        const saleDiscount = lastSaleData?.discount || 0
        const saleSubtotal = lastSaleData?.subtotal || 0
        const saleItems = lastSaleData?.items || []
        const saleCashAmount = lastSaleData?.cashAmount || 0
        const saleChange = lastSaleData?.paymentMethod === 'cash' ? Math.max(0, saleCashAmount - saleTotal) : 0

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
                    <div className="text-center">
                        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                            <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>

                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            ¡Venta Exitosa!
                        </h3>

                        <div className="mt-4 space-y-2 text-sm text-gray-600">
                            <p>Total: <span className="font-semibold">{formatCurrency(saleTotal)}</span></p>
                            {saleDiscount > 0 && (
                                <p>Descuento aplicado: <span className="font-semibold text-green-600">{formatCurrency(saleDiscount)}</span></p>
                            )}
                            {lastSaleData?.paymentMethod === 'cash' && saleChange > 0 && (
                                <p>Vuelto: <span className="font-semibold">{formatCurrency(saleChange)}</span></p>
                            )}
                        </div>

                        <div className="mt-6 flex gap-3">
                            <button
                                onClick={() => generatePDF(saleTotal, saleSubtotal, saleDiscount, saleItems)}
                                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                📄 Descargar Comprobante
                            </button>
                            <button
                                onClick={handleClose}
                                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-semibold">Procesar Pago</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Summary */}
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>Subtotal:</span>
                            <span>{formatCurrency(subtotal)}</span>
                        </div>
                        {discount > 0 && (
                            <div className="flex justify-between text-sm text-green-600">
                                <span>Descuento:</span>
                                <span>-{formatCurrency(discount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-lg font-bold pt-2 border-t">
                            <span>Total:</span>
                            <span>{formatCurrency(total)}</span>
                        </div>
                    </div>

                    {/* Payment Method */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Método de Pago
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                onClick={() => setPaymentMethod('cash')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${paymentMethod === 'cash'
                                        ? 'border-blue-600 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <Banknote className="h-6 w-6" />
                                <span className="text-sm font-medium">Efectivo</span>
                            </button>

                            <button
                                onClick={() => setPaymentMethod('card')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${paymentMethod === 'card'
                                        ? 'border-blue-600 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <CreditCard className="h-6 w-6" />
                                <span className="text-sm font-medium">Tarjeta</span>
                            </button>

                            <button
                                onClick={() => setPaymentMethod('mixed')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${paymentMethod === 'mixed'
                                        ? 'border-blue-600 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <DollarSign className="h-6 w-6" />
                                <span className="text-sm font-medium">Mixto</span>
                            </button>
                        </div>
                    </div>

                    {/* Payment Inputs */}
                    {paymentMethod === 'cash' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Efectivo Recibido
                            </label>
                            <div className="space-y-3">
                                <input
                                    type="number"
                                    value={cashAmount}
                                    onChange={(e) => setCashAmount(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                                    placeholder="0"
                                    step="1"
                                    autoFocus
                                />
                                <button
                                    onClick={handleExactAmount}
                                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                                >
                                    💵 Monto Justo ({formatCurrency(total)})
                                </button>
                                {parseFloat(cashAmount) >= total && (
                                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                        <div className="text-sm text-green-700">
                                            Vuelto: <span className="font-bold text-lg">{formatCurrency(calculateChange())}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {paymentMethod === 'card' && (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center gap-3">
                                <CreditCard className="h-5 w-5 text-blue-600" />
                                <span className="text-sm text-blue-700">
                                    💳 Procesar pago con tarjeta en el terminal
                                </span>
                            </div>
                        </div>
                    )}

                    {paymentMethod === 'mixed' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Efectivo
                                </label>
                                <input
                                    type="number"
                                    value={cashAmount}
                                    onChange={(e) => setCashAmount(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="0.00"
                                    step="0.01"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Tarjeta
                                </label>
                                <input
                                    type="number"
                                    value={cardAmount}
                                    onChange={(e) => setCardAmount(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="0.00"
                                    step="0.01"
                                />
                            </div>
                            <div className="text-sm">
                                Total ingresado: {formatCurrency((parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-4 border-t bg-gray-50">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleCheckout}
                        disabled={!isValidPayment() || isProcessing}
                        className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                        {isProcessing ? 'Procesando...' : 'Confirmar Venta'}
                    </button>
                </div>
            </div>
        </div>
    )
}
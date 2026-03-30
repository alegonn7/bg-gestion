import { useState } from 'react'
import { FileText, Loader2, CheckCircle, AlertTriangle, X } from 'lucide-react'
import { useFiscalStore, calcularIVA, precioSinIva, TIPO_COMPROBANTE_LABELS, type TipoComprobante } from '@/store/fiscal'

interface SaleItem {
  product_name: string
  quantity: number
  price: number
  subtotal: number
  barcode?: string | null
  product_id?: string
  alicuota_iva?: number  // 3=0%, 4=10.5%, 5=21%, 6=27%
}

interface Props {
  sale: {
    id: string
    total: number
    items: SaleItem[]
  }
  onClose: () => void
}

export default function FiscalInvoiceModal({ sale, onClose }: Props) {
  const { config, emitInvoice } = useFiscalStore()

  // Determinar tipo inicial según condición IVA del emisor
  const isMonotributo = config?.condicion_iva === 'Monotributo'
  const defaultTipo: TipoComprobante = isMonotributo ? 11 : 6
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>(defaultTipo)
  const [cuitReceptor, setCuitReceptor] = useState('')
  const [razonSocialReceptor, setRazonSocialReceptor] = useState('')
  const [emitting, setEmitting] = useState(false)
  const [result, setResult] = useState<{ cae: string; caeVence: string; numero: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isFactA = tipoComprobante === 1
  const isFactC = tipoComprobante === 11

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v)

  const handleEmit = async () => {
    if (isFactA && cuitReceptor.replace(/-/g, '').length !== 11) {
      setError('Para Factura A necesitás ingresar el CUIT del receptor (11 dígitos)')
      return
    }

    setEmitting(true)
    setError(null)

    try {
      // Construir ítems para AFIP — usar alícuota por producto (default 5=21%)
      const items = sale.items.map(item => {
        const alicuota = item.alicuota_iva ?? 5
        const precioTotal = item.price  // precio CON IVA
        const iva = calcularIVA(precioTotal, alicuota)

        return {
          codigo: item.product_id || 'SIN-COD',
          codigoMtx: item.barcode || undefined,
          descripcion: item.product_name.slice(0, 100),
          cantidad: item.quantity,
          // Fact A: precio SIN IVA + IVA desglosado. Fact B/C: precio CON IVA.
          precioUnitario: isFactA ? precioSinIva(precioTotal, alicuota) : precioTotal,
          codigoAlicuotaIVA: alicuota,
          importeIVA: isFactA ? iva : 0,
        }
      })

      const res = await emitInvoice({
        saleId: sale.id,
        tipoComprobante,
        cuitReceptor: isFactA ? cuitReceptor.replace(/-/g, '') : undefined,
        razonSocialReceptor: isFactA ? razonSocialReceptor : undefined,
        condicionIVAReceptor: isFactA ? 1 : isFactC ? 6 : 5,  // 1=RI, 5=CF, 6=Monotributo
        items,
      })

      setResult(res)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Emitir Factura Electrónica</h2>
              <p className="text-xs text-gray-500">{config?.razon_social} · CUIT {config?.cuit}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Resultado exitoso */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-700 font-semibold">
                <CheckCircle className="w-5 h-5" />
                Factura emitida correctamente
              </div>
              <div className="text-sm text-green-800 space-y-1">
                <p><span className="font-medium">Tipo:</span> {TIPO_COMPROBANTE_LABELS[tipoComprobante]} N° {String(config?.punto_venta).padStart(4, '0')}-{String(result.numero).padStart(8, '0')}</p>
                <p><span className="font-medium">CAE:</span> {result.cae}</p>
                <p><span className="font-medium">Vence:</span> {result.caeVence}</p>
              </div>
              <button
                onClick={onClose}
                className="mt-2 w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
              >
                Cerrar
              </button>
            </div>
          )}

          {!result && (
            <>
              {/* Resumen de la venta */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-gray-700 mb-2">Venta a facturar</p>
                {sale.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-gray-600">
                    <span>{item.quantity}x {item.product_name}</span>
                    <span>{formatCurrency(item.subtotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t mt-1">
                  <span>Total</span>
                  <span>{formatCurrency(sale.total)}</span>
                </div>
              </div>

              {/* Tipo de comprobante */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de comprobante</label>
                {isMonotributo ? (
                  <div className="p-3 rounded-lg border-2 border-indigo-500 bg-indigo-50">
                    <p className="font-semibold text-sm">Factura C</p>
                    <p className="text-xs text-gray-500 mt-0.5">Monotributista — único tipo habilitado</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setTipoComprobante(6)}
                      className={`p-3 rounded-lg border-2 text-left transition ${tipoComprobante === 6 ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <p className="font-semibold text-sm">Factura B</p>
                      <p className="text-xs text-gray-500 mt-0.5">Consumidor Final</p>
                    </button>
                    <button
                      onClick={() => setTipoComprobante(1)}
                      className={`p-3 rounded-lg border-2 text-left transition ${tipoComprobante === 1 ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <p className="font-semibold text-sm">Factura A</p>
                      <p className="text-xs text-gray-500 mt-0.5">Responsable Inscripto (requiere CUIT)</p>
                    </button>
                  </div>
                )}
              </div>

              {/* Datos del receptor para Factura A */}
              {isFactA && (
                <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs font-medium text-blue-700">Datos del receptor (Responsable Inscripto)</p>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">CUIT del receptor *</label>
                    <input
                      type="text"
                      value={cuitReceptor}
                      onChange={e => setCuitReceptor(e.target.value)}
                      placeholder="20123456789"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Razón Social (opcional)</label>
                    <input
                      type="text"
                      value={razonSocialReceptor}
                      onChange={e => setRazonSocialReceptor(e.target.value)}
                      placeholder="Empresa S.A."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                </div>
              )}

              {/* Nota sobre IVA */}
              <div className="text-xs text-gray-500 bg-yellow-50 border border-yellow-100 rounded px-3 py-2">
                {isFactA
                  ? 'Factura A: los precios se desglosan SIN IVA + IVA desglosado por ítem.'
                  : isFactC
                  ? 'Factura C (Monotributo): precio final con IVA incluido, sin discriminar.'
                  : 'Factura B: precio final con IVA incluido, sin discriminar.'}
                {' '}Alícuota por producto (21% por defecto).
              </div>

              {error && (
                <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {/* Acciones */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleEmit}
                  disabled={emitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {emitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  {emitting ? 'Enviando a ARCA...' : 'Emitir factura'}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
                >
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

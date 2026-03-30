import { useState } from 'react'
import { FileText, Loader2, CheckCircle, AlertTriangle, X, RotateCcw } from 'lucide-react'
import {
  useFiscalStore,
  calcularIVA,
  precioSinIva,
  TIPO_COMPROBANTE_LABELS,
  type FiscalComprobante,
} from '@/store/fiscal'
import type { SaleItem } from '@/store/sales'

interface Props {
  comprobante: FiscalComprobante
  saleItems: SaleItem[]
  onClose: () => void
}

const NC_TIPO: Record<number, number> = { 1: 3, 6: 8, 11: 13 }

export default function FiscalCreditNoteModal({ comprobante, saleItems, onClose }: Props) {
  const { config, emitCreditNote } = useFiscalStore()
  const [emitting, setEmitting] = useState(false)
  const [result, setResult] = useState<{ cae: string; caeVence: string; numero: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ncTipo = NC_TIPO[comprobante.tipo_cbte]
  const isFactA = comprobante.tipo_cbte === 1

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v)

  const handleEmit = async () => {
    setEmitting(true)
    setError(null)

    try {
      // Reconstruir items igual que en la factura original
      const items = saleItems.map(item => {
        const alicuota = item.alicuota_iva ?? 5
        const precioTotal = item.price
        const iva = calcularIVA(precioTotal, alicuota)

        return {
          codigo: item.product_id || 'SIN-COD',
          codigoMtx: item.barcode || undefined,
          descripcion: item.product_name.slice(0, 100),
          cantidad: item.quantity,
          precioUnitario: isFactA ? precioSinIva(precioTotal, alicuota) : precioTotal,
          codigoAlicuotaIVA: alicuota,
          importeIVA: isFactA ? iva : 0,
        }
      })

      const res = await emitCreditNote({
        originalComprobante: comprobante,
        saleId: comprobante.sale_id || undefined,
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
            <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Emitir Nota de Crédito</h2>
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
                Nota de Crédito emitida correctamente
              </div>
              <div className="text-sm text-green-800 space-y-1">
                <p><span className="font-medium">Tipo:</span> {TIPO_COMPROBANTE_LABELS[ncTipo]} N° {String(config?.punto_venta).padStart(4, '0')}-{String(result.numero).padStart(8, '0')}</p>
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
              {/* Comprobante original */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-orange-800 mb-2">Comprobante a anular</p>
                <div className="flex justify-between text-gray-700">
                  <span>{TIPO_COMPROBANTE_LABELS[comprobante.tipo_cbte]}</span>
                  <span>N° {String(comprobante.punto_venta).padStart(4, '0')}-{String(comprobante.numero).padStart(8, '0')}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Fecha emisión</span>
                  <span>{comprobante.fecha_emision}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>CAE</span>
                  <span className="font-mono text-xs">{comprobante.cae}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t mt-1">
                  <span>Total</span>
                  <span>{formatCurrency(comprobante.importe_total ?? 0)}</span>
                </div>
              </div>

              {/* Tipo de NC */}
              <div className="p-3 rounded-lg border-2 border-orange-400 bg-orange-50">
                <p className="font-semibold text-sm">{ncTipo ? TIPO_COMPROBANTE_LABELS[ncTipo] : 'Tipo no soportado'}</p>
                <p className="text-xs text-gray-500 mt-0.5">Cancela el comprobante original en ARCA</p>
              </div>

              {!ncTipo && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  El tipo de comprobante original ({comprobante.tipo_cbte}) no tiene un tipo de NC asociado.
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleEmit}
                  disabled={emitting || !ncTipo}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {emitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  {emitting ? 'Enviando a ARCA...' : 'Emitir Nota de Crédito'}
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

import { useState } from 'react'
import { TrendingUp, Loader2, CheckCircle, AlertTriangle, X } from 'lucide-react'
import { useFiscalStore, TIPO_COMPROBANTE_LABELS, type FiscalComprobante } from '@/store/fiscal'

const ND_TIPO: Record<number, number> = { 1: 2, 6: 7, 11: 12 }

interface Props {
  comprobante: FiscalComprobante
  saleId?: string
  onClose: () => void
}

export default function FiscalDebitNoteModal({ comprobante, saleId, onClose }: Props) {
  const { config, emitDebitNote } = useFiscalStore()
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [emitting, setEmitting] = useState(false)
  const [result, setResult] = useState<{ cae: string; caeVence: string; numero: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ndTipo = ND_TIPO[comprobante.tipo_cbte]

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v)

  const handleEmit = async () => {
    if (!concepto.trim()) { setError('Ingresá el concepto del cargo adicional'); return }
    const importeNum = parseFloat(importe.replace(',', '.'))
    if (!importeNum || importeNum <= 0) { setError('Ingresá un importe válido'); return }

    setEmitting(true)
    setError(null)
    try {
      const res = await emitDebitNote({
        originalComprobante: comprobante,
        saleId,
        concepto: concepto.trim(),
        importe: importeNum,
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
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Emitir Nota de Débito</h2>
              <p className="text-xs text-gray-500">{config?.razon_social} · CUIT {config?.cuit}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-700 font-semibold">
                <CheckCircle className="w-5 h-5" />
                Nota de Débito emitida correctamente
              </div>
              <div className="text-sm text-green-800 space-y-1">
                <p><span className="font-medium">Tipo:</span> {TIPO_COMPROBANTE_LABELS[ndTipo]} N° {String(config?.punto_venta).padStart(4, '0')}-{String(result.numero).padStart(8, '0')}</p>
                <p><span className="font-medium">CAE:</span> {result.cae}</p>
                <p><span className="font-medium">Vence:</span> {result.caeVence}</p>
              </div>
              <button onClick={onClose} className="mt-2 w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                Cerrar
              </button>
            </div>
          )}

          {!result && (
            <>
              {/* Comprobante original */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-blue-800 mb-2">Comprobante original</p>
                <div className="flex justify-between text-gray-700">
                  <span>{TIPO_COMPROBANTE_LABELS[comprobante.tipo_cbte]}</span>
                  <span>N° {String(comprobante.punto_venta).padStart(4, '0')}-{String(comprobante.numero).padStart(8, '0')}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Fecha</span>
                  <span>{comprobante.fecha_emision}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t mt-1">
                  <span>Total original</span>
                  <span>{formatCurrency(comprobante.importe_total ?? 0)}</span>
                </div>
              </div>

              {/* Tipo ND */}
              <div className="p-3 rounded-lg border-2 border-blue-400 bg-blue-50">
                <p className="font-semibold text-sm">{ndTipo ? TIPO_COMPROBANTE_LABELS[ndTipo] : 'Tipo no soportado'}</p>
                <p className="text-xs text-gray-500 mt-0.5">Cargo adicional sobre el comprobante original</p>
              </div>

              {!ndTipo && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  El tipo de comprobante original ({comprobante.tipo_cbte}) no tiene un tipo de ND asociado.
                </div>
              )}

              {/* Campos */}
              {ndTipo && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Concepto *</label>
                    <input
                      type="text"
                      value={concepto}
                      onChange={e => setConcepto(e.target.value)}
                      placeholder="Ej: Ajuste de precio, Flete adicional..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Importe adicional *</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={importe}
                      onChange={e => setImporte(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <p className="text-xs text-gray-400 mt-1">Se emite exento de IVA. Si necesitás discriminar IVA contactá al soporte.</p>
                  </div>
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
                  disabled={emitting || !ndTipo}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {emitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                  {emitting ? 'Enviando a ARCA...' : 'Emitir Nota de Débito'}
                </button>
                <button onClick={onClose} className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">
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

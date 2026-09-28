import { useMemo, useState } from 'react'
import { FileText, Loader2, CheckCircle, AlertTriangle, X, RotateCcw, Download } from 'lucide-react'
import {
  useFiscalStore,
  itemsDeVenta,
  saldoDeFactura,
  TIPO_COMPROBANTE_LABELS,
  type FiscalComprobante,
  type InvoiceItem,
} from '@/store/fiscal'
import type { SaleItem } from '@/store/sales'
import { useAuthStore } from '@/store/auth'
import { descargarComprobante } from '@/lib/facturaPdf'

interface Props {
  comprobante: FiscalComprobante      // factura original
  notas: FiscalComprobante[]          // notas de crédito/débito ya emitidas sobre esa factura
  saleItems: SaleItem[]
  onClose: () => void
}

const NC_TIPO: Record<number, number> = { 1: 3, 6: 8, 11: 13 }
const NOTAS_CREDITO = [3, 8, 13]

const claveItem = (i: InvoiceItem) => `${i.codigo}|${i.descripcion}`

// Importe final de un ítem (con IVA) por la cantidad indicada
function importeDe(item: InvoiceItem, cantidad: number, esA: boolean) {
  const bonificacionUnitaria = (item.importeBonificacion ?? 0) / (item.cantidad || 1)
  const neto = (item.precioUnitario - bonificacionUnitaria) * cantidad
  return esA ? neto + item.importeIVA * cantidad : neto
}

export default function FiscalCreditNoteModal({ comprobante, notas, saleItems, onClose }: Props) {
  const { config, emitCreditNote } = useFiscalStore()
  const { organization } = useAuthStore()
  const [emitting, setEmitting] = useState(false)
  const [result, setResult] = useState<{ cae: string; caeVence: string; numero: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ncTipo = NC_TIPO[comprobante.tipo_cbte]
  const esA = comprobante.tipo_cbte === 1
  const saldo = saldoDeFactura(comprobante, notas)

  // Ítems facturados y cuánto de cada uno queda por acreditar
  const itemsFactura = useMemo<InvoiceItem[]>(
    () => (comprobante.items?.length ? comprobante.items : itemsDeVenta(saleItems, comprobante.importe_total ?? 0, comprobante.tipo_cbte)),
    [comprobante, saleItems],
  )
  const yaAcreditado = useMemo(() => {
    const cantidades = new Map<string, number>()
    for (const nota of notas.filter(n => NOTAS_CREDITO.includes(n.tipo_cbte))) {
      for (const item of nota.items ?? []) cantidades.set(claveItem(item), (cantidades.get(claveItem(item)) ?? 0) + item.cantidad)
    }
    return cantidades
  }, [notas])
  const disponible = (item: InvoiceItem) => Math.max(0, item.cantidad - (yaAcreditado.get(claveItem(item)) ?? 0))

  const [cantidades, setCantidades] = useState<number[]>(() => itemsFactura.map(disponible))

  const totalNota = itemsFactura.reduce((s, item, i) => s + importeDe(item, cantidades[i] || 0, esA), 0)

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(v)

  const handleDescargar = async () => {
    if (!result || !config) return
    const nota = useFiscalStore.getState().comprobantes.find(c =>
      c.tipo_cbte === ncTipo && c.numero === result.numero && c.ambiente === config.ambiente
    )
    if (!nota) return setError('No se encontró la nota emitida. Descargala desde Facturación ARCA.')
    await descargarComprobante(nota, config, {
      nombreFantasia: organization?.name,
      logoUrl: organization?.logo_url,
      asociado: comprobante,
    })
  }

  const handleEmit = async () => {
    setError(null)
    if (totalNota <= 0) return setError('Elegí al menos un producto para acreditar')
    if (totalNota > saldo + 0.05) return setError(`La nota de crédito no puede superar lo que queda de la factura (${formatCurrency(saldo)})`)

    setEmitting(true)
    try {
      // Cada ítem va con la cantidad elegida y la parte proporcional de su bonificación
      const items = itemsFactura
        .map((item, i) => ({ item, cantidad: cantidades[i] || 0 }))
        .filter(({ cantidad }) => cantidad > 0)
        .map(({ item, cantidad }) => ({
          ...item,
          cantidad,
          importeBonificacion: (item.importeBonificacion ?? 0) * cantidad / (item.cantidad || 1),
        }))

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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
                <p><span className="font-medium">Tipo:</span> {TIPO_COMPROBANTE_LABELS[ncTipo]} N° {String(config?.punto_venta).padStart(5, '0')}-{String(result.numero).padStart(8, '0')}</p>
                <p><span className="font-medium">CAE:</span> {result.cae}</p>
                <p><span className="font-medium">Vence:</span> {result.caeVence}</p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleDescargar}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700"
                >
                  <Download className="w-4 h-4" />
                  Descargar PDF
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {!result && (
            <>
              {/* Comprobante original */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between text-gray-700">
                  <span className="font-medium">{TIPO_COMPROBANTE_LABELS[comprobante.tipo_cbte]}</span>
                  <span>N° {String(comprobante.punto_venta).padStart(5, '0')}-{String(comprobante.numero).padStart(8, '0')}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Total facturado</span>
                  <span>{formatCurrency(comprobante.importe_total ?? 0)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t mt-1">
                  <span>Queda por acreditar</span>
                  <span>{formatCurrency(saldo)}</span>
                </div>
              </div>

              {/* Qué se acredita */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">¿Qué productos se acreditan?</p>
                <div className="border border-gray-200 rounded-lg divide-y">
                  {itemsFactura.map((item, i) => {
                    const max = disponible(item)
                    return (
                      <div key={i} className="flex items-center gap-3 p-2.5 text-sm">
                        <span className="flex-1 text-gray-700">{item.descripcion}</span>
                        <span className="text-xs text-gray-400">de {max}</span>
                        <input
                          type="number" min={0} max={max} step="any"
                          value={cantidades[i] ?? 0}
                          disabled={max === 0}
                          onChange={e => {
                            const valor = Math.min(max, Math.max(0, Number(e.target.value)))
                            setCantidades(prev => prev.map((c, j) => (j === i ? valor : c)))
                          }}
                          className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-right disabled:bg-gray-50"
                        />
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between font-semibold text-gray-900 mt-2 text-sm">
                  <span>Total de la nota de crédito</span>
                  <span>{formatCurrency(totalNota)}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg border-2 border-orange-400 bg-orange-50">
                <p className="font-semibold text-sm">{ncTipo ? TIPO_COMPROBANTE_LABELS[ncTipo] : 'Tipo no soportado'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {totalNota >= saldo - 0.01 ? 'Anula lo que queda de la factura en ARCA' : 'Acredita una parte de la factura (devolución parcial)'}
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleEmit}
                  disabled={emitting || !ncTipo || saldo <= 0.01}
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

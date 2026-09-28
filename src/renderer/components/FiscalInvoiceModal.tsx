import { useState } from 'react'
import { FileText, Loader2, CheckCircle, AlertTriangle, X, Download } from 'lucide-react'
import { useFiscalStore, itemsDeVenta, condicionDeVenta, TIPO_COMPROBANTE_LABELS, type TipoComprobante } from '@/store/fiscal'
import { useAuthStore } from '@/store/auth'
import { descargarComprobante } from '@/lib/facturaPdf'

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
    payment_method?: string
    items: SaleItem[]
  }
  onClose: () => void
}

// Condición frente al IVA del comprador (códigos de ARCA)
const RECEPTOR_A = [
  { value: 1, label: 'Responsable Inscripto' },
  { value: 6, label: 'Monotributista' },
]
const RECEPTOR_B = [
  { value: 5, label: 'Consumidor Final' },
  { value: 4, label: 'IVA Exento' },
]
const RECEPTOR_C = [
  { value: 5, label: 'Consumidor Final' },
  { value: 1, label: 'Responsable Inscripto' },
  { value: 6, label: 'Monotributista' },
  { value: 4, label: 'IVA Exento' },
]

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-400'

export default function FiscalInvoiceModal({ sale, onClose }: Props) {
  const { config, emitInvoice } = useFiscalStore()
  const { organization } = useAuthStore()

  // Monotributistas y exentos emiten comprobantes C; responsables inscriptos, A o B
  const emiteC = config?.condicion_iva === 'Monotributo' || config?.condicion_iva === 'Exento'
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>(emiteC ? 11 : 6)
  const [identificar, setIdentificar] = useState(false)
  const [docTipo, setDocTipo] = useState<80 | 96>(96)
  const [docNro, setDocNro] = useState('')
  const [nombreReceptor, setNombreReceptor] = useState('')
  const [condicionReceptor, setCondicionReceptor] = useState(5)
  const [emitting, setEmitting] = useState(false)
  const [result, setResult] = useState<{ cae: string; caeVence: string; numero: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [descargando, setDescargando] = useState(false)

  const isFactA = tipoComprobante === 1
  const isFactC = tipoComprobante === 11
  const opcionesReceptor = isFactA ? RECEPTOR_A : isFactC ? RECEPTOR_C : RECEPTOR_B
  const pideDatos = isFactA || identificar

  const cambiarTipo = (tipo: TipoComprobante) => {
    setTipoComprobante(tipo)
    setCondicionReceptor(tipo === 1 ? 1 : 5)
    if (tipo === 1) setDocTipo(80)
  }

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v)

  const handleEmit = async () => {
    const nro = docNro.replace(/\D/g, '')
    const tipoDoc = isFactA ? 80 : docTipo
    if (pideDatos) {
      if (tipoDoc === 80 && nro.length !== 11) return setError('El CUIT del comprador tiene que tener 11 dígitos')
      if (tipoDoc === 96 && (nro.length < 7 || nro.length > 8)) return setError('El DNI tiene que tener 7 u 8 dígitos')
    }
    // La factura A tiene que decir a nombre de quién está (y el Libro IVA Digital lo pide)
    if (isFactA && !nombreReceptor.trim()) return setError('Ingresá el nombre o la razón social del comprador')

    setEmitting(true)
    setError(null)
    try {
      const res = await emitInvoice({
        saleId: sale.id,
        tipoComprobante,
        docTipo: pideDatos ? tipoDoc : undefined,
        docNro: pideDatos ? nro : undefined,
        razonSocialReceptor: pideDatos ? nombreReceptor.trim() || undefined : undefined,
        condicionIVAReceptor: pideDatos ? condicionReceptor : 5,
        items: itemsDeVenta(sale.items, sale.total, tipoComprobante),
      })
      setResult(res)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEmitting(false)
    }
  }

  const handleDescargar = async () => {
    if (!result || !config) return
    const comprobante = useFiscalStore.getState().comprobantes.find(c =>
      c.tipo_cbte === tipoComprobante && c.numero === result.numero && c.ambiente === config.ambiente
    )
    if (!comprobante) return setError('No se encontró el comprobante emitido. Descargalo desde el historial.')
    setDescargando(true)
    try {
      await descargarComprobante(comprobante, config, {
        nombreFantasia: organization?.name,
        logoUrl: organization?.logo_url,
        condicionVenta: condicionDeVenta(sale.payment_method),
      })
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Emitir Factura Electrónica
                {config?.ambiente === 'dev' && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">Modo prueba</span>
                )}
              </h2>
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
                {config?.ambiente === 'dev' ? 'Factura de prueba emitida (sin validez fiscal)' : 'Factura emitida correctamente'}
              </div>
              <div className="text-sm text-green-800 space-y-1">
                <p><span className="font-medium">Tipo:</span> {TIPO_COMPROBANTE_LABELS[tipoComprobante]} N° {String(config?.punto_venta).padStart(5, '0')}-{String(result.numero).padStart(8, '0')}</p>
                <p><span className="font-medium">CAE:</span> {result.cae}</p>
                <p><span className="font-medium">Vence:</span> {result.caeVence}</p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleDescargar}
                  disabled={descargando}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {descargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Descargar PDF
                </button>
                <button onClick={onClose} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                  Cerrar
                </button>
              </div>
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
                {emiteC ? (
                  <div className="p-3 rounded-lg border-2 border-indigo-500 bg-indigo-50">
                    <p className="font-semibold text-sm">Factura C</p>
                    <p className="text-xs text-gray-500 mt-0.5">Monotributista o exento — único tipo habilitado</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => cambiarTipo(6)}
                      className={`p-3 rounded-lg border-2 text-left transition ${tipoComprobante === 6 ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <p className="font-semibold text-sm">Factura B</p>
                      <p className="text-xs text-gray-500 mt-0.5">Consumidor final o exento</p>
                    </button>
                    <button
                      onClick={() => cambiarTipo(1)}
                      className={`p-3 rounded-lg border-2 text-left transition ${tipoComprobante === 1 ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <p className="font-semibold text-sm">Factura A</p>
                      <p className="text-xs text-gray-500 mt-0.5">Responsable Inscripto o monotributista</p>
                    </button>
                  </div>
                )}
              </div>

              {/* Comprador */}
              {!isFactA && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={identificar} onChange={e => setIdentificar(e.target.checked)} />
                  Identificar al cliente (DNI o CUIT)
                </label>
              )}
              {pideDatos && (
                <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs font-medium text-blue-700">Datos del comprador</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Documento</label>
                      {isFactA ? (
                        <div className="px-3 py-2 border border-gray-200 bg-white rounded-lg text-sm text-gray-600">CUIT</div>
                      ) : (
                        <select value={docTipo} onChange={e => setDocTipo(Number(e.target.value) as 80 | 96)} className={inputClass}>
                          <option value={96}>DNI</option>
                          <option value={80}>CUIT</option>
                        </select>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1">Número *</label>
                      <input type="text" value={docNro} onChange={e => setDocNro(e.target.value)} placeholder={isFactA || docTipo === 80 ? '20123456789' : '30123456'} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Nombre o razón social{isFactA && ' *'}</label>
                    <input type="text" value={nombreReceptor} onChange={e => setNombreReceptor(e.target.value)} placeholder="Empresa S.A. / Juan Pérez" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Condición frente al IVA</label>
                    <select value={condicionReceptor} onChange={e => setCondicionReceptor(Number(e.target.value))} className={inputClass}>
                      {opcionesReceptor.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Nota sobre IVA */}
              <div className="text-xs text-gray-500 bg-yellow-50 border border-yellow-100 rounded px-3 py-2">
                {isFactA
                  ? 'Factura A: los precios se muestran SIN IVA y el IVA se discrimina por alícuota.'
                  : isFactC
                  ? 'Factura C: precio final, sin discriminar IVA.'
                  : 'Factura B: precio final con IVA incluido; el comprobante informa el IVA contenido.'}
                {' '}Se usa la alícuota de cada producto (21% por defecto).
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

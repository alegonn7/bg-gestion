import { useEffect, useState } from 'react'
import { FileText, CheckCircle, AlertTriangle, XCircle, RefreshCw, Download, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import {
  useFiscalStore,
  TIPO_COMPROBANTE_LABELS,
  COMPROBANTES_POR_PAGINA,
  COLUMNAS_COMPROBANTE,
  type FiscalComprobante,
  type FiltrosComprobantes,
} from '@/store/fiscal'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { descargarComprobante } from '@/lib/facturaPdf'
import FiscalSetupSection from '@/components/FiscalSetupSection'

const FILTROS_INICIALES: FiltrosComprobantes = { texto: '', tipo: '', desde: '', hasta: '', pagina: 1 }

const inputClass = 'px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white'

const tipoColor: Record<number, string> = {
  1: 'bg-blue-100 text-blue-700',
  2: 'bg-sky-100 text-sky-700',
  3: 'bg-orange-100 text-orange-700',
  6: 'bg-indigo-100 text-indigo-700',
  7: 'bg-sky-100 text-sky-700',
  8: 'bg-orange-100 text-orange-700',
  11: 'bg-purple-100 text-purple-700',
  12: 'bg-sky-100 text-sky-700',
  13: 'bg-orange-100 text-orange-700',
}

export default function FiscalPage() {
  const { config, fetchConfig, buscarComprobantes } = useFiscalStore()
  const { organization, user } = useAuthStore()
  const esDueño = user?.role === 'owner'
  const [filtros, setFiltros] = useState<FiltrosComprobantes>(FILTROS_INICIALES)
  const [texto, setTexto] = useState('')
  const [comprobantes, setComprobantes] = useState<FiscalComprobante[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = async () => {
    if (!config?.fiscal_enabled) return
    setLoading(true)
    setError(null)
    try {
      const resultado = await buscarComprobantes(filtros)
      setComprobantes(resultado.comprobantes)
      setTotal(resultado.total)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [filtros, config?.fiscal_enabled])

  // La sección de configuración (solo del dueño) es la que carga la configuración; sin ella, se carga acá
  useEffect(() => {
    if (!esDueño && !config) fetchConfig()
  }, [])

  // La búsqueda por texto se aplica medio segundo después de dejar de escribir
  useEffect(() => {
    const id = setTimeout(() => setFiltros(f => (f.texto === texto ? f : { ...f, texto, pagina: 1 })), 500)
    return () => clearTimeout(id)
  }, [texto])

  const filtrar = (cambios: Partial<FiltrosComprobantes>) => setFiltros(f => ({ ...f, ...cambios, pagina: 1 }))
  const paginas = Math.max(1, Math.ceil(total / COMPROBANTES_POR_PAGINA))

  const descargar = async (c: FiscalComprobante) => {
    if (!config) return
    // Las notas llevan impresa la factura a la que corresponden
    let asociado = c.original_comprobante_id ? comprobantes.find(o => o.id === c.original_comprobante_id) ?? null : null
    if (c.original_comprobante_id && !asociado) {
      const { data } = await supabase.from('fiscal_comprobantes').select(COLUMNAS_COMPROBANTE).eq('id', c.original_comprobante_id).single()
      asociado = data as FiscalComprobante | null
    }
    descargarComprobante(c, config, { nombreFantasia: organization?.name, logoUrl: organization?.logo_url, asociado })
  }

  const formatCurrency = (v: number | null) =>
    v == null ? '-' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(v)

  const formatNumero = (puntoVenta: number, numero: number) =>
    `${String(puntoVenta).padStart(5, '0')}-${String(numero).padStart(8, '0')}`

  const resultadoLabel = (r: string) => {
    if (r === 'A') return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full"><CheckCircle className="w-3 h-3" />Aprobado</span>
    if (r === 'O') return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full"><AlertTriangle className="w-3 h-3" />Observado</span>
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full"><XCircle className="w-3 h-3" />Rechazado</span>
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturación Electrónica ARCA</h1>
          <p className="text-sm text-gray-500 mt-1">Configuración y comprobantes emitidos</p>
        </div>
        {config?.fiscal_enabled && (
          <button
            onClick={cargar}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        )}
      </div>

      {/* Configuración: solo el dueño */}
      {esDueño && <FiscalSetupSection />}

      {!config?.fiscal_enabled ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-8 text-center text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {esDueño
              ? 'Configurá la facturación electrónica arriba para empezar a facturar.'
              : 'La facturación electrónica todavía no está activada. Pedile al dueño que la configure.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b space-y-3">
            <h2 className="text-base font-semibold text-gray-900">Comprobantes emitidos</h2>

            {/* Filtros */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  placeholder="Código de venta, DNI/CUIT, cliente o número"
                  className={`${inputClass} w-full pl-9`}
                />
              </div>
              <select value={filtros.tipo} onChange={e => filtrar({ tipo: e.target.value as FiltrosComprobantes['tipo'] })} className={inputClass}>
                <option value="">Todos los tipos</option>
                <option value="facturas">Facturas</option>
                <option value="nc">Notas de crédito</option>
                <option value="nd">Notas de débito</option>
              </select>
              <label className="text-xs text-gray-500">Desde
                <input type="date" value={filtros.desde} onChange={e => filtrar({ desde: e.target.value })} className={`${inputClass} block`} />
              </label>
              <label className="text-xs text-gray-500">Hasta
                <input type="date" value={filtros.hasta} onChange={e => filtrar({ hasta: e.target.value })} className={`${inputClass} block`} />
              </label>
              <button onClick={() => { setTexto(''); setFiltros(FILTROS_INICIALES) }} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
                Limpiar
              </button>
            </div>
          </div>

          {error && <p className="px-5 pt-3 text-sm text-red-600">{error}</p>}

          {loading ? (
            <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : comprobantes.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay comprobantes para mostrar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Número</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Venta</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">CAE</th>
                    <th className="px-4 py-3">Emitió</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {comprobantes.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${tipoColor[c.tipo_cbte] ?? 'bg-gray-100 text-gray-600'}`}>
                          {TIPO_COMPROBANTE_LABELS[c.tipo_cbte] ?? `Tipo ${c.tipo_cbte}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{formatNumero(c.punto_venta, c.numero)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.fecha_emision.split('-').reverse().join('/')}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.sale_id ? c.sale_id.slice(0, 8) : '—'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.razon_social_receptor || (c.doc_nro || c.cuit_receptor ? '' : <span className="text-gray-400">Consumidor final</span>)}
                        {(c.doc_nro || c.cuit_receptor) && (
                          <span className="text-xs text-gray-400 ml-1">{c.doc_tipo === 96 ? 'DNI' : 'CUIT'} {c.doc_nro || c.cuit_receptor}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{formatCurrency(c.importe_total)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.cae || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.created_by_name || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {resultadoLabel(c.resultado)}
                        {c.ambiente === 'dev' && (
                          <span className="ml-1.5 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">Prueba</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.cae && (
                          <button
                            onClick={() => descargar(c)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200"
                          >
                            <Download className="w-3.5 h-3.5" />PDF
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación */}
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-gray-500">
            <span>{total} comprobantes</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiltros(f => ({ ...f, pagina: f.pagina - 1 }))}
                disabled={filtros.pagina <= 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>Página {filtros.pagina} de {paginas}</span>
              <button
                onClick={() => setFiltros(f => ({ ...f, pagina: f.pagina + 1 }))}
                disabled={filtros.pagina >= paginas}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

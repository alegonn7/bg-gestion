import { useEffect, useState } from 'react'
import { Truck, Plus, Search, Download, XCircle, ChevronLeft, ChevronRight, Loader2, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useRemitosStore, descargarRemitoPdf, REMITOS_POR_PAGINA, type FiltrosRemitos } from '@/store/remitos'
import { MOTIVOS_REMITO, numeroRemito, type MotivoRemito } from '@/lib/remitos'
import RemitoModal from '@/components/RemitoModal'
import RemitoCaiModal from '@/components/RemitoCaiModal'

const FILTROS_INICIALES: FiltrosRemitos = { texto: '', motivo: '', desde: '', hasta: '', pagina: 1 }

const inputClass = 'px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white'

export default function RemitosPage() {
  const { remitos, total, isLoading, error, buscar, anular } = useRemitosStore()
  const [filtros, setFiltros] = useState<FiltrosRemitos>(FILTROS_INICIALES)
  const [texto, setTexto] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [gestionarCai, setGestionarCai] = useState(false)
  const [confirmarAnular, setConfirmarAnular] = useState<string | null>(null)
  const { user } = useAuthStore()
  // Pedir o cargar CAI es configuración: solo el dueño
  const esDueño = user?.role === 'owner'

  useEffect(() => { buscar(filtros) }, [filtros])

  // La búsqueda por texto se aplica medio segundo después de dejar de escribir
  useEffect(() => {
    const id = setTimeout(() => setFiltros(f => (f.texto === texto ? f : { ...f, texto, pagina: 1 })), 500)
    return () => clearTimeout(id)
  }, [texto])

  const paginas = Math.max(1, Math.ceil(total / REMITOS_POR_PAGINA))
  const filtrar = (cambios: Partial<FiltrosRemitos>) => setFiltros(f => ({ ...f, ...cambios, pagina: 1 }))

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Remitos</h1>
          <p className="text-sm text-gray-500 mt-1">Entregas y traslados de mercadería · documento no válido como factura</p>
        </div>
        <div className="flex gap-2">
          {esDueño && (
            <button
              onClick={() => setGestionarCai(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-sm font-medium rounded-lg"
            >
              <ShieldCheck className="w-4 h-4" />Remito R · CAI
            </button>
          )}
          <button
            onClick={() => setNuevo(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg"
          >
            <Plus className="w-4 h-4" />Nuevo remito
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Número, destinatario o DNI/CUIT"
            className={`${inputClass} w-full pl-9`}
          />
        </div>
        <select value={filtros.motivo} onChange={e => filtrar({ motivo: e.target.value as MotivoRemito | '' })} className={inputClass}>
          <option value="">Todos los motivos</option>
          {(Object.keys(MOTIVOS_REMITO) as MotivoRemito[]).map(m => <option key={m} value={m}>{MOTIVOS_REMITO[m]}</option>)}
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200">
        {isLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : remitos.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay remitos para mostrar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Motivo</th>
                  <th className="px-4 py-3">Destinatario</th>
                  <th className="px-4 py-3 text-right">Ítems</th>
                  <th className="px-4 py-3">Hecho por</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {remitos.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{numeroRemito(r)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.fecha.split('-').reverse().join('/')}</td>
                    <td className="px-4 py-3 text-gray-600">{MOTIVOS_REMITO[r.motivo]}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.destinatario_nombre || <span className="text-gray-400">—</span>}
                      {r.destinatario_doc_nro && <span className="text-xs text-gray-400 ml-1">({r.destinatario_doc_nro})</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.items.reduce((s, i) => s + i.cantidad, 0)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.created_by_name || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3">
                      {r.estado === 'anulado' ? (
                        <>
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">Anulado</span>
                          {r.anulado_por_nombre && (
                            <p className="text-xs text-gray-400 mt-1">
                              por {r.anulado_por_nombre}
                              {r.anulado_en && ` el ${new Date(r.anulado_en).toLocaleDateString('es-AR')}`}
                            </p>
                          )}
                        </>
                      ) : <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">Emitido</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => descargarRemitoPdf(r)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200"
                      >
                        <Download className="w-3.5 h-3.5" />PDF
                      </button>
                      {r.estado === 'emitido' && (confirmarAnular === r.id ? (
                        <span className="ml-2 inline-flex items-center gap-1">
                          <button onClick={() => anular(r.id).then(() => setConfirmarAnular(null))} className="px-2.5 py-1 text-xs bg-red-600 text-white rounded-lg">Anular</button>
                          <button onClick={() => setConfirmarAnular(null)} className="px-2.5 py-1 text-xs bg-gray-100 rounded-lg">No</button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmarAnular(r.id)}
                          className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200"
                        >
                          <XCircle className="w-3.5 h-3.5" />Anular
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-gray-500">
          <span>{total} remitos</span>
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

      {nuevo && <RemitoModal onClose={() => setNuevo(false)} onCreado={() => buscar(filtros)} />}
      {gestionarCai && <RemitoCaiModal onClose={() => setGestionarCai(false)} />}
    </div>
  )
}

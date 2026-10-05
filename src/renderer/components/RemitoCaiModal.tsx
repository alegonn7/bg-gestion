import { useEffect, useState } from 'react'
import { ShieldCheck, X, Loader2, AlertTriangle, Trash2, CheckCircle } from 'lucide-react'
import { useRemitosStore } from '@/store/remitos'
import { esSinAutomatizaciones, useFiscalStore } from '@/store/fiscal'
import type { CaiRemito } from '@/lib/remitos'
import CaiManualArca from './arca/CaiManualArca'

interface Props {
  onClose: () => void
}

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500'
const fechaAR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—')
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())

const PASOS_PEDIDO: Record<string, string> = {
  puntos_venta: 'Revisando tus datos en ARCA…',
  punto_venta: 'Preparando tu punto de venta para remitos…',
  cai: 'Pidiendo el CAI a ARCA…',
}

function estadoDe(c: CaiRemito) {
  if (c.estado === 'pendiente') {
    return <span className="inline-flex items-center gap-1 text-xs text-gray-600"><Loader2 className="w-3 h-3 animate-spin" />{PASOS_PEDIDO[c.paso ?? 'cai']}</span>
  }
  if (c.estado === 'error') return <span className="text-xs text-red-600">No se pudo</span>
  if (c.vencimiento && c.vencimiento < hoy()) return <span className="text-xs text-gray-500">Vencido</span>
  return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">Vigente</span>
}

export default function RemitoCaiModal({ onClose }: Props) {
  const { cais, fetchCais, solicitarCai, avanzarCai, cargarCai, borrarCai } = useRemitosStore()
  // Sin automatizaciones, el CAI se pide a mano en ARCA con un paso a paso
  const { config: configFiscal, sinAutomatizaciones, fetchConfig } = useFiscalStore()
  const [pestaña, setPestaña] = useState<'pedir' | 'cargar'>('pedir')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // Pedir a ARCA: el cliente solo elige cuántos remitos quiere; el resto lo resuelve el sistema
  const [cantidad, setCantidad] = useState('100')
  const [esSociedad, setEsSociedad] = useState(false)
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [acepto, setAcepto] = useState(false)
  // La clave queda solo en memoria mientras el pedido avanza (cada paso la necesita)
  const [claveEnCurso, setClaveEnCurso] = useState('')

  // Cargar a mano (datos de la constancia de CAI)
  const [manual, setManual] = useState({ puntoVenta: '', cai: '', vencimiento: '', desde: '', hasta: '' })
  // "Desde" se completa solo con el número que sigue al último CAI de ese punto de venta
  const [desdeSugerido, setDesdeSugerido] = useState(true)

  useEffect(() => {
    fetchCais().catch(err => setError(err.message))
    fetchConfig()
  }, [])

  const cambiarPuntoVenta = (valor: string) => {
    const numero = Number(valor)
    const anteriores = cais.filter(c => c.punto_venta === numero && c.hasta).map(c => Number(c.hasta))
    const siguiente = numero > 0 ? String(anteriores.length ? Math.max(...anteriores) + 1 : 1) : ''
    setManual(m => ({ ...m, puntoVenta: valor, desde: desdeSugerido || !m.desde ? siguiente : m.desde }))
  }

  const pendientes = cais.filter(c => c.estado === 'pendiente').map(c => c.id).join(',')
  useEffect(() => {
    if (!pendientes || !claveEnCurso) return
    const credenciales = { clave: claveEnCurso, usuario: esSociedad ? usuario.replace(/\D/g, '') : undefined }
    const id = setInterval(() => {
      for (const caiId of pendientes.split(',')) {
        avanzarCai(caiId, credenciales)
          // Si el pedido se cortó (por ejemplo, porque no quedan automatizaciones), se relee la
          // configuración: sin automatizaciones aparece el paso a paso para pedirlo en ARCA
          .then(cai => { if (cai.estado === 'error') fetchConfig() })
          .catch(err => (esSinAutomatizaciones(err) ? fetchConfig() : setError(err.message)))
      }
    }, 5000)
    return () => clearInterval(id)
  }, [pendientes, claveEnCurso])

  // Cuando no queda nada pendiente, la clave se borra de memoria
  useEffect(() => {
    if (!pendientes && claveEnCurso) {
      setClaveEnCurso('')
      const ultimo = cais[0]
      if (ultimo?.estado === 'vigente') setOk('¡Listo! Ya podés emitir remitos R.')
    }
  }, [pendientes])

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setOk(null)
    setBusy(true)
    try {
      await fn()
    } catch (err: any) {
      // Sin pedido automático: se muestra el paso a paso para pedirlo en ARCA
      if (esSinAutomatizaciones(err)) await fetchConfig()
      else setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const pedir = () => run(async () => {
    if (!acepto) throw new Error('Tenés que aceptar el uso de la clave fiscal para continuar')
    await solicitarCai({
      cantidad: Number(cantidad),
      clave,
      usuario: esSociedad ? usuario.replace(/\D/g, '') : undefined,
    })
    setClaveEnCurso(clave)
    setClave('')
  })

  const cargar = () => run(async () => {
    await cargarCai({
      puntoVenta: Number(manual.puntoVenta),
      cai: manual.cai,
      vencimiento: manual.vencimiento,
      desde: Number(manual.desde),
      hasta: Number(manual.hasta),
    })
    setManual({ puntoVenta: '', cai: '', vencimiento: '', desde: '', hasta: '' })
    setDesdeSugerido(true)
    setOk('CAI guardado. Ya podés emitir remitos R.')
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Remito R · CAI de ARCA</h2>
              <p className="text-xs text-gray-500">El remito con validez fiscal para trasladar mercadería</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-y-1">
            <p>
              El remito R lleva un <strong>CAI</strong>: un código que ARCA otorga para una cantidad de remitos, con fecha
              de vencimiento. Cuando se terminan o vence, se pide otro.
            </p>
            <p>Podés imprimirlo o enviarlo en formato digital; en los dos casos lleva el CAI.</p>
          </div>

          {ok && <div className="flex items-start gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg text-sm"><CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{ok}</div>}
          {error && <div className="flex items-start gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg text-sm"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}</div>}

          {/* Si se cerró la pantalla con un pedido en curso, hace falta la clave para seguir */}
          {pendientes && !claveEnCurso && (
            <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">Hay un pedido de CAI en curso. Ingresá tu clave fiscal para continuar:</p>
              <div className="flex gap-2">
                <input type="password" value={clave} onChange={e => setClave(e.target.value)} autoComplete="off" className={inputClass} />
                <button onClick={() => { setClaveEnCurso(clave); setClave('') }} disabled={!clave} className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg disabled:opacity-50">
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* CAI */}
          {cais.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <th className="px-3 py-2">CAI</th>
                    <th className="px-3 py-2">Remitos</th>
                    <th className="px-3 py-2">Vence</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cais.map(c => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 font-mono text-xs">{c.cai ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {c.desde && c.hasta
                          ? <>N° {c.desde} al {c.hasta} <span className="text-gray-400">(pto. vta. {c.punto_venta})</span></>
                          : `${c.cantidad ?? ''} pedidos`}
                      </td>
                      <td className="px-3 py-2 text-xs">{fechaAR(c.vencimiento)}</td>
                      <td className="px-3 py-2">
                        {estadoDe(c)}
                        {c.estado === 'error' && c.error && <p className="text-xs text-red-600 mt-0.5">{c.error}</p>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {c.estado !== 'pendiente' && (
                          <button onClick={() => run(() => borrarCai(c.id))} disabled={busy} title="Borrar" className="p-1 text-gray-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pedir o cargar */}
          <div className="flex gap-2 border-b">
            {(['pedir', 'cargar'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPestaña(p)}
                className={`px-3 py-2 text-sm border-b-2 -mb-px ${pestaña === p ? 'border-emerald-600 text-emerald-700 font-medium' : 'border-transparent text-gray-500'}`}
              >
                {p === 'pedir' ? 'Pedir CAI a ARCA' : 'Ya tengo un CAI'}
              </button>
            ))}
          </div>

          {pestaña === 'pedir' && sinAutomatizaciones ? (
            <CaiManualArca condicionIva={configFiscal?.condicion_iva ?? null} onCargar={() => setPestaña('cargar')} />
          ) : pestaña === 'pedir' ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                Pedimos el CAI a ARCA en tu nombre. Tu clave fiscal se usa solo para este trámite y no se guarda.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">¿Cuántos remitos querés habilitar?</label>
                <select value={cantidad} onChange={e => setCantidad(e.target.value)} className={inputClass}>
                  {['50', '100', '250', '500', '1000'].map(n => <option key={n} value={n}>{n} remitos</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={esSociedad} onChange={e => setEsSociedad(e.target.checked)} />
                Es una sociedad: a ARCA entra otra persona con su propio CUIT/CUIL
              </label>
              {esSociedad && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CUIT/CUIL de quien entra a ARCA *</label>
                  <input value={usuario} onChange={e => setUsuario(e.target.value)} className={inputClass} />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clave fiscal *</label>
                <input type="password" value={clave} onChange={e => setClave(e.target.value)} autoComplete="off" className={inputClass} />
              </div>
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" className="mt-0.5" checked={acepto} onChange={e => setAcepto(e.target.checked)} />
                Autorizo a BG Gestión a usar mi clave fiscal solo para pedir este CAI.
              </label>
              <button
                onClick={pedir}
                disabled={busy || !clave || !!pendientes}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Pedir CAI
              </button>
              {pendientes && <p className="text-xs text-gray-500">Esto puede tardar unos minutos. No cierres esta pantalla.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Copiá los datos de la constancia de CAI que te dio ARCA o tu contador. La numeración (desde y hasta) también
                figura en la constancia.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CAI (14 dígitos) *</label>
                  <input value={manual.cai} onChange={e => setManual({ ...manual, cai: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vencimiento *</label>
                  <input type="date" value={manual.vencimiento} onChange={e => setManual({ ...manual, vencimiento: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Punto de venta *</label>
                  <input type="number" min={1} value={manual.puntoVenta} onChange={e => cambiarPuntoVenta(e.target.value)} className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Desde N° *</label>
                    <input type="number" min={1} value={manual.desde} onChange={e => { setDesdeSugerido(false); setManual({ ...manual, desde: e.target.value }) }} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hasta N° *</label>
                    <input type="number" min={1} value={manual.hasta} onChange={e => setManual({ ...manual, hasta: e.target.value })} className={inputClass} />
                  </div>
                </div>
              </div>
              <button
                onClick={cargar}
                disabled={busy}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar CAI
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

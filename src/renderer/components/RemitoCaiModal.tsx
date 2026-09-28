import { useEffect, useState } from 'react'
import { ShieldCheck, X, Loader2, AlertTriangle, Trash2, CheckCircle } from 'lucide-react'
import { useRemitosStore } from '@/store/remitos'
import type { CaiRemito } from '@/lib/remitos'

interface Props {
  onClose: () => void
}

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500'
const fechaAR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—')
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())

function estadoDe(c: CaiRemito) {
  if (c.estado === 'pendiente') return <span className="inline-flex items-center gap-1 text-xs text-gray-600"><Loader2 className="w-3 h-3 animate-spin" />Pidiendo a ARCA…</span>
  if (c.estado === 'error') return <span className="text-xs text-red-600" title={c.error ?? ''}>Error</span>
  if (c.vencimiento && c.vencimiento < hoy()) return <span className="text-xs text-gray-500">Vencido</span>
  return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">Vigente</span>
}

export default function RemitoCaiModal({ onClose }: Props) {
  const { cais, fetchCais, solicitarCai, avanzarCai, cargarCai, borrarCai } = useRemitosStore()
  const [pestaña, setPestaña] = useState<'pedir' | 'cargar'>('pedir')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // Pedir a ARCA
  const [puntoVenta, setPuntoVenta] = useState('')
  const [cantidad, setCantidad] = useState('100')
  const [esSociedad, setEsSociedad] = useState(false)
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [acepto, setAcepto] = useState(false)

  // Cargar a mano
  const [manual, setManual] = useState({ puntoVenta: '', cai: '', vencimiento: '', desde: '', hasta: '' })

  useEffect(() => { fetchCais().catch(err => setError(err.message)) }, [])

  // Mientras haya solicitudes en curso, se consulta a ARCA cada pocos segundos
  const pendientes = cais.filter(c => c.estado === 'pendiente').map(c => c.id).join(',')
  useEffect(() => {
    if (!pendientes) return
    const id = setInterval(() => {
      for (const caiId of pendientes.split(',')) avanzarCai(caiId).catch(err => setError(err.message))
    }, 5000)
    return () => clearInterval(id)
  }, [pendientes])

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setOk(null)
    setBusy(true)
    try {
      await fn()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const pedir = () => run(async () => {
    if (!acepto) throw new Error('Tenés que aceptar el uso de la clave fiscal para continuar')
    const cai = await solicitarCai({
      puntoVenta: Number(puntoVenta),
      cantidad: Number(cantidad),
      clave,
      usuario: esSociedad ? usuario.replace(/\D/g, '') : undefined,
    })
    setClave('')
    setOk(`Solicitud enviada a ARCA para los números ${cai.desde} al ${cai.hasta} del punto de venta ${cai.punto_venta}. Puede tardar unos minutos.`)
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
    setOk('CAI cargado. Ya podés emitir remitos R.')
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
              El remito R lleva un <strong>CAI</strong>: un código que ARCA otorga para una cantidad de números de un punto
              de venta, con fecha de vencimiento. Cuando se agota o vence, se pide otro.
            </p>
            <p>
              Desde la RG 5678/2025 el remito generado por sistema puede ser digital (no hace falta imprimirlo), pero siempre con CAI.
              Conviene usar un punto de venta exclusivo para los remitos R de BG Gestión.
            </p>
          </div>

          {ok && <div className="flex items-start gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg text-sm"><CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{ok}</div>}
          {error && <div className="flex items-start gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg text-sm"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}</div>}

          {/* CAI cargados */}
          {cais.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <th className="px-3 py-2">Pto. venta</th>
                    <th className="px-3 py-2">CAI</th>
                    <th className="px-3 py-2">Números</th>
                    <th className="px-3 py-2">Vence</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cais.map(c => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 font-mono text-xs">{String(c.punto_venta).padStart(5, '0')}</td>
                      <td className="px-3 py-2 font-mono text-xs">{c.cai ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">{c.desde} al {c.hasta}</td>
                      <td className="px-3 py-2 text-xs">{fechaAR(c.vencimiento)}</td>
                      <td className="px-3 py-2">
                        {estadoDe(c)}
                        {c.estado === 'error' && c.error && <p className="text-xs text-red-600 mt-0.5">{c.error}</p>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => run(() => borrarCai(c.id))} disabled={busy} title="Borrar" className="p-1 text-gray-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
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
                {p === 'pedir' ? 'Pedir CAI a ARCA' : 'Cargar un CAI que ya tengo'}
              </button>
            ))}
          </div>

          {pestaña === 'pedir' ? (
            <div className="space-y-3">
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Es un trámite real en ARCA (no existe CAI de prueba). Usa una automatización de Afip SDK con tu clave fiscal, que no se guarda.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Punto de venta *</label>
                  <input type="number" min={1} value={puntoVenta} onChange={e => setPuntoVenta(e.target.value)} placeholder="Ej.: 10" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad de remitos *</label>
                  <input type="number" min={1} max={10000} value={cantidad} onChange={e => setCantidad(e.target.value)} className={inputClass} />
                </div>
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
                Autorizo a BG Gestión a usar mi clave fiscal, a través de Afip SDK, solo para pedir este CAI.
              </label>
              <button
                onClick={pedir}
                disabled={busy || !puntoVenta || !cantidad || !clave}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Pedir CAI
              </button>
              <p className="text-xs text-gray-500">
                Cuando ARCA lo otorgue, verificá en ARCA → "Autorización de Impresión de Comprobantes" que la numeración coincida
                con la que muestra la lista. Si ARCA te pide confirmar la recepción del CAI, hacelo desde ese mismo servicio.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Copiá los datos de la constancia de CAI que te dio ARCA (o tu contador).</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Punto de venta *</label>
                  <input type="number" min={1} value={manual.puntoVenta} onChange={e => setManual({ ...manual, puntoVenta: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CAI (14 dígitos) *</label>
                  <input value={manual.cai} onChange={e => setManual({ ...manual, cai: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número desde *</label>
                  <input type="number" min={1} value={manual.desde} onChange={e => setManual({ ...manual, desde: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número hasta *</label>
                  <input type="number" min={1} value={manual.hasta} onChange={e => setManual({ ...manual, hasta: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vencimiento del CAI *</label>
                  <input type="date" value={manual.vencimiento} onChange={e => setManual({ ...manual, vencimiento: e.target.value })} className={inputClass} />
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

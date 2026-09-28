import { useEffect, useMemo, useState } from 'react'
import { Truck, X, Plus, Trash2, Loader2, CheckCircle, AlertTriangle, Download, Search } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useProductsStore } from '@/store/products'
import { useRemitosStore, descargarRemitoPdf, type DisponibilidadR, type NuevoRemito } from '@/store/remitos'
import { MOTIVOS_REMITO, numeroRemito, type ItemRemito, type MotivoRemito, type Remito } from '@/lib/remitos'

interface Props {
  inicial?: Partial<NuevoRemito>
  onClose: () => void
  onCreado?: (remito: Remito) => void
}

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500'

export default function RemitoModal({ inicial, onClose, onCreado }: Props) {
  const { branches, selectedBranch, branch } = useAuthStore()
  const { products } = useProductsStore()
  const { crear, disponibilidadR } = useRemitosStore()
  const sucursalActual = selectedBranch ?? branch

  // Remito R: solo si hay un CAI vigente con números disponibles
  const [tipo, setTipo] = useState<'X' | 'R'>('X')
  const [remitoR, setRemitoR] = useState<DisponibilidadR | null>(null)
  useEffect(() => {
    disponibilidadR().then(setRemitoR).catch(() => setRemitoR(null))
  }, [])

  const [motivo, setMotivo] = useState<MotivoRemito>(inicial?.motivo ?? 'venta')
  const [destinatarioNombre, setDestinatarioNombre] = useState(inicial?.destinatarioNombre ?? '')
  const [docTipo, setDocTipo] = useState(inicial?.destinatarioDocTipo ?? 96)
  const [docNro, setDocNro] = useState(inicial?.destinatarioDocNro ?? '')
  const [domicilio, setDomicilio] = useState(inicial?.domicilioEntrega ?? '')
  const [sucursalDestinoId, setSucursalDestinoId] = useState(inicial?.sucursalDestinoId ?? '')
  const [transportista, setTransportista] = useState(inicial?.transportista ?? '')
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? '')
  const [items, setItems] = useState<ItemRemito[]>(inicial?.items?.length ? inicial.items : [{ codigo: '', descripcion: '', cantidad: 1 }])
  const [busqueda, setBusqueda] = useState('')
  const [emitiendo, setEmitiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creado, setCreado] = useState<Remito | null>(null)

  const otrasSucursales = branches.filter(b => b.id !== sucursalActual?.id)

  const encontrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (q.length < 2) return []
    return products
      .filter(p => p.product?.name?.toLowerCase().includes(q) || p.barcode?.includes(q))
      .slice(0, 8)
  }, [busqueda, products])

  const elegirSucursalDestino = (id: string) => {
    setSucursalDestinoId(id)
    const destino = branches.find(b => b.id === id)
    if (destino) {
      setDestinatarioNombre(`Sucursal ${destino.name}`)
      if (destino.address) setDomicilio(destino.address)
    }
  }

  const agregarProducto = (codigo: string, descripcion: string, precio: number | null) => {
    setItems(prev => {
      const sinVacias = prev.filter(i => i.descripcion.trim())
      const existente = sinVacias.find(i => i.codigo && i.codigo === codigo)
      if (existente) return sinVacias.map(i => (i === existente ? { ...i, cantidad: i.cantidad + 1 } : i))
      return [...sinVacias, { codigo, descripcion, cantidad: 1, precio }]
    })
    setBusqueda('')
  }

  // Total de las líneas con precio (null si ninguna tiene precio)
  const conPrecio = items.filter(i => i.descripcion.trim() && i.precio != null)
  const totalItems = conPrecio.length ? conPrecio.reduce((s, i) => s + (i.precio ?? 0) * i.cantidad, 0) : null

  const cambiarItem = (index: number, cambios: Partial<ItemRemito>) =>
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, ...cambios } : item)))

  const handleEmitir = async () => {
    setError(null)
    if (motivo === 'traslado' && !sucursalDestinoId) return setError('Elegí la sucursal de destino')
    setEmitiendo(true)
    try {
      const remito = await crear({
        tipo,
        puntoVenta: tipo === 'R' ? remitoR?.puntoVenta : undefined,
        motivo,
        saleId: inicial?.saleId,
        destinatarioNombre,
        destinatarioDocTipo: docTipo,
        destinatarioDocNro: docNro,
        domicilioEntrega: domicilio,
        sucursalDestinoId: motivo === 'traslado' ? sucursalDestinoId : null,
        transportista,
        observaciones,
        items,
      })
      setCreado(remito)
      onCreado?.(remito)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEmitiendo(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Truck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Nuevo remito</h2>
              <p className="text-xs text-gray-500">
                {tipo === 'R' ? 'Remito R · con CAI de ARCA' : 'Remito X · Documento no válido como factura'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {creado ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-700 font-semibold">
                <CheckCircle className="w-5 h-5" />
                Remito {numeroRemito(creado)} emitido
              </div>
              <p className="text-sm text-green-800">
                Imprimilo (sale original y duplicado): quien recibe firma el original y se queda con el duplicado.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => descargarRemitoPdf(creado)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700"
                >
                  <Download className="w-4 h-4" />Descargar PDF
                </button>
                <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                  Cerrar
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Tipo de remito */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTipo('X')}
                  className={`p-3 rounded-lg border-2 text-left ${tipo === 'X' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <p className="font-semibold text-sm">Remito X</p>
                  <p className="text-xs text-gray-500 mt-0.5">Sin validez fiscal · entregas y control interno</p>
                </button>
                <button
                  onClick={() => remitoR && setTipo('R')}
                  disabled={!remitoR}
                  className={`p-3 rounded-lg border-2 text-left disabled:opacity-50 ${tipo === 'R' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <p className="font-semibold text-sm">Remito R</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {remitoR ? 'Con CAI · válido para trasladar mercadería' : 'Necesitás un CAI vigente (Remitos → Remito R)'}
                  </p>
                </button>
              </div>
              {tipo === 'R' && remitoR && (
                <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  Sale como R {String(remitoR.puntoVenta).padStart(5, '0')}-{String(remitoR.siguiente).padStart(8, '0')} ·
                  CAI {remitoR.cai} vence el {remitoR.vencimiento.split('-').reverse().join('/')} · quedan {remitoR.quedan} números
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
                  <select value={motivo} onChange={e => setMotivo(e.target.value as MotivoRemito)} className={inputClass}>
                    {(Object.keys(MOTIVOS_REMITO) as MotivoRemito[]).map(m => <option key={m} value={m}>{MOTIVOS_REMITO[m]}</option>)}
                  </select>
                </div>
                {motivo === 'traslado' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sucursal destino *</label>
                    <select value={sucursalDestinoId} onChange={e => elegirSucursalDestino(e.target.value)} className={inputClass}>
                      <option value="">Elegí una sucursal</option>
                      {otrasSucursales.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Destinatario</label>
                    <input value={destinatarioNombre} onChange={e => setDestinatarioNombre(e.target.value)} placeholder="Nombre o razón social" className={inputClass} />
                  </div>
                )}
              </div>

              {motivo !== 'traslado' && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Documento</label>
                    <select value={docTipo} onChange={e => setDocTipo(Number(e.target.value))} className={inputClass}>
                      <option value={96}>DNI</option>
                      <option value={80}>CUIT</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                    <input value={docNro} onChange={e => setDocNro(e.target.value)} placeholder="Opcional" className={inputClass} />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Domicilio de entrega</label>
                <input value={domicilio} onChange={e => setDomicilio(e.target.value)} placeholder="Calle, número, localidad" className={inputClass} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transportista</label>
                <input value={transportista} onChange={e => setTransportista(e.target.value)} placeholder="Opcional: empresa, chofer, patente" className={inputClass} />
              </div>

              {/* Mercadería */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Mercadería *</label>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar producto por nombre o código de barras"
                    className={`${inputClass} pl-9`}
                  />
                  {encontrados.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {encontrados.map(p => (
                        <button
                          key={p.id}
                          onClick={() => agregarProducto(p.barcode || '', p.product?.name || '', p.price_sale ?? null)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex justify-between gap-2"
                        >
                          <span>{p.product?.name}</span>
                          <span className="text-xs text-gray-400">{p.barcode}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 px-2 text-xs text-gray-500">
                  <span className="w-36">Código</span>
                  <span className="flex-1">Descripción</span>
                  <span className="w-20 text-right">Cantidad</span>
                  <span className="w-28 text-right">Precio unit.</span>
                  <span className="w-8" />
                </div>
                <div className="border border-gray-200 rounded-lg divide-y">
                  {items.map((item, i) => (
                    <div key={i} className="flex gap-2 p-2 items-center">
                      <input value={item.codigo} onChange={e => cambiarItem(i, { codigo: e.target.value })} placeholder="Código" className={`${inputClass} w-36`} />
                      <input value={item.descripcion} onChange={e => cambiarItem(i, { descripcion: e.target.value })} placeholder="Descripción" className={`${inputClass} flex-1`} />
                      <input
                        type="number" min={0} step="any" value={item.cantidad}
                        onChange={e => cambiarItem(i, { cantidad: Number(e.target.value) })}
                        className={`${inputClass} w-20 text-right`}
                        title="Cantidad"
                      />
                      <input
                        type="number" min={0} step="any" value={item.precio ?? ''}
                        onChange={e => cambiarItem(i, { precio: e.target.value === '' ? null : Number(e.target.value) })}
                        placeholder="Precio"
                        title="Precio unitario (opcional)"
                        className={`${inputClass} w-28 text-right`}
                      />
                      <button onClick={() => setItems(prev => prev.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                {totalItems !== null && (
                  <p className="text-right text-sm text-gray-700">
                    Total: <strong>{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalItems)}</strong>
                  </p>
                )}
                <button
                  onClick={() => setItems(prev => [...prev, { codigo: '', descripcion: '', cantidad: 1 }])}
                  className="flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800"
                >
                  <Plus className="w-4 h-4" />Agregar línea
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2} className={inputClass} />
              </div>

              {error && (
                <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleEmitir}
                  disabled={emitiendo}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {emitiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                  Emitir remito
                </button>
                <button onClick={onClose} className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">Cancelar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Pedido del CAI de remitos hecho a mano por el cliente en la página de ARCA, con un paso a paso.
// Se muestra cuando la app no puede pedirlo sola; al final el CAI se carga en "Ya tengo un CAI".
import { useState } from 'react'
import { ArrowRight, CheckCircle2, Clock, ListChecks } from 'lucide-react'
import { Boton, BotonAbrirArca, Instrucciones, Nota, PasoTutorial, Servicio, type EstadoPaso } from './TutorialArca'

export default function CaiManualArca({ condicionIva, onCargar }: { condicionIva: string | null; onCargar: () => void }) {
  const [hechos, setHechos] = useState<number[]>([])
  const [abierto, setAbierto] = useState<number | null>(0)

  const actual = [0, 1, 2].find((paso) => !hechos.includes(paso)) ?? 2
  const estadoDe = (paso: number): EstadoPaso => (hechos.includes(paso) ? 'hecho' : paso === actual ? 'actual' : 'pendiente')
  const alternar = (paso: number) => setAbierto(abierto === paso ? null : paso)
  const marcarHecho = (paso: number) => {
    const nuevos = [...new Set([...hechos, paso])]
    setHechos(nuevos)
    setAbierto([0, 1, 2].find((p) => !nuevos.includes(p)) ?? 2)
  }

  const botonListo = (paso: number, texto: string, alternativa?: string) => (
    <div className="flex flex-wrap gap-2 pt-1">
      <button type="button" onClick={() => marcarHecho(paso)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
        <CheckCircle2 className="w-4 h-4" />{texto}
      </button>
      {alternativa && (
        <button type="button" onClick={() => marcarHecho(paso)} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm">
          {alternativa}
        </button>
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-white border border-emerald-100 flex items-center justify-center">
            <ListChecks className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900">Pedí el CAI en la página de ARCA</h3>
            <p className="text-sm text-gray-600 mt-0.5">
              En este momento no podemos pedirlo automáticamente. Son dos trámites cortos (el primero, solo la primera vez)
              y después cargás el CAI acá.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-gray-200 text-xs text-gray-600"><Clock className="w-3.5 h-3.5" />Unos 10 minutos</span>
              <BotonAbrirArca acento="emerald" chico />
            </div>
          </div>
        </div>
      </div>

      <PasoTutorial numero={1} titulo="Tené un punto de venta para remitos" detalle="Solo la primera vez · unos 3 minutos"
        lugar="arca" estado={estadoDe(0)} abierto={abierto === 0} acento="emerald" onAbrir={() => alternar(0)}>
        <p className="text-sm text-gray-600">Los remitos R llevan un punto de venta distinto al de las facturas electrónicas.</p>
        <Instrucciones pasos={[
          <>Entrá a ARCA con tu CUIT y tu clave fiscal.</>,
          <>Abrí <Servicio>Administración de puntos de venta y domicilios</Servicio> y tocá el nombre del negocio.</>,
          <>Entrá en <Boton>A/B/M de Puntos de venta</Boton> y tocá <Boton>Agregar</Boton></>,
          <>
            Completá:
            <ul className="mt-1.5 space-y-1 list-disc pl-4 marker:text-gray-400">
              <li><strong>Número:</strong> el que sigue a los que ya tenés. Anotalo.</li>
              <li>
                <strong>Sistema:</strong> el que empieza con{' '}
                <span className="px-1.5 py-px rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium">Factuweb (Imprenta)</span>
                {condicionIva === 'Monotributo' && ' (el de monotributo)'}
              </li>
              <li><strong>Domicilio:</strong> el del negocio.</li>
            </ul>
          </>,
          <>Tocá <Boton>Aceptar</Boton> y confirmá con <Boton>Sí</Boton></>,
        ]} />
        <Nota>Si ya pediste un CAI antes, usá el mismo punto de venta y salteá este paso.</Nota>
        {botonListo(0, 'Listo, ya lo tengo', 'Ya tenía uno')}
      </PasoTutorial>

      <PasoTutorial numero={2} titulo="Pedí el CAI" detalle="Unos 5 minutos"
        lugar="arca" estado={estadoDe(1)} abierto={abierto === 1} acento="emerald" onAbrir={() => alternar(1)}>
        <Instrucciones pasos={[
          <>Buscá y abrí <Servicio>Autorización de Impresión de Comprobantes</Servicio>. Si no lo tenés, tocá <Boton>Agregar</Boton></>,
          <>Elegí <Boton>Solicitud de C.A.I.</Boton> y después <Boton>Solicitud manual</Boton></>,
          <>Cuando te pregunte si es para comprobantes de resguardo ante contingencias, respondé <Boton>No</Boton></>,
          <>
            Completá:
            <ul className="mt-1.5 space-y-1 list-disc pl-4 marker:text-gray-400">
              <li><strong>Punto de venta:</strong> el del paso 1.</li>
              <li><strong>Tipo de comprobante:</strong> Remito R.</li>
              <li><strong>Cantidad:</strong> cuántos remitos querés (por ejemplo, 100).</li>
            </ul>
          </>,
          <>Si te pide quién puede retirar los comprobantes, poné tu CUIT y tu nombre o el del negocio.</>,
          <>Tocá <Boton>Confirmar</Boton>. ARCA te muestra la constancia con el CAI.</>,
        ]} />
        <Nota>Guardá o imprimí la constancia: tiene los datos que vas a cargar en el paso siguiente.</Nota>
        {botonListo(1, 'Listo, ya tengo la constancia')}
      </PasoTutorial>

      <PasoTutorial numero={3} titulo="Cargá el CAI en la app" detalle="Con los datos de la constancia"
        lugar="app" estado={estadoDe(2)} abierto={abierto === 2} acento="emerald" onAbrir={() => alternar(2)}>
        <p className="text-sm text-gray-700">De la constancia vas a necesitar:</p>
        <ul className="space-y-1 list-disc pl-5 text-sm text-gray-700 marker:text-gray-400">
          <li>El número de <strong>CAI</strong> (14 dígitos).</li>
          <li>La <strong>fecha de vencimiento</strong>.</li>
          <li>El <strong>punto de venta</strong> y la <strong>numeración</strong> autorizada (desde y hasta).</li>
        </ul>
        <button type="button" onClick={onCargar} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
          Cargar el CAI<ArrowRight className="w-4 h-4" />
        </button>
      </PasoTutorial>
    </div>
  )
}

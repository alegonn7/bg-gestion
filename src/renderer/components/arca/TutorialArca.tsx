// Piezas de los paso a paso para hacer trámites en la página de ARCA (alta de facturación y CAI
// de remitos), cuando la app no los puede hacer sola.
import { Fragment, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Copy, ExternalLink, Lightbulb, Search } from 'lucide-react'

// Ingreso a ARCA con clave fiscal
export const URL_ARCA = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml'

export function abrirArca() {
  if (window.electron?.abrirEnlace) window.electron.abrirEnlace(URL_ARCA)
  else window.open(URL_ARCA, '_blank', 'noopener')
}

export type Acento = 'indigo' | 'emerald'

// Clases completas (Tailwind solo incluye las que aparecen escritas enteras)
const ACENTOS: Record<Acento, { actual: string; borde: string; boton: string; suave: string; texto: string }> = {
  indigo: {
    actual: 'bg-indigo-600 text-white',
    borde: 'border-indigo-300 ring-1 ring-indigo-100 shadow-sm',
    boton: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    suave: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
    texto: 'text-indigo-600',
  },
  emerald: {
    actual: 'bg-emerald-600 text-white',
    borde: 'border-emerald-300 ring-1 ring-emerald-100 shadow-sm',
    boton: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    suave: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    texto: 'text-emerald-600',
  },
}

export function clasesDe(acento: Acento) {
  return ACENTOS[acento]
}

// ─── Cómo se ven las cosas de ARCA en el texto ───────────────────────────────

// Un botón o una opción de la pantalla de ARCA, dibujado como botón
export function Boton({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-px mx-0.5 rounded-md border border-gray-300 bg-white text-[13px] font-medium text-gray-800 shadow-[0_1px_0_rgba(0,0,0,0.05)] whitespace-nowrap align-baseline">
      {children}
    </span>
  )
}

// Un servicio de ARCA (se busca en el buscador de la página)
export function Servicio({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-px mx-0.5 rounded-md border border-sky-200 bg-sky-50 text-[13px] font-medium text-sky-900 align-baseline">
      <Search className="w-3 h-3 flex-shrink-0" />
      {children}
    </span>
  )
}

// Un camino de opciones: ARCA › Web Services › Facturación Electrónica
export function Ruta({ partes }: { partes: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {partes.map((parte, i) => (
        <Fragment key={parte}>
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
          <span className="px-1.5 py-px rounded bg-gray-100 text-[13px] font-medium text-gray-800">{parte}</span>
        </Fragment>
      ))}
    </span>
  )
}

// Un dato para escribir tal cual en ARCA, con botón para copiarlo
export function Copiable({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      // Sin portapapeles: se puede escribir a mano
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <code className="px-2 py-0.5 rounded-md border border-gray-300 bg-gray-50 font-mono text-[13px] font-semibold text-gray-900">{texto}</code>
      <button type="button" onClick={copiar} className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800">
        {copiado ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </span>
  )
}

export function Nota({ tipo = 'consejo', children }: { tipo?: 'consejo' | 'atencion'; children: ReactNode }) {
  const atencion = tipo === 'atencion'
  const Icono = atencion ? AlertTriangle : Lightbulb
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 text-[13px] leading-relaxed ${atencion ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-blue-50 border-blue-100 text-blue-900'}`}>
      <Icono className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  )
}

// Lista numerada de lo que hay que hacer en la pantalla
export function Instrucciones({ pasos }: { pasos: ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {pasos.map((paso, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed text-gray-700">
          <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center justify-center">
            {i + 1}
          </span>
          <div className="min-w-0">{paso}</div>
        </li>
      ))}
    </ol>
  )
}

export function BotonAbrirArca({ acento, chico = false }: { acento: Acento; chico?: boolean }) {
  return (
    <button
      type="button"
      onClick={abrirArca}
      className={`inline-flex items-center gap-1.5 rounded-lg border font-medium ${clasesDe(acento).suave} ${chico ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'}`}
    >
      <ExternalLink className={chico ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      Abrir la página de ARCA
    </button>
  )
}

// ─── Un paso del recorrido (se abre y se cierra) ─────────────────────────────

export type EstadoPaso = 'hecho' | 'actual' | 'pendiente'

export function PasoTutorial({ numero, titulo, detalle, lugar, estado, abierto, acento, onAbrir, children }: {
  numero: number
  titulo: string
  detalle: string
  lugar: 'app' | 'arca'
  estado: EstadoPaso
  abierto: boolean
  acento: Acento
  onAbrir: () => void
  children: ReactNode
}) {
  const clases = clasesDe(acento)
  return (
    <div className={`rounded-xl border bg-white transition-shadow ${abierto && estado !== 'hecho' ? clases.borde : 'border-gray-200'}`}>
      <button type="button" onClick={onAbrir} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
            estado === 'hecho' ? 'bg-green-100 text-green-700' : estado === 'actual' ? clases.actual : 'bg-gray-100 text-gray-500'
          }`}
        >
          {estado === 'hecho' ? <CheckCircle2 className="w-5 h-5" /> : numero}
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block text-sm font-semibold ${estado === 'hecho' ? 'text-gray-500' : 'text-gray-900'}`}>{titulo}</span>
          <span className="block text-xs text-gray-500">{detalle}</span>
        </span>
        <span
          className={`hidden sm:inline-flex flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            lugar === 'arca' ? 'bg-sky-50 text-sky-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {lugar === 'arca' ? 'En ARCA' : 'En la app'}
        </span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && <div className="px-4 pb-4 pl-[3.75rem] space-y-3">{children}</div>}
    </div>
  )
}

// Lo que se marcó como hecho sobrevive a cerrar la app (el cliente puede ir y venir de ARCA)
export function leerHechos(clave: string): number[] {
  try {
    const guardado = JSON.parse(localStorage.getItem(clave) || '[]')
    return Array.isArray(guardado) ? guardado.filter((n) => Number.isInteger(n)) : []
  } catch {
    return []
  }
}

export function guardarHechos(clave: string, hechos: number[]) {
  try {
    localStorage.setItem(clave, JSON.stringify(hechos))
  } catch {
    // Sin almacenamiento: se vuelve a marcar
  }
}

// Lector de códigos con la cámara (solo versión web, pensado para el celular).
// Usa el lector que trae el navegador cuando existe (Chrome en Android) y, si no
// (Safari en iPhone), uno propio que viaja con la app, así funciona también sin internet.

const FORMATOS = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code',
] as const

export interface Detector {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>
}

/** La cámara como lector existe solo en la web; en escritorio se usa el lector físico. */
export function canUseCameraScanner(): boolean {
  return !window.electron && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

let detectorPromise: Promise<Detector> | null = null

export function getDetector(): Promise<Detector> {
  if (!detectorPromise) {
    detectorPromise = crearDetector().catch((err) => {
      detectorPromise = null
      throw err
    })
  }
  return detectorPromise
}

async function crearDetector(): Promise<Detector> {
  const Nativo = (window as any).BarcodeDetector
  if (Nativo) {
    try {
      const soportados: string[] = await Nativo.getSupportedFormats()
      if (soportados.includes('ean_13')) {
        return new Nativo({ formats: FORMATOS.filter((f) => soportados.includes(f)) })
      }
    } catch {
      // seguimos con el lector propio
    }
  }

  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  // El lector se descarga del propio sitio (no de un CDN) para que quede guardado y ande offline
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
  })
  return new BarcodeDetector({ formats: [...FORMATOS] })
}

/** Mensaje para el usuario según por qué no se pudo abrir la cámara. */
export function cameraErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'No hay permiso para usar la cámara. Habilitalo en la configuración del navegador para este sitio y volvé a intentar.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No se encontró una cámara en este dispositivo.'
  }
  if (name === 'NotReadableError') {
    return 'La cámara está siendo usada por otra aplicación. Cerrala y volvé a intentar.'
  }
  return 'No se pudo abrir la cámara.'
}

/** Celular o tablet (pantalla táctil sin mouse). */
export function isTouchDevice(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

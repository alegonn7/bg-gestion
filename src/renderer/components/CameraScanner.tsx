import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, X, Flashlight, FlashlightOff, Loader2 } from 'lucide-react'
import { canUseCameraScanner, cameraErrorMessage, getDetector } from '@/lib/cameraScanner'

export interface CameraScanResult {
  type: 'success' | 'error' | 'info'
  message: string
}

/** Recibe el código leído (el sonido lo pone quien lo usa). Puede devolver un mensaje para mostrar sobre la cámara. */
export type CameraScanHandler = (code: string) => CameraScanResult | void

interface CameraScannerProps {
  onScan: CameraScanHandler
  onClose: () => void
  /** Sigue leyendo después de cada código (ej: punto de venta). Si no, se cierra al primer código. */
  continuous?: boolean
  title?: string
}

// Un mismo código no se vuelve a tomar hasta que salga de cuadro este tiempo (evita sumar dos veces)
const MISMO_CODIGO_MS = 1200
const INTERVALO_MS = 120

export function CameraScanner({ onScan, onClose, continuous = false, title = 'Escanear código' }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const onScanRef = useRef(onScan)
  const onCloseRef = useRef(onClose)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<CameraScanResult | null>(null)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [count, setCount] = useState(0)

  useEffect(() => { onScanRef.current = onScan }, [onScan])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let stream: MediaStream | null = null
    let last = { code: '', seenAt: 0 }

    const start = async () => {
      try {
        const [media, detector] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          }),
          getDetector(),
        ])
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop())
          return
        }
        stream = media
        const track = media.getVideoTracks()[0]
        trackRef.current = track
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean }
        setTorchAvailable(!!caps.torch)

        const video = videoRef.current!
        video.srcObject = media
        await video.play().catch(() => {})
        setStatus('scanning')

        const tick = async () => {
          if (cancelled) return
          if (video.readyState >= 2) {
            try {
              const results = await detector.detect(video)
              const code = results[0]?.rawValue?.trim()
              const now = Date.now()
              if (code && !cancelled) {
                const repetido = code === last.code && now - last.seenAt < MISMO_CODIGO_MS
                last = { code, seenAt: now }
                if (!repetido) {
                  navigator.vibrate?.(60)
                  const result = onScanRef.current(code)
                  if (!continuous) {
                    onCloseRef.current()
                    return
                  }
                  setFeedback(result || { type: 'success', message: `Leído: ${code}` })
                  setCount((c) => c + 1)
                }
              }
            } catch {
              // un cuadro que no se pudo analizar: seguimos con el próximo
            }
          }
          timer = setTimeout(tick, INTERVALO_MS)
        }
        tick()
      } catch (err) {
        if (cancelled) return
        console.warn('Cámara:', err)
        setError(cameraErrorMessage(err))
        setStatus('error')
      }
    }
    start()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
      trackRef.current = null
    }
  }, [continuous])

  // El aviso de cada lectura se borra solo
  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 2500)
    return () => clearTimeout(t)
  }, [feedback, count])

  // Escape cierra (útil con teclado)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const toggleTorch = async () => {
    const track = trackRef.current
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] })
      setTorchOn(!torchOn)
    } catch {
      setTorchAvailable(false)
    }
  }

  const feedbackColor =
    feedback?.type === 'error' ? 'bg-red-600' : feedback?.type === 'info' ? 'bg-blue-600' : 'bg-green-600'

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center gap-3 px-4 h-14 text-white flex-shrink-0">
        <Camera className="w-5 h-5" />
        <p className="flex-1 font-medium truncate">{title}</p>
        {torchAvailable && (
          <button onClick={toggleTorch} className="p-2 rounded-full hover:bg-white/10" aria-label={torchOn ? 'Apagar linterna' : 'Prender linterna'}>
            {torchOn ? <FlashlightOff className="w-6 h-6" /> : <Flashlight className="w-6 h-6" />}
          </button>
        )}
        <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-white/10" aria-label="Cerrar cámara">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />

        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[80%] max-w-md aspect-[2/1] rounded-xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] relative">
              <div className="absolute left-3 right-3 top-1/2 h-0.5 bg-red-500/80" />
            </div>
          </div>
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Abriendo la cámara…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4 px-8 text-center">
            <Camera className="w-10 h-10 text-white/60" />
            <p>{error}</p>
            <button onClick={onClose} className="px-5 py-2 bg-white text-gray-900 rounded-lg font-medium">Cerrar</button>
          </div>
        )}

        {feedback && (
          <div className={`absolute left-4 right-4 top-4 ${feedbackColor} text-white rounded-lg px-4 py-3 text-sm font-medium shadow-lg`}>
            {feedback.message}
          </div>
        )}
      </div>

      <div className="px-4 py-4 text-center text-white flex-shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {status === 'scanning' && (
          <p className="text-sm text-white/80 mb-3">Apuntá al código de barras y mantené el celular quieto</p>
        )}
        {continuous && (
          <button onClick={onClose} className="w-full max-w-md py-3 bg-white text-gray-900 rounded-lg font-semibold">
            Listo{count > 0 ? ` (${count} leído${count === 1 ? '' : 's'})` : ''}
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}

interface CameraScanButtonProps {
  onScan: CameraScanHandler
  continuous?: boolean
  title?: string
  /** Texto del botón; sin texto se muestra solo el ícono */
  label?: string
  className?: string
}

/** Botón que abre la cámara como lector. En escritorio no se muestra (ahí está el lector físico). */
export function CameraScanButton({ onScan, continuous, title, label, className }: CameraScanButtonProps) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  if (!canUseCameraScanner()) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Escanear con la cámara"
        aria-label="Escanear con la cámara"
        className={className ?? 'inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex-shrink-0'}
      >
        <Camera className="w-5 h-5" />
        {label && <span>{label}</span>}
      </button>
      {open && <CameraScanner onScan={onScan} onClose={close} continuous={continuous} title={title} />}
    </>
  )
}

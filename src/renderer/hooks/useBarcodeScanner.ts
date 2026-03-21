import { useEffect, useRef, useCallback } from 'react'

/**
 * Hook para capturar escaneos de un escáner físico de códigos de barras (ProSoft S224 u otro HID/USB).
 * 
 * Los escáneres HID simulan un teclado: escriben el código a alta velocidad y envían Enter.
 * 
 * Dos modos de captura:
 * 1. Si hay un input con foco → el escáner escribe ahí y el Enter hace submit normalmente (este hook NO interfiere)
 * 2. Si NO hay input con foco → este hook captura la entrada rápida y llama al callback
 * 
 * @param onScan - Callback que recibe el código escaneado
 * @param options - Configuración opcional
 */
interface UseBarcodeOptions {
  /** Tiempo máximo entre caracteres para considerar que viene del escáner (ms). Default: 80 */
  maxTimeBetweenChars?: number
  /** Largo mínimo del código para considerarlo válido. Default: 3 */
  minLength?: number
  /** Si está desactivado, no captura nada. Default: false */
  disabled?: boolean
}

export function useBarcodeScanner(
  onScan: (barcode: string) => void,
  options: UseBarcodeOptions = {}
) {
  const {
    maxTimeBetweenChars = 80,
    minLength = 3,
    disabled = false,
  } = options

  const bufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)
  const onScanRef = useRef(onScan)

  // Mantener referencia actualizada sin re-suscribir el listener
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

    // Si hay un input con foco, dejar que el flujo normal lo maneje
    // (el escáner escribe en el input y el Enter hace submit)
    if (isInputFocused) {
      bufferRef.current = ''
      return
    }

    const now = Date.now()
    const timeDiff = now - lastKeyTimeRef.current
    lastKeyTimeRef.current = now

    // Si pasó mucho tiempo entre teclas, resetear (no es entrada rápida de escáner)
    if (timeDiff > maxTimeBetweenChars && bufferRef.current.length > 0) {
      bufferRef.current = ''
    }

    if (e.key === 'Enter') {
      const barcode = bufferRef.current.trim()
      bufferRef.current = ''

      if (barcode.length >= minLength) {
        e.preventDefault()
        onScanRef.current(barcode)
      }
      return
    }

    // Solo acumular caracteres imprimibles
    if (e.key.length === 1) {
      bufferRef.current += e.key
    }
  }, [maxTimeBetweenChars, minLength])

  useEffect(() => {
    if (disabled) return

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [handleKeyDown, disabled])
}

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useShowProductPhotos } from '@/store/display'

interface ProductPhotosProps {
  images?: string[] | null
  name?: string
  className?: string
}

/**
 * Fotos del producto (solo web, si están activadas en Configuración).
 * Sin fotos no muestra nada. Tocar la foto la abre en grande.
 */
export default function ProductPhotos({ images, name, className = '' }: ProductPhotosProps) {
  const show = useShowProductPhotos()
  const [selected, setSelected] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [failed, setFailed] = useState<string[]>([])

  const urls = (images || []).filter((url) => url && !failed.includes(url))
  const key = (images || []).join('|')

  // Al cambiar de producto, volver a la foto principal
  useEffect(() => { setSelected(0); setZoomed(false) }, [key])

  if (!show || urls.length === 0) return null

  const current = urls[Math.min(selected, urls.length - 1)]
  const markFailed = (url: string) => setFailed((prev) => [...prev, url])

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        className="w-full h-56 md:h-64 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden flex items-center justify-center"
        title="Ver en grande"
      >
        <img
          src={current}
          alt={name || 'Foto del producto'}
          className="max-w-full max-h-full object-contain"
          onError={() => markFailed(current)}
        />
      </button>

      {urls.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto">
          {urls.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setSelected(i)}
              className={`w-14 h-14 flex-shrink-0 rounded-md overflow-hidden border-2 bg-gray-50 ${
                url === current ? 'border-blue-500' : 'border-transparent'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" onError={() => markFailed(url)} />
            </button>
          ))}
        </div>
      )}

      {zoomed && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
          onClick={() => setZoomed(false)}
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="w-8 h-8" />
          </button>
          <img src={current} alt={name || 'Foto del producto'} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  )
}

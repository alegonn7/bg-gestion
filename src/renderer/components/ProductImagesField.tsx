import { useRef, useState } from 'react'
import { X, ImagePlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { compressImage } from '@/lib/compressImage'

// Mismo bucket y estructura de carpetas que usa bg-tienda (components/admin/product-form.tsx),
// así las imágenes cargadas acá se ven en la tienda y viceversa (columna products.images).
const BUCKET = 'store-product-images'

interface ProductImagesFieldProps {
  images: string[]
  onChange: (images: string[]) => void
  /** Avisa al formulario mientras hay una subida en curso (para no guardar a medias) */
  onUploadingChange?: (uploading: boolean) => void
}

export default function ProductImagesField({ images, onChange, onUploadingChange }: ProductImagesFieldProps) {
  const { organization } = useAuthStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const setBusy = (value: boolean) => {
    setUploading(value)
    onUploadingChange?.(value)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !organization) return

    setBusy(true)
    setError('')

    const urls: string[] = []
    try {
      for (const original of files) {
        const file = await compressImage(original, { maxSize: 1400 })
        const ext = file.name.split('.').pop()
        const filename = `${organization.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filename, file)
        if (uploadError) {
          setError(`Error subiendo imagen: ${uploadError.message}`)
          break
        }

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
        urls.push(data.publicUrl)
      }
    } catch (err: any) {
      setError(`Error subiendo imagen: ${err?.message || err}`)
    } finally {
      if (urls.length) onChange([...images, ...urls])
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeImage = (url: string) => onChange(images.filter(u => u !== url))

  const makeMain = (url: string) => onChange([url, ...images.filter(u => u !== url)])

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Imágenes <span className="text-xs text-gray-400 font-normal ml-1">(se ven en la tienda online)</span>
      </label>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-3">
          {images.map((url, i) => (
            <div key={url} className="relative w-20 h-20">
              <img
                src={url}
                alt={`Imagen ${i + 1}`}
                onClick={() => i > 0 && makeMain(url)}
                title={i === 0 ? 'Imagen principal' : 'Usar como principal'}
                className={`w-20 h-20 object-cover rounded-lg border ${
                  i === 0 ? 'border-blue-500 border-2' : 'border-gray-200 cursor-pointer'
                }`}
              />
              <button
                type="button"
                onClick={() => removeImage(url)}
                aria-label="Quitar imagen"
                className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 shadow"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
        id="product-images-upload"
      />
      <label
        htmlFor="product-images-upload"
        className={`inline-flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition ${
          uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
        }`}
      >
        <ImagePlus className="w-4 h-4" />
        {uploading ? 'Subiendo...' : 'Agregar imágenes'}
      </label>
      <p className="mt-1 text-xs text-gray-500">
        La primera imagen es la principal (tocá otra para hacerla principal). Podés subir varias a la vez.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

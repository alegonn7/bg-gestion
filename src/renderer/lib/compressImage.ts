// Achica y recomprime una imagen en el navegador antes de subirla a Storage (copiado de
// bg-tienda/lib/compress-image.ts). Las fotos del celular pesan 2–5 MB; así quedan en 100–400 KB.
// Si algo falla (formato que el navegador no decodifica, etc.) devuelve el archivo original:
// nunca bloquea una subida.
export async function compressImage(
  file: File,
  { maxSize, quality = 0.82 }: { maxSize: number; quality?: number },
): Promise<File> {
  // SVG/GIF se dejan como están (vectorial / animado).
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    // WebP mantiene transparencia (PNGs de producto con fondo transparente) y pesa bastante
    // menos que JPEG a la misma calidad.
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp'
    return new File([blob], name, { type: 'image/webp' })
  } catch {
    return file
  }
}

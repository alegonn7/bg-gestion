import { create } from 'zustand'

/**
 * Preferencias de visualización de este dispositivo (se guardan en el navegador, no en la base).
 *
 * Fotos de producto: solo en la web (en escritorio `window.electron` existe y no se muestran).
 * Arrancan activadas; se apagan desde Configuración.
 */

const PHOTOS_KEY = 'bg-show-product-photos'

function readShowPhotos(): boolean {
  try { return localStorage.getItem(PHOTOS_KEY) !== '0' } catch { return true }
}

interface DisplayState {
  showProductPhotos: boolean
  setShowProductPhotos: (value: boolean) => void
}

export const useDisplayStore = create<DisplayState>((set) => ({
  showProductPhotos: readShowPhotos(),
  setShowProductPhotos: (value) => {
    try { localStorage.setItem(PHOTOS_KEY, value ? '1' : '0') } catch { /* sin almacenamiento: queda solo en memoria */ }
    set({ showProductPhotos: value })
  },
}))

/** La opción de fotos existe solo en la web */
export const productPhotosAvailable = () => !window.electron

/** true si hay que mostrar las fotos de producto en esta pantalla */
export function useShowProductPhotos(): boolean {
  const enabled = useDisplayStore((s) => s.showProductPhotos)
  return productPhotosAvailable() && enabled
}

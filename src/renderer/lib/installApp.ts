// Versión web: instalar BG Gestión como app en el celular (ícono en la pantalla de inicio).
// Chrome/Android avisa que se puede instalar con el evento "beforeinstallprompt"; hay que
// escucharlo apenas arranca la página y guardarlo para cuando el usuario toque "Instalar".

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function initInstallPrompt() {
  if (window.electron) return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Ya se abrió como app instalada (no desde el navegador). */
export function isRunningInstalled(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

/** iPhone/iPad: Safari no ofrece botón de instalar, se hace desde "Compartir". */
export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function canPromptInstall(): boolean {
  return !!deferred
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const ev = deferred
  deferred = null
  notify()
  await ev.prompt()
  const { outcome } = await ev.userChoice
  return outcome === 'accepted'
}

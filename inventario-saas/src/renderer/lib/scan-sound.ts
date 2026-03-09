const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine') {
  const oscillator = audioCtx.createOscillator()
  const gainNode = audioCtx.createGain()

  oscillator.type = type
  oscillator.frequency.value = frequency
  gainNode.gain.value = 0.15

  oscillator.connect(gainNode)
  gainNode.connect(audioCtx.destination)

  // Fade out suave
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration)

  oscillator.start()
  oscillator.stop(audioCtx.currentTime + duration)
}

/** Beep corto agudo — producto encontrado */
export function playScanSuccess() {
  playTone(1200, 0.15)
}

/** Doble tono grave — producto no encontrado */
export function playScanError() {
  playTone(400, 0.15, 'square')
  setTimeout(() => playTone(300, 0.2, 'square'), 180)
}

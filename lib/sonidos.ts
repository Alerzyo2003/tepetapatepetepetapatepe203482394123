// Sonidos de la app generados en el navegador (no dependen de archivos ni de internet).
// Los navegadores bloquean el audio hasta que la persona hace un clic: por eso se "desbloquea" en la primera interacción.
let ctx: AudioContext | null = null

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch { return null }
}

if (typeof window !== 'undefined') {
  const desbloquear = () => { contexto() }
  ;['pointerdown', 'keydown', 'touchstart'].forEach(e => window.addEventListener(e, desbloquear, { once: true, passive: true }))
}

// Una nota corta con entrada y salida suaves
function nota(frecuencia: number, inicio: number, duracion: number, volumen: number, tipo: OscillatorType = 'sine') {
  const c = contexto()
  if (!c) return
  const t0 = c.currentTime + inicio
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = tipo
  osc.frequency.setValueAtTime(frecuencia, t0)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(volumen, t0 + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duracion + 0.03)
}

// Mensaje enviado: "pop" corto hacia arriba
export function sonidoEnviar() {
  nota(660, 0, 0.12, 0.18)
  nota(990, 0.07, 0.16, 0.14)
}

// Mensaje recibido: dos notas descendentes, un poco más fuertes para que se note
export function sonidoRecibir() {
  nota(988, 0, 0.18, 0.28)
  nota(740, 0.14, 0.28, 0.28)
}

// Solicitud nueva para administración: tres notas ascendentes
export function sonidoSolicitud() {
  nota(784, 0, 0.16, 0.3)
  nota(988, 0.15, 0.16, 0.3)
  nota(1318, 0.3, 0.4, 0.3)
}

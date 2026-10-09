// Compresión de imágenes en el navegador antes de subirlas a Supabase.
// Pensado para radiografías y fotos clínicas: WebP de alta calidad (se ve igual en pantalla, pesa mucho menos).

export const CONFIG_IMAGENES = {
  MAX_LADO: 3000,        // px del lado más largo (una panorámica suele medir ~2.900 px: no se reduce)
  CALIDAD: 0.9,          // 0.9 = alta calidad, apta para radiografías
  MAX_LADO_MINI: 400,    // miniatura para la grilla
  CALIDAD_MINI: 0.7,
}

export const ES_IMAGEN = (tipo: string) => ['image/jpeg', 'image/png', 'image/webp'].includes(tipo)

export interface ImagenProcesada {
  archivo: Blob          // imagen a guardar (comprimida u original)
  tipo: string           // image/webp, image/jpeg o el tipo original
  extension: string
  miniatura: Blob | null // miniatura WebP (o null si no se pudo crear)
  comprimida: boolean
  pesoOriginal: number
  pesoFinal: number
}

async function cargar(file: File): Promise<{ img: CanvasImageSource; ancho: number; alto: number }> {
  // createImageBitmap respeta la orientación de las fotos de celular
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any)
      return { img: bmp, ancho: bmp.width, alto: bmp.height }
    } catch { /* se intenta con <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { img, ancho: img.naturalWidth, alto: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function dibujar(img: CanvasImageSource, ancho: number, alto: number, maxLado: number): HTMLCanvasElement {
  const escala = Math.min(1, maxLado / Math.max(ancho, alto))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(ancho * escala))
  canvas.height = Math.max(1, Math.round(alto * escala))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff' // fondo blanco por si el PNG tiene transparencia
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

const aBlob = (canvas: HTMLCanvasElement, tipo: string, calidad: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(resolve, tipo, calidad))

// WebP si el navegador lo permite; si no (Safari antiguo), JPEG de alta calidad
async function codificar(canvas: HTMLCanvasElement, calidad: number): Promise<{ blob: Blob; tipo: string; extension: string } | null> {
  const webp = await aBlob(canvas, 'image/webp', calidad)
  if (webp && webp.type === 'image/webp') return { blob: webp, tipo: 'image/webp', extension: 'webp' }
  const jpg = await aBlob(canvas, 'image/jpeg', calidad)
  return jpg ? { blob: jpg, tipo: 'image/jpeg', extension: 'jpg' } : null
}

const extensionDe = (file: File) => (file.name.split('.').pop() || 'bin').toLowerCase()

export async function procesarImagen(file: File, opciones: { calidadOriginal?: boolean } = {}): Promise<ImagenProcesada> {
  const C = CONFIG_IMAGENES
  const base: ImagenProcesada = {
    archivo: file, tipo: file.type, extension: extensionDe(file), miniatura: null,
    comprimida: false, pesoOriginal: file.size, pesoFinal: file.size,
  }
  if (!ES_IMAGEN(file.type)) return base

  let fuente: { img: CanvasImageSource; ancho: number; alto: number }
  try { fuente = await cargar(file) } catch { return base }

  try {
    // Miniatura (siempre, también en calidad original)
    const mini = await codificar(dibujar(fuente.img, fuente.ancho, fuente.alto, C.MAX_LADO_MINI), C.CALIDAD_MINI)
    base.miniatura = mini?.blob || null

    if (!opciones.calidadOriginal) {
      const grande = await codificar(dibujar(fuente.img, fuente.ancho, fuente.alto, C.MAX_LADO), C.CALIDAD)
      // Solo se usa la versión comprimida si realmente pesa menos
      if (grande && grande.blob.size < file.size) {
        return { ...base, archivo: grande.blob, tipo: grande.tipo, extension: grande.extension, comprimida: true, pesoFinal: grande.blob.size }
      }
    }
    return base
  } finally {
    if ('close' in (fuente.img as any)) (fuente.img as any).close?.()
  }
}

export const formatoPeso = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

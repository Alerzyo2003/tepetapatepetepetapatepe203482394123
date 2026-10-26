import { supabase } from '@/lib/supabase'

// Archivos de pacientes (fotos, radiografías, PDF). Son datos de salud: se guardan en el bucket PRIVADO
// 'pacientes_docs' y se muestran con links temporales firmados, que vencen en una hora.
// Los registros antiguos guardaban el link público del bucket 'documentos_pacientes' (ahora privado): también se firman.

export const BUCKET_PACIENTES = 'pacientes_docs'
const PUBLICO_ANTIGUO = '/storage/v1/object/public/documentos_pacientes/'

// Dónde está guardado un archivo según lo que dice la base (ruta interna o link antiguo). null = link externo.
export function ubicacionArchivo(url: string | null | undefined): { bucket: string; ruta: string } | null {
  if (!url) return null
  const s = String(url)
  const i = s.indexOf(PUBLICO_ANTIGUO)
  if (i >= 0) return { bucket: 'documentos_pacientes', ruta: decodeURIComponent(s.slice(i + PUBLICO_ANTIGUO.length).split('?')[0]) }
  if (s.startsWith('http')) return null
  return { bucket: BUCKET_PACIENTES, ruta: s }
}

// Firma varias URLs en una llamada por bucket. Devuelve { url guardada → link temporal }.
export async function firmarUrls(urls: (string | null | undefined)[], segundos = 3600): Promise<Record<string, string>> {
  const porBucket: Record<string, Map<string, string>> = {}
  for (const u of new Set(urls.filter(Boolean) as string[])) {
    const ub = ubicacionArchivo(u)
    if (!ub) continue
    ;(porBucket[ub.bucket] ||= new Map()).set(ub.ruta, u)
  }
  const firmadas: Record<string, string> = {}
  await Promise.all(Object.entries(porBucket).map(async ([bucket, rutas]) => {
    const { data } = await supabase.storage.from(bucket).createSignedUrls([...rutas.keys()], segundos)
    ;(data || []).forEach(f => { if (f.path && f.signedUrl) firmadas[rutas.get(f.path)!] = f.signedUrl })
  }))
  // Links externos (no son de Supabase): se usan tal cual
  urls.forEach(u => { if (u && !ubicacionArchivo(u) && String(u).startsWith('http')) firmadas[u] = u })
  return firmadas
}

// Borra del almacenamiento los archivos indicados (de cualquiera de los dos buckets)
export async function borrarArchivos(urls: (string | null | undefined)[]) {
  const porBucket: Record<string, string[]> = {}
  for (const u of urls) {
    const ub = ubicacionArchivo(u)
    if (ub) (porBucket[ub.bucket] ||= []).push(ub.ruta)
  }
  for (const [bucket, rutas] of Object.entries(porBucket)) {
    const { error } = await supabase.storage.from(bucket).remove(rutas)
    if (error) console.warn('No se pudieron borrar los archivos del almacenamiento:', error.message)
  }
}

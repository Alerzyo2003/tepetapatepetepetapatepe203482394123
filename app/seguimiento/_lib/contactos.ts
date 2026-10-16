// Historial de contactos: quién contactó a cada paciente, con qué resultado y hasta cuándo deja de aparecer.
import { LISTAS, RESULTADOS, type IdLista } from './config'
import { fechaISO, sumarDias } from './util'

export interface Contacto {
  id: number | string
  paciente_id: string
  lista: string
  resultado: string
  nota: string | null
  volver_a_contactar: string | null // YYYY-MM-DD
  usuario_id: string | null
  created_at: string
}

// Los saludos (cumpleaños, reseñas) son aparte: no ocultan al paciente de las listas de venta y viceversa
const FIDELIZACION = new Set<string>(LISTAS.filter(l => l.grupo === 'Fidelización').map(l => l.id))
const aplica = (lista: IdLista, c: Contacto) =>
  FIDELIZACION.has(lista) ? c.lista === lista : (!FIDELIZACION.has(c.lista) || c.resultado === 'telefono_malo')

// Contactos por paciente, del más reciente al más antiguo
export function indexarContactos(contactos: Contacto[] | null): Map<string, Contacto[]> {
  const m = new Map<string, Contacto[]>()
  for (const c of contactos || []) {
    const a = m.get(c.paciente_id)
    if (a) a.push(c); else m.set(c.paciente_id, [c])
  }
  for (const a of m.values()) a.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))
  return m
}

// Último contacto que tiene que ver con esta lista (para mostrarlo en la fila)
export const ultimoContacto = (lista: IdLista, contactos: Contacto[] | undefined) => (contactos || []).find(c => aplica(lista, c)) || null

// El paciente no aparece mientras haya un contacto vigente ("volver a contactar" en el futuro)
export const contactoVigente = (lista: IdLista, contactos: Contacto[] | undefined, hoyISO: string) =>
  (contactos || []).find(c => aplica(lista, c) && !!c.volver_a_contactar && c.volver_a_contactar > hoyISO) || null

export const textoResultado = (id: string) => RESULTADOS.find(r => r.id === id)?.texto || id
export const fechaVolver = (resultado: string, hoy: Date) => fechaISO(sumarDias(hoy, RESULTADOS.find(r => r.id === resultado)?.dias ?? 7))

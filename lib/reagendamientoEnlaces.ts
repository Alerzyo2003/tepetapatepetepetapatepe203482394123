// Cuántos pacientes se reagendan solos con el enlace que se les manda por WhatsApp.
// Datos de la tabla reagendamiento_enlaces (un registro por cada enlace creado):
//  - estado 'usado': el paciente eligió su nueva hora (usado_en, cita_resultante_id)
//  - estado 'revocado': se reemplazó por un enlace nuevo o se anuló
//  - estado 'activo': todavía no se usa (si expira_en ya pasó, venció sin usarse)
import { supabase } from '@/lib/supabase'

export interface Reagendado {
  id: string
  usado_en: string
  paciente_id: string
  paciente: string
  telefono: string | null
  profesional_id: string | null
  inicio_original: string | null
  inicio_nuevo: string | null
  estado_cita_nueva: string | null
}

export interface ResumenReagendamiento {
  pacientesConEnlace: number // citas distintas a las que se les mandó enlace en el periodo
  reagendaron: number // enlaces usados en el periodo
  reagendaronDeEsteEnvio: number // de los enlaces mandados en el periodo, cuántos se usaron (para la tasa)
  vencidos: number // mandados en el periodo, vencieron sin usarse
  esperando: number // mandados en el periodo, todavía vigentes
  asistieron: number // de los que reagendaron, cuántos ya fueron atendidos en la nueva hora
  noAsistieron: number // de los que reagendaron, cuántos faltaron otra vez
  lista: Reagendado[]
}

const ATENDIDO = ['atendido', 'atendiendose', 'atendiéndose']
const NO_ASISTE = ['no_asiste', 'no asiste']

export async function cargarReagendamiento(desdeTz: string, hastaTz: string, profesionalId?: string | null): Promise<ResumenReagendamiento> {
  const filtrar = (q: any) => (profesionalId ? q.eq('profesional_id', profesionalId) : q)
  const [enviados, usados] = await Promise.all([
    filtrar(supabase.from('reagendamiento_enlaces').select('id, cita_id, estado, expira_en')
      .gte('created_at', desdeTz).lt('created_at', hastaTz)),
    filtrar(supabase.from('reagendamiento_enlaces')
      .select('id, usado_en, paciente_id, profesional_id, inicio_original, inicio_nuevo, cita_resultante_id')
      .eq('estado', 'usado').gte('usado_en', desdeTz).lt('usado_en', hastaTz)),
  ])
  if (enviados.error) throw enviados.error
  if (usados.error) throw usados.error

  const env: any[] = enviados.data || []
  const us: any[] = usados.data || []
  const ahora = new Date().toISOString()

  // Una cita puede tener varios enlaces (si se reenvió): se cuenta una vez y vale si cualquiera se usó
  const porCita = new Map<string, any[]>()
  env.forEach(e => porCita.set(e.cita_id, [...(porCita.get(e.cita_id) || []), e]))
  let reagendaronDeEsteEnvio = 0, vencidos = 0, esperando = 0
  porCita.forEach(lista => {
    if (lista.some(e => e.estado === 'usado')) reagendaronDeEsteEnvio++
    else if (lista.some(e => e.estado === 'activo' && e.expira_en > ahora)) esperando++
    else if (lista.some(e => e.estado === 'activo')) vencidos++
  })

  const idsPac = [...new Set(us.map(u => u.paciente_id).filter(Boolean))]
  const idsCitas = [...new Set(us.map(u => u.cita_resultante_id).filter(Boolean))]
  const [pacs, citas] = await Promise.all([
    idsPac.length ? supabase.from('pacientes').select('id, nombre, apellido, telefono').in('id', idsPac) : Promise.resolve({ data: [] as any[] }),
    idsCitas.length ? supabase.from('citas').select('id, estado').in('id', idsCitas) : Promise.resolve({ data: [] as any[] }),
  ])
  const pac: Record<string, any> = {}
  ;(pacs.data || []).forEach((p: any) => { pac[p.id] = p })
  const estadoCita: Record<string, string> = {}
  ;(citas.data || []).forEach((c: any) => { estadoCita[c.id] = c.estado })

  const lista: Reagendado[] = us
    .map(u => ({
      id: u.id,
      usado_en: u.usado_en,
      paciente_id: u.paciente_id,
      paciente: pac[u.paciente_id] ? `${pac[u.paciente_id].nombre || ''} ${pac[u.paciente_id].apellido || ''}`.trim() : 'Paciente',
      telefono: pac[u.paciente_id]?.telefono || null,
      profesional_id: u.profesional_id,
      inicio_original: u.inicio_original,
      inicio_nuevo: u.inicio_nuevo,
      estado_cita_nueva: u.cita_resultante_id ? estadoCita[u.cita_resultante_id] || null : null,
    }))
    .sort((a, b) => b.usado_en.localeCompare(a.usado_en))

  const est = (r: Reagendado) => (r.estado_cita_nueva || '').toLowerCase()
  return {
    pacientesConEnlace: porCita.size,
    reagendaron: us.length,
    reagendaronDeEsteEnvio,
    vencidos,
    esperando,
    asistieron: lista.filter(r => ATENDIDO.includes(est(r))).length,
    noAsistieron: lista.filter(r => NO_ASISTE.includes(est(r))).length,
    lista,
  }
}

// Nombre corto de cómo terminó la cita nueva, para mostrar.
// La cita que crea el enlace queda con estado 'reprogramada' hasta que se marca la asistencia.
export function textoEstadoCita(estado: string | null, inicio: string | null): { texto: string; clase: string } {
  const e = (estado || '').toLowerCase()
  if (ATENDIDO.includes(e)) return { texto: 'Asistió', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (NO_ASISTE.includes(e)) return { texto: 'No asistió', clase: 'bg-rose-50 text-rose-700 border-rose-200' }
  if (e.includes('cancel') || e.includes('anulad')) return { texto: 'Anulada', clase: 'bg-slate-100 text-slate-500 border-slate-200' }
  if (e.includes('cambio')) return { texto: 'Cambió de hora', clase: 'bg-amber-50 text-amber-700 border-amber-200' }
  if (!e) return { texto: '—', clase: 'bg-slate-50 text-slate-400 border-slate-200' }
  // inicio viene sin zona horaria (hora de Chile), igual que la hora del computador de la clínica
  const yaPaso = inicio ? new Date(inicio.replace(' ', 'T')) < new Date() : false
  return yaPaso
    ? { texto: 'Sin marcar', clase: 'bg-slate-50 text-slate-500 border-slate-200' }
    : { texto: 'Por venir', clase: 'bg-sky-50 text-sky-700 border-sky-200' }
}

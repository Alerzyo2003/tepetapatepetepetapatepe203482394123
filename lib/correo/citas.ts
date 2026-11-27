// Lógica de servidor compartida por el recordatorio automático (cron) y la confirmación al agendar.
import { supabaseAdmin } from '@/lib/admin'
import { emailValido, enviarCorreo } from './enviar'
import { plantillaConfirmacion, plantillaRecordatorio, type CitaCorreo } from './plantillas'

// Estados de cita que ya no necesitan aviso (incluye los nombres antiguos de Dentalink)
const ESTADOS_FUERA = ['cancelada', 'atendido', 'no_asiste', 'no asiste', 'anulado', 'cambio de fecha', 'en_espera', 'atendiendose']
const citaVigente = (c: any) =>
  !ESTADOS_FUERA.includes(String(c.estado || '').toLowerCase())
  // Solicitud web aún sin validar por recepción: no se avisa
  && !(c.estado_confirmacion === 'pendiente' && String(c.motivo || '').includes('Online'))

// Fecha de hoy en Chile (el servidor de Vercel corre en UTC)
export function fechaChile(desplazamientoDias = 0) {
  const d = new Date(Date.now() + desplazamientoDias * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

async function nombresDoctores(ids: string[]) {
  const m: Record<string, string> = {}
  if (!ids.length) return m
  const { data } = await supabaseAdmin.from('profesionales').select('user_id, nombre, apellido').in('user_id', ids)
  ;(data || []).forEach((p: any) => { m[p.user_id] = `Dr(a). ${p.nombre || ''} ${p.apellido || ''}`.replace(/\s+/g, ' ').trim() })
  return m
}

async function registrar(fila: Record<string, any>) {
  const { error } = await supabaseAdmin.from('correos_enviados').insert(fila)
  if (error) console.error('No se pudo registrar el correo', error.message)
}

type Grupo = { paciente: any; citas: any[] }
function agruparPorPaciente(citas: any[]): Grupo[] {
  const m = new Map<string, Grupo>()
  for (const c of citas) {
    if (!c.paciente_id || !c.pacientes) continue
    const g = m.get(c.paciente_id) || { paciente: c.pacientes, citas: [] }
    g.citas.push(c); m.set(c.paciente_id, g)
  }
  return Array.from(m.values())
}

const nombrePila = (p: any) => String(p?.nombre || '').trim().split(/\s+/)[0] || 'paciente'

// Recordatorio de las citas de un día (por defecto, mañana). No repite: cada cita recibe un solo recordatorio exitoso.
export async function enviarRecordatoriosDelDia(fechaISO = fechaChile(1)) {
  const { data, error } = await supabaseAdmin
    .from('citas')
    .select('id, inicio, estado, estado_confirmacion, motivo, paciente_id, profesional_id, pacientes(id, nombre, apellido, email, activo)')
    .gte('inicio', `${fechaISO}T00:00:00`).lte('inicio', `${fechaISO}T23:59:59`)
    .order('inicio')
  if (error) throw error
  const vigentes = (data || []).filter(citaVigente)
  const ids = vigentes.map((c: any) => c.id)
  const yaEnviadas = new Set<string>()
  if (ids.length) {
    const { data: env } = await supabaseAdmin.from('correos_enviados').select('cita_id').eq('tipo', 'recordatorio').eq('estado', 'enviado').in('cita_id', ids)
    ;(env || []).forEach((e: any) => yaEnviadas.add(e.cita_id))
  }
  const doctores = await nombresDoctores(Array.from(new Set(vigentes.map((c: any) => c.profesional_id).filter(Boolean))))
  const grupos = agruparPorPaciente(vigentes.filter((c: any) => !yaEnviadas.has(c.id)))

  const resumen = { fecha: fechaISO, citas: vigentes.length, enviados: 0, sinEmail: 0, errores: 0 }
  for (const g of grupos) {
    const email = String(g.paciente.email || '').trim()
    if (g.paciente.activo === false || !emailValido(email)) { resumen.sinEmail++; continue }
    const citasCorreo: CitaCorreo[] = g.citas.map((c: any) => ({ id: c.id, inicio: c.inicio, doctor: doctores[c.profesional_id] || 'nuestro especialista' }))
    const { asunto, html, texto } = plantillaRecordatorio(nombrePila(g.paciente), fechaISO, citasCorreo)
    try {
      await enviarCorreo({ para: email, asunto, html, texto })
      resumen.enviados++
      for (const c of g.citas) await registrar({ tipo: 'recordatorio', paciente_id: g.paciente.id, cita_id: c.id, para: email, asunto, estado: 'enviado' })
    } catch (e: any) {
      resumen.errores++
      await registrar({ tipo: 'recordatorio', paciente_id: g.paciente.id, cita_id: g.citas[0].id, para: email, asunto, estado: 'error', error: String(e?.message || e).slice(0, 500) })
    }
    // Pausa corta entre correos para no superar el límite por hora del hosting
    await new Promise(r => setTimeout(r, 400))
  }
  return resumen
}

// Confirmación al agendar: un correo por paciente con todas las horas recién creadas
export async function enviarConfirmacionCitas(citaIds: string[], enviadoPor?: string) {
  if (!citaIds.length) return { enviado: false, motivo: 'sin_citas' as const }
  const { data, error } = await supabaseAdmin
    .from('citas')
    .select('id, inicio, estado, estado_confirmacion, motivo, paciente_id, profesional_id, pacientes(id, nombre, apellido, email, activo)')
    .in('id', citaIds).order('inicio')
  if (error) throw error
  const vigentes = (data || []).filter(citaVigente)
  const g = agruparPorPaciente(vigentes)[0]
  if (!g) return { enviado: false, motivo: 'sin_citas' as const }
  const email = String(g.paciente.email || '').trim()
  if (!emailValido(email)) return { enviado: false, motivo: 'sin_email' as const }
  const doctores = await nombresDoctores(Array.from(new Set(g.citas.map((c: any) => c.profesional_id).filter(Boolean))))
  const { asunto, html, texto } = plantillaConfirmacion(nombrePila(g.paciente), g.citas.map((c: any) => ({ id: c.id, inicio: c.inicio, doctor: doctores[c.profesional_id] || 'nuestro especialista' })))
  try {
    await enviarCorreo({ para: email, asunto, html, texto })
    await registrar({ tipo: 'confirmacion', paciente_id: g.paciente.id, cita_id: g.citas[0].id, para: email, asunto, estado: 'enviado', enviado_por: enviadoPor || null })
    return { enviado: true, para: email }
  } catch (e: any) {
    await registrar({ tipo: 'confirmacion', paciente_id: g.paciente.id, cita_id: g.citas[0].id, para: email, asunto, estado: 'error', error: String(e?.message || e).slice(0, 500), enviado_por: enviadoPor || null })
    return { enviado: false, motivo: 'error' as const, error: String(e?.message || e) }
  }
}

export { registrar as registrarCorreo }

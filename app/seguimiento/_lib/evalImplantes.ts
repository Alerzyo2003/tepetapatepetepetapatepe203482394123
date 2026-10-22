// Evaluaciones de implantes: quién se evaluó y en qué quedó.
// Una evaluación es una cita cuyo motivo dice evaluación + implante, o una prestación de evaluación de implantes
// cargada (en un presupuesto o como atención directa). Las palabras se ajustan en config.ts → EVAL_IMPLANTES.
import { supabase } from '@/lib/supabase'
import { CONFIG, type IdLista } from './config'
import type { Oportunidad, Tono } from './reglas'
import { aFecha, fechaCorta, fechaEvolucion, fechaISO, fechaPlan, haceTexto, diasDesde, itemAnulado, itemIniciado, money, nombreItem, normalizar, primerNombre, sumarDias } from './util'

const E = CONFIG.EVAL_IMPLANTES
export const LISTA_EVAL = 'eval_implantes' as IdLista // así quedan anotados los contactos hechos desde esta página

export type EtapaEval = 'sin_presupuesto' | 'presupuestado' | 'no_vino' | 'cerrado' | 'agendada' | 'en_tratamiento'
export const ETAPAS_EVAL: { id: EtapaEval; texto: string; tono: Tono; prioridad: number; seguir: boolean }[] = [
  { id: 'sin_presupuesto', texto: 'Evaluado sin presupuesto', tono: 'rojo', prioridad: 90, seguir: true },
  { id: 'presupuestado', texto: 'Presupuesto sin cerrar', tono: 'ambar', prioridad: 80, seguir: true },
  { id: 'no_vino', texto: 'No vino a la evaluación', tono: 'ambar', prioridad: 70, seguir: true },
  { id: 'cerrado', texto: 'Aprobó o abonó', tono: 'verde', prioridad: 50, seguir: true },
  { id: 'agendada', texto: 'Evaluación agendada', tono: 'azul', prioridad: 30, seguir: false },
  { id: 'en_tratamiento', texto: 'Ya empezó el implante', tono: 'gris', prioridad: 10, seguir: false },
]
export const etapaEval = (id: EtapaEval) => ETAPAS_EVAL.find(e => e.id === id)!

export interface EventoEval {
  fecha: Date
  texto: string                                // motivo de la cita o nombre de la prestación
  origen: 'cita' | 'prestacion' | 'atencion'
  estado: 'vino' | 'no_vino' | 'anulo' | 'agendada'
  profesionalId: string | null                 // user_id del doctor
}

export interface FilaEval {
  pacienteId: string
  eventos: EventoEval[]   // del más reciente al más antiguo
  principal: EventoEval   // la última evaluación a la que vino (si no vino a ninguna, la última)
  etapa: EtapaEval
  presupuesto: number     // valor de las prestaciones de implante presupuestadas después de evaluarse
  abonado: number
  tratamientos: string[]  // nombres de esas prestaciones
}

export interface DatosEval {
  filas: FilaEval[]
  profesionales: any[]
  proximas: Map<string, any> // próxima cita vigente de cada paciente
  errores: string[]
  cargadoEn: number
}

// ── Utilidades ──
const fechaLocal = (d: Date) => `${fechaISO(d)} 00:00:00` // las citas se guardan en hora local sin zona
const tiene = (texto: any, palabras: string[]) => { const t = normalizar(texto); return palabras.some(p => t.includes(normalizar(p))) }
export const esEvaluacionImplante = (texto: any) => tiene(texto, E.palabrasImplante) && tiene(texto, E.palabrasEvaluacion)
const filtroOr = (columna: string, palabras: string[]) => palabras.map(p => `${columna}.ilike.*${normalizar(p).replace(/[^A-Z0-9]/g, '')}*`).join(',')
const lotes = <T,>(a: T[], n = 150) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out }

// Trae todas las filas (Supabase entrega 1000 por consulta)
async function traerTodo(armar: (conConteo: boolean) => any, pagina = 1000): Promise<any[]> {
  const primera = await armar(true).range(0, pagina - 1)
  if (primera.error) throw new Error(primera.error.message || 'Error de Supabase')
  const filas: any[] = [...(primera.data || [])]
  const total = primera.count ?? filas.length
  if (filas.length < pagina || total <= pagina) return filas
  const resto: Promise<any>[] = []
  for (let desde = pagina; desde < total; desde += pagina) resto.push(armar(false).range(desde, desde + pagina - 1))
  for (const r of await Promise.all(resto)) {
    if (r.error) throw new Error(r.error.message || 'Error de Supabase')
    filas.push(...(r.data || []))
  }
  return filas
}
const conteo = (c: boolean) => (c ? { count: 'exact' as const } : undefined)

function estadoCita(c: any, ahora: Date): EventoEval['estado'] {
  const estado = String(c.estado || '').toLowerCase()
  const f = aFecha(c.inicio)
  if (['cancelada', 'reprogramada'].includes(estado)) return 'anulo'
  if (estado === 'no_asiste') return 'no_vino'
  if (['atendido', 'atendiendose', 'en_espera'].includes(estado)) return 'vino'
  return f && f > ahora ? 'agendada' : 'no_vino' // ya pasó y nadie la marcó como atendida
}

// ── Carga ──
export async function cargarEvaluaciones(desde: Date | null, ahora: Date): Promise<DatosEval> {
  const errores: string[] = []
  const intentar = async <T,>(nombre: string, fn: () => Promise<T>, vacio: T): Promise<T> => {
    try { return await fn() } catch (e: any) { errores.push(`${nombre}: ${e?.message || e}`); return vacio }
  }
  const evalOr = filtroOr('nombre_prestacion', E.palabrasEvaluacion)

  const [profesionales, citas, itemsEval, atenciones] = await Promise.all([
    intentar('doctores', async () => {
      const { data, error } = await supabase.from('profesionales').select('id, user_id, nombre, apellido, activo')
      if (error) throw new Error(error.message)
      return data || []
    }, [] as any[]),
    // Citas con "implante" en el motivo (también las futuras: evaluaciones agendadas)
    intentar('citas', () => traerTodo(c => {
      let q = supabase.from('citas').select('id, paciente_id, inicio, estado, motivo, profesional_id', conteo(c)).ilike('motivo', '%implant%')
      if (desde) q = q.gte('inicio', fechaLocal(desde))
      return q.order('id')
    }), [] as any[]),
    // Prestaciones de evaluación de implantes cargadas en presupuestos
    intentar('prestaciones', () => traerTodo(c => supabase.from('presupuesto_items')
      .select('id, nombre_prestacion, estado, progreso, precio_pactado, abonado, profesional_id, presupuestos!inner(id, paciente_id, created_at, fecha_creacion)', conteo(c))
      .ilike('nombre_prestacion', '%implant%').or(evalOr).order('id')), [] as any[]),
    // Atenciones directas cuya prestación es una evaluación de implantes
    intentar('atenciones', async () => {
      const catalogo = await traerTodo(c => supabase.from('prestaciones').select('id, "Nombre Accion", "Nombre"', conteo(c)).order('id'))
      const ids = catalogo.filter(p => esEvaluacionImplante(`${p['Nombre Accion'] || ''} ${p['Nombre'] || ''}`)).map(p => p.id)
      if (!ids.length) return []
      const nombres = new Map(catalogo.map(p => [String(p.id), p['Nombre Accion'] || p['Nombre'] || 'Evaluación de implantes']))
      const filas = (await Promise.all(lotes(ids).map(l => traerTodo(c => {
        let q = supabase.from('atenciones_realizadas').select('id, fecha, paciente_id, profesional_id, prestacion_id', conteo(c)).in('prestacion_id', l)
        if (desde) q = q.gte('fecha', fechaLocal(desde))
        return q.order('id')
      })))).flat()
      return filas.map(a => ({ ...a, nombre: nombres.get(String(a.prestacion_id)) }))
    }, [] as any[]),
  ])

  // Eventos de evaluación por paciente
  const eventos = new Map<string, EventoEval[]>()
  const agregar = (pac: string | null | undefined, e: EventoEval) => {
    if (!pac) return
    const a = eventos.get(pac)
    if (a) a.push(e); else eventos.set(pac, [e])
  }
  for (const c of citas) {
    const fecha = aFecha(c.inicio)
    if (!fecha || !esEvaluacionImplante(c.motivo)) continue
    agregar(c.paciente_id, { fecha, texto: String(c.motivo || '').trim(), origen: 'cita', estado: estadoCita(c, ahora), profesionalId: c.profesional_id || null })
  }
  for (const it of itemsEval) {
    if (itemAnulado(it) || !esEvaluacionImplante(nombreItem(it))) continue
    const hecha = itemIniciado(it) || Number(it.abonado || 0) > 0 // solo las que se hicieron o se pagaron
    if (!hecha) continue
    const fecha = fechaEvolucion(it) || fechaPlan(it.presupuestos)
    if (!fecha || (desde && fecha < desde)) continue
    agregar(it.presupuestos?.paciente_id, { fecha, texto: nombreItem(it), origen: 'prestacion', estado: 'vino', profesionalId: it.profesional_id || null })
  }
  for (const a of atenciones) {
    const fecha = aFecha(a.fecha)
    if (!fecha) continue
    agregar(a.paciente_id, { fecha, texto: String(a.nombre || 'Evaluación de implantes'), origen: 'atencion', estado: 'vino', profesionalId: a.profesional_id || null })
  }

  const ids = [...eventos.keys()]
  const implOr = filtroOr('nombre_prestacion', CONFIG.IMPLANTES.palabras)
  const ahoraLocal = `${fechaISO(ahora)} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}:00`
  const [itemsImpl, futuras] = await Promise.all([
    // Prestaciones de implante (cirugía, corona sobre implante, etc.) de esos pacientes: el presupuesto y si ya empezó
    intentar('presupuestos', async () => (await Promise.all(lotes(ids).map(l => traerTodo(c => supabase.from('presupuesto_items')
      .select('id, nombre_prestacion, estado, progreso, precio_pactado, abonado, presupuestos!inner(id, paciente_id, aprobado, created_at, fecha_creacion)', conteo(c))
      .in('presupuestos.paciente_id', l).or(implOr).order('id'))))).flat(), [] as any[]),
    intentar('horas agendadas', async () => (await Promise.all(lotes(ids).map(l => traerTodo(c => supabase.from('citas')
      .select('id, paciente_id, inicio, estado, motivo, profesional_id', conteo(c))
      .in('paciente_id', l).gte('inicio', ahoraLocal).not('estado', 'in', `(${CONFIG.ESTADOS_CITA_INACTIVA.join(',')})`).order('id'))))).flat(), [] as any[]),
  ])

  const proximas = new Map<string, any>()
  for (const c of futuras) {
    const actual = proximas.get(c.paciente_id)
    if (!actual || String(c.inicio) < String(actual.inicio)) proximas.set(c.paciente_id, c)
  }
  const implPorPaciente = new Map<string, any[]>()
  for (const it of itemsImpl) {
    const pac = it.presupuestos?.paciente_id
    if (!pac || itemAnulado(it) || esEvaluacionImplante(nombreItem(it))) continue
    const a = implPorPaciente.get(pac)
    if (a) a.push(it); else implPorPaciente.set(pac, [it])
  }

  const filas: FilaEval[] = []
  for (const [pac, evs] of eventos) {
    evs.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
    const vino = evs.filter(e => e.estado === 'vino')
    const principal = vino[0] || evs[0]
    const primera = (vino.length ? vino[vino.length - 1] : principal).fecha
    const limite = sumarDias(primera, -E.diasPresupuestoAntes)
    const items = (implPorPaciente.get(pac) || []).filter(it => {
      const f = fechaPlan(it.presupuestos)
      return !f || f >= limite || (fechaEvolucion(it)?.getTime() || 0) >= limite.getTime()
    })
    const presupuesto = items.reduce((s, it) => s + Number(it.precio_pactado || 0), 0)
    const abonado = items.reduce((s, it) => s + Number(it.abonado || 0), 0)
    const etapa: EtapaEval =
      items.some(itemIniciado) ? 'en_tratamiento'
        : items.length && (abonado > 0 || items.some(it => it.presupuestos?.aprobado === true)) ? 'cerrado'
          : items.length ? 'presupuestado'
            : vino.length ? 'sin_presupuesto'
              : evs.some(e => e.estado === 'agendada') ? 'agendada'
                : 'no_vino'
    filas.push({ pacienteId: pac, eventos: evs, principal, etapa, presupuesto, abonado, tratamientos: [...new Set(items.map(nombreItem))] })
  }
  return { filas, profesionales, proximas, errores, cargadoEn: Date.now() }
}

// ── Fila para la lista (misma forma que las del Panel de Seguimiento) ──
const ORIGEN: Record<EventoEval['origen'], string> = { cita: 'cita', prestacion: 'prestación cargada', atencion: 'atención directa' }
const ESTADO: Record<EventoEval['estado'], string> = { vino: 'Evaluado', no_vino: 'No vino', anulo: 'Anuló', agendada: 'Agendada para el' }

export function aOportunidad(f: FilaEval, ahora: Date): Oportunidad {
  const et = etapaEval(f.etapa)
  const p = f.principal
  const dias = diasDesde(p.fecha, ahora)
  const cuando = p.estado === 'agendada' ? `${ESTADO.agendada} ${fechaCorta(p.fecha)}` : `${ESTADO[p.estado]} ${haceTexto(dias)} (${fechaCorta(p.fecha)})`
  const fechaTxt = p.fecha.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
  const hola = (pac: any) => (primerNombre(pac) ? `Hola ${primerNombre(pac)}` : 'Hola')
  const FIRMA = 'te saludamos de Clínica Dignidad'
  const mensajes: Record<EtapaEval, (pac: any) => string> = {
    sin_presupuesto: pac => `${hola(pac)}, ${FIRMA}. ¿Cómo has estado después de tu evaluación de implantes del ${fechaTxt}? Queremos ayudarte con el siguiente paso: te podemos explicar el presupuesto y las facilidades de pago. ¿Te acomoda que lo conversemos?`,
    presupuestado: pac => `${hola(pac)}, ${FIRMA}. ¿Pudiste revisar tu presupuesto de implantes? Tenemos facilidades de pago y podemos agendar tu cirugía cuando te acomode. ¿Tienes alguna duda que te podamos resolver?`,
    no_vino: pac => `${hola(pac)}, ${FIRMA}. Te esperábamos para tu evaluación de implantes del ${fechaTxt}. ¿Quieres que te agendemos una nueva hora? Así revisamos tu caso y te explicamos las alternativas.`,
    cerrado: pac => `${hola(pac)}, ${FIRMA}. Tu plan de implantes ya está listo. ¿Coordinamos la fecha para comenzar?`,
    agendada: pac => `${hola(pac)}, ${FIRMA}. Te recordamos tu evaluación de implantes del ${fechaTxt}. ¡Te esperamos!`,
    en_tratamiento: pac => `${hola(pac)}, ${FIRMA}. ¿Cómo has estado con tu tratamiento de implantes? Cualquier duda, aquí estamos.`,
  }
  const motivos: Record<EtapaEval, string> = {
    sin_presupuesto: 'PRESENTACION PRESUPUESTO IMPLANTES', presupuestado: 'PRESENTACION PRESUPUESTO IMPLANTES',
    no_vino: 'EVALUACION IMPLANTES', cerrado: 'CIRUGIA IMPLANTE', agendada: '', en_tratamiento: 'CONTROL IMPLANTE',
  }
  const recencia = dias === null ? 0 : Math.max(0, 9 - Math.floor(Math.abs(dias) / 30)) // más reciente, más arriba dentro de la etapa
  return {
    clave: `${LISTA_EVAL}:${f.pacienteId}`,
    lista: LISTA_EVAL,
    pacienteId: f.pacienteId,
    detalle: `${p.texto || 'Evaluación de implantes'} (${ORIGEN[p.origen]})${f.eventos.length > 1 ? ` · ${f.eventos.length} registros` : ''}${f.tratamientos.length ? ` · ${f.tratamientos.slice(0, 2).join(', ')}${f.tratamientos.length > 2 ? '…' : ''}` : ''}`,
    etapa: et.texto,
    tono: et.tono,
    prioridad: et.prioridad + recencia,
    fechaTexto: cuando,
    monto: f.presupuesto,
    montoTexto: f.presupuesto ? (f.abonado > 0 ? `abonado ${money(f.abonado)}` : 'presupuesto de implantes') : '',
    doctores: [...new Set([p.profesionalId, ...f.eventos.map(e => e.profesionalId)].filter((x): x is string => !!x))],
    motivo: motivos[f.etapa],
    mensaje: mensajes[f.etapa],
  }
}

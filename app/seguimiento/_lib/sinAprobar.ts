// Presupuestos sin aprobar: lo que el paciente no ha aprobado ni abonado y que no se ha empezado.
// Usa la vista v_presupuestos_sin_aprobar si existe (rápida y con la fecha original de los presupuestos de Dentalink);
// si no existe, lo calcula en el navegador. Las reglas se ajustan en config.ts → SIN_APROBAR.
import { supabase } from '@/lib/supabase'
import { CONFIG, type IdLista } from './config'
import type { Oportunidad, Tono } from './reglas'
import { mensajePresupuestoAntiguo, mensajePresupuestoReciente } from '@/lib/mensajes'
import { aFecha, diasDesde, fechaCorta, fechaISO, haceTexto, itemAnulado, itemIniciado, money, nombreItem, normalizar, primerNombre, sumarDias, sumarMeses } from './util'

const S = CONFIG.SIN_APROBAR
// Los contactos se anotan como "por_cerrar": es la misma lista del Panel de Seguimiento
export const LISTA_SIN_APROBAR = 'por_cerrar' as IdLista

export type EtapaSA = 'nuevo' | 'seguimiento' | 'recuperar' | 'antiguo' | 'mas_anio' | 'anterior'
export const ETAPAS_SA: { id: EtapaSA; texto: string; rango: string; tono: Tono; prioridad: number; seguir: boolean }[] = [
  { id: 'nuevo', texto: 'Recién presupuestado', rango: 'hasta 7 días', tono: 'verde', prioridad: 90, seguir: true },
  { id: 'seguimiento', texto: 'En seguimiento', rango: '8 a 30 días', tono: 'ambar', prioridad: 85, seguir: true },
  { id: 'recuperar', texto: 'Por recuperar', rango: '1 a 3 meses', tono: 'rojo', prioridad: 75, seguir: true },
  { id: 'antiguo', texto: 'Antiguo', rango: '3 a 12 meses', tono: 'gris', prioridad: 50, seguir: false },
  { id: 'mas_anio', texto: 'Más de 1 año', rango: 'más de 12 meses', tono: 'gris', prioridad: 30, seguir: false },
  { id: 'anterior', texto: 'Sistema anterior', rango: 'sin fecha original', tono: 'azul', prioridad: 40, seguir: false },
]
export const etapaSA = (id: EtapaSA) => ETAPAS_SA.find(e => e.id === id)!

export interface PresupuestoSA {
  id: string
  pacienteId: string
  nombre: string
  total: number
  fecha: Date | null
  fechaOriginal: boolean  // true: fecha traída de la carga de Dentalink
  sinFechaReal: boolean   // traído de Dentalink sin su fecha original (tiene la del día de la carga)
  especialistaId: string | null
  prestaciones: string[]
  profesionales: string[] // user_id de los doctores de las prestaciones
}

export interface FilaSA {
  pacienteId: string
  presupuestos: PresupuestoSA[] // del más reciente al más antiguo
  principal: PresupuestoSA      // el más reciente
  etapa: EtapaSA
  dias: number | null           // días desde el presupuesto principal
  alternativa: Date | null      // después aprobó o abonó otro presupuesto (probablemente eligió esa alternativa)
  ultimaVisita: Date | null
}

export interface DatosSA {
  filas: FilaSA[]
  profesionales: any[]
  proximas: Map<string, any>
  errores: string[]
  modoRapido: boolean // true: se usó la vista de Supabase
  cargadoEn: number
}

// ── Utilidades ──
const conteo = (c: boolean) => (c ? { count: 'exact' as const } : undefined)
const lotes = <T,>(a: T[], n = 150) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out }
const NO_TRATAMIENTO = S.noEsTratamiento.map(normalizar)
const noEsTratamiento = (nombre: string) => {
  const t = normalizar(nombre)
  const palabras = t.split(/[^A-Z0-9]+/)
  return NO_TRATAMIENTO.some(x => (x.length <= 3 ? palabras.includes(x) : t.includes(x)))
}
const esDiaDeCarga = (d: Date | null) => !!d && [fechaISO(d), d.toISOString().slice(0, 10)].some(x => S.fechasCargaSistemaAnterior.includes(x))
const fechaMenor = (...fs: any[]) => {
  const ds = fs.map(aFecha).filter((d): d is Date => !!d)
  return ds.length ? new Date(Math.min(...ds.map(d => d.getTime()))) : null
}

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

// Con la vista: una consulta liviana
async function desdeVista(desde: Date | null, montoMin: number) {
  const filas = await traerTodo(c => {
    let q = supabase.from('v_presupuestos_sin_aprobar')
      .select('id, paciente_id, nombre_tratamiento, especialista_id, total, fecha_original, fecha, prestaciones, profesionales', conteo(c))
      .gte('total', Math.max(1, montoMin))
    if (desde) q = q.gte('fecha', desde.toISOString())
    return q.order('id')
  })
  return filas.map(r => {
    const fecha = aFecha(r.fecha)
    return {
      id: r.id, pacienteId: r.paciente_id, nombre: String(r.nombre_tratamiento || '').trim(), total: Number(r.total || 0),
      fecha, fechaOriginal: !!r.fecha_original, sinFechaReal: !r.fecha_original && esDiaDeCarga(fecha),
      especialistaId: r.especialista_id || null,
      prestaciones: (r.prestaciones || []).filter(Boolean), profesionales: (r.profesionales || []).filter(Boolean),
    } as PresupuestoSA
  })
}

// Sin la vista: presupuestos sin aprobar ni abonar y sus prestaciones (más datos, mismo resultado salvo la fecha original)
async function sinVista(desde: Date | null, montoMin: number) {
  const planes = await traerTodo(c => {
    let q = supabase.from('presupuestos')
      .select('id, paciente_id, nombre_tratamiento, especialista_id, total, estado, created_at, fecha_creacion', conteo(c))
      .not('aprobado', 'is', true).or('total_abonado.is.null,total_abonado.eq.0')
      .not('paciente_id', 'is', null).gte('total', Math.max(1, montoMin))
    if (desde) q = q.gte('created_at', desde.toISOString()) // la fecha del presupuesto nunca es posterior a created_at
    return q.order('id')
  })
  const vigentes = planes.filter(p => !/^finaliz|anul/.test(String(p.estado || '').toLowerCase()))
  const items = (await Promise.all(lotes(vigentes.map(p => p.id)).map(l => traerTodo(c => supabase.from('presupuesto_items')
    .select('presupuesto_id, nombre_prestacion, estado, progreso, abonado, precio_pactado, profesional_id', conteo(c))
    .in('presupuesto_id', l).order('id'))))).flat()
  const porPlan = new Map<string, any[]>()
  for (const it of items) {
    if (itemAnulado(it)) continue
    const a = porPlan.get(it.presupuesto_id)
    if (a) a.push(it); else porPlan.set(it.presupuesto_id, [it])
  }
  const out: PresupuestoSA[] = []
  for (const p of vigentes) {
    const its = porPlan.get(p.id) || []
    if (!its.length || its.some(it => itemIniciado(it) || Number(it.abonado || 0) > 0)) continue
    const fecha = fechaMenor(p.fecha_creacion, p.created_at)
    out.push({
      id: p.id, pacienteId: p.paciente_id, nombre: String(p.nombre_tratamiento || '').trim(), total: Number(p.total || 0),
      fecha, fechaOriginal: false, sinFechaReal: esDiaDeCarga(fecha), especialistaId: p.especialista_id || null,
      prestaciones: [...its].sort((a, b) => Number(b.precio_pactado || 0) - Number(a.precio_pactado || 0)).slice(0, 8).map(nombreItem).filter(Boolean),
      profesionales: [...new Set(its.map(it => it.profesional_id).filter(Boolean))] as string[],
    })
  }
  return out
}

function etapaPorDias(p: PresupuestoSA, dias: number | null): EtapaSA {
  if (p.sinFechaReal || dias === null) return 'anterior'
  return dias <= 7 ? 'nuevo' : dias <= 30 ? 'seguimiento' : dias <= 90 ? 'recuperar' : dias <= 365 ? 'antiguo' : 'mas_anio'
}

// ── Carga ──
export async function cargarSinAprobar(desde: Date | null, montoMin: number, ahora: Date): Promise<DatosSA> {
  const errores: string[] = []
  const intentar = async <T,>(nombre: string, fn: () => Promise<T>, vacio: T): Promise<T> => {
    try { return await fn() } catch (e: any) { errores.push(`${nombre}: ${e?.message || e}`); return vacio }
  }
  let modoRapido = true
  const [profesionales, crudos] = await Promise.all([
    intentar('doctores', async () => {
      const { data, error } = await supabase.from('profesionales').select('id, user_id, nombre, apellido, activo')
      if (error) throw new Error(error.message)
      return data || []
    }, [] as any[]),
    (async () => {
      try { return await desdeVista(desde, montoMin) } catch { modoRapido = false }
      return intentar('presupuestos', () => sinVista(desde, montoMin), [] as PresupuestoSA[])
    })(),
  ])

  // Solo los del período (sin la vista se filtra aquí con la fecha real) y que no sean solo exámenes o evaluaciones
  const presupuestos = crudos.filter(p =>
    (!desde || !p.fecha || p.fecha >= desde) && !(p.prestaciones.length && p.prestaciones.every(noEsTratamiento)))
  const porPaciente = new Map<string, PresupuestoSA[]>()
  for (const p of presupuestos) {
    const a = porPaciente.get(p.pacienteId)
    if (a) a.push(p); else porPaciente.set(p.pacienteId, [p])
  }
  const ids = [...porPaciente.keys()]
  const dos = (n: number) => String(n).padStart(2, '0')
  const ahoraLocal = `${fechaISO(ahora)} ${dos(ahora.getHours())}:${dos(ahora.getMinutes())}:00`
  const hace2Anios = `${fechaISO(sumarMeses(ahora, -24))} 00:00:00`

  const [aprobados, futuras, visitas] = await Promise.all([
    // Presupuestos aprobados o abonados de esos pacientes (para detectar que eligieron otra alternativa)
    intentar('aprobados', async () => (await Promise.all(lotes(ids).map(l => traerTodo(c => supabase.from('presupuestos')
      .select('paciente_id, created_at, fecha_creacion', conteo(c))
      .in('paciente_id', l).or('aprobado.eq.true,total_abonado.gt.0').order('id'))))).flat(), [] as any[]),
    intentar('horas agendadas', async () => (await Promise.all(lotes(ids).map(l => traerTodo(c => supabase.from('citas')
      .select('id, paciente_id, inicio, estado, motivo, profesional_id', conteo(c))
      .in('paciente_id', l).gte('inicio', ahoraLocal).not('estado', 'in', `(${CONFIG.ESTADOS_CITA_INACTIVA.join(',')})`).order('id'))))).flat(), [] as any[]),
    intentar('visitas', async () => (await Promise.all(lotes(ids).map(l => traerTodo(c => supabase.from('citas')
      .select('paciente_id, inicio', conteo(c))
      .in('paciente_id', l).in('estado', ['atendido', 'atendiendose', 'en_espera']).gte('inicio', hace2Anios).lte('inicio', ahoraLocal).order('id'))))).flat(), [] as any[]),
  ])

  const ultimoAprobado = new Map<string, Date>()
  for (const a of aprobados) {
    const f = fechaMenor(a.fecha_creacion, a.created_at)
    if (!f || esDiaDeCarga(f)) continue // con la fecha de la carga no se sabe si fue antes o después
    const actual = ultimoAprobado.get(a.paciente_id)
    if (!actual || f > actual) ultimoAprobado.set(a.paciente_id, f)
  }
  const proximas = new Map<string, any>()
  for (const c of futuras) {
    const actual = proximas.get(c.paciente_id)
    if (!actual || String(c.inicio) < String(actual.inicio)) proximas.set(c.paciente_id, c)
  }
  const ultimaVisita = new Map<string, Date>()
  for (const v of visitas) {
    const f = aFecha(v.inicio)
    const actual = ultimaVisita.get(v.paciente_id)
    if (f && (!actual || f > actual)) ultimaVisita.set(v.paciente_id, f)
  }

  const filas: FilaSA[] = []
  for (const [pac, ps] of porPaciente) {
    ps.sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0) || b.total - a.total)
    const principal = ps[0]
    const dias = principal.fecha ? diasDesde(principal.fecha, ahora) : null
    const aprobado = ultimoAprobado.get(pac) || null
    const alternativa = aprobado && principal.fecha && aprobado.getTime() >= sumarDias(principal.fecha, -S.diasAlternativa).getTime() ? aprobado : null
    filas.push({ pacienteId: pac, presupuestos: ps, principal, etapa: etapaPorDias(principal, dias), dias, alternativa, ultimaVisita: ultimaVisita.get(pac) || null })
  }
  return { filas, profesionales, proximas, errores, modoRapido, cargadoEn: Date.now() }
}

// ── Fila para la lista (misma forma que las del Panel de Seguimiento) ──
export const nombrePresupuesto = (p: PresupuestoSA) => p.nombre || p.prestaciones[0] || 'Presupuesto'

export function aOportunidad(f: FilaSA, ahora: Date, userDeProfesional: Map<string, string>): Oportunidad {
  const et = etapaSA(f.etapa)
  const p = f.principal
  const trat = nombrePresupuesto(p)
  const tratTexto = trat.toLowerCase()
  const otros = f.presupuestos.length - 1
  const prest = p.prestaciones.filter(x => normalizar(x) !== normalizar(trat)).slice(0, 3)
  const cuando = p.sinFechaReal
    ? `Traído del sistema anterior${p.fecha ? ` (cargado el ${fechaCorta(p.fecha)})` : ''}`
    : p.fecha ? `Presupuestado ${haceTexto(f.dias)} (${fechaCorta(p.fecha)})` : 'Sin fecha'
  const visita = f.ultimaVisita ? `vino ${haceTexto(diasDesde(f.ultimaVisita, ahora))}` : 'sin visitas en 2 años'
  const reciente = f.etapa === 'nuevo' || f.etapa === 'seguimiento'
  const especialista = p.especialistaId ? userDeProfesional.get(p.especialistaId) : undefined
  const recencia = f.dias === null ? 0 : Math.max(0, 9 - Math.floor(f.dias / 15))
  return {
    clave: `sin_aprobar:${f.pacienteId}`,
    lista: LISTA_SIN_APROBAR,
    pacienteId: f.pacienteId,
    detalle: `${trat}${prest.length ? `: ${prest.join(', ')}${p.prestaciones.length > prest.length + 1 ? '…' : ''}` : ''}${otros > 0 ? ` · y ${otros} presupuesto${otros === 1 ? '' : 's'} más sin aprobar` : ''}`,
    etapa: f.alternativa ? `${et.texto} · aprobó otro después` : et.texto,
    tono: f.alternativa ? 'gris' : et.tono,
    prioridad: (f.alternativa ? 0 : et.prioridad) + recencia,
    fechaTexto: `${cuando} · ${visita}`,
    monto: p.total,
    montoTexto: otros > 0 ? `+${otros} presupuesto${otros === 1 ? '' : 's'} (${money(f.presupuestos.slice(1).reduce((s, x) => s + x.total, 0))})` : 'sin aprobar',
    doctores: [...new Set([especialista, ...p.profesionales].filter((x): x is string => !!x))],
    motivo: 'PRESENTACION PRESUPUESTO',
    mensaje: reciente
      ? pac => mensajePresupuestoReciente(primerNombre(pac), tratTexto)
      : pac => mensajePresupuestoAntiguo(primerNombre(pac), tratTexto),
  }
}

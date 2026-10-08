// Consultas a Supabase del Panel de Desempeño
import { supabase } from '@/lib/supabase'
import { CONFIG, fechaISO, normalizar, type Rango } from './util'

type Respuesta = PromiseLike<{ data: any[] | null; error: any }>

// Trae todas las filas paginando de a 1000 (Supabase corta en 1000 por defecto)
export async function fetchAll(query: (from: number, to: number) => Respuesta, pagina = 1000): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += pagina) {
    const { data, error } = await query(from, from + pagina - 1)
    if (error) throw new Error(error.message || error.details || 'Error de Supabase')
    out.push(...(data || []))
    if (!data || data.length < pagina) break
  }
  return out
}

// Trae filas por lista de ids, en lotes para no exceder el largo de la URL
export async function fetchPorIds(tabla: string, select: string, ids: any[], columna = 'id'): Promise<any[]> {
  const unicos = [...new Set(ids.filter(Boolean))]
  const lotes: any[][] = []
  for (let i = 0; i < unicos.length; i += 200) lotes.push(unicos.slice(i, i + 200))
  const res = await Promise.all(lotes.map(l => supabase.from(tabla).select(select).in(columna, l)))
  const out: any[] = []
  for (const r of res) {
    if (r.error) throw new Error(r.error.message)
    out.push(...((r.data as any[]) || []))
  }
  return out
}

const PAGO_VIGENTE = 'estado.is.null,estado.neq.Anulado' // .neq solo excluye también los NULL

export interface DatosPeriodo {
  rango: Rango
  pagos: any[]
  items: Record<string, any>
  categoriaPrestacion: Record<string, string>
  atenciones: any[]
  citas: any[]
  egresos: any[]
  presupuestos: any[]
  liquidaciones: any[]
  cajas: any[]
  bloqueos: any[]
  pacientesNuevos: number
}

// Todo lo que ocurrió dentro de un mes
export async function cargarPeriodo(r: Rango): Promise<DatosPeriodo> {
  const [pagos, atenciones, citas, egresos, presupuestos, liquidaciones, cajas, bloqueos, nuevos] = await Promise.all([
    fetchAll((a, b) => supabase.from('pagos')
      .select('id, monto, metodo_pago, fecha_pago, profesional_id, paciente_id, item_id, caja_id, presupuesto_id')
      .gte('fecha_pago', r.desdeTz).lt('fecha_pago', r.hastaTz).or(PAGO_VIGENTE).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('atenciones_realizadas')
      .select('id, monto_cobrado, fecha, paciente_id, profesional_id, prestacion_id, prestaciones:prestacion_id("Nombre Accion", "Nombre", "Nombre Categoria")')
      .gte('fecha', r.desdeLocal).lt('fecha', r.hastaLocal).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('citas')
      .select('id, inicio, fin, estado, estado_confirmacion, motivo, hora_llegada, hora_inicio_atencion, profesional_id, paciente_id')
      .gte('inicio', r.desdeLocal).lt('inicio', r.hastaLocal).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('egresos')
      .select('id, categoria, monto, fecha')
      .gte('fecha', r.desdeTz).lt('fecha', r.hastaTz).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('presupuestos')
      .select('id, paciente_id, total, total_abonado, aprobado, created_at, nombre_tratamiento, especialista_id')
      .gte('created_at', r.desdeTz).lt('created_at', r.hastaTz).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('liquidaciones')
      .select('id, profesional_id, monto_total, fecha_pago')
      .gte('fecha_pago', r.desdeTz).lt('fecha_pago', r.hastaTz).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('sesiones_caja')
      .select('id, fecha_apertura, estado, monto_apertura, monto_cierre, nombre_responsable')
      .gte('fecha_apertura', r.desdeTz).lt('fecha_apertura', r.hastaTz).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('bloqueos_agenda')
      .select('id, profesional_id, fecha, hora_inicio, hora_fin')
      .gte('fecha', r.desdeFecha).lt('fecha', r.hastaFecha).order('id').range(a, b)),
    supabase.from('pacientes').select('id', { count: 'exact', head: true })
      .gte('created_at', r.desdeTz).lt('created_at', r.hastaTz),
  ])
  if (nuevos.error) throw new Error(nuevos.error.message)

  const itemsLista = await fetchPorIds('presupuesto_items',
    'id, profesional_id, prestacion_id, nombre_prestacion, precio_pactado, costo_laboratorio, lab_pagado_por_dr, estado, tipo_reparto, porcentaje_forzado',
    pagos.map(p => p.item_id))
  const items = Object.fromEntries(itemsLista.map(i => [i.id, i]))

  const prestaciones = await fetchPorIds('prestaciones', 'id, "Nombre Categoria"', itemsLista.map(i => i.prestacion_id))
  const categoriaPrestacion = Object.fromEntries(prestaciones.map(p => [p.id, p['Nombre Categoria'] || 'Sin categoría']))

  return {
    rango: r, pagos, items, categoriaPrestacion, atenciones, citas, egresos, presupuestos,
    liquidaciones, cajas, bloqueos, pacientesNuevos: nuevos.count || 0,
  }
}

export interface FilaPorCobrar {
  id: string // presupuesto_id
  paciente_id: string
  nombre_tratamiento: string | null
  especialista_id: string | null
  realizado: number // valor de lo realizado
  pagado: number // abonado sobre lo realizado
  saldo: number
  items: { profesional_id: string | null; saldo: number }[]
}

// Estados de prestación que cuentan como realizadas (mismo criterio que la ficha de tratamiento)
const ESTADOS_REALIZADO = ['realizado', 'atendido', 'terminado', 'completado', 'finalizado']

export interface DatosFijos {
  profesionales: any[]
  disponibilidad: any[]
  porCobrar: FilaPorCobrar[] // prestaciones ya realizadas que no están pagadas completas, agrupadas por presupuesto
  porCerrar: any[]   // presupuestos recientes sin aprobar ni abonar
  recontactar: { paciente_id: string; ultima: string; profesional_id: string | null }[]
}

// Datos que no dependen del mes elegido (se cargan una vez)
export async function cargarFijos(ahora: Date): Promise<DatosFijos> {
  const haceDias = new Date(ahora); haceDias.setDate(haceDias.getDate() - CONFIG.DIAS_PRESUPUESTO_POR_CERRAR)
  const inactivoDesde = new Date(ahora); inactivoDesde.setMonth(inactivoDesde.getMonth() - CONFIG.MESES_INACTIVO_HASTA)
  const inactivoHasta = new Date(ahora); inactivoHasta.setMonth(inactivoHasta.getMonth() - CONFIG.MESES_INACTIVO_DESDE)

  const [profRes, disponibilidad, porCobrar, sinAprobar, atendidosAntes, citasRecientes] = await Promise.all([
    // Todos los profesionales (también inactivos, para no perder lo que produjeron)
    supabase.from('profesionales').select('id, user_id, nombre, apellido, activo, porcentaje_comision, especialidades(nombre)'),
    fetchAll((a, b) => supabase.from('disponibilidad_profesional')
      .select('profesional_id, dia_semana, hora_inicio, hora_fin, fecha_especifica').order('id').range(a, b)),
    // Deuda real: solo prestaciones realizadas o con avance (no lo planificado sin hacer)
    cargarPorCobrar(),
    // Por cerrar: solo presupuestos sobre el monto mínimo, los de mayor valor primero (sin traer los 3.000+ chicos)
    supabase.from('presupuestos')
      .select('id, paciente_id, total, total_abonado, nombre_tratamiento, created_at, especialista_id')
      .eq('aprobado', false).gte('total', CONFIG.MONTO_MIN_POR_CERRAR).gte('created_at', haceDias.toISOString())
      .or('total_abonado.is.null,total_abonado.eq.0')
      .order('total', { ascending: false }).limit(CONFIG.MAX_FILAS_LISTA * 2),
    fetchAll((a, b) => supabase.from('citas')
      .select('paciente_id, inicio, profesional_id').eq('estado', 'atendido')
      .gte('inicio', `${fechaISO(inactivoDesde)} 00:00:00`).lt('inicio', `${fechaISO(inactivoHasta)} 00:00:00`)
      .order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('citas')
      .select('paciente_id').neq('estado', 'cancelada')
      .gte('inicio', `${fechaISO(inactivoHasta)} 00:00:00`).order('id').range(a, b)),
  ])
  if (profRes.error) throw new Error(profRes.error.message)
  if (sinAprobar.error) throw new Error(sinAprobar.error.message)

  const excluir = CONFIG.EXCLUIR_POR_CERRAR.map(normalizar)
  const porCerrar = ((sinAprobar.data as any[]) || [])
    .filter(p => {
      const palabras = normalizar(p.nombre_tratamiento).split(/[^a-z0-9]+/)
      const texto = normalizar(p.nombre_tratamiento)
      return !excluir.some(x => (x.length <= 3 ? palabras.includes(x) : texto.includes(x)))
    })
    .slice(0, CONFIG.MAX_FILAS_LISTA)

  // Pacientes atendidos hace 6–18 meses que no han vuelto ni tienen cita futura
  const conActividad = new Set(citasRecientes.map(c => c.paciente_id))
  const ultima: Record<string, { paciente_id: string; ultima: string; profesional_id: string | null }> = {}
  for (const c of atendidosAntes) {
    if (!c.paciente_id || conActividad.has(c.paciente_id)) continue
    if (!ultima[c.paciente_id] || c.inicio > ultima[c.paciente_id].ultima) {
      ultima[c.paciente_id] = { paciente_id: c.paciente_id, ultima: c.inicio, profesional_id: c.profesional_id }
    }
  }
  const recontactar = Object.values(ultima).sort((a, b) => b.ultima.localeCompare(a.ultima))

  return { profesionales: profRes.data || [], disponibilidad, porCobrar, porCerrar, recontactar }
}

// Recaudación de los últimos 13 meses hasta el mes elegido (histórico y comparación anual)
export async function cargarHistorial(r: Rango): Promise<any[]> {
  const desde = new Date(r.anio, r.mes - 13, 1).toISOString()
  return fetchAll((a, b) => supabase.from('pagos')
    .select('id, monto, fecha_pago, metodo_pago, profesional_id')
    .gte('fecha_pago', desde).lt('fecha_pago', r.hastaTz).or(PAGO_VIGENTE).order('id').range(a, b))
}

// completo: nombre y teléfono (listas de contacto). nombre: para rankings. liviano: solo fecha de ficha (estadísticas)
const CAMPOS_PACIENTE = {
  completo: 'id, nombre, apellido, telefono, created_at, activo',
  nombre: 'id, nombre, apellido, created_at',
  liviano: 'id, created_at',
}
export async function cargarPacientes(ids: string[], nivel: keyof typeof CAMPOS_PACIENTE = 'completo'): Promise<any[]> {
  return fetchPorIds('pacientes', CAMPOS_PACIENTE[nivel], ids)
}

// ── Caché de datos generales en la sesión del navegador (evita volver a descargarlos al entrar de nuevo) ──
const CLAVE_CACHE = 'panel-desempeno-fijos-v2'
export function leerFijosCache(): DatosFijos | null {
  try {
    const raw = sessionStorage.getItem(CLAVE_CACHE)
    if (!raw) return null
    const { t, datos } = JSON.parse(raw)
    return Date.now() - t < CONFIG.MINUTOS_CACHE * 60000 ? datos : null
  } catch { return null }
}
export function guardarFijosCache(datos: DatosFijos) {
  try { sessionStorage.setItem(CLAVE_CACHE, JSON.stringify({ t: Date.now(), datos })) } catch { /* sin espacio: se ignora */ }
}

// Usa la vista v_deuda_realizada si existe (calcula en Supabase y transfiere solo los resultados).
// Si no se ha creado, calcula en el navegador a partir de las prestaciones realizadas.
async function cargarPorCobrar(): Promise<FilaPorCobrar[]> {
  try {
    const filas = await fetchAll((a, b) => supabase.from('v_deuda_realizada')
      .select('id, paciente_id, nombre_tratamiento, especialista_id, realizado, pagado, saldo, items')
      .order('id').range(a, b))
    return filas.map(f => ({
      ...f, realizado: Number(f.realizado || 0), pagado: Number(f.pagado || 0), saldo: Number(f.saldo || 0),
      items: (f.items || []).map((i: any) => ({ profesional_id: i.profesional_id || null, saldo: Number(i.saldo || 0) })),
    }))
  } catch {
    const items = await fetchAll((a, b) => supabase.from('presupuesto_items')
      .select('presupuesto_id, precio_pactado, abonado, estado, profesional_id')
      .or(['progreso.gt.0', ...ESTADOS_REALIZADO.map(e => `estado.ilike.${e}`)].join(','))
      .order('id').range(a, b))
    return armarPorCobrar(items)
  }
}

// Agrupa por presupuesto las prestaciones realizadas con saldo (precio pactado − abonado)
async function armarPorCobrar(items: any[]): Promise<FilaPorCobrar[]> {
  const grupos: Record<string, FilaPorCobrar> = {}
  for (const it of items) {
    const estado = String(it.estado || '').toLowerCase().trim()
    if (!it.presupuesto_id || estado.includes('cancel') || estado.includes('anul')) continue
    const pactado = Number(it.precio_pactado || 0)
    const abonado = Number(it.abonado || 0)
    const saldo = Math.max(0, pactado - abonado)
    const g = (grupos[it.presupuesto_id] ||= {
      id: it.presupuesto_id, paciente_id: '', nombre_tratamiento: null, especialista_id: null, realizado: 0, pagado: 0, saldo: 0, items: [],
    })
    g.realizado += pactado
    g.pagado += Math.min(abonado, pactado)
    g.saldo += saldo
    if (saldo > 0) g.items.push({ profesional_id: it.profesional_id || null, saldo })
  }
  const conSaldo = Object.values(grupos).filter(g => g.saldo >= 1000)
  const presupuestos = await fetchPorIds('presupuestos', 'id, paciente_id, nombre_tratamiento, especialista_id, estado', conSaldo.map(g => g.id))
  const porId = Object.fromEntries(presupuestos.map(p => [p.id, p]))
  return conSaldo
    .filter(g => porId[g.id]?.paciente_id && !String(porId[g.id].estado || '').toLowerCase().includes('anul'))
    .map(g => ({ ...g, paciente_id: porId[g.id].paciente_id, nombre_tratamiento: porId[g.id].nombre_tratamiento, especialista_id: porId[g.id].especialista_id }))
}

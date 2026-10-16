// Consultas a Supabase del Panel de Seguimiento.
// Si existen las funciones de seguimiento_rapido.sql, las búsquedas pesadas se hacen dentro de Supabase y se
// descarga solo el resultado. Si no existen, se usa el método anterior (funciona igual, pero descarga más).
import { supabase } from '@/lib/supabase'
import { fetchPorIds } from '@/app/reportes/desempeno/_lib/consultas'
import { CONFIG } from './config'
import { fechaISO, inicioDelDia, normalizar, sumarDias, sumarMeses } from './util'

export interface DatosBase {
  cargadoEn: number
  modoRapido: boolean       // true: se usaron las funciones de Supabase (carga liviana)
  profesionales: any[]
  usuarios: Record<string, string> // perfiles.id → nombre (quién registró un contacto)
  disponibilidad: any[]
  citasPasadas: any[]       // citas pasadas que usan las listas (faltas, anulaciones, evaluaciones, atendidos recientes)
  actividad: any[]          // por paciente: última atención, su doctor y última cita no anulada
  implantes: any[]
  endodoncias: any[]
  extracciones: any[]
  ortodoncia: any[]
  higiene: any[]            // última limpieza o periodoncia de cada paciente (si ya le toca)
  periodontales: any[]      // última periodoncia de cada paciente (para saber quién es paciente periodontal)
  rehabilitacion: any[]     // coronas, prótesis, restauraciones… de los pacientes con implante, endodoncia o extracción
  detenidos: any[]          // planes aprobados o con abono sin finalizar, con sus prestaciones
  porCerrar: any[]
  porCobrar: FilaPorCobrar[]
  saldoAFavor: any[]
  presupuestosEvaluados: any[] // presupuestos recientes de los pacientes que vinieron a evaluación
  cumpleanos: any[] | null  // fichas de quienes están de cumpleaños (null: se calcula en el navegador)
  conversion: { creados: number; cerrados: number } | null
  errores: Record<string, string>
}

export interface DatosVivos {
  citasFuturas: any[]       // desde hoy en adelante (todas, también anuladas)
  bloqueos: any[]
  contactos: any[] | null   // null: la tabla seguimiento_contactos aún no se ha creado
}

const ESTADOS_HECHO = ['progreso.gt.0', ...CONFIG.ESTADOS_ITEM_REALIZADO.map(e => `estado.ilike.${e}`)].join(',')
const fechaLocal = (d: Date) => `${fechaISO(d)} 00:00:00`

// Trae todas las filas de una consulta: la primera página dice cuántas son y el resto se pide en paralelo
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

// ── Saldos por cobrar: prestaciones realizadas que no están pagadas completas, por presupuesto ──
// Mismo cálculo que el Panel de Desempeño: usa la vista v_deuda_realizada si existe; si no, lo calcula aquí.
export interface FilaPorCobrar {
  id: string // presupuesto_id
  paciente_id: string
  nombre_tratamiento: string | null
  especialista_id: string | null
  realizado: number
  pagado: number
  saldo: number
  items: { profesional_id: string | null; saldo: number }[]
}

async function cargarPorCobrar(): Promise<FilaPorCobrar[]> {
  try {
    const filas = await traerTodo(c => supabase.from('v_deuda_realizada')
      .select('id, paciente_id, nombre_tratamiento, especialista_id, realizado, pagado, saldo, items', c ? { count: 'exact' } : undefined).order('id'))
    return filas.map(f => ({
      ...f, realizado: Number(f.realizado || 0), pagado: Number(f.pagado || 0), saldo: Number(f.saldo || 0),
      items: (f.items || []).map((i: any) => ({ profesional_id: i.profesional_id || null, saldo: Number(i.saldo || 0) })),
    }))
  } catch {
    const items = await traerTodo(c => supabase.from('presupuesto_items')
      .select('presupuesto_id, precio_pactado, abonado, estado, profesional_id', c ? { count: 'exact' } : undefined)
      .or(ESTADOS_HECHO).order('id'))
    const grupos: Record<string, FilaPorCobrar> = {}
    for (const it of items) {
      const estado = String(it.estado || '').toLowerCase().trim()
      if (!it.presupuesto_id || estado.includes('cancel') || estado.includes('anul')) continue
      const pactado = Number(it.precio_pactado || 0)
      const abonado = Number(it.abonado || 0)
      const saldo = Math.max(0, pactado - abonado)
      const g = (grupos[it.presupuesto_id] ||= { id: it.presupuesto_id, paciente_id: '', nombre_tratamiento: null, especialista_id: null, realizado: 0, pagado: 0, saldo: 0, items: [] })
      g.realizado += pactado
      g.pagado += Math.min(abonado, pactado)
      g.saldo += saldo
      if (saldo > 0) g.items.push({ profesional_id: it.profesional_id || null, saldo })
    }
    const conSaldo = Object.values(grupos).filter(g => g.saldo >= 1000)
    const planes = await fetchPorIds('presupuestos', 'id, paciente_id, nombre_tratamiento, especialista_id, estado', conSaldo.map(g => g.id))
    const porId = Object.fromEntries(planes.map(p => [p.id, p]))
    return conSaldo
      .filter(g => porId[g.id]?.paciente_id && !String(porId[g.id].estado || '').toLowerCase().includes('anul'))
      .map(g => ({ ...g, paciente_id: porId[g.id].paciente_id, nombre_tratamiento: porId[g.id].nombre_tratamiento, especialista_id: porId[g.id].especialista_id }))
  }
}

async function rpc(nombre: string, params: Record<string, any>): Promise<any[]> {
  const { data, error } = await supabase.rpc(nombre, params)
  if (error) throw new Error(error.message || 'Error de Supabase')
  return Array.isArray(data) ? data : []
}

// ── Prestaciones por nombre ──
// Fila compacta de la función → misma forma que usan las reglas (nombre + EvoFec, y el plan en "presupuestos")
const desdeFuncion = (r: any) => ({
  id: r.id, presupuesto_id: r.presupuesto_id,
  nombre_prestacion: r.evo ? `${r.nombre} | EvoFec: ${r.evo}` : r.nombre,
  diente_id: r.diente_id, estado: r.estado, progreso: r.progreso, precio_pactado: r.precio_pactado, abonado: r.abonado, profesional_id: r.profesional_id,
  presupuestos: {
    id: r.presupuesto_id, paciente_id: r.paciente_id, created_at: r.created_at, fecha_creacion: r.fecha_creacion,
    estado: r.plan_estado, nombre_tratamiento: r.plan_nombre, especialista_id: r.especialista_id,
  },
})

// Método anterior (sin la función): en palabras largas las vocales pasan a "_" para no depender de tildes
const patron = (palabra: string) => {
  const limpia = normalizar(palabra).replace(/[^A-Z0-9 ]/g, '').trim()
  const base = limpia.replace(/ /g, '').length >= 7 ? limpia.replace(/[AEIOU]/g, '_') : limpia
  return `nombre_prestacion.ilike.*${base.replace(/ +/g, '*')}*`
}
const SELECT_ITEM_CON_PLAN = 'id, presupuesto_id, nombre_prestacion, diente_id, estado, progreso, precio_pactado, abonado, profesional_id, presupuestos!inner(id, paciente_id, created_at, fecha_creacion, estado, nombre_tratamiento, especialista_id)'

interface OpcionesItems {
  soloIniciadas?: boolean
  pacientes?: string[] | null
  ultimaPorPaciente?: boolean          // solo la más reciente de cada paciente
  ultimaAntes?: Date | null            // …y solo si esa última es anterior a esta fecha
  piezas?: Record<string, string[]> | null // solo esas piezas de cada paciente ("*" = todas), las sin pieza y las de implante
}

async function itemsPorNombre(palabras: string[], meses: number, ahora: Date, o: OpcionesItems, rapido: { ok: boolean }): Promise<any[]> {
  const soloIniciadas = o.soloIniciadas ?? true
  const desde = sumarMeses(ahora, -meses).toISOString()
  if (o.pacientes && !o.pacientes.length) return []
  try {
    const filas = await rpc('seguimiento_prestaciones', {
      palabras: [...new Set(palabras.map(normalizar))], desde, solo_iniciadas: soloIniciadas,
      pacientes: o.pacientes || null, ultima_por_paciente: !!o.ultimaPorPaciente,
      ultima_antes: o.ultimaAntes ? o.ultimaAntes.toISOString() : null, piezas: o.piezas || null,
    })
    return filas.map(desdeFuncion)
  } catch {
    rapido.ok = false
  }
  const filtroPalabras = palabras.map(patron).join(',')
  const filtro = soloIniciadas ? `and(or(${filtroPalabras}),or(${ESTADOS_HECHO}))` : filtroPalabras
  if (!o.pacientes) {
    return traerTodo(c => supabase.from('presupuesto_items').select(SELECT_ITEM_CON_PLAN, c ? { count: 'exact' } : undefined)
      .or(filtro).gte('presupuestos.created_at', desde).order('id'))
  }
  const lotes: string[][] = []
  for (let i = 0; i < o.pacientes.length; i += 150) lotes.push(o.pacientes.slice(i, i + 150))
  const res = await Promise.all(lotes.map(lote => traerTodo(c => supabase.from('presupuesto_items').select(SELECT_ITEM_CON_PLAN, c ? { count: 'exact' } : undefined)
    .in('presupuestos.paciente_id', lote).gte('presupuestos.created_at', desde).or(filtro).order('id'))))
  return res.flat()
}

// ── Citas ──
// Con la función de actividad basta con las citas pasadas que usan las listas; sin ella se traen todas las de 6 meses
async function citasPasadas(hoy: Date, completo: boolean): Promise<any[]> {
  const hace6m = sumarMeses(hoy, -CONFIG.INACTIVO_MESES_DESDE)
  const base = (c: boolean) => supabase.from('citas').select('paciente_id, inicio, estado, motivo, profesional_id', c ? { count: 'exact' } : undefined)
    .gte('inicio', fechaLocal(hace6m)).lt('inicio', fechaLocal(hoy))
  if (completo) return traerTodo(c => base(c).order('id'))
  const q = (d: Date) => `"${fechaLocal(d)}"`
  const motivos = CONFIG.EVALUADOS.motivos.map(m => `motivo.ilike.*${normalizar(m).replace(/[^A-Z0-9]/g, '')}*`).join(',')
  const filtro = [
    'estado.eq.no_asiste',
    `and(estado.eq.cancelada,inicio.gte.${q(sumarDias(hoy, -CONFIG.ANULADAS_DIAS_ATRAS))})`,
    `and(estado.eq.atendido,inicio.gte.${q(sumarDias(hoy, -CONFIG.EVALUADOS.dias))},or(${motivos}))`,
    `and(estado.eq.atendido,inicio.gte.${q(sumarDias(hoy, -CONFIG.RESENA_DIAS))})`,
  ].join(',')
  return traerTodo(c => base(c).or(filtro).order('id'))
}

// Por paciente: última atención y última cita no anulada (método anterior: se arma con todas las citas)
async function actividad(hoy: Date, rapido: { ok: boolean }): Promise<any[] | null> {
  const desde = sumarMeses(hoy, -CONFIG.INACTIVO_MESES_HASTA)
  try {
    return await rpc('seguimiento_actividad', { desde: fechaLocal(desde) })
  } catch {
    rapido.ok = false
    return null
  }
}
async function actividadSinFuncion(hoy: Date, pasadas: any[]): Promise<any[]> {
  const desde = sumarMeses(hoy, -CONFIG.INACTIVO_MESES_HASTA)
  const hace6m = sumarMeses(hoy, -CONFIG.INACTIVO_MESES_DESDE)
  const antiguas = await traerTodo(c => supabase.from('citas').select('paciente_id, inicio, profesional_id', c ? { count: 'exact' } : undefined)
    .eq('estado', 'atendido').gte('inicio', fechaLocal(desde)).lt('inicio', fechaLocal(hace6m)).order('id'))
  const porPac = new Map<string, any>()
  const fila = (pac: string) => {
    let f = porPac.get(pac)
    if (!f) { f = { paciente_id: pac, ultima_atencion: null, profesional_id: null, ultima_actividad: null }; porPac.set(pac, f) }
    return f
  }
  for (const c of [...antiguas.map(a => ({ ...a, estado: 'atendido' })), ...pasadas]) {
    if (!c.paciente_id) continue
    const f = fila(c.paciente_id)
    if (c.estado === 'atendido' && (!f.ultima_atencion || c.inicio > f.ultima_atencion)) { f.ultima_atencion = c.inicio; f.profesional_id = c.profesional_id }
    if (c.estado !== 'cancelada' && (!f.ultima_actividad || c.inicio > f.ultima_actividad)) f.ultima_actividad = c.inicio
  }
  return [...porPac.values()]
}

// ── Datos históricos (se guardan en memoria unos minutos) ──
let cacheBase: DatosBase | null = null

export function baseEnCache(): DatosBase | null {
  return cacheBase && Date.now() - cacheBase.cargadoEn < CONFIG.MINUTOS_CACHE * 60_000 ? cacheBase : null
}

export async function cargarBase(ahora: Date): Promise<DatosBase> {
  cachePacientes.clear() // al recargar todo, también se vuelven a pedir las fichas (teléfonos corregidos, etc.)
  const errores: Record<string, string> = {}
  const rapido = { ok: true }
  // Cada consulta falla por separado: si una lista no carga, las demás siguen funcionando
  const intentar = async <T,>(nombre: string, fn: () => Promise<T>, vacio: T): Promise<T> => {
    try { return await fn() } catch (e: any) { errores[nombre] = e?.message || String(e); return vacio }
  }
  const hoy = inicioDelDia(ahora)
  const haceCerrar = sumarDias(hoy, -CONFIG.POR_CERRAR.dias)
  const hace90 = sumarDias(hoy, -90)
  const H = CONFIG.HIGIENE

  const [
    profesionales, usuarios, disponibilidad, act,
    implantes, endodoncias, extracciones, ortodoncia, higiene, periodontales,
    detenidos, porCerrar, porCobrar, saldoAFavor, conversion, cumpleanos,
  ] = await Promise.all([
    intentar('profesionales', async () => {
      const { data, error } = await supabase.from('profesionales').select('id, user_id, nombre, apellido, activo')
      if (error) throw error
      return data || []
    }, [] as any[]),
    intentar('usuarios', async () => {
      const { data, error } = await supabase.from('perfiles').select('id, nombre_completo')
      if (error) throw error
      return Object.fromEntries((data || []).map((p: any) => [p.id, p.nombre_completo || '']))
    }, {} as Record<string, string>),
    intentar('disponibilidad', () => traerTodo(c => supabase.from('disponibilidad_profesional')
      .select('profesional_id, dia_semana, hora_inicio, hora_fin, fecha_especifica', c ? { count: 'exact' } : undefined).order('id')), []),
    actividad(hoy, rapido),
    intentar('implantes', () => itemsPorNombre(CONFIG.IMPLANTES.palabras, CONFIG.IMPLANTES.mesesAtras, ahora, {}, rapido), []),
    intentar('endodoncias', () => itemsPorNombre(CONFIG.ENDODONCIAS.palabras, CONFIG.ENDODONCIAS.mesesAtras, ahora, {}, rapido), []),
    intentar('extracciones', () => itemsPorNombre(CONFIG.EXTRACCIONES.palabras, CONFIG.EXTRACCIONES.mesesAtras, ahora, {}, rapido), []),
    // Ortodoncia: también lo presupuestado sin hacer, para saber cuánto falta del tratamiento
    intentar('ortodoncia', () => itemsPorNombre(CONFIG.ORTODONCIA.palabras, CONFIG.ORTODONCIA.mesesAtras, ahora, { soloIniciadas: false }, rapido), []),
    // Higiene: la última limpieza o periodoncia de cada paciente, solo si ya pasó el plazo más corto (no se baja a quien vino hace poco)
    intentar('higiene', () => itemsPorNombre([...H.limpieza, ...H.periodoncia], H.mesesAtras, ahora,
      { ultimaPorPaciente: true, ultimaAntes: sumarMeses(ahora, -Math.min(H.mesesLimpieza, H.mesesPeriodoncia)) }, rapido), []),
    intentar('higiene', () => itemsPorNombre(H.periodoncia, H.mesesAtras, ahora, { ultimaPorPaciente: true }, rapido), []),
    intentar('detenidos', () => traerTodo(c => supabase.from('presupuestos')
      .select('id, paciente_id, nombre_tratamiento, especialista_id, estado, aprobado, total, total_abonado, created_at, fecha_creacion, presupuesto_items(id, estado, progreso, precio_pactado, abonado, profesional_id)', c ? { count: 'exact' } : undefined)
      .or('and(or(aprobado.eq.true,total_abonado.gt.0),or(estado.is.null,estado.not.ilike.finalizado))')
      .gte('created_at', sumarMeses(ahora, -CONFIG.DETENIDOS.mesesAtras).toISOString())
      .order('id')), []),
    intentar('por_cerrar', async () => {
      const { data, error } = await supabase.from('presupuestos')
        .select('id, paciente_id, total, total_abonado, nombre_tratamiento, created_at, fecha_creacion, especialista_id')
        .eq('aprobado', false).gte('total', CONFIG.POR_CERRAR.montoMinimo).gte('created_at', haceCerrar.toISOString())
        .or('total_abonado.is.null,total_abonado.eq.0')
        .order('total', { ascending: false }).limit(CONFIG.POR_CERRAR.maxFilas)
      if (error) throw error
      return data || []
    }, [] as any[]),
    intentar('por_cobrar', () => cargarPorCobrar(), [] as FilaPorCobrar[]),
    intentar('saldo_favor', () => traerTodo(c => supabase.from('pacientes')
      .select('id, saldo_a_favor', c ? { count: 'exact' } : undefined).gte('saldo_a_favor', CONFIG.SALDO_A_FAVOR_MINIMO).order('id')), []),
    // Cierre de presupuestos de los últimos 90 días (solo cuenta filas, no las descarga)
    intentar('conversion', async () => {
      const base = () => supabase.from('presupuestos').select('id', { count: 'exact', head: true })
        .gte('created_at', hace90.toISOString()).gte('total', CONFIG.POR_CERRAR.montoMinimo)
      const [todos, cerrados] = await Promise.all([base(), base().or('aprobado.eq.true,total_abonado.gt.0')])
      if (todos.error) throw todos.error
      if (cerrados.error) throw cerrados.error
      return { creados: todos.count || 0, cerrados: cerrados.count || 0 }
    }, null as { creados: number; cerrados: number } | null),
    rpc('seguimiento_cumpleanos', { dias_antes: CONFIG.CUMPLEANOS_DIAS_ANTES + 1, dias_despues: CONFIG.CUMPLEANOS_DIAS_DESPUES + 1 })
      .catch(() => { rapido.ok = false; return null }),
  ])

  // Citas pasadas: livianas si la función de actividad respondió; si no, las de 6 meses completas
  const pasadas = await intentar('citas', () => citasPasadas(hoy, !act), [])
  const actividadFinal = act ?? await intentar('citas', () => actividadSinFuncion(hoy, pasadas), [])

  // Segunda vuelta: depende de lo anterior
  // Trabajos de rehabilitación solo de las piezas con implante, endodoncia o extracción ("*" si la prestación no tiene pieza)
  const piezas: Record<string, string[]> = {}
  for (const it of [...implantes, ...endodoncias, ...extracciones]) {
    const pac = it.presupuestos?.paciente_id
    if (!pac) continue
    const d = String(it.diente_id ?? '').trim();
    (piezas[pac] ||= []).push(d && /^\d+$/.test(d) ? d : '*')
  }
  const pacientesRehab = Object.keys(piezas)
  const palabrasRehab = [...new Set([...CONFIG.IMPLANTES.rehabilitacion, ...CONFIG.ENDODONCIAS.rehabilitacion, ...CONFIG.EXTRACCIONES.rehabilitacion])]
  const motivosEval = CONFIG.EVALUADOS.motivos.map(normalizar)
  const desdeEval = sumarDias(hoy, -CONFIG.EVALUADOS.dias)
  const evaluados = pasadas.filter(c => c.estado === 'atendido' && c.paciente_id && new Date(String(c.inicio).replace(' ', 'T')) >= desdeEval
    && motivosEval.some(m => normalizar(c.motivo).includes(m)))

  const [rehabilitacion, presupuestosEvaluados] = await Promise.all([
    intentar('rehabilitacion', () => itemsPorNombre(palabrasRehab, 36, ahora, { soloIniciadas: false, pacientes: pacientesRehab, piezas }, rapido), []),
    intentar('evaluados', () => fetchPorIds('presupuestos', 'id, paciente_id, created_at, fecha_creacion',
      evaluados.map(c => c.paciente_id), 'paciente_id'), []),
  ])

  // Fichas que ya vinieron con los cumpleaños: se guardan para no volver a pedirlas
  for (const p of cumpleanos || []) cachePacientes.set(p.id, p)

  cacheBase = {
    cargadoEn: Date.now(), modoRapido: rapido.ok, profesionales, usuarios, disponibilidad,
    citasPasadas: pasadas, actividad: actividadFinal,
    implantes, endodoncias, extracciones, ortodoncia, higiene, periodontales, rehabilitacion,
    detenidos, porCerrar, porCobrar, saldoAFavor, presupuestosEvaluados, cumpleanos, conversion, errores,
  }
  return cacheBase
}

// ── Datos que cambian a cada rato (se piden siempre) ──
export async function cargarVivos(ahora: Date): Promise<DatosVivos> {
  const hoy = inicioDelDia(ahora)
  const [citasFuturas, bloqueos, contactos] = await Promise.all([
    traerTodo(c => supabase.from('citas')
      .select('id, paciente_id, inicio, fin, estado, estado_confirmacion, motivo, profesional_id', c ? { count: 'exact' } : undefined)
      .gte('inicio', fechaLocal(hoy)).order('id')),
    supabase.from('bloqueos_agenda').select('profesional_id, fecha, hora_inicio, hora_fin')
      .gte('fecha', fechaISO(hoy)).lte('fecha', fechaISO(sumarDias(hoy, CONFIG.DIAS_OCUPACION))),
    cargarContactos(ahora),
  ])
  return { citasFuturas, bloqueos: bloqueos.data || [], contactos }
}

// ── Registro de contactos (tabla opcional seguimiento_contactos) ──
export async function cargarContactos(ahora: Date): Promise<any[] | null> {
  try {
    const desde = sumarDias(ahora, -400).toISOString()
    return await traerTodo(c => supabase.from('seguimiento_contactos')
      .select('id, paciente_id, lista, resultado, nota, volver_a_contactar, usuario_id, created_at', c ? { count: 'exact' } : undefined)
      .gte('created_at', desde).order('id'))
  } catch {
    return null // la tabla aún no existe (o no hay permiso): el panel funciona igual, sin historial
  }
}

export async function registrarContacto(fila: { paciente_id: string; lista: string; resultado: string; nota?: string | null; volver_a_contactar: string; usuario_id: string | null }) {
  const { data, error } = await supabase.from('seguimiento_contactos').insert([fila])
    .select('id, paciente_id, lista, resultado, nota, volver_a_contactar, usuario_id, created_at').single()
  if (error) throw new Error(error.message)
  return data
}

export async function borrarContacto(id: number | string) {
  const { error } = await supabase.from('seguimiento_contactos').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Pacientes (nombre, teléfono, cumpleaños). Se piden solo los de la lista que se está viendo ──
// Devuelve null para las fichas que ya no existen.
const cachePacientes = new Map<string, any>()
export async function cargarPacientes(ids: string[]): Promise<Record<string, any>> {
  const faltan = [...new Set(ids.filter(id => id && !cachePacientes.has(id)))]
  if (faltan.length) {
    const filas = await fetchPorIds('pacientes', 'id, nombre, apellido, rut, telefono, fecha_nacimiento, activo', faltan)
    for (const p of filas) cachePacientes.set(p.id, p)
    for (const id of faltan) if (!cachePacientes.has(id)) cachePacientes.set(id, null) // ficha borrada
  }
  const out: Record<string, any> = {}
  for (const id of ids) if (cachePacientes.has(id)) out[id] = cachePacientes.get(id)
  return out
}
export const pacientesEnMemoria = (): Record<string, any> => Object.fromEntries(cachePacientes)

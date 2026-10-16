// Reglas de cada lista del Panel de Seguimiento: a partir de los datos arma la lista de pacientes a contactar.
import { URL_AGENDAR_ONLINE, URL_RESENA_GOOGLE } from '@/app/agenda/_components/utils'
import { CONFIG, type IdLista } from './config'
import type { DatosBase, DatosVivos } from './datos'
import {
  aFecha, coincide, DIA_MS, diasDesde, fechaEvolucion, fechaItem, fechaLargaTexto, fechaPlan, haceTexto, inicioDelDia,
  itemAnulado, itemIniciado, itemRealizado, money, nombreItemNorm, normalizar, pieza, primerNombre, saldoItem, sumarDias, sumarMeses, textoPiezas,
} from './util'

export type Tono = 'rojo' | 'ambar' | 'verde' | 'azul' | 'gris'

export interface Oportunidad {
  clave: string
  lista: IdLista
  pacienteId: string
  detalle: string
  etapa: string
  tono: Tono
  prioridad: number      // mayor = más urgente dentro de la lista
  fechaTexto: string
  monto: number          // 0 = sin monto
  montoTexto: string
  abonado?: number       // tratamientos detenidos: lo ya pagado de lo que falta hacer
  doctores: string[]     // user_id de los doctores relacionados (filtro por doctor)
  motivo: string         // motivo sugerido al agendar
  mensaje: (paciente: any) => string
}

export interface Contexto {
  ahora: Date
  base: DatosBase
  vivos: DatosVivos
  atenciones: Map<string, { fecha: Date; profesional: string | null }> // última atención de cada paciente
  horaFutura: Map<string, any>          // próxima cita vigente de cada paciente
  actividad6m: Set<string>              // pacientes con alguna cita no anulada en los últimos 6 meses o futura
  rehab: Map<string, any[]>             // trabajos de rehabilitación por paciente
  userDeProfesional: Map<string, string> // profesionales.id → user_id
}

// Qué datos usa cada lista (si alguno no cargó, la lista muestra el error)
export const DATOS_DE_LISTA: Record<IdLista, string[]> = {
  implantes: ['implantes', 'rehabilitacion', 'citas'],
  endodoncias: ['endodoncias', 'rehabilitacion'],
  extracciones: ['extracciones', 'rehabilitacion'],
  ortodoncia: ['ortodoncia', 'citas'],
  higiene: ['higiene'],
  detenidos: ['detenidos', 'citas'],
  por_cerrar: ['por_cerrar'],
  evaluados: ['citas', 'evaluados'],
  saldo_favor: ['saldo_favor'],
  por_cobrar: ['por_cobrar'],
  no_asistio: ['citas'],
  anulo: ['citas'],
  inactivos: ['citas'],
  cumpleanos: ['citas'],
  resena: ['citas'],
}

const agregar = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]) }
const hola = (p: any) => (primerNombre(p) ? `Hola ${primerNombre(p)}` : 'Hola')
const FIRMA = 'te saludamos de Clínica Dignidad'
const mismaPieza = (a: any, b: any) => pieza(a) !== null && pieza(a) === pieza(b)
// La rehabilitación se hizo después del tratamiento (si alguna fecha es aproximada, se asume que sí)
const despuesDe = (r: any, fecha: Date | null) => {
  const f = fechaItem(r, r.presupuestos)
  return !fecha || !f.fecha || f.aproximada || f.fecha.getTime() >= fecha.getTime() - DIA_MS
}
const unicos = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))]
const nombresCortos = (xs: (string | null | undefined)[], max = 2) => {
  const u = unicos(xs.map(x => String(x || '').trim()))
  return u.length <= max ? u.join(', ') : `${u.slice(0, max).join(', ')} +${u.length - max}`
}

export function armarContexto(base: DatosBase, vivos: DatosVivos, ahora: Date): Contexto {
  // Última atención de cada paciente: resumen por paciente + citas atendidas recientes (incluye las de hoy)
  const atenciones = new Map<string, { fecha: Date; profesional: string | null }>()
  const anotar = (pac: string | null | undefined, inicio: any, profesional: string | null | undefined) => {
    const f = aFecha(inicio)
    if (!pac || !f) return
    const actual = atenciones.get(pac)
    if (!actual || f > actual.fecha) atenciones.set(pac, { fecha: f, profesional: profesional || null })
  }
  for (const a of base.actividad) anotar(a.paciente_id, a.ultima_atencion, a.profesional_id)
  for (const ci of [...base.citasPasadas, ...vivos.citasFuturas]) if (ci.estado === 'atendido') anotar(ci.paciente_id, ci.inicio, ci.profesional_id)

  const horaFutura = new Map<string, any>()
  for (const c of vivos.citasFuturas) {
    if (!c.paciente_id || CONFIG.ESTADOS_CITA_INACTIVA.includes(c.estado) || c.estado === 'atendido') continue
    const actual = horaFutura.get(c.paciente_id)
    if (!actual || String(c.inicio) < String(actual.inicio)) horaFutura.set(c.paciente_id, c)
  }

  // Con alguna cita no anulada en los últimos 6 meses (o futura)
  const hace6m = sumarMeses(inicioDelDia(ahora), -CONFIG.INACTIVO_MESES_DESDE).getTime()
  const actividad6m = new Set<string>()
  for (const a of base.actividad) { const f = aFecha(a.ultima_actividad); if (a.paciente_id && f && f.getTime() >= hace6m) actividad6m.add(a.paciente_id) }
  for (const c of [...base.citasPasadas, ...vivos.citasFuturas]) if (c.paciente_id && c.estado !== 'cancelada') actividad6m.add(c.paciente_id)

  const rehab = new Map<string, any[]>()
  const vistos = new Set<string>()
  for (const r of base.rehabilitacion) {
    const pac = r.presupuestos?.paciente_id
    if (!pac || vistos.has(r.id)) continue
    vistos.add(r.id)
    agregar(rehab, pac, r)
  }
  return {
    ahora, base, vivos, atenciones, horaFutura, actividad6m, rehab,
    userDeProfesional: new Map(base.profesionales.map(p => [String(p.id), p.user_id])),
  }
}

export const ultimaVisita = (c: Contexto, pac: string): Date | null => c.atenciones.get(pac)?.fecha || null
const volvioDespues = (c: Contexto, pac: string, fecha: Date | null, margen = 0) => {
  const u = ultimaVisita(c, pac)
  return !!u && !!fecha && u.getTime() > fecha.getTime() + margen
}
const doctorDePlan = (c: Contexto, plan: any) => (plan?.especialista_id ? c.userDeProfesional.get(String(plan.especialista_id)) || null : null)

interface Hecho { item: any; fecha: Date | null; aproximada: boolean; dias: number }

// ─────────────────────────────────────────────────────────────
// Seguimiento clínico
// ─────────────────────────────────────────────────────────────
function implantes(c: Contexto): Oportunidad[] {
  const cfg = CONFIG.IMPLANTES
  const porPac = new Map<string, Hecho[]>()
  for (const it of c.base.implantes) {
    const plan = it.presupuestos, pac = plan?.paciente_id
    if (!pac || itemAnulado(it) || !itemIniciado(it)) continue
    const n = nombreItemNorm(it)
    if (!coincide(n, cfg.palabras) || coincide(n, cfg.excluir)) continue
    const { fecha, aproximada } = fechaItem(it, plan)
    const dias = diasDesde(fecha, c.ahora)
    if (dias === null || dias > cfg.mesesAtras * 31) continue
    agregar(porPac, pac, { item: it, fecha, aproximada, dias })
  }

  const out: Oportunidad[] = []
  for (const [pac, hechos] of porPac) {
    const rehab = c.rehab.get(pac) || []
    const esRehab = (r: any) => !itemAnulado(r) && coincide(nombreItemNorm(r), cfg.rehabilitacion)
    const relacionada = (r: any, h: Hecho) => mismaPieza(r, h.item) || nombreItemNorm(r).includes('IMPLANT')
    // Pendiente: el implante no está terminado, o no tiene su corona/prótesis realizada
    const pendientes = hechos.filter(h => !(itemRealizado(h.item) && rehab.some(r => esRehab(r) && itemRealizado(r) && relacionada(r, h) && despuesDe(r, h.fecha))))
    if (!pendientes.length) continue
    pendientes.sort((a, b) => a.dias - b.dias)
    const ref = pendientes[0]
    const controlHecho = volvioDespues(c, pac, ref.fecha, 2 * DIA_MS)
    const piezas = textoPiezas(pendientes.map(h => pieza(h.item)))

    // Valor: lo que falta cobrar del implante y de su corona/prótesis ya presupuestada
    const contados = new Set<string>()
    let monto = 0
    for (const h of pendientes) if (!itemRealizado(h.item) && !contados.has(h.item.id)) { contados.add(h.item.id); monto += saldoItem(h.item) }
    for (const r of rehab) {
      if (esRehab(r) && !itemRealizado(r) && !contados.has(r.id) && pendientes.some(h => relacionada(r, h))) { contados.add(r.id); monto += saldoItem(r) }
    }

    let etapa: string, tono: Tono, prioridad: number, motivo: string, mensaje: (p: any) => string
    if (ref.dias <= cfg.diasControlPostOperatorio && !controlHecho) {
      etapa = 'Falta control post-operatorio'; tono = 'rojo'; prioridad = 100; motivo = 'CONTROL POST OPERATORIO IMPLANTE'
      mensaje = p => `${hola(p)}, ${FIRMA} 🦷. ¿Cómo te has sentido después de la instalación de tu implante? Para asegurar una buena recuperación te corresponde tu control post-operatorio. ¿Te agendamos una hora esta semana?`
    } else if (ref.dias < cfg.diasParaCorona) {
      etapa = 'En oseointegración: dejar hora de corona'; tono = 'ambar'; prioridad = 60; motivo = 'CONTROL IMPLANTE'
      mensaje = p => `${hola(p)}, ${FIRMA} 🦷. Tu implante está en la etapa de integración con el hueso. Para no perder los tiempos del tratamiento, te proponemos dejar agendada desde ya tu hora para la siguiente etapa (la corona). ¿Qué días y horarios te acomodan?`
    } else {
      etapa = 'Listo para corona'; tono = 'verde'; prioridad = 85; motivo = 'CORONA SOBRE IMPLANTE'
      mensaje = p => `${hola(p)}, ${FIRMA} 🦷. Ya pasaron más de 3 meses desde la instalación de tu implante, así que estás en el momento ideal para la siguiente etapa: tu corona 😁. ¿Te agendamos una hora para continuar?`
    }
    out.push({
      clave: `implantes:${pac}`, lista: 'implantes', pacienteId: pac,
      detalle: `Implante${pendientes.length > 1 ? 's' : ''} ${piezas}`.trim() + (itemRealizado(ref.item) ? '' : ` · avance ${Number(ref.item.progreso || 0)}%`),
      etapa, tono, prioridad,
      fechaTexto: `Instalado ${haceTexto(ref.dias)}${ref.aproximada ? ' (aprox.)' : ''}`,
      monto, montoTexto: monto ? 'pendiente del tratamiento' : '',
      doctores: unicos(pendientes.map(h => h.item.profesional_id)),
      motivo: `${motivo} ${piezas.toUpperCase()}`.trim(), mensaje,
    })
  }
  return out
}

function endodoncias(c: Contexto): Oportunidad[] {
  const cfg = CONFIG.ENDODONCIAS
  type Caso = Hecho & { etapa: 'sin_terminar' | 'riesgo' | 'falta' }
  const PRIORIDAD = { sin_terminar: 95, riesgo: 88, falta: 70 }
  const porPac = new Map<string, Caso[]>()
  for (const it of c.base.endodoncias) {
    const plan = it.presupuestos, pac = plan?.paciente_id
    if (!pac || itemAnulado(it) || !itemIniciado(it)) continue
    const n = nombreItemNorm(it)
    if (!coincide(n, cfg.palabras) || coincide(n, cfg.excluir)) continue
    const { fecha, aproximada } = fechaItem(it, plan)
    const dias = diasDesde(fecha, c.ahora)
    if (dias === null || dias > cfg.mesesAtras * 31) continue
    let etapa: Caso['etapa']
    if (!itemRealizado(it)) {
      if (dias < cfg.diasSinTerminar) continue
      etapa = 'sin_terminar'
    } else {
      if (dias < cfg.diasMinimos) continue
      const restaurada = (c.rehab.get(pac) || []).some(r => !itemAnulado(r) && itemRealizado(r) && coincide(nombreItemNorm(r), cfg.rehabilitacion)
        && (pieza(it) === null || mismaPieza(r, it)) && despuesDe(r, fecha))
      if (restaurada) continue
      etapa = dias > cfg.diasRiesgo ? 'riesgo' : 'falta'
    }
    agregar(porPac, pac, { item: it, fecha, aproximada, dias, etapa })
  }

  const out: Oportunidad[] = []
  for (const [pac, casos] of porPac) {
    casos.sort((a, b) => PRIORIDAD[b.etapa] - PRIORIDAD[a.etapa] || a.dias - b.dias)
    const ref = casos[0]
    const piezas = textoPiezas(casos.map(x => pieza(x.item)))
    const contados = new Set<string>()
    let monto = 0
    for (const x of casos) if (!itemRealizado(x.item) && !contados.has(x.item.id)) { contados.add(x.item.id); monto += saldoItem(x.item) }
    for (const r of c.rehab.get(pac) || []) {
      if (!itemAnulado(r) && !itemRealizado(r) && coincide(nombreItemNorm(r), cfg.rehabilitacion) && !contados.has(r.id) && casos.some(x => mismaPieza(r, x.item))) {
        contados.add(r.id); monto += saldoItem(r)
      }
    }
    const textoPieza = piezas ? ` (${piezas})` : ''
    const enCurso = ref.etapa === 'sin_terminar'
    out.push({
      clave: `endodoncias:${pac}`, lista: 'endodoncias', pacienteId: pac,
      detalle: `Endodoncia ${piezas}`.trim() + (enCurso ? ` · avance ${Number(ref.item.progreso || 0)}%` : ''),
      etapa: enCurso ? 'Endodoncia sin terminar' : ref.etapa === 'riesgo' ? 'Sin restauración: riesgo de fractura' : 'Falta restauración',
      tono: ref.etapa === 'falta' ? 'ambar' : 'rojo', prioridad: PRIORIDAD[ref.etapa],
      fechaTexto: `${enCurso ? 'Última sesión' : 'Terminada'} ${haceTexto(ref.dias)}${ref.aproximada ? ' (aprox.)' : ''}`,
      monto, montoTexto: monto ? 'presupuestado sin realizar' : '',
      doctores: unicos(casos.map(x => x.item.profesional_id)),
      motivo: enCurso ? `CONTINUAR ENDODONCIA ${piezas.toUpperCase()}`.trim() : `RESTAURACION POST ENDODONCIA ${piezas.toUpperCase()}`.trim(),
      mensaje: enCurso
        ? p => `${hola(p)}, ${FIRMA}. Tu tratamiento de conducto${textoPieza} quedó pendiente y es importante terminarlo pronto para evitar dolor o una infección. ¿Te agendamos una hora para continuarlo?`
        : p => `${hola(p)}, ${FIRMA}. Tu tratamiento de conducto${textoPieza} ya está listo 👏, pero falta la restauración definitiva. Un diente con endodoncia sin su restauración o corona se puede fracturar, por eso es importante terminarlo. ¿Te agendamos una hora?`,
    })
  }
  return out
}

function extracciones(c: Contexto): Oportunidad[] {
  const cfg = CONFIG.EXTRACCIONES
  const porPac = new Map<string, Hecho[]>()
  for (const it of c.base.extracciones) {
    const plan = it.presupuestos, pac = plan?.paciente_id
    if (!pac || itemAnulado(it) || !itemRealizado(it)) continue
    const n = nombreItemNorm(it)
    if (!coincide(n, cfg.palabras) || coincide(n, cfg.excluir)) continue
    const p = pieza(it)
    if (p !== null && (cfg.piezasExcluidas.includes(p) || (p >= 51 && p <= 85))) continue // muelas del juicio y dientes de leche
    const { fecha, aproximada } = fechaItem(it, plan)
    const dias = diasDesde(fecha, c.ahora)
    if (dias === null || dias < cfg.diasMinimos || dias > cfg.mesesAtras * 31) continue
    agregar(porPac, pac, { item: it, fecha, aproximada, dias })
  }

  const out: Oportunidad[] = []
  for (const [pac, hechos] of porPac) {
    const rehab = (c.rehab.get(pac) || []).filter(r => !itemAnulado(r) && coincide(nombreItemNorm(r), cfg.rehabilitacion))
    const cubre = (r: any, h: Hecho) => pieza(r) === null || mismaPieza(r, h.item)
    const sinReponer = hechos.filter(h => !rehab.some(r => itemRealizado(r) && cubre(r, h) && despuesDe(r, h.fecha)))
    if (!sinReponer.length) continue
    sinReponer.sort((a, b) => a.dias - b.dias)
    const ref = sinReponer[0]
    const presupuestado = rehab.filter(r => !itemRealizado(r) && sinReponer.some(h => cubre(r, h)))
    const monto = presupuestado.reduce((s, r) => s + saldoItem(r), 0)
    const piezas = textoPiezas(sinReponer.map(h => pieza(h.item)))
    out.push({
      clave: `extracciones:${pac}`, lista: 'extracciones', pacienteId: pac,
      detalle: `Extracción ${piezas}`.trim(),
      etapa: monto > 0 ? 'Reposición presupuestada sin hacer' : 'Ofrecer implante o prótesis',
      tono: monto > 0 ? 'verde' : 'azul', prioridad: monto > 0 ? 75 : 50,
      fechaTexto: `Extraída ${haceTexto(ref.dias)}${ref.aproximada ? ' (aprox.)' : ''}`,
      monto, montoTexto: monto ? 'presupuestado sin realizar' : '',
      doctores: unicos(sinReponer.map(h => h.item.profesional_id)),
      motivo: monto > 0 ? 'INICIO REHABILITACION' : 'EVALUACION IMPLANTE / PROTESIS',
      mensaje: monto > 0
        ? p => `${hola(p)}, ${FIRMA} 🦷. Te escribimos porque ya tienes presupuestado el tratamiento para reponer la pieza que se extrajo. Si quieres, agendamos para comenzar y te contamos las facilidades de pago. ¿Qué días te acomodan?`
        : p => `${hola(p)}, ${FIRMA} 🦷. Han pasado unos meses desde tu extracción y queríamos contarte que ya puedes recuperar esa pieza con un implante o una prótesis. Reponerla te ayuda a masticar mejor y evita que los dientes vecinos se muevan. ¿Te agendamos una evaluación?`,
    })
  }
  return out
}

function ortodoncia(c: Contexto): Oportunidad[] {
  const cfg = CONFIG.ORTODONCIA
  const porPac = new Map<string, any[]>()
  for (const it of c.base.ortodoncia) {
    const pac = it.presupuestos?.paciente_id
    if (!pac || itemAnulado(it)) continue
    const n = nombreItemNorm(it)
    if (coincide(n, cfg.palabras) && !coincide(n, cfg.excluir)) agregar(porPac, pac, it)
  }

  const out: Oportunidad[] = []
  for (const [pac, items] of porPac) {
    // Solo tratamientos ya comenzados y cuyo plan no está finalizado
    const iniciados = items.filter(i => itemIniciado(i) && !normalizar(i.presupuestos?.estado).includes('FINALIZ'))
    if (!iniciados.length) continue
    const abiertos = new Set(iniciados.map(i => i.presupuesto_id))
    let ultima: Date | null = null
    let aproximada = false
    for (const i of iniciados) { const f = fechaEvolucion(i); if (f && (!ultima || f > ultima)) ultima = f }
    const visita = ultimaVisita(c, pac)
    if (visita && (!ultima || visita > ultima)) ultima = visita
    if (!ultima) {
      for (const i of iniciados) { const f = fechaPlan(i.presupuestos); if (f && (!ultima || f > ultima)) ultima = f }
      aproximada = true
    }
    const dias = diasDesde(ultima, c.ahora)
    if (dias === null || dias < cfg.diasControl || dias > cfg.mesesSinActividad * 31) continue
    const pendientes = items.filter(i => abiertos.has(i.presupuesto_id) && !itemRealizado(i))
    const monto = pendientes.reduce((s, i) => s + saldoItem(i), 0)
    const abandono = dias > cfg.diasAbandono
    const plan = iniciados[iniciados.length - 1].presupuestos
    out.push({
      clave: `ortodoncia:${pac}`, lista: 'ortodoncia', pacienteId: pac,
      detalle: plan?.nombre_tratamiento || 'Ortodoncia',
      etapa: abandono ? 'Dejó de venir a sus controles' : 'Control atrasado',
      tono: abandono ? 'rojo' : 'ambar', prioridad: abandono ? 80 : 70,
      fechaTexto: `Último control ${haceTexto(dias)}${aproximada ? ' (aprox.)' : ''}`,
      monto, montoTexto: monto ? 'saldo del tratamiento' : '',
      doctores: unicos([...iniciados.map(i => i.profesional_id), doctorDePlan(c, plan)]),
      motivo: 'CONTROL ORTODONCIA',
      mensaje: p => `${hola(p)}, ${FIRMA} 😁. Te escribimos porque ya te corresponde tu control de ortodoncia. Mantener los controles al día hace que el tratamiento avance y termine a tiempo. ¿Te agendamos una hora?`,
    })
  }
  return out
}

function higiene(c: Contexto): Oportunidad[] {
  const cfg = CONFIG.HIGIENE
  // Paciente periodontal: tuvo periodoncia en el período (necesita mantención cada pocos meses)
  const periodontales = new Set<string>()
  for (const it of [...c.base.higiene, ...c.base.periodontales]) {
    const pac = it.presupuestos?.paciente_id
    if (pac && !itemAnulado(it) && itemIniciado(it) && coincide(nombreItemNorm(it), cfg.periodoncia)) periodontales.add(pac)
  }
  // Última limpieza o periodoncia de cada paciente
  const ultima = new Map<string, Hecho>()
  for (const it of c.base.higiene) {
    const plan = it.presupuestos, pac = plan?.paciente_id
    if (!pac || itemAnulado(it) || !itemIniciado(it)) continue
    const n = nombreItemNorm(it)
    if (!coincide(n, cfg.limpieza) && !coincide(n, cfg.periodoncia)) continue
    const { fecha, aproximada } = fechaItem(it, plan)
    const dias = diasDesde(fecha, c.ahora)
    if (dias === null) continue
    const actual = ultima.get(pac)
    if (!actual || dias < actual.dias) ultima.set(pac, { item: it, fecha, aproximada, dias })
  }

  const out: Oportunidad[] = []
  for (const [pac, ref] of ultima) {
    const esPerio = periodontales.has(pac)
    const meses = esPerio ? cfg.mesesPeriodoncia : cfg.mesesLimpieza
    if (ref.dias < meses * 30.4 || ref.dias > cfg.mesesAtras * 31) continue
    const mesesPasados = Math.max(1, Math.round(ref.dias / 30.4))
    const ultimaFuePerio = coincide(nombreItemNorm(ref.item), cfg.periodoncia)
    out.push({
      clave: `higiene:${pac}`, lista: 'higiene', pacienteId: pac,
      detalle: esPerio ? 'Paciente periodontal' : 'Control y limpieza',
      etapa: esPerio ? 'Mantención periodontal' : 'Limpieza semestral',
      tono: esPerio ? 'ambar' : 'azul', prioridad: esPerio ? 62 : 45,
      fechaTexto: `Última ${ultimaFuePerio ? 'periodoncia' : 'limpieza'} ${haceTexto(ref.dias)}${ref.aproximada ? ' (aprox.)' : ''}`,
      monto: 0, montoTexto: '',
      doctores: unicos([ref.item.profesional_id]),
      motivo: esPerio ? 'MANTENCION PERIODONTAL' : 'LIMPIEZA Y CONTROL',
      mensaje: esPerio
        ? p => `${hola(p)}, ${FIRMA} 🦷. Te corresponde tu mantención periodontal, que es clave para mantener tus encías sanas después del tratamiento. ¿Te agendamos una hora?`
        : p => `${hola(p)}, ${FIRMA} 🦷✨. Ya pasaron ${mesesPasados} meses desde tu última limpieza y es un buen momento para tu control. Puedes responder este mensaje o agendar directamente aquí: ${URL_AGENDAR_ONLINE}`,
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// Ventas
// ─────────────────────────────────────────────────────────────
function detenidos(c: Contexto): Oportunidad[] {
  const porPac = new Map<string, { plan: any; pendientes: number; saldo: number; abonado: number }[]>()
  for (const plan of c.base.detenidos) {
    const est = normalizar(plan.estado)
    if (!plan.paciente_id || est.includes('FINALIZ') || est.includes('ANUL')) continue
    const pend = (plan.presupuesto_items || []).filter((i: any) => !itemAnulado(i) && !itemRealizado(i))
    if (!pend.length) continue
    const saldo = pend.reduce((s: number, i: any) => s + saldoItem(i), 0)
    const abonado = pend.reduce((s: number, i: any) => s + Math.min(Number(i.abonado || 0), Number(i.precio_pactado || 0)), 0)
    if (saldo + abonado < 1000) continue
    agregar(porPac, plan.paciente_id, { plan, pendientes: pend.length, saldo, abonado })
  }

  const out: Oportunidad[] = []
  for (const [pac, planes] of porPac) {
    const visita = ultimaVisita(c, pac)
    const dv = diasDesde(visita, c.ahora)
    if (dv !== null && dv < CONFIG.DETENIDOS.diasSinVisita) continue // está viniendo: el tratamiento sigue su curso
    const saldo = planes.reduce((s, x) => s + x.saldo, 0)
    const abonado = planes.reduce((s, x) => s + x.abonado, 0)
    const pendientes = planes.reduce((s, x) => s + x.pendientes, 0)
    const pago = abonado > 0
    const nombres = nombresCortos(planes.map(x => x.plan.nombre_tratamiento))
    const masAntiguo = planes.map(x => fechaPlan(x.plan)).filter((f): f is Date => !!f).sort((a, b) => a.getTime() - b.getTime())[0] || null
    const primerPlan = planes[0].plan.nombre_tratamiento || ''
    out.push({
      clave: `detenidos:${pac}`, lista: 'detenidos', pacienteId: pac,
      detalle: `${nombres || 'Tratamiento'} · ${pendientes} prestación${pendientes === 1 ? '' : 'es'} pendiente${pendientes === 1 ? '' : 's'}`,
      etapa: pago ? 'Pagó y no ha terminado' : 'Aprobado sin terminar',
      tono: pago ? 'rojo' : 'ambar', prioridad: pago ? 90 : 72,
      fechaTexto: visita ? `Última visita ${haceTexto(dv)}` : `Sin visitas · plan ${haceTexto(diasDesde(masAntiguo, c.ahora))}`,
      monto: saldo, montoTexto: pago ? `por cobrar · ya abonó ${money(abonado)}` : 'por cobrar al realizar', abonado,
      doctores: unicos([...planes.map(x => doctorDePlan(c, x.plan)), ...planes.flatMap(x => (x.plan.presupuesto_items || []).map((i: any) => i.profesional_id))]),
      motivo: `CONTINUAR ${primerPlan}`.trim().toUpperCase(),
      mensaje: p => `${hola(p)}, ${FIRMA}. Te escribimos porque tu tratamiento${primerPlan ? ` de ${primerPlan.toLowerCase()}` : ''} tiene sesiones pendientes${pago ? ` y ya tienes ${money(abonado)} abonado para ellas` : ''}. Queremos ayudarte a terminarlo 😊. ¿Te agendamos tu próxima hora?`,
    })
  }
  return out
}

function porCerrar(c: Contexto): Oportunidad[] {
  const excluir = CONFIG.POR_CERRAR.excluir.map(normalizar)
  // Si después aprobó otro plan (otra alternativa), este presupuesto ya no se persigue
  const ultimoAprobado = new Map<string, number>()
  for (const p of c.base.detenidos) {
    const f = fechaPlan(p)?.getTime() || 0
    if (p.paciente_id && f > (ultimoAprobado.get(p.paciente_id) || 0)) ultimoAprobado.set(p.paciente_id, f)
  }
  const porPac = new Map<string, any[]>()
  for (const p of c.base.porCerrar) {
    if (!p.paciente_id) continue
    const texto = normalizar(p.nombre_tratamiento)
    const palabras = texto.split(/[^A-Z0-9]+/)
    if (excluir.some(x => (x.length <= 3 ? palabras.includes(x) : texto.includes(x)))) continue
    const f = fechaPlan(p)?.getTime() || 0
    if ((ultimoAprobado.get(p.paciente_id) || 0) >= f - DIA_MS) continue
    agregar(porPac, p.paciente_id, p)
  }

  const out: Oportunidad[] = []
  for (const [pac, planes] of porPac) {
    planes.sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
    const ref = planes[0]
    const reciente = planes.map(p => fechaPlan(p)).filter((f): f is Date => !!f).sort((a, b) => b.getTime() - a.getTime())[0] || null
    const dias = diasDesde(reciente, c.ahora) ?? 0
    const trat = ref.nombre_tratamiento || 'tratamiento'
    const etapa = dias <= 7 ? { t: 'Recién presupuestado', tono: 'verde' as Tono, p: 78 } : dias <= 30 ? { t: 'En seguimiento', tono: 'ambar' as Tono, p: 65 } : { t: 'Recuperar', tono: 'gris' as Tono, p: 45 }
    out.push({
      clave: `por_cerrar:${pac}`, lista: 'por_cerrar', pacienteId: pac,
      detalle: nombresCortos(planes.map(p => p.nombre_tratamiento)) || 'Presupuesto',
      etapa: etapa.t, tono: etapa.tono, prioridad: etapa.p,
      fechaTexto: `Presupuestado ${haceTexto(dias)}`,
      monto: Number(ref.total || 0), montoTexto: planes.length > 1 ? `el mayor de ${planes.length} presupuestos` : 'presupuesto',
      doctores: unicos(planes.map(p => doctorDePlan(c, p))),
      motivo: `INICIO ${trat}`.toUpperCase(),
      mensaje: p => `${hola(p)}, ${FIRMA}. Queríamos saber si tienes alguna duda sobre tu presupuesto de ${String(trat).toLowerCase()}. Tenemos facilidades de pago y podemos agendar tu primera sesión cuando te acomode. ¡Quedamos atentos!`,
    })
  }
  return out
}

function evaluados(c: Contexto): Oportunidad[] {
  const cfg = CONFIG.EVALUADOS
  const motivos = cfg.motivos.map(normalizar)
  const desde = sumarDias(inicioDelDia(c.ahora), -cfg.dias)
  const ultimaEval = new Map<string, any>()
  for (const ci of c.base.citasPasadas) {
    if (ci.estado !== 'atendido' || !ci.paciente_id) continue
    const f = aFecha(ci.inicio)
    if (!f || f < desde || !motivos.some(m => normalizar(ci.motivo).includes(m))) continue
    const actual = ultimaEval.get(ci.paciente_id)
    if (!actual || String(ci.inicio) > String(actual.inicio)) ultimaEval.set(ci.paciente_id, ci)
  }
  const presupuestos = new Map<string, any[]>()
  for (const p of c.base.presupuestosEvaluados) agregar(presupuestos, p.paciente_id, p)

  const out: Oportunidad[] = []
  for (const [pac, ci] of ultimaEval) {
    const f = aFecha(ci.inicio)!
    if ((presupuestos.get(pac) || []).some(p => (fechaPlan(p)?.getTime() || 0) >= f.getTime() - 3 * DIA_MS)) continue
    if (volvioDespues(c, pac, f, DIA_MS)) continue // volvió: ya está en tratamiento
    const urgencia = normalizar(ci.motivo).includes('URGENCIA')
    const dias = diasDesde(f, c.ahora)
    out.push({
      clave: `evaluados:${pac}`, lista: 'evaluados', pacienteId: pac,
      detalle: ci.motivo || 'Evaluación',
      etapa: urgencia ? 'Vino por urgencia, sin presupuesto' : 'Sin presupuesto',
      tono: 'ambar', prioridad: urgencia ? 68 : 66,
      fechaTexto: `${urgencia ? 'Atendido' : 'Evaluado'} ${haceTexto(dias)}`,
      monto: 0, montoTexto: '',
      doctores: unicos([ci.profesional_id]),
      motivo: 'PRESENTACION DE PRESUPUESTO',
      mensaje: p => `${hola(p)}, ${FIRMA}. ¿Cómo has estado después de tu ${urgencia ? 'atención' : 'evaluación'} del ${fechaLargaTexto(f)}? Queremos ayudarte a continuar con tu tratamiento: podemos explicarte el presupuesto y agendar tu primera sesión. ¿Te acomoda que lo conversemos?`,
    })
  }
  return out
}

function saldoAFavor(c: Contexto): Oportunidad[] {
  return c.base.saldoAFavor.filter(p => p.id).map(p => {
    const saldo = Number(p.saldo_a_favor || 0)
    const visita = ultimaVisita(c, p.id)
    return {
      clave: `saldo_favor:${p.id}`, lista: 'saldo_favor' as IdLista, pacienteId: p.id,
      detalle: 'Saldo a favor en la clínica', etapa: 'Dinero a favor sin usar', tono: 'verde' as Tono, prioridad: 60,
      fechaTexto: visita ? `Última visita ${haceTexto(diasDesde(visita, c.ahora))}` : 'Sin visitas en 18 meses',
      monto: saldo, montoTexto: 'saldo a favor',
      doctores: [], motivo: 'CONTINUAR TRATAMIENTO',
      mensaje: (pac: any) => `${hola(pac)}, ${FIRMA}. Te recordamos que tienes un saldo a favor de ${money(saldo)} en la clínica para usar en tus tratamientos 😊. ¿Te agendamos una hora para aprovecharlo?`,
    }
  })
}

// ─────────────────────────────────────────────────────────────
// Cobranza
// ─────────────────────────────────────────────────────────────
function porCobrar(c: Contexto): Oportunidad[] {
  const porPac = new Map<string, typeof c.base.porCobrar>()
  for (const f of c.base.porCobrar) if (f.paciente_id) agregar(porPac, f.paciente_id, f)
  const out: Oportunidad[] = []
  for (const [pac, filas] of porPac) {
    const saldo = filas.reduce((s, f) => s + f.saldo, 0)
    if (saldo < 1000) continue
    const realizado = filas.reduce((s, f) => s + f.realizado, 0)
    const visita = ultimaVisita(c, pac)
    const alto = saldo >= CONFIG.POR_COBRAR_ALTO
    out.push({
      clave: `por_cobrar:${pac}`, lista: 'por_cobrar', pacienteId: pac,
      detalle: nombresCortos(filas.map(f => f.nombre_tratamiento)) || 'Tratamiento',
      etapa: alto ? 'Deuda alta' : 'Saldo pendiente', tono: alto ? 'rojo' : 'ambar', prioridad: alto ? 70 : 55,
      fechaTexto: visita ? `Última visita ${haceTexto(diasDesde(visita, c.ahora))}` : '',
      monto: saldo, montoTexto: `de ${money(realizado)} realizado`,
      doctores: unicos([...filas.map(f => (f.especialista_id ? c.userDeProfesional.get(String(f.especialista_id)) : null)), ...filas.flatMap(f => f.items.map(i => i.profesional_id))]),
      motivo: 'PAGO DE SALDO PENDIENTE',
      mensaje: p => `${hola(p)}, ${FIRMA}. Te recordamos que tu tratamiento tiene un saldo pendiente de ${money(saldo)}. Puedes pagarlo en tu próxima visita o coordinar con nosotros por este medio. ¡Gracias!`,
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// Agenda
// ─────────────────────────────────────────────────────────────
function noAsistio(c: Contexto): Oportunidad[] {
  const desde = sumarDias(inicioDelDia(c.ahora), -CONFIG.NO_ASISTIO_DIAS)
  const conteo = new Map<string, number>()
  const ultima = new Map<string, any>()
  for (const ci of c.base.citasPasadas) {
    if (ci.estado !== 'no_asiste' || !ci.paciente_id) continue
    conteo.set(ci.paciente_id, (conteo.get(ci.paciente_id) || 0) + 1)
    const f = aFecha(ci.inicio)
    if (!f || f < desde) continue
    const actual = ultima.get(ci.paciente_id)
    if (!actual || String(ci.inicio) > String(actual.inicio)) ultima.set(ci.paciente_id, ci)
  }
  const out: Oportunidad[] = []
  for (const [pac, ci] of ultima) {
    const f = aFecha(ci.inicio)!
    if (volvioDespues(c, pac, f)) continue // volvió después
    const n = conteo.get(pac) || 1
    out.push({
      clave: `no_asistio:${pac}`, lista: 'no_asistio', pacienteId: pac,
      detalle: ci.motivo || 'Cita',
      etapa: n >= 2 ? `Falta seguido (${n} veces en 6 meses)` : 'No asistió', tono: n >= 2 ? 'rojo' : 'ambar', prioridad: n >= 2 ? 62 : 58,
      fechaTexto: `Faltó ${haceTexto(diasDesde(f, c.ahora))}`,
      monto: 0, montoTexto: '',
      doctores: unicos([ci.profesional_id]),
      motivo: ci.motivo || 'REAGENDAMIENTO',
      mensaje: p => `${hola(p)}, ${FIRMA}. El ${fechaLargaTexto(f)} te esperábamos para tu cita y no pudiste asistir. Entendemos que pueden surgir imprevistos 🙂 ¿Te ayudamos a buscar una nueva hora?`,
    })
  }
  return out
}

function anulo(c: Contexto): Oportunidad[] {
  const desde = sumarDias(inicioDelDia(c.ahora), -CONFIG.ANULADAS_DIAS_ATRAS)
  const ultima = new Map<string, any>()
  for (const ci of [...c.base.citasPasadas, ...c.vivos.citasFuturas]) {
    if (ci.estado !== 'cancelada' || !ci.paciente_id) continue
    const f = aFecha(ci.inicio)
    if (!f || f < desde) continue
    const actual = ultima.get(ci.paciente_id)
    if (!actual || String(ci.inicio) > String(actual.inicio)) ultima.set(ci.paciente_id, ci)
  }
  const out: Oportunidad[] = []
  for (const [pac, ci] of ultima) {
    const f = aFecha(ci.inicio)!
    if (volvioDespues(c, pac, f)) continue
    out.push({
      clave: `anulo:${pac}`, lista: 'anulo', pacienteId: pac,
      detalle: ci.motivo || 'Cita',
      etapa: 'Hora anulada', tono: 'ambar', prioridad: 56,
      fechaTexto: `Hora del ${f.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} anulada`,
      monto: 0, montoTexto: '',
      doctores: unicos([ci.profesional_id]),
      motivo: ci.motivo || 'REAGENDAMIENTO',
      mensaje: p => `${hola(p)}, ${FIRMA}. Vimos que tu hora del ${fechaLargaTexto(f)} quedó anulada. ¿Te ayudamos a buscar una nueva? Puedes responder este mensaje o agendar aquí: ${URL_AGENDAR_ONLINE}`,
    })
  }
  return out
}

function inactivos(c: Contexto): Oportunidad[] {
  const hoy = inicioDelDia(c.ahora)
  const desde = sumarMeses(hoy, -CONFIG.INACTIVO_MESES_HASTA).getTime()
  const hasta = sumarMeses(hoy, -CONFIG.INACTIVO_MESES_DESDE).getTime()
  const out: Oportunidad[] = []
  for (const [pac, a] of c.atenciones) {
    const t = a.fecha.getTime()
    if (t < desde || t >= hasta || c.actividad6m.has(pac)) continue
    const dias = diasDesde(a.fecha, c.ahora) ?? 0
    out.push({
      clave: `inactivos:${pac}`, lista: 'inactivos', pacienteId: pac,
      detalle: 'Sin atenciones recientes', etapa: 'Inactivo', tono: 'gris', prioridad: 30 + Math.max(0, 20 - Math.round(dias / 30)),
      fechaTexto: `Última atención ${haceTexto(dias)}`,
      monto: 0, montoTexto: '',
      doctores: unicos([a.profesional]),
      motivo: 'CONTROL Y LIMPIEZA',
      mensaje: (p: any) => `${hola(p)}, ${FIRMA}. Ya pasaron unos meses desde tu última visita y es un buen momento para tu control y limpieza 🦷. ¿Te agendamos una hora? También puedes agendar aquí: ${URL_AGENDAR_ONLINE}`,
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// Fidelización
// ─────────────────────────────────────────────────────────────
function resena(c: Contexto): Oportunidad[] {
  const desde = sumarDias(inicioDelDia(c.ahora), -CONFIG.RESENA_DIAS)
  const ultima = new Map<string, any>()
  for (const ci of [...c.base.citasPasadas, ...c.vivos.citasFuturas]) {
    if (ci.estado !== 'atendido' || !ci.paciente_id) continue
    const f = aFecha(ci.inicio)
    if (!f || f < desde) continue
    const actual = ultima.get(ci.paciente_id)
    if (!actual || String(ci.inicio) > String(actual.inicio)) ultima.set(ci.paciente_id, ci)
  }
  return [...ultima.entries()].map(([pac, ci]) => ({
    clave: `resena:${pac}`, lista: 'resena' as IdLista, pacienteId: pac,
    detalle: ci.motivo || 'Atención', etapa: 'Pedir reseña', tono: 'verde' as Tono, prioridad: 50,
    fechaTexto: `Atendido ${haceTexto(diasDesde(aFecha(ci.inicio), c.ahora))}`,
    monto: 0, montoTexto: '',
    doctores: unicos([ci.profesional_id]),
    motivo: 'CONTROL',
    mensaje: (p: any) => `${hola(p)}, gracias por atenderte en Clínica Dignidad 💙. ¿Nos ayudarías dejando tu opinión en Google? Es solo un clic:\n${URL_RESENA_GOOGLE}\n\nY si conoces a alguien que necesite atención dental, ¡nos encantará recibirlo de tu parte! 🦷`,
  }))
}

// Pacientes a revisar para cumpleaños: atendidos en el último año o con hora agendada
export function idsCumpleanos(c: Contexto): string[] {
  const hace12m = sumarDias(inicioDelDia(c.ahora), -365).getTime()
  const ids = new Set<string>(c.horaFutura.keys())
  for (const [pac, a] of c.atenciones) if (a.fecha.getTime() >= hace12m) ids.add(pac)
  return [...ids]
}

export function cumpleanos(c: Contexto, pacientes: Record<string, any>): Oportunidad[] {
  const hoy = inicioDelDia(c.ahora)
  const out: Oportunidad[] = []
  // Con la función de Supabase ya vienen las fichas de quienes están de cumpleaños; si no, se revisan los atendidos del año
  const fichas: any[] = c.base.cumpleanos ?? idsCumpleanos(c).map(id => pacientes[id]).filter(Boolean)
  for (const p of fichas) {
    const id = p.id
    const m = String(p?.fecha_nacimiento || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) continue
    const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
    for (let off = -CONFIG.CUMPLEANOS_DIAS_ANTES; off <= CONFIG.CUMPLEANOS_DIAS_DESPUES; off++) {
      const d = sumarDias(hoy, off)
      // 29 de febrero se saluda el 28 en años no bisiestos
      const bisiesto = new Date(d.getFullYear(), 1, 29).getMonth() === 1
      const diaCumple = mes === 2 && dia === 29 && !bisiesto ? 28 : dia
      if (d.getMonth() + 1 !== mes || d.getDate() !== diaCumple) continue
      const edad = d.getFullYear() - anio
      const regalo = CONFIG.CUMPLEANOS_REGALO.trim()
      out.push({
        clave: `cumpleanos:${id}`, lista: 'cumpleanos', pacienteId: id,
        detalle: edad > 0 && edad < 120 ? `Cumple ${edad} años` : 'Cumpleaños',
        etapa: off === 0 ? 'Hoy' : off > 0 ? (off === 1 ? 'Mañana' : `En ${off} días`) : (off === -1 ? 'Fue ayer' : `Fue hace ${-off} días`),
        tono: off === 0 ? 'verde' : off > 0 ? 'azul' : 'gris', prioridad: off === 0 ? 100 : off > 0 ? 90 - off : 50 + off,
        fechaTexto: d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }),
        monto: 0, montoTexto: '', doctores: [], motivo: 'CONTROL Y LIMPIEZA',
        mensaje: (pac: any) => `¡${off < 0 ? 'Feliz cumpleaños atrasado' : 'Feliz cumpleaños'}${primerNombre(pac) ? `, ${primerNombre(pac)}` : ''}! 🎉🎂 Todo el equipo de Clínica Dignidad te desea un ${off < 0 ? 'muy feliz año' : 'día increíble'}. 💙${regalo ? `\n\n${regalo}` : ''}`,
      })
      break
    }
  }
  return out
}

// Todas las listas que no dependen de la ficha del paciente
export function calcularListas(c: Contexto): Record<IdLista, Oportunidad[]> {
  return {
    implantes: implantes(c), endodoncias: endodoncias(c), extracciones: extracciones(c), ortodoncia: ortodoncia(c), higiene: higiene(c),
    detenidos: detenidos(c), por_cerrar: porCerrar(c), evaluados: evaluados(c), saldo_favor: saldoAFavor(c),
    por_cobrar: porCobrar(c),
    no_asistio: noAsistio(c), anulo: anulo(c), inactivos: inactivos(c),
    cumpleanos: [], resena: resena(c),
  }
}

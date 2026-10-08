// Cálculo de métricas del Panel de Desempeño (funciones puras, sin consultas)
import type { DatosFijos, DatosPeriodo } from './consultas'
import {
  CONFIG, MESES, esCitaWeb, esSaldoAFavor, esWebPendiente, fechaISO, fechaLocal, labProporcional,
  limpiarNombrePrestacion, medioDePago, minsDeHora, nombreCompleto, normalizar, ratio,
} from './util'

export interface FilaDoctor {
  userId: string
  nombre: string
  especialidad: string
  activo: boolean
  produccion: number
  honorarios: number
  lab: number
  clinica: number
  pacientes: number
  prestaciones: number
  citas: number
  citasPasadas: number
  noAsiste: number
  minDisponibles: number
  minAgendados: number
  minLibresPasados: number
  minLibresFuturos: number
  ocupacion: number | null
  espera: number | null
  valorHora: number | null
}

export interface Conciliacion { id: string; fecha: string; responsable: string; estado: string; declarado: number | null; pagos: number; diferencia: number | null }

export interface Metricas {
  filtrado: boolean
  dinero: {
    recaudacion: number
    medios: { efectivo: number; tarjeta: number; transferencia: number; otro: number }
    saldoAFavorUsado: number
    produccion: number
    honorarios: number
    honorariosPendientesTerminar: number
    reembolsoLabDoctores: number
    lab: number
    ventaConLab: number
    margenClinica: number
    margenPct: number
    anticipos: number // pagos ingresados a saldo a favor (sin prestación): entran a caja, se producen al usarse
    anticiposN: number
    egresos: number
    egresosPorCategoria: { name: string; value: number }[]
    marketing: number
    utilidad: number
    liquidacionesPagadas: number
    ticketPromedio: number
  }
  cajas: { conciliacion: Conciliacion[]; abiertas: number; diferenciaTotal: number; pagosFueraDeCaja: number }
  doctores: FilaDoctor[]
  ventas: {
    categorias: { name: string; value: number }[]
    tratamientos: { name: string; value: number; cantidad: number }[]
    especialidades: { name: string; value: number }[]
    topPacientes: { id: string; name: string; value: number }[]
    produccionPorDia: { name: string; value: number }[]
  }
  agenda: {
    citas: number
    citasPasadas: number
    citasFuturas: number
    canceladas: number
    noAsiste: number
    tasaCancelacion: number
    tasaAusencia: number
    minPerdidosAusencia: number
    citasWeb: number
    webPendientes: number
    ocupacion: number | null
    minDisponibles: number
    minAgendados: number
    minLibresPasados: number
    minLibresFuturos: number
    valorHora: number | null
    espera: number | null
    demandaPorHora: { name: string; value: number }[]
    citasPorDia: { name: string; value: number }[]
  }
  pacientes: { nuevos: number; atendidos: number; nuevosAtendidos: number; recurrentes: number; tasaRetorno: number; costoPorNuevo: number | null }
  comercial: {
    creados: number
    aprobados: number
    conversion: number
    montoCotizado: number
    montoAprobado: number
    conversionMonto: number
    diasAprobacion: number | null
    cotizados: { name: string; value: number }[]
  }
}

const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0] // Lunes → Domingo
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const top = (obj: Record<string, number>, n = 10) =>
  Object.entries(obj).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, n)

export function calcularMetricas(d: DatosPeriodo, fijos: DatosFijos, pacientesPorId: Record<string, any>, filtroDoc: string | null, ahora: Date): Metricas {
  const r = d.rango
  const hoyStr = fechaISO(ahora)
  const profPorUser = new Map<string, any>(fijos.profesionales.filter(p => p.user_id).map(p => [p.user_id, p]))
  const profFiltro = filtroDoc ? profPorUser.get(filtroDoc) : null

  const porcentajeDoctor = (prof: any, item?: any) => {
    if (item?.tipo_reparto === 'doctor') return 1
    if (item?.tipo_reparto === 'clinica') return 0
    if (item?.tipo_reparto === 'forzado') return Number(item?.porcentaje_forzado || 0) / 100
    const base = prof?.porcentaje_comision
    return Number(base === null || base === undefined ? CONFIG.COMISION_POR_DEFECTO : base) / 100
  }
  const doctorDePago = (p: any) => p.profesional_id || d.items[p.item_id]?.profesional_id || null

  const pagos = filtroDoc ? d.pagos.filter(p => doctorDePago(p) === filtroDoc) : d.pagos
  const atenciones = filtroDoc ? d.atenciones.filter(a => a.profesional_id === filtroDoc) : d.atenciones
  const citasTodas = filtroDoc ? d.citas.filter(c => c.profesional_id === filtroDoc) : d.citas
  const presupuestos = filtroDoc ? d.presupuestos.filter(p => p.especialista_id === profFiltro?.id) : d.presupuestos

  // ── Acumuladores por doctor ──
  const filas: Record<string, FilaDoctor & { _pac: Set<string>; _items: Set<string>; _espera: number[]; _agPas: number; _dispPas: number; _minAus: number }> = {}
  const fila = (userId: string | null) => {
    const key = userId && profPorUser.has(userId) ? userId : 'sin-asignar'
    if (!filas[key]) {
      const prof = profPorUser.get(key)
      const esp = Array.isArray(prof?.especialidades) ? prof.especialidades[0]?.nombre : prof?.especialidades?.nombre
      filas[key] = {
        userId: key, nombre: prof ? nombreCompleto(prof) : 'Sin asignar', especialidad: esp || 'Sin especialidad', activo: prof?.activo !== false,
        produccion: 0, honorarios: 0, lab: 0, clinica: 0, pacientes: 0, prestaciones: 0, citas: 0, citasPasadas: 0, noAsiste: 0,
        minDisponibles: 0, minAgendados: 0, minLibresPasados: 0, minLibresFuturos: 0, ocupacion: null, espera: null, valorHora: null,
        _pac: new Set(), _items: new Set(), _espera: [], _agPas: 0, _dispPas: 0, _minAus: 0,
      }
    }
    return filas[key]
  }

  // ── 1. Dinero ──
  const medios = { efectivo: 0, tarjeta: 0, transferencia: 0, otro: 0 }
  let recaudacion = 0, saldoAFavorUsado = 0, produccion = 0, honorarios = 0, honorariosPendientesTerminar = 0
  let reembolsoLabDoctores = 0, lab = 0, ventaConLab = 0, margenClinica = 0, anticipos = 0, anticiposN = 0
  const categorias: Record<string, number> = {}
  const tratamientos: Record<string, { value: number; items: Set<string> }> = {}
  const facturacionPaciente: Record<string, number> = {}
  const prodPorDia: Record<number, number> = {}
  const pacientesActivos = new Set<string>()

  const sumarTratamiento = (nombre: string, monto: number, clave: string) => {
    if (!tratamientos[nombre]) tratamientos[nombre] = { value: 0, items: new Set() }
    tratamientos[nombre].value += monto
    tratamientos[nombre].items.add(clave)
  }

  for (const p of pagos) {
    const monto = Number(p.monto || 0)
    if (monto <= 0) continue
    const saldo = esSaldoAFavor(p)
    if (saldo) saldoAFavorUsado += monto
    else { recaudacion += monto; medios[medioDePago(p.metodo_pago)] += monto }
    if (p.paciente_id) {
      pacientesActivos.add(p.paciente_id)
      facturacionPaciente[p.paciente_id] = (facturacionPaciente[p.paciente_id] || 0) + monto
    }
    const dia = new Date(p.fecha_pago).getDay()

    const item = d.items[p.item_id]
    if (!item) {
      if (!saldo) { anticipos += monto; anticiposN++ }
      continue
    }
    prodPorDia[dia] = (prodPorDia[dia] || 0) + monto
    const docId = doctorDePago(p)
    const prof = profPorUser.get(docId)
    const labPago = labProporcional(monto, item)
    const base = CONFIG.HONORARIO_SOBRE_NETO_DE_LAB ? Math.max(0, monto - labPago) : monto
    const honor = base * porcentajeDoctor(prof, item)
    const clinica = monto - labPago - honor

    produccion += monto; honorarios += honor; lab += labPago; margenClinica += clinica
    if (labPago > 0) ventaConLab += monto
    if (item.lab_pagado_por_dr) reembolsoLabDoctores += labPago
    if (!CONFIG.ESTADOS_ITEM_TERMINADO.includes(normalizar(item.estado))) honorariosPendientesTerminar += honor

    const f = fila(docId)
    f.produccion += monto; f.honorarios += honor; f.lab += labPago; f.clinica += clinica
    f._items.add(item.id)
    if (p.paciente_id) f._pac.add(p.paciente_id)

    const cat = d.categoriaPrestacion[item.prestacion_id] || 'Sin categoría'
    categorias[cat] = (categorias[cat] || 0) + monto
    sumarTratamiento(limpiarNombrePrestacion(item.nombre_prestacion) || 'Prestación sin nombre', monto, item.id)
  }

  for (const a of atenciones) {
    const monto = Number(a.monto_cobrado || 0)
    const prof = profPorUser.get(a.profesional_id)
    const honor = monto * porcentajeDoctor(prof)
    produccion += monto; honorarios += honor; margenClinica += monto - honor
    const f = fila(a.profesional_id)
    f.produccion += monto; f.honorarios += honor; f.clinica += monto - honor
    f._items.add(`at-${a.id}`)
    if (a.paciente_id) { f._pac.add(a.paciente_id); pacientesActivos.add(a.paciente_id) }
    const prest = Array.isArray(a.prestaciones) ? a.prestaciones[0] : a.prestaciones
    const cat = prest?.['Nombre Categoria'] || 'Atención directa'
    categorias[cat] = (categorias[cat] || 0) + monto
    sumarTratamiento(prest?.['Nombre Accion'] || prest?.Nombre || 'Atención directa', monto, `at-${a.id}`)
    const dia = fechaLocal(a.fecha).getDay()
    prodPorDia[dia] = (prodPorDia[dia] || 0) + monto
  }

  const egresosPorCat: Record<string, number> = {}
  for (const e of d.egresos) egresosPorCat[e.categoria || 'Otros'] = (egresosPorCat[e.categoria || 'Otros'] || 0) + Number(e.monto || 0)
  const egresos = Object.values(egresosPorCat).reduce((a, b) => a + b, 0)
  const marketing = egresosPorCat['Marketing'] || 0
  const liquidacionesPagadas = d.liquidaciones
    .filter(l => !profFiltro || l.profesional_id === profFiltro.id)
    .reduce((a, l) => a + Number(l.monto_total || 0), 0)
  const utilidad = recaudacion - lab - egresos - (CONFIG.HONORARIOS_INCLUIDOS_EN_EGRESOS ? 0 : honorarios)

  // ── 2. Cajas (conciliación: lo declarado al cerrar vs. los pagos registrados en esa caja) ──
  const pagosPorCaja: Record<string, number> = {}
  let pagosFueraDeCaja = 0
  for (const p of d.pagos) {
    if (esSaldoAFavor(p)) continue
    if (p.caja_id) pagosPorCaja[p.caja_id] = (pagosPorCaja[p.caja_id] || 0) + Number(p.monto || 0)
    else pagosFueraDeCaja += Number(p.monto || 0)
  }
  const conciliacion: Conciliacion[] = d.cajas.map(c => {
    const cerrada = c.estado === 'cerrada' && c.monto_cierre !== null && c.monto_cierre !== undefined
    const declarado = cerrada ? Number(c.monto_cierre || 0) - Number(c.monto_apertura || 0) : null
    const pagosCaja = pagosPorCaja[c.id] || 0
    return {
      id: c.id, fecha: c.fecha_apertura, responsable: c.nombre_responsable || '—', estado: c.estado || '—',
      declarado, pagos: pagosCaja, diferencia: declarado === null ? null : Math.round(declarado - pagosCaja),
    }
  }).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const diferenciaTotal = conciliacion.reduce((a, c) => a + (c.diferencia || 0), 0)

  // ── 3. Agenda ──
  const webPendientes = citasTodas.filter(esWebPendiente).length
  const citas = citasTodas.filter(c => !esWebPendiente(c))
  let canceladas = 0, citasPasadas = 0, citasFuturas = 0, noAsiste = 0, minPerdidosAusencia = 0, citasWeb = 0
  const demandaHora: Record<number, number> = {}
  const citasDia: Record<number, number> = {}
  const esperas: number[] = []
  const minAgendadosDia: Record<string, number> = {} // `${userId}|${fecha}`

  // Solo cuenta lo ocurrido hasta "ahora" (así el mes en curso se compara con el mismo día del mes anterior).
  // Las citas futuras sirven para la demanda y las horas libres que quedan.
  for (const c of citas) {
    const ini = fechaLocal(c.inicio)
    const futura = ini >= ahora
    if (c.estado === 'cancelada') { if (!futura) canceladas++; continue }
    const dur = Math.max(0, (fechaLocal(c.fin).getTime() - ini.getTime()) / 60000)
    const f = fila(c.profesional_id)
    demandaHora[ini.getHours()] = (demandaHora[ini.getHours()] || 0) + 1
    citasDia[ini.getDay()] = (citasDia[ini.getDay()] || 0) + 1
    const k = `${c.profesional_id}|${fechaISO(ini)}`
    minAgendadosDia[k] = (minAgendadosDia[k] || 0) + dur
    if (futura) { citasFuturas++; continue }
    f.citas++
    citasPasadas++; f.citasPasadas++
    if (esCitaWeb(c)) citasWeb++
    if (c.estado === 'no_asiste') { noAsiste++; f.noAsiste++; minPerdidosAusencia += dur; f._minAus += dur }
    if (c.estado === 'atendido' && c.paciente_id) pacientesActivos.add(c.paciente_id)
    if (c.hora_llegada && c.hora_inicio_atencion) {
      const m = (fechaLocal(c.hora_inicio_atencion).getTime() - fechaLocal(c.hora_llegada).getTime()) / 60000
      if (m >= 0 && m < 240) { esperas.push(m); f._espera.push(m) }
    }
  }

  // Ocupación real: minutos agendados ÷ minutos disponibles (disponibilidad − bloqueos)
  const dispPorUser: Record<string, any[]> = {}
  for (const x of fijos.disponibilidad) (dispPorUser[x.profesional_id] ||= []).push(x)
  const bloqueosPorProf: Record<string, any[]> = {}
  for (const b of d.bloqueos) (bloqueosPorProf[`${b.profesional_id}|${b.fecha}`] ||= []).push(b)
  const profsAgenda = fijos.profesionales.filter(p => p.user_id && (filtroDoc ? p.user_id === filtroDoc : p.activo !== false))

  let minDisponibles = 0, minAgendados = 0, minDisponiblesPasados = 0, minAgendadosPasados = 0, minLibresPasados = 0, minLibresFuturos = 0
  for (let dia = 1; dia <= r.dias; dia++) {
    const fecha = new Date(r.anio, r.mes - 1, dia)
    const fechaStr = fechaISO(fecha)
    for (const prof of profsAgenda) {
      const lista = dispPorUser[prof.user_id] || []
      const especiales = lista.filter(x => x.fecha_especifica === fechaStr)
      const bloques = especiales.length ? especiales : lista.filter(x => !x.fecha_especifica && x.dia_semana === fecha.getDay())
      if (!bloques.length) continue
      const bloqueos = bloqueosPorProf[`${prof.id}|${fechaStr}`] || []
      if (bloqueos.some(b => !b.hora_inicio || !b.hora_fin)) continue // día completo bloqueado
      let disp = 0
      for (const bl of bloques) {
        const ini = minsDeHora(bl.hora_inicio), fin = minsDeHora(bl.hora_fin)
        let m = Math.max(0, fin - ini)
        for (const bq of bloqueos) m -= Math.max(0, Math.min(fin, minsDeHora(bq.hora_fin)) - Math.max(ini, minsDeHora(bq.hora_inicio)))
        disp += Math.max(0, m)
      }
      if (!disp) continue
      const agend = Math.min(disp, minAgendadosDia[`${prof.user_id}|${fechaStr}`] || 0)
      const f = fila(prof.user_id)
      f.minDisponibles += disp; f.minAgendados += agend
      minDisponibles += disp; minAgendados += agend
      if (fechaStr < hoyStr) { f.minLibresPasados += disp - agend; minLibresPasados += disp - agend; minAgendadosPasados += agend; f._agPas += agend; minDisponiblesPasados += disp; f._dispPas += disp }
      else { f.minLibresFuturos += disp - agend; minLibresFuturos += disp - agend }
    }
  }

  // Valor de una hora de sillón: producción ÷ horas efectivamente usadas (sin ausencias)
  const horasUsadas = Math.max(0, minAgendadosPasados - minPerdidosAusencia) / 60
  const valorHora = horasUsadas > 0 && produccion > 0 ? produccion / horasUsadas : null

  const doctores: FilaDoctor[] = Object.values(filas).map(({ _pac, _items, _espera, _agPas, _dispPas, _minAus, ...f }) => ({
    ...f,
    pacientes: _pac.size,
    prestaciones: _items.size,
    // Ocupación de los días ya transcurridos (si no hay, la del mes completo)
    ocupacion: _dispPas ? _agPas / _dispPas : f.minDisponibles ? f.minAgendados / f.minDisponibles : null,
    espera: _espera.length ? _espera.reduce((a, b) => a + b, 0) / _espera.length : null,
    valorHora: _agPas - _minAus > 0 && f.produccion > 0 ? f.produccion / ((_agPas - _minAus) / 60) : null,
  }))
    .filter(f => f.produccion > 0 || f.citas > 0 || f.minDisponibles > 0)
    .sort((a, b) => b.produccion - a.produccion)

  const especialidades: Record<string, number> = {}
  for (const f of doctores) if (f.produccion) especialidades[f.especialidad] = (especialidades[f.especialidad] || 0) + f.produccion

  // ── 4. Pacientes ──
  const desde = new Date(r.desdeTz).getTime(), hasta = new Date(r.hastaTz).getTime()
  let nuevosAtendidos = 0, recurrentes = 0
  for (const id of pacientesActivos) {
    const creado = pacientesPorId[id]?.created_at ? new Date(pacientesPorId[id].created_at).getTime() : null
    if (creado !== null && creado >= desde && creado < hasta) nuevosAtendidos++
    else recurrentes++
  }

  // ── 5. Comercial (presupuestos creados en el mes) ──
  const aprobadosLista = presupuestos.filter(p => p.aprobado || Number(p.total_abonado || 0) > 0)
  const montoCotizado = presupuestos.reduce((a, p) => a + Number(p.total || 0), 0)
  const montoAprobado = aprobadosLista.reduce((a, p) => a + Number(p.total || 0), 0)
  const primerPago: Record<string, number> = {}
  for (const p of d.pagos) {
    if (!p.presupuesto_id) continue
    const t = new Date(p.fecha_pago).getTime()
    if (!primerPago[p.presupuesto_id] || t < primerPago[p.presupuesto_id]) primerPago[p.presupuesto_id] = t
  }
  const dias = aprobadosLista
    .map(p => (primerPago[p.id] ? (primerPago[p.id] - new Date(p.created_at).getTime()) / 86400000 : null))
    .filter((x): x is number => x !== null && x >= 0)
  const cotizados: Record<string, number> = {}
  for (const p of presupuestos) cotizados[p.nombre_tratamiento || 'Plan sin nombre'] = (cotizados[p.nombre_tratamiento || 'Plan sin nombre'] || 0) + Number(p.total || 0)

  const atendidos = pacientesActivos.size

  return {
    filtrado: !!filtroDoc,
    dinero: {
      recaudacion, medios, saldoAFavorUsado, produccion, honorarios, honorariosPendientesTerminar, reembolsoLabDoctores,
      lab, ventaConLab, margenClinica, margenPct: ratio(margenClinica, produccion), anticipos, anticiposN,
      egresos, egresosPorCategoria: top(egresosPorCat, 20), marketing, utilidad, liquidacionesPagadas,
      ticketPromedio: ratio(produccion, atendidos),
    },
    cajas: { conciliacion, abiertas: conciliacion.filter(c => c.declarado === null).length, diferenciaTotal, pagosFueraDeCaja },
    doctores,
    ventas: {
      categorias: top(categorias),
      tratamientos: Object.entries(tratamientos).map(([name, t]) => ({ name, value: t.value, cantidad: t.items.size }))
        .sort((a, b) => b.value - a.value).slice(0, 10),
      especialidades: top(especialidades),
      topPacientes: Object.entries(facturacionPaciente).map(([id, value]) => ({ id, name: nombreCompleto(pacientesPorId[id]), value }))
        .sort((a, b) => b.value - a.value).slice(0, 10),
      produccionPorDia: DIAS_ORDEN.filter(i => prodPorDia[i]).map(i => ({ name: DIAS_CORTOS[i], value: prodPorDia[i] })),
    },
    agenda: {
      citas: citasPasadas, citasPasadas, citasFuturas, canceladas, noAsiste,
      tasaCancelacion: ratio(canceladas, citasPasadas + canceladas),
      tasaAusencia: ratio(noAsiste, citasPasadas),
      minPerdidosAusencia, citasWeb, webPendientes,
      ocupacion: minDisponiblesPasados ? minAgendadosPasados / minDisponiblesPasados : minDisponibles ? minAgendados / minDisponibles : null,
      minDisponibles, minAgendados, minLibresPasados, minLibresFuturos, valorHora,
      espera: esperas.length ? esperas.reduce((a, b) => a + b, 0) / esperas.length : null,
      demandaPorHora: Object.keys(demandaHora).map(Number).sort((a, b) => a - b).map(h => ({ name: `${String(h).padStart(2, '0')}:00`, value: demandaHora[h] })),
      citasPorDia: DIAS_ORDEN.filter(i => citasDia[i]).map(i => ({ name: DIAS_CORTOS[i], value: citasDia[i] })),
    },
    pacientes: {
      nuevos: d.pacientesNuevos, atendidos, nuevosAtendidos, recurrentes,
      tasaRetorno: ratio(recurrentes, atendidos),
      costoPorNuevo: marketing > 0 && d.pacientesNuevos > 0 ? marketing / d.pacientesNuevos : null,
    },
    comercial: {
      creados: presupuestos.length, aprobados: aprobadosLista.length,
      conversion: ratio(aprobadosLista.length, presupuestos.length),
      montoCotizado, montoAprobado, conversionMonto: ratio(montoAprobado, montoCotizado),
      diasAprobacion: dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : null,
      cotizados: top(cotizados),
    },
  }
}

// Recaudación mensual (12 meses) desde el historial de pagos
export function historialMensual(pagos: any[], anio: number, mes: number, filtroDoc: string | null, corteAnioAnterior: Date | null = null) {
  const porMes: Record<string, number> = {}
  let anioAnteriorAlCorte = 0
  for (const p of pagos) {
    if (esSaldoAFavor(p)) continue
    if (filtroDoc && p.profesional_id !== filtroDoc) continue
    const f = new Date(p.fecha_pago)
    const k = `${f.getFullYear()}-${f.getMonth()}`
    porMes[k] = (porMes[k] || 0) + Number(p.monto || 0)
    if (corteAnioAnterior && f.getFullYear() === anio - 1 && f.getMonth() === mes - 1 && f <= corteAnioAnterior) anioAnteriorAlCorte += Number(p.monto || 0)
  }
  const serie = []
  for (let i = 11; i >= 0; i--) {
    const f = new Date(anio, mes - 1 - i, 1)
    serie.push({ name: `${MESES[f.getMonth()]}${f.getMonth() === 0 || i === 11 ? ` ${String(f.getFullYear()).slice(2)}` : ''}`, value: porMes[`${f.getFullYear()}-${f.getMonth()}`] || 0 })
  }
  const anioAnterior = corteAnioAnterior ? anioAnteriorAlCorte : porMes[`${anio - 1}-${mes - 1}`] || 0
  const ant = new Date(anio, mes - 2, 1)
  const mesAnteriorCompleto = porMes[`${ant.getFullYear()}-${ant.getMonth()}`] || 0
  return { serie, anioAnterior, mesAnteriorCompleto }
}

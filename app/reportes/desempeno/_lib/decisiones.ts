// Motor de recomendaciones: lee las métricas y propone acciones para aumentar ingresos.
// Las cifras de "potencial" son estimaciones conservadoras para priorizar, no promesas.
import type { Metricas } from './metricas'
import { fechaISO, horas, money, porcentaje, ratio, variacion } from './util'

export type Nivel = 'urgente' | 'oportunidad' | 'atencion' | 'bien'

export interface Decision {
  id: string
  nivel: Nivel
  titulo: string
  detalle: string
  acciones: string[]
  impacto: number | null // $ estimados que se pueden ganar o recuperar
  ancla?: string // id de la sección con el detalle
}

export interface EntradaDecisiones {
  m: Metricas
  prev: Metricas | null
  esMesActual: boolean
  hoy: Date
  metas: { monto: number; bono: number }[]
  venta: number // valor que se compara con las metas
  proyeccion: number | null
  diasHabilesRestantes: number
  porCerrar: { n: number; monto: number }
  porCobrar: { n: number; monto: number }
  recontactar: number
  recaudacionAnioAnterior: number
}

// Supuestos usados para estimar el potencial
export const SUPUESTOS = {
  CIERRE_PRESUPUESTOS: 0.3, // 30% de los presupuestos pendientes se puede cerrar con seguimiento
  COBRO_PENDIENTE: 0.25, // 25% de la deuda se puede recuperar en el mes
  RELLENO_HORAS_LIBRES: 0.5, // 50% de las horas libres se puede llenar
  RETORNO_RECONTACTO: 0.15, // 15% de los pacientes recontactados vuelve
  CONVERSION_OBJETIVO: 0.5,
  AUSENCIA_ALTA: 0.08,
  OCUPACION_BAJA: 0.6,
  OCUPACION_ALTA: 0.9,
  MARGEN_BAJO: 0.35,
  EGRESOS_ALTOS: 0.5,
  ESPERA_ALTA: 15,
  DEPENDENCIA_DOCTOR: 0.5,
}

const ORDEN: Record<Nivel, number> = { urgente: 0, oportunidad: 1, atencion: 1, bien: 2 }

export function generarDecisiones(e: EntradaDecisiones): Decision[] {
  const { m, prev } = e
  const out: Decision[] = []
  const vh = m.agenda.valorHora || m.dinero.ticketPromedio || 0
  const S = SUPUESTOS

  // 1. Metas de ventas con bono
  if (e.esMesActual && !m.filtrado && e.metas.length && e.proyeccion !== null) {
    const siguiente = e.metas.find(x => e.venta < x.monto)
    const logrado = [...e.metas].reverse().find(x => e.venta >= x.monto)
    if (!siguiente) {
      out.push({
        id: 'meta', nivel: 'bien', titulo: `¡Meta máxima lograda! Bono de ${money(logrado!.bono)}`,
        detalle: `Ventas de ${money(e.venta)} superan los ${money(logrado!.monto)}.`,
        acciones: ['Aprovecha el impulso para cerrar presupuestos grandes y dejar agenda llena para el próximo mes.'],
        impacto: null, ancla: 'resumen',
      })
    } else {
      const falta = siguiente.monto - e.venta
      const porDia = e.diasHabilesRestantes > 0 ? falta / e.diasHabilesRestantes : falta
      const llega = e.proyeccion >= siguiente.monto
      const tramo = `meta de ${money(siguiente.monto)} (bono ${money(siguiente.bono)})`
      out.push({
        id: 'meta',
        nivel: llega ? 'bien' : logrado ? 'atencion' : 'urgente',
        titulo: llega ? `Vas en camino a la ${tramo}` : `Faltan ${money(falta)} para la ${tramo}`,
        detalle: `${logrado ? `Ya aseguraste el bono de ${money(logrado.bono)}. ` : ''}Proyección al cierre: ${money(e.proyeccion)}. ` +
          `Necesitas ${money(porDia)} por día hábil${e.diasHabilesRestantes > 0 ? ` en los ${e.diasHabilesRestantes} que quedan` : ''}.`,
        acciones: llega
          ? ['Mantén el ritmo diario y revisa cada mañana lo vendido el día anterior.']
          : [
              'Prioriza presupuestos por cerrar y saldos por cobrar: es la plata más rápida.',
              'Llena las horas libres de esta semana con pacientes a recontactar.',
              'Revisa cada mañana lo vendido el día anterior contra la meta diaria.',
            ],
        impacto: llega ? null : falta, ancla: 'resumen',
      })
    }
  }

  // 2. Cajas descuadradas
  if (!m.filtrado) {
    const descuadradas = m.cajas.conciliacion.filter(c => c.diferencia !== null && Math.abs(c.diferencia) >= 1000)
    if (descuadradas.length) {
      out.push({
        id: 'cajas', nivel: 'urgente',
        titulo: `${descuadradas.length} caja${descuadradas.length > 1 ? 's' : ''} con diferencia (${money(m.cajas.diferenciaTotal)})`,
        detalle: 'Lo declarado al cerrar no coincide con los pagos registrados en esa caja. Puede ser un cobro sin registrar o un error de cierre.',
        acciones: [
          'Revisa cada caja con diferencia en la sección "Conciliación de cajas".',
          'Todo cobro debe registrarse como pago en la ficha antes de cerrar la caja.',
        ],
        impacto: Math.abs(m.cajas.diferenciaTotal), ancla: 'cajas',
      })
    }
    const hoyStr = fechaISO(e.hoy)
    const abiertasViejas = m.cajas.conciliacion.filter(c => c.declarado === null && fechaISO(new Date(c.fecha)) < hoyStr).length
    if (abiertasViejas) {
      out.push({
        id: 'cajas-abiertas', nivel: 'atencion', titulo: `${abiertasViejas} caja${abiertasViejas > 1 ? 's' : ''} de días anteriores sin cerrar`,
        detalle: 'Sin cierre no se puede verificar que el dinero cuadre.',
        acciones: ['Cierra las cajas pendientes y registra el monto contado.'], impacto: null, ancla: 'cajas',
      })
    }
  }

  // 3. Presupuestos por cerrar
  if (e.porCerrar.n > 0) {
    out.push({
      id: 'por-cerrar', nivel: e.porCerrar.n >= 3 ? 'oportunidad' : 'atencion',
      titulo: `${e.porCerrar.n} presupuestos sin aprobar por ${money(e.porCerrar.monto)}`,
      detalle: 'Pacientes que recibieron un presupuesto en los últimos 90 días y no han aprobado ni abonado. Es la plata más fácil de conseguir: el paciente ya vino y ya sabe que necesita el tratamiento.',
      acciones: [
        'Escribe hoy a los 5 de mayor valor con el botón de WhatsApp de la lista.',
        'Ofrece partir por la fase 1 o pagar en cuotas para bajar la barrera de entrada.',
        'Haz seguimiento a las 48 h de entregar cada presupuesto nuevo.',
      ],
      impacto: e.porCerrar.monto * S.CIERRE_PRESUPUESTOS, ancla: 'comercial',
    })
  }

  // 4. Saldos por cobrar
  if (e.porCobrar.monto > 0) {
    out.push({
      id: 'por-cobrar', nivel: 'oportunidad',
      titulo: `${money(e.porCobrar.monto)} por cobrar de tratamientos ya realizados`,
      detalle: `${e.porCobrar.n} planes tienen prestaciones hechas que no están pagadas completas.`,
      acciones: [
        'Revisa el saldo del paciente en la Hoja de Ruta antes de cada cita y cobra la cuota antes de pasar al box.',
        'Contacta a los de mayor saldo sin cita agendada.',
        'Evita terminar tratamientos con saldo pendiente: cobra antes de la última sesión.',
      ],
      impacto: e.porCobrar.monto * S.COBRO_PENDIENTE, ancla: 'comercial',
    })
  }

  // 5. Ausencias
  const a = m.agenda
  if (a.citasPasadas >= 20 && a.tasaAusencia >= S.AUSENCIA_ALTA) {
    out.push({
      id: 'ausencias', nivel: a.tasaAusencia >= 0.15 ? 'urgente' : 'atencion',
      titulo: `Ausencias de ${porcentaje(a.tasaAusencia)}: ${horas(a.minPerdidosAusencia)} de sillón perdidas`,
      detalle: `${a.noAsiste} pacientes no llegaron. Cada hora vacía vale aprox. ${money(vh)} en producción.`,
      acciones: [
        'Usa "Recordar Mañana" todos los días antes de las 13:00.',
        'Al marcar "No asistió", envía el WhatsApp para reagendar en el momento.',
        'A pacientes con 2 o más inasistencias, pide confirmación el mismo día o un abono para reservar.',
      ],
      impacto: (a.minPerdidosAusencia / 60) * vh, ancla: 'agenda',
    })
  } else if (a.citasPasadas >= 20 && a.tasaAusencia < 0.05) {
    out.push({ id: 'ausencias', nivel: 'bien', titulo: `Ausencias bajo control (${porcentaje(a.tasaAusencia)})`, detalle: 'Los recordatorios están funcionando.', acciones: ['Mantén el envío diario de recordatorios.'], impacto: null, ancla: 'agenda' })
  }

  // 6. Horas libres que quedan este mes
  if (e.esMesActual && a.minLibresFuturos >= 300) {
    const peores = [...m.doctores].filter(d => d.minLibresFuturos >= 120).sort((x, y) => y.minLibresFuturos - x.minLibresFuturos).slice(0, 3)
    out.push({
      id: 'horas-libres', nivel: 'oportunidad',
      titulo: `Quedan ${horas(a.minLibresFuturos)} libres en la agenda de este mes`,
      detalle: peores.length ? `Más espacio: ${peores.map(d => `${d.nombre} (${horas(d.minLibresFuturos)})`).join(', ')}.` : 'Horas disponibles sin pacientes agendados.',
      acciones: [
        'Llena esas horas con los presupuestos por cerrar y los pacientes a recontactar.',
        'Usa "Buscar Hora" al hablar con el paciente para ofrecerle el primer espacio libre.',
        'Comparte el link de agendamiento online en redes y Google.',
      ],
      impacto: (a.minLibresFuturos / 60) * vh * S.RELLENO_HORAS_LIBRES, ancla: 'doctores',
    })
  }

  // 7. Ocupación del mes
  if (a.ocupacion !== null && a.minDisponibles > 0) {
    if (a.ocupacion < S.OCUPACION_BAJA) {
      const bajos = m.doctores.filter(d => d.ocupacion !== null && d.ocupacion < S.OCUPACION_BAJA).map(d => `${d.nombre} (${porcentaje(d.ocupacion!, 0)})`)
      out.push({
        id: 'ocupacion-baja', nivel: 'atencion', titulo: `Ocupación de agenda baja (${porcentaje(a.ocupacion, 0)})`,
        detalle: bajos.length ? `Bajo ${porcentaje(S.OCUPACION_BAJA, 0)}: ${bajos.join(', ')}.` : 'Hay más horas disponibles que pacientes.',
        acciones: [
          'Concentra los horarios de los doctores con poca demanda en menos días (menos costo fijo, agenda más llena).',
          'Dirige marketing a los tratamientos de esos especialistas.',
        ],
        impacto: null, ancla: 'doctores',
      })
    } else if (a.ocupacion >= S.OCUPACION_ALTA) {
      out.push({
        id: 'ocupacion-alta', nivel: 'oportunidad', titulo: `Agenda casi llena (${porcentaje(a.ocupacion, 0)})`,
        detalle: 'Con alta demanda, el ingreso ya no crece agendando más; crece con más horas o mejor precio.',
        acciones: [
          'Evalúa abrir más bloques horarios o sumar un profesional en la especialidad más demandada.',
          'Revisa el arancel: con demanda alta hay espacio para ajustar precios.',
          'Prioriza tratamientos de mayor valor por hora.',
        ],
        impacto: null, ancla: 'doctores',
      })
    }
  }

  // 8. Pacientes para recontactar
  if (e.recontactar >= 10) {
    out.push({
      id: 'recontactar', nivel: 'oportunidad',
      titulo: `${e.recontactar} pacientes no vuelven hace más de 6 meses`,
      detalle: 'Fueron atendidos entre 6 y 18 meses atrás y no tienen cita agendada.',
      acciones: [
        'Envía 20 WhatsApp diarios invitando a control y limpieza (lista "Pacientes para recontactar").',
        'Ofrece la limpieza como puerta de entrada: suele generar nuevos presupuestos.',
      ],
      impacto: e.recontactar * S.RETORNO_RECONTACTO * (m.dinero.ticketPromedio || 0), ancla: 'comercial',
    })
  }

  // 9. Conversión de presupuestos
  const c = m.comercial
  if (c.creados >= 5 && c.conversion < 0.4) {
    out.push({
      id: 'conversion', nivel: 'atencion', titulo: `Solo ${porcentaje(c.conversion, 0)} de los presupuestos se aprueba`,
      detalle: `${c.aprobados} de ${c.creados} presupuestos del mes. Llevarla a ${porcentaje(S.CONVERSION_OBJETIVO, 0)} sumaría ventas importantes.`,
      acciones: [
        'Explica el presupuesto en persona con el odontograma, no solo lo entregues impreso.',
        'Presenta 2 alternativas (ej. implante vs. prótesis) en vez de un solo plan.',
        'Ofrece cuotas y empezar por lo urgente.',
      ],
      impacto: Math.max(0, S.CONVERSION_OBJETIVO - c.conversion) * c.montoCotizado, ancla: 'comercial',
    })
  }

  // 10. Recaudación vs. mes anterior (en el mes en curso, contra el mismo día del mes anterior)
  if (prev && prev.dinero.recaudacion > 0) {
    const v = variacion(m.dinero.recaudacion, prev.dinero.recaudacion)
    const contra = e.esMesActual ? `al día ${e.hoy.getDate()} del mes anterior` : 'el mes anterior'
    const anual = e.recaudacionAnioAnterior ? ` Mismo periodo del año pasado: ${money(e.recaudacionAnioAnterior)}.` : ''
    if (v !== null && v <= -10) {
      out.push({
        id: 'caida', nivel: 'atencion',
        titulo: `La recaudación va ${Math.abs(v)}% bajo ${contra}`,
        detalle: `${money(m.dinero.recaudacion)} vs. ${money(prev.dinero.recaudacion)}.${anual}`,
        acciones: ['Compara citas, ausencias y conversión contra el mismo periodo para encontrar la causa (abajo están las variaciones).'],
        impacto: prev.dinero.recaudacion - m.dinero.recaudacion, ancla: 'resumen',
      })
    } else if (v !== null && v >= 10) {
      out.push({ id: 'crecimiento', nivel: 'bien', titulo: `Recaudación ${v}% sobre ${contra}`, detalle: `${money(m.dinero.recaudacion)} vs. ${money(prev.dinero.recaudacion)}.${anual}`, acciones: ['Identifica qué funcionó este mes para repetirlo.'], impacto: null, ancla: 'resumen' })
    }

    // Ticket promedio
    const vt = variacion(m.dinero.ticketPromedio, prev.dinero.ticketPromedio)
    if (vt !== null && vt <= -10 && m.pacientes.atendidos >= 20) {
      out.push({
        id: 'ticket', nivel: 'atencion', titulo: `Ticket promedio bajó ${Math.abs(vt)}%`,
        detalle: `${money(m.dinero.ticketPromedio)} por paciente vs. ${money(prev.dinero.ticketPromedio)} el mes anterior.`,
        acciones: [
          'En cada control, revisa el odontograma y ofrece los tratamientos pendientes.',
          'Arma combos (limpieza + destartraje + blanqueamiento) con precio conveniente.',
        ],
        impacto: Math.abs(m.dinero.ticketPromedio - prev.dinero.ticketPromedio) * m.pacientes.atendidos, ancla: 'ventas',
      })
    }
  }

  const d = m.dinero
  if (!m.filtrado && d.produccion > 0) {
    // 11. Margen de la clínica
    if (d.margenPct < S.MARGEN_BAJO) {
      out.push({
        id: 'margen', nivel: 'atencion', titulo: `Margen de la clínica bajo (${porcentaje(d.margenPct, 0)} de la producción)`,
        detalle: `Honorarios ${money(d.honorarios)} y laboratorio ${money(d.lab)} sobre ${money(d.produccion)} producidos.`,
        acciones: [
          'Revisa las prestaciones con reparto "100% doctor" o porcentaje forzado.',
          'Revisa los precios de tratamientos con laboratorio: deben cubrir el costo y el honorario.',
        ],
        impacto: null, ancla: 'doctores',
      })
    }
    // 12. Laboratorio
    if (d.ventaConLab > 0 && ratio(d.lab, d.ventaConLab) > 0.4) {
      out.push({
        id: 'laboratorio', nivel: 'atencion', titulo: `El laboratorio se lleva ${porcentaje(ratio(d.lab, d.ventaConLab), 0)} de lo cobrado en esos tratamientos`,
        detalle: `${money(d.lab)} de costo sobre ${money(d.ventaConLab)} cobrados.`,
        acciones: ['Cotiza con otro laboratorio o renegocia precios por volumen.', 'Ajusta el precio de coronas y prótesis en el arancel.'],
        impacto: (ratio(d.lab, d.ventaConLab) - 0.35) * d.ventaConLab, ancla: 'dinero',
      })
    }
    // 13. Egresos
    if (d.recaudacion > 0 && ratio(d.egresos, d.recaudacion) > S.EGRESOS_ALTOS) {
      const mayor = d.egresosPorCategoria[0]
      out.push({
        id: 'egresos', nivel: 'atencion', titulo: `Los gastos son ${porcentaje(ratio(d.egresos, d.recaudacion), 0)} de lo recaudado`,
        detalle: mayor ? `El mayor gasto es ${mayor.name}: ${money(mayor.value)}.` : '',
        acciones: ['Revisa los gastos de la categoría más alta y renegocia contratos o proveedores.'],
        impacto: null, ancla: 'dinero',
      })
    }
    // 14. Dependencia de un doctor
    const conProd = m.doctores.filter(x => x.produccion > 0)
    if (conProd.length >= 2 && ratio(conProd[0].produccion, d.produccion) > S.DEPENDENCIA_DOCTOR) {
      out.push({
        id: 'dependencia', nivel: 'atencion', titulo: `${conProd[0].nombre} genera ${porcentaje(ratio(conProd[0].produccion, d.produccion), 0)} de la producción`,
        detalle: 'Si ese profesional se ausenta o se va, los ingresos caen de golpe.',
        acciones: ['Deriva pacientes a otros profesionales de la misma área.', 'Potencia la agenda del resto con marketing dirigido.'],
        impacto: null, ancla: 'doctores',
      })
    }
  }

  // 16. Espera
  if (a.espera !== null && a.espera > S.ESPERA_ALTA) {
    const lentos = m.doctores.filter(x => x.espera !== null && x.espera > S.ESPERA_ALTA).sort((x, y) => y.espera! - x.espera!).slice(0, 3)
    out.push({
      id: 'espera', nivel: 'atencion', titulo: `Espera promedio de ${Math.round(a.espera)} min`,
      detalle: lentos.length ? `Mayor espera: ${lentos.map(x => `${x.nombre} (${Math.round(x.espera!)} min)`).join(', ')}.` : '',
      acciones: ['Ajusta la duración de las citas de esos doctores y evita sobrecupos en sus horas punta.', 'La espera larga baja las reseñas y la tasa de retorno.'],
      impacto: null, ancla: 'agenda',
    })
  }

  // 17. Horas valle
  const horario = a.demandaPorHora.filter(h => { const n = Number(h.name.slice(0, 2)); return n >= 9 && n <= 19 })
  if (horario.length >= 5) {
    const max = Math.max(...horario.map(h => h.value))
    const valles = horario.filter(h => h.value < max * 0.4).map(h => h.name)
    if (valles.length) {
      out.push({
        id: 'valle', nivel: 'oportunidad', titulo: `Horas con poca demanda: ${valles.join(', ')}`,
        detalle: 'Tienen menos de la mitad de las citas de la hora más pedida.',
        acciones: ['Agenda ahí controles, limpiezas y pacientes recontactados.', 'Ofrece un precio especial o promoción solo en esos horarios.'],
        impacto: null, ancla: 'agenda',
      })
    }
  }

  // 18. Canal online
  if (a.webPendientes > 0) {
    out.push({ id: 'web-pendientes', nivel: 'atencion', titulo: `${a.webPendientes} cita${a.webPendientes > 1 ? 's' : ''} online sin confirmar`, detalle: 'Pacientes que pidieron hora por la web y esperan respuesta.', acciones: ['Confírmalas hoy desde la agenda (botón Citas Web): un paciente que espera se va a otra clínica.'], impacto: null, ancla: 'agenda' })
  }
  if (a.citas >= 50 && ratio(a.citasWeb, a.citas) < 0.1) {
    out.push({
      id: 'web', nivel: 'oportunidad', titulo: `Solo ${porcentaje(ratio(a.citasWeb, a.citas), 0)} de las citas llega por la web`,
      detalle: 'El agendamiento online trae pacientes nuevos sin carga para recepción.',
      acciones: ['Pon el link de agendamiento en Instagram, WhatsApp Business y Google Maps.'], impacto: null, ancla: 'agenda',
    })
  }

  // 19. Costo por paciente nuevo
  if (m.pacientes.costoPorNuevo !== null && d.ticketPromedio > 0 && m.pacientes.costoPorNuevo > d.ticketPromedio * 0.5) {
    out.push({
      id: 'marketing', nivel: 'atencion', titulo: `Cada paciente nuevo cuesta ${money(m.pacientes.costoPorNuevo)} en marketing`,
      detalle: `Es más de la mitad del ticket promedio (${money(d.ticketPromedio)}).`,
      acciones: ['Mide qué canal trae pacientes (pregunta "¿cómo nos conociste?") y corta el que no rinde.', 'Pide reseñas en Google a los pacientes atendidos: es marketing gratis.'],
      impacto: null, ancla: 'pacientes',
    })
  }

  // 20. Categoría estrella
  const estrella = m.ventas.categorias[0]
  const totalCat = m.ventas.categorias.reduce((s, x) => s + x.value, 0)
  if (estrella && totalCat > 0 && ratio(estrella.value, totalCat) > 0.25) {
    out.push({
      id: 'estrella', nivel: 'bien', titulo: `${estrella.name} es tu categoría más fuerte (${porcentaje(ratio(estrella.value, totalCat), 0)} de las ventas)`,
      detalle: `${money(estrella.value)} este mes.`,
      acciones: ['Destácala en redes y en la sala de espera; asegura agenda suficiente para esa especialidad.'], impacto: null, ancla: 'ventas',
    })
  }

  return out.sort((x, y) => ORDEN[x.nivel] - ORDEN[y.nivel] || (y.impacto || 0) - (x.impacto || 0))
}

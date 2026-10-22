// Panel de Seguimiento: configuración de las reglas.
// Todo lo que está aquí se puede ajustar sin tocar el resto del código.

export const CONFIG = {
  // Quién puede entrar al panel (es_admin también entra)
  ROLES_PERMITIDOS: ['ADMIN', 'RECEPCIONISTA'],
  // Minutos que se reutilizan los datos históricos (planes, prestaciones, citas pasadas) al volver al panel.
  // Las horas agendadas y los contactos se vuelven a pedir siempre.
  MINUTOS_CACHE: 30,
  // Filas que se muestran de cada lista antes de "Ver más"
  FILAS_POR_PAGINA: 40,

  // Estados de cita que NO cuentan como "tiene hora agendada"
  ESTADOS_CITA_INACTIVA: ['cancelada', 'no_asiste', 'reprogramada'],
  // Estados de prestación que cuentan como realizada (mismo criterio que la ficha de tratamiento)
  ESTADOS_ITEM_REALIZADO: ['realizado', 'atendido', 'terminado', 'finalizado', 'completado'],

  // ── Evaluaciones de implantes (página "Evaluaciones de implantes") ──
  EVAL_IMPLANTES: {
    // Una cita (por su motivo) o una prestación cargada es "evaluación de implantes" si dice implante
    // y además alguna de las palabras de evaluación (sin tildes; basta con el comienzo de la palabra)
    palabrasImplante: ['IMPLANT'],
    palabrasEvaluacion: ['EVAL', 'VALORA', 'PRIMERA', 'DIAGN', 'CONSULTA', 'PLANIFICA'],
    // Período que se muestra al abrir la página
    mesesPorDefecto: 6,
    // Qué presupuesto cuenta como resultado de la evaluación (cualquier tratamiento, no solo implantes):
    // los presupuestos creados desde N días antes de la primera evaluación...
    diasPresupuestoAntes: 3,
    // ...y si incluye implante, desde N días antes (a veces el presupuesto de implante se hace antes de la cita)
    diasPresupuestoImplanteAntes: 90,
    // Prestaciones que no cuentan como "tratamiento presupuestado" (exámenes, evaluaciones, certificados)
    // Palabras de 3 letras o menos tienen que aparecer como palabra completa (RX)
    noEsTratamiento: ['RADIOGRAF', 'RX', 'PANORAMICA', 'SCANNER', 'CBCT', 'EVAL', 'VALORA', 'CONSULTA', 'DIAGN', 'CERTIFICADO', 'PLANIFICA'],
  },

  // ── Implantes ──
  IMPLANTES: {
    palabras: ['IMPLANT', 'FIXTURE', 'OSEOINTEGR'],
    // Prestaciones con "implante" en el nombre que NO son la cirugía
    excluir: ['CORONA', 'PILAR', 'ADITAMENTO', 'PROTESIS', 'SOBREDENTADURA', 'HIBRIDA', 'RETIRO', 'EXPLANT', 'MANTENCION', 'CONTROL',
      'EVALUACION', 'PLANIFICACION', 'GUIA', 'SCANNER', 'CBCT', 'RADIOGRAF', 'TORNILLO', 'CICATRIZ', 'ANALOGO', 'TRANSFER', 'DESCUBRIMIENTO', 'LIMPIEZA'],
    // Trabajos que completan un implante (en la misma pieza, o que digan "implante")
    rehabilitacion: ['CORONA', 'PILAR', 'ADITAMENTO', 'PROTESIS', 'SOBREDENTADURA', 'HIBRIDA', 'PUENTE'],
    mesesAtras: 18,
    diasControlPostOperatorio: 30, // hasta este día después de la cirugía se pide el control post-operatorio
    diasParaCorona: 90,            // desde este día está "listo para corona"
  },

  // ── Endodoncias ──
  ENDODONCIAS: {
    palabras: ['ENDODON', 'PULPECTOM', 'CONDUCTO'],
    excluir: ['URGENCIA', 'TREPANACION', 'PULPOTOM'],
    rehabilitacion: ['CORONA', 'INCRUST', 'ONLAY', 'OVERLAY', 'ENDOCORONA', 'PERNO', 'MUNON', 'RESTAURACION', 'RESINA', 'OBTURACION', 'AMALGAMA', 'CARILLA'],
    mesesAtras: 12,
    diasMinimos: 7,          // se deja una semana antes de llamar por la restauración
    diasRiesgo: 30,          // desde aquí se marca "riesgo de fractura"
    diasSinTerminar: 14,     // endodoncia a medias sin avanzar en este tiempo
  },

  // ── Extracciones ──
  EXTRACCIONES: {
    palabras: ['EXODON', 'EXTRACC'],
    // No se ofrece reponer: dientes de leche, terceros molares, piezas incluidas, etc.
    excluir: ['TEMPORAL', 'DECIDU', 'TERCER', 'CORDAL', 'INCLUID', 'SUPERNUMER', 'LECHE'],
    piezasExcluidas: [18, 28, 38, 48],
    rehabilitacion: ['IMPLANT', 'PROTESIS', 'PUENTE', 'REMOVIBLE', 'SOBREDENTADURA', 'HIBRIDA', 'ACRILICA', 'METALICA'],
    mesesAtras: 24,
    diasMinimos: 21, // tiempo de cicatrización antes de ofrecer el implante o prótesis
  },

  // ── Ortodoncia ──
  ORTODONCIA: {
    palabras: ['ORTODON', 'BRACKET', 'ALINEADOR', 'FRENILLO', 'ORTOPEDIA'],
    excluir: ['EVALUACION', 'ESTUDIO', 'CONTENCION', 'RETIRO'],
    mesesAtras: 36,
    diasControl: 35,     // control mensual: desde aquí está atrasado
    diasAbandono: 90,    // desde aquí se considera que dejó los controles
    mesesSinActividad: 18, // si no hubo evolución ni visita en este tiempo, se deja fuera (tratamiento antiguo)
  },

  // ── Limpiezas y periodoncia ──
  HIGIENE: {
    limpieza: ['LIMPIEZA', 'DESTARTRAJE', 'PROFILAXIS', 'PULIDO CORONARIO'],
    periodoncia: ['PERIODON', 'RASPAJE', 'PULIDO RADICULAR', 'CURETAJE'],
    mesesLimpieza: 6,      // control y limpieza cada 6 meses
    mesesPeriodoncia: 4,   // mantención periodontal cada 3–4 meses
    mesesAtras: 24,        // más allá de esto el paciente ya está en "inactivos"
  },

  // ── Presupuestos por cerrar ──
  POR_CERRAR: {
    dias: 120,
    montoMinimo: 80_000,
    maxFilas: 400,
    // Palabras que dejan fuera un presupuesto (radiografías, evaluaciones, certificados…)
    excluir: ['radiograf', 'rx', 'panoramica', 'scanner', 'cbct', 'evaluacion', 'consulta', 'certificado'],
  },

  // ── Tratamientos detenidos (aprobados o con abono, sin terminar) ──
  DETENIDOS: {
    mesesAtras: 18,
    diasSinVisita: 30, // si vino hace menos de esto, se asume que el tratamiento sigue su curso
  },

  // ── Evaluados sin presupuesto ──
  EVALUADOS: {
    motivos: ['EVALUA', 'PRIMERA', 'DIAGNOST', 'CONSULTA', 'URGENCIA'],
    dias: 60,
  },

  // ── Otras listas ──
  SALDO_A_FAVOR_MINIMO: 5_000,
  POR_COBRAR_ALTO: 300_000,   // desde este saldo se marca en rojo
  NO_ASISTIO_DIAS: 60,
  ANULADAS_DIAS_ATRAS: 30,
  INACTIVO_MESES_DESDE: 6,
  INACTIVO_MESES_HASTA: 18,
  CUMPLEANOS_DIAS_ANTES: 2,   // también saluda a quien estuvo de cumpleaños hace 1–2 días
  CUMPLEANOS_DIAS_DESPUES: 7,
  // Texto opcional que se agrega al saludo de cumpleaños (ej. un descuento). Vacío = sin regalo.
  CUMPLEANOS_REGALO: '',
  RESENA_DIAS: 3,             // pedir reseña a quien se atendió en los últimos N días

  // ── Agenda ──
  DIAS_OCUPACION: 7,
}

// Grupos y listas del panel. El orden aquí es el orden en pantalla.
export type IdLista =
  | 'implantes' | 'endodoncias' | 'extracciones' | 'ortodoncia' | 'higiene'
  | 'detenidos' | 'por_cerrar' | 'evaluados' | 'saldo_favor'
  | 'por_cobrar'
  | 'no_asistio' | 'anulo' | 'inactivos'
  | 'cumpleanos' | 'resena'

export interface DefLista {
  id: IdLista
  grupo: string
  titulo: string
  descripcion: string
  consejo: string
  // false: aparece aunque el paciente ya tenga hora (saludos, reseñas, cobros)
  ocultarConHora: boolean
}

export const LISTAS: DefLista[] = [
  {
    id: 'implantes', grupo: 'Seguimiento clínico', titulo: 'Implantes sin hora', ocultarConHora: true,
    descripcion: 'Pacientes con implante instalado que no tienen hora: falta el control post-operatorio o la etapa de corona.',
    consejo: 'Pregunta cómo se ha sentido. El control es parte del tratamiento; si ya pasaron 3 meses, agenda la corona.',
  },
  {
    id: 'endodoncias', grupo: 'Seguimiento clínico', titulo: 'Endodoncias sin terminar', ocultarConHora: true,
    descripcion: 'Tratamientos de conducto a medias, o terminados sin corona ni restauración en esa pieza.',
    consejo: 'Explica que un diente con endodoncia sin restaurar se puede fracturar. Es una urgencia clínica, no solo una venta.',
  },
  {
    id: 'extracciones', grupo: 'Seguimiento clínico', titulo: 'Extracciones sin reponer', ocultarConHora: true,
    descripcion: 'Se sacaron piezas (sin contar muelas del juicio ni dientes de leche) y no se ha hecho implante ni prótesis.',
    consejo: 'Ofrece una evaluación para implante o prótesis. Si ya está presupuestado, recuérdale el valor y las facilidades de pago.',
  },
  {
    id: 'ortodoncia', grupo: 'Seguimiento clínico', titulo: 'Ortodoncia sin control', ocultarConHora: true,
    descripcion: 'Pacientes en tratamiento de ortodoncia que no vienen a su control mensual y no tienen hora.',
    consejo: 'Los controles atrasados alargan el tratamiento. Ofrece horas fijas (mismo día y hora cada mes).',
  },
  {
    id: 'higiene', grupo: 'Seguimiento clínico', titulo: 'Limpieza y mantención', ocultarConHora: true,
    descripcion: 'Les toca su limpieza semestral, o su mantención periodontal cada 3–4 meses.',
    consejo: 'Es la forma más fácil de llenar huecos de agenda. Ofrece las horas libres de esta semana.',
  },
  {
    id: 'detenidos', grupo: 'Ventas', titulo: 'Tratamientos detenidos', ocultarConHora: true,
    descripcion: 'Planes aprobados o con abonos que tienen prestaciones pendientes y el paciente dejó de venir.',
    consejo: 'Primero los que ya pagaron: es dinero recibido por trabajo que falta hacer. Agenda su próxima sesión.',
  },
  {
    id: 'por_cerrar', grupo: 'Ventas', titulo: 'Presupuestos por cerrar', ocultarConHora: true,
    descripcion: 'Presupuestos recientes que el paciente no ha aprobado ni abonado.',
    consejo: 'Llama en los primeros 7 días. Resuelve dudas, ofrece pago en cuotas o empezar por la etapa más urgente.',
  },
  {
    id: 'evaluados', grupo: 'Ventas', titulo: 'Evaluados sin presupuesto', ocultarConHora: true,
    descripcion: 'Vinieron a evaluación, consulta o urgencia y no tienen ningún presupuesto después de esa cita.',
    consejo: 'Revisa con el doctor si falta cargar el presupuesto y luego contacta al paciente para presentárselo.',
  },
  {
    id: 'saldo_favor', grupo: 'Ventas', titulo: 'Saldo a favor sin usar', ocultarConHora: true,
    descripcion: 'Pacientes con dinero abonado en la clínica que no tienen hora para usarlo.',
    consejo: 'Es dinero que ya está en la clínica: agendar es fácil y convierte el abono en atención.',
  },
  {
    id: 'por_cobrar', grupo: 'Cobranza', titulo: 'Saldos por cobrar', ocultarConHora: false,
    descripcion: 'Prestaciones ya realizadas que no están pagadas completas (mismo cálculo que el Panel de Desempeño).',
    consejo: 'Si tiene hora próxima, cóbralo en la visita. Si no, ofrece transferencia o pago en cuotas.',
  },
  {
    id: 'no_asistio', grupo: 'Agenda', titulo: 'No asistió y no reagendó', ocultarConHora: true,
    descripcion: 'Faltaron a su cita en los últimos 60 días y no han vuelto ni tienen otra hora.',
    consejo: 'Sin retarlos: ofrece una nueva hora. A quien falta seguido, pide confirmación el día anterior.',
  },
  {
    id: 'anulo', grupo: 'Agenda', titulo: 'Anuló y no reagendó', ocultarConHora: true,
    descripcion: 'Su hora quedó anulada (en el último mes o próximamente) y no tienen otra hora.',
    consejo: 'Contacta el mismo día de la anulación: es cuando más fácil se reagenda.',
  },
  {
    id: 'inactivos', grupo: 'Agenda', titulo: 'Pacientes inactivos', ocultarConHora: true,
    descripcion: 'Su última atención fue hace 6 a 18 meses y no han vuelto ni tienen hora.',
    consejo: 'Invita a un control y limpieza. Ideal para campañas por WhatsApp en semanas con poca agenda.',
  },
  {
    id: 'cumpleanos', grupo: 'Fidelización', titulo: 'Cumpleaños', ocultarConHora: false,
    descripcion: 'Pacientes atendidos en el último año que están de cumpleaños estos días.',
    consejo: 'Un saludo cercano. Si la clínica tiene un regalo (ej. descuento en limpieza), configúralo en CUMPLEANOS_REGALO.',
  },
  {
    id: 'resena', grupo: 'Fidelización', titulo: 'Pedir reseña y referidos', ocultarConHora: false,
    descripcion: 'Pacientes atendidos en los últimos días: el mejor momento para pedir una reseña en Google y que recomienden la clínica.',
    consejo: 'Las reseñas traen pacientes nuevos. Pide la reseña solo una vez por paciente (queda registrado).',
  },
]

export const GRUPOS = [...new Set(LISTAS.map(l => l.grupo))]

// Resultados de un contacto y cuántos días el paciente deja de aparecer en las listas
export const RESULTADOS = [
  { id: 'whatsapp', texto: 'WhatsApp enviado', dias: 5 },
  { id: 'agendo', texto: 'Agendó hora', dias: 30 },
  { id: 'lo_pensara', texto: 'Lo va a pensar', dias: 10 },
  { id: 'no_contesta', texto: 'No contesta', dias: 2 },
  { id: 'no_interesado', texto: 'No le interesa', dias: 120 },
  { id: 'telefono_malo', texto: 'Teléfono malo', dias: 60 },
  { id: 'resena', texto: 'Se pidió reseña', dias: 365 },
] as const

export type IdResultado = typeof RESULTADOS[number]['id']

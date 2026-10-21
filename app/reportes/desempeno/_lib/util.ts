// Utilidades y configuración del Panel de Desempeño

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN (ajusta aquí las reglas del negocio)
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  // Quién puede ver el panel
  ROLES_PERMITIDOS: ['ADMIN'],
  // Metas de ventas del mes y su bono (de menor a mayor)
  METAS_VENTAS: [
    { monto: 28_000_000, bono: 100_000 },
    { monto: 35_000_000, bono: 150_000 },
    { monto: 40_000_000, bono: 220_000 },
  ],
  // Qué cuenta como "venta" para la meta: 'recaudacion' (dinero que entró) o 'produccion' (prestaciones pagadas + atenciones)
  BASE_META_VENTAS: 'recaudacion' as 'recaudacion' | 'produccion',
  // Comisión si el doctor no tiene porcentaje_comision
  COMISION_POR_DEFECTO: 40,
  // true: el % del doctor se calcula sobre (pago - laboratorio). false: sobre el pago completo
  HONORARIO_SOBRE_NETO_DE_LAB: false, // false = misma regla que la página de Liquidación
  // true si los pagos a doctores YA se registran en Egresos (ej. "Sueldos"); así no se descuentan dos veces
  HONORARIOS_INCLUIDOS_EN_EGRESOS: false,
  // Presupuestos sin aprobar de los últimos N días que se muestran "por cerrar"
  DIAS_PRESUPUESTO_POR_CERRAR: 90,
  // Monto mínimo para que un presupuesto aparezca "por cerrar" (deja fuera radiografías y presupuestos chicos)
  MONTO_MIN_POR_CERRAR: 150000,
  // Palabras que excluyen un presupuesto de "por cerrar" aunque supere el monto
  EXCLUIR_POR_CERRAR: ['radiograf', 'rx', 'panoramica', 'scanner', 'cbct', 'evaluacion', 'consulta', 'certificado'],
  // Estados de cita que cuentan como "el paciente vino" (para la antigüedad de los presupuestos por cerrar)
  ESTADOS_CITA_VINO: ['atendido', 'atendiendose', 'en_espera'],
  // Máximo de filas que se traen para cada lista de contacto (ahorra transferencia de datos)
  MAX_FILAS_LISTA: 150,
  // Minutos que se reutilizan los datos generales antes de volver a pedirlos a Supabase
  MINUTOS_CACHE: 30,
  // Pacientes a recontactar: última atención entre N y M meses atrás, sin cita futura
  MESES_INACTIVO_DESDE: 6,
  MESES_INACTIVO_HASTA: 18,
  ESTADOS_ITEM_TERMINADO: ['realizado', 'atendido', 'terminado', 'finalizado', 'completado'],
  // Carpetas (categorías de prestaciones) que cuentan como RX. Solo se mira la categoría, no el nombre,
  // así las promociones de limpieza con bitewing u otras prestaciones que mencionan "rx" no se cuentan como RX.
  CATEGORIAS_RX: ['RADIOGRAFIAS'],
  // Carpetas cuyo pago completo cuenta como Laboratorio (insumos, cepillos, trabajos de laboratorio, etc.).
  // En las demás carpetas solo cuenta como laboratorio el "costo de laboratorio" cargado en la prestación.
  CATEGORIAS_LABORATORIO: ['LABORATORIOS', 'LABORATORIO'],
}

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// ── Formatos ──
export const money = (v: number) => `$${Math.round(v || 0).toLocaleString('es-CL')}`
export function moneyCorto(v: number) {
  const a = Math.abs(v || 0)
  if (a >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`
  if (a >= 1_000) return `$${Math.round(v / 1_000)} mil`
  return `$${Math.round(v || 0)}`
}
export const porcentaje = (v: number, dec = 1) => `${(Math.round(v * 100 * 10 ** dec) / 10 ** dec).toLocaleString('es-CL')}%`
export const ratio = (a: number, b: number) => (b ? a / b : 0)
export function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null
  return Math.round(((actual - anterior) / anterior) * 100)
}
export const horas = (min: number) => `${(Math.round((min / 60) * 10) / 10).toLocaleString('es-CL')} h`

// ── Fechas ──
const dos = (n: number) => String(n).padStart(2, '0')
export const fechaISO = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`

// Columnas "timestamp without time zone" (citas, atenciones) vienen como hora local sin zona
export const fechaLocal = (s: string) => new Date(String(s).replace(' ', 'T').replace(/(\.\d+)?(Z|[+-]\d\d:?\d\d)$/, ''))
export const fechaCorta = (d: Date) => d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })

// Fecha de una columna con zona horaria o solo fecha ("2025-03-12", "2025-03-12 10:00:00+00", ISO...). null si no es válida.
export function leerFecha(v: any): Date | null {
  if (!v) return null
  const s = String(v).trim().replace(' ', 'T')
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date(s.replace(/(T[\d:.]+[+-]\d\d)$/, '$1:00'))
  return Number.isNaN(d.getTime()) || d.getFullYear() < 2000 ? null : d
}

// ── Antigüedad de los presupuestos por cerrar ──
// Se mide desde la última vez que el paciente vino a la clínica (cita atendida).
// Si nunca vino, desde la fecha del presupuesto (la más antigua entre fecha_creacion y created_at:
// los presupuestos traídos de otro sistema pueden tener created_at del día en que se cargaron).
export type TramoAntiguedad = 'todos' | 'mes' | 'trimestre' | 'anio' | 'antiguo'
export const TRAMOS_ANTIGUEDAD: { id: TramoAntiguedad; texto: string }[] = [
  { id: 'todos', texto: 'Todos' },
  { id: 'mes', texto: 'Hasta 1 mes' },
  { id: 'trimestre', texto: '1 a 3 meses' },
  { id: 'anio', texto: '3 a 12 meses' },
  { id: 'antiguo', texto: 'Más de 1 año' },
]

export function fechaPresupuesto(p: any): Date | null {
  const fechas = [leerFecha(p?.fecha_creacion), leerFecha(p?.created_at)].filter((d): d is Date => !!d)
  return fechas.length ? new Date(Math.min(...fechas.map(d => d.getTime()))) : null
}

export function antiguedadPorCerrar(p: any, ahora: Date): { dias: number | null; desdeVisita: boolean; tramo: Exclude<TramoAntiguedad, 'todos'> } {
  const visita = p?.ultima_visita ? fechaLocal(p.ultima_visita) : null
  const ref = visita && !Number.isNaN(visita.getTime()) ? visita : fechaPresupuesto(p)
  const dias = ref ? Math.max(0, Math.floor((ahora.getTime() - ref.getTime()) / 86400000)) : null
  const tramo = dias === null || dias > 365 ? 'antiguo' : dias <= 30 ? 'mes' : dias <= 90 ? 'trimestre' : 'anio'
  return { dias, desdeVisita: !!visita, tramo }
}

export function haceTiempo(dias: number): string {
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  if (dias < 365) { const m = Math.max(1, Math.round(dias / 30.4)); return `hace ${m} ${m === 1 ? 'mes' : 'meses'}` }
  const a = Math.floor(dias / 365)
  return `hace ${a} ${a === 1 ? 'año' : 'años'}`
}
export const minsDeHora = (h: string | null | undefined) => {
  if (!h) return 0
  const [hh, mm] = h.split(':').map(Number)
  return hh * 60 + (mm || 0)
}

export interface Rango {
  anio: number
  mes: number // 1-12
  desdeTz: string // para columnas con zona horaria (pagos, cajas, egresos, presupuestos)
  hastaTz: string // exclusivo
  desdeLocal: string // para columnas sin zona (citas, atenciones)
  hastaLocal: string // exclusivo
  desdeFecha: string
  hastaFecha: string // exclusivo
  dias: number
}

// Mes completo en hora de Chile (el fin es exclusivo: primer instante del mes siguiente)
export function rangoMes(anio: number, mes: number): Rango {
  const ini = new Date(anio, mes - 1, 1)
  const fin = new Date(anio, mes, 1)
  return {
    anio, mes,
    desdeTz: ini.toISOString(), hastaTz: fin.toISOString(),
    desdeLocal: `${fechaISO(ini)} 00:00:00`, hastaLocal: `${fechaISO(fin)} 00:00:00`,
    desdeFecha: fechaISO(ini), hastaFecha: fechaISO(fin),
    dias: new Date(anio, mes, 0).getDate(),
  }
}
// Mismo día y hora dentro de otro mes (si ese mes es más corto, su último día)
export function corteEquivalente(anio: number, mes: number, ahora: Date): Date {
  const dias = new Date(anio, mes, 0).getDate()
  return new Date(anio, mes - 1, Math.min(ahora.getDate(), dias), ahora.getHours(), ahora.getMinutes(), ahora.getSeconds())
}

// Mes cortado en un momento (para comparar "al mismo día" contra el mes en curso)
export function rangoMesHasta(anio: number, mes: number, corte: Date): Rango {
  const base = rangoMes(anio, mes)
  if (corte >= new Date(anio, mes, 1)) return base
  const diaSiguiente = new Date(corte.getFullYear(), corte.getMonth(), corte.getDate() + 1)
  const hora = `${dos(corte.getHours())}:${dos(corte.getMinutes())}:${dos(corte.getSeconds())}`
  return { ...base, hastaTz: corte.toISOString(), hastaLocal: `${fechaISO(corte)} ${hora}`, hastaFecha: fechaISO(diaSiguiente), dias: corte.getDate() }
}

export const mesAnterior = (anio: number, mes: number) => (mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 })

// Días hábiles (lunes a sábado) del mes y cuántos ya pasaron (incluye hoy)
export function diasHabiles(r: Rango, ahora: Date) {
  let total = 0, transcurridos = 0
  for (let d = 1; d <= r.dias; d++) {
    const f = new Date(r.anio, r.mes - 1, d)
    if (f.getDay() === 0) continue
    total++
    if (f <= ahora) transcurridos++
  }
  return { total, transcurridos }
}

// ── Textos ──
export const nombreCompleto = (p: any) => (p ? `${p.nombre || ''} ${p.apellido || ''}`.trim() : 'Paciente sin ficha')
// El nombre de la prestación puede traer metadatos ("RESINA | Fase: ... | Dcto: ...")
export const limpiarNombrePrestacion = (s: any) => String(s || '').split(' | ')[0].trim()
export const normalizar = (v: any) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// ¿Es una radiografía? Solo si la prestación está en la carpeta RADIOGRAFIAS
const CATEGORIAS_RX_NORM = CONFIG.CATEGORIAS_RX.map(c => normalizar(c))
export const esRx = (categoria: any) => CATEGORIAS_RX_NORM.includes(normalizar(categoria))
const CATEGORIAS_LAB_NORM = CONFIG.CATEGORIAS_LABORATORIO.map(c => normalizar(c))
export const esCarpetaLab = (categoria: any) => CATEGORIAS_LAB_NORM.includes(normalizar(categoria))

export const esSaldoAFavor = (pago: any) => normalizar(pago?.metodo_pago).includes('saldo')
export const esCitaWeb = (cita: any) => normalizar(cita?.motivo).includes('online')
export const esWebPendiente = (cita: any) => cita?.estado_confirmacion === 'pendiente' && esCitaWeb(cita)

export function medioDePago(metodo: any): 'efectivo' | 'tarjeta' | 'transferencia' | 'otro' {
  const m = normalizar(metodo)
  if (m.includes('efectivo')) return 'efectivo'
  if (m.includes('transfer')) return 'transferencia'
  if (m.includes('tarjeta') || m.includes('debito') || m.includes('credito') || m.includes('transbank') || m.includes('redcompra')) return 'tarjeta'
  return 'otro'
}

// Costo de laboratorio proporcional a lo pagado del ítem
export function labProporcional(monto: number, item: any) {
  const precio = Number(item?.precio_pactado || 0)
  const lab = Number(item?.costo_laboratorio || 0)
  if (!lab || monto <= 0) return 0
  if (!precio) return Math.min(lab, monto)
  return lab * Math.min(1, monto / precio)
}

// ── WhatsApp (mismo criterio que la agenda) ──
export function telefonoWA(tel: any): string | null {
  let n = String(tel || '').replace(/\D/g, '')
  if (n.length === 9) n = `56${n}`
  else if (n.length === 8) n = `569${n}`
  return n.length >= 11 ? n : null
}
export function abrirWhatsApp(tel: any, mensaje: string): boolean {
  const n = telefonoWA(tel)
  if (!n) return false
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(mensaje)}`, '_blank')
  return true
}

// ── Exportar CSV (abre directo en Excel) ──
export function descargarCSV(nombre: string, filas: (string | number)[][]) {
  const esc = (v: any) => {
    const s = String(v ?? '')
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + filas.map(f => f.map(esc).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

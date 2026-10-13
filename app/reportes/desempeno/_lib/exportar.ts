// Exportación a Excel (.xlsx) con varias hojas: resumen y detalle línea por línea.
// No usa librerías externas: el archivo lo arma ./xlsx.ts
import type { LineaDetalle, Metricas } from './metricas'
import { descargarXlsx, type Hoja } from './xlsx'

const fechaTexto = (s: string) => {
  const d = new Date(String(s).includes('T') || String(s).includes('+') ? s : String(s).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(s || '')
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(d.getDate())}-${dos(d.getMonth() + 1)}-${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`
}
const r = (n: number) => Math.round(n || 0)
const suma = (filas: LineaDetalle[], f: (x: LineaDetalle) => number) => filas.reduce((s, x) => s + f(x), 0)

// Crea una hoja con anchos de columna y formato de pesos en las columnas indicadas
const hoja = (filas: any[][], columnasPesos: number[] = [], anchos: number[] = []) => ({ filas, columnasPesos, anchos })

export interface OpcionesExcel {
  nombreArchivo: string
  titulo: string
  resumen: (string | number)[][]   // filas del resumen (indicador, mes, mes anterior)
  m: Metricas
  recomendaciones: { titulo: string; nivel: string; impacto: number | null }[]
}

export function armarHojas(opciones: OpcionesExcel): Hoja[] {
  const { m } = opciones
  const wb: Hoja[] = []
  const agregar = (h: Omit<Hoja, 'nombre'>, nombre: string) => wb.push({ nombre, ...h })
  const det = m.detalle

  // 1. Resumen
  agregar(hoja([[opciones.titulo], [], ...opciones.resumen], [1, 2], [42, 18, 22]), 'Resumen')

  // 2. Todo lo generado
  const encabezado = ['Fecha', 'Paciente', 'Doctor', 'Prestación', 'Pieza', 'Categoría', 'Medio de pago', 'Monto cobrado',
    'Clasificación', 'Por qué está en proceso', 'Precio prestación', 'Pagado de la prestación', 'Estado prestación',
    'Laboratorio (de este pago)', 'Honorario doctor', 'Queda a la clínica', 'RX']
  const filaDet = (x: LineaDetalle) => [fechaTexto(x.fecha), x.paciente, x.doctor, x.prestacion, x.pieza, x.categoria, x.medioPago, r(x.monto),
    x.clasificacion, x.motivoEnProceso, r(x.precioPrestacion), r(x.pagadoPrestacion), x.estadoPrestacion, r(x.lab), r(x.honorario), r(x.clinica), x.esRx ? 'Sí' : '']
  const totalDet = (filas: LineaDetalle[]) => ['TOTAL', '', '', `${filas.length} líneas`, '', '', '', r(suma(filas, x => x.monto)), '', '', '', '', '',
    r(suma(filas, x => x.lab)), r(suma(filas, x => x.honorario)), r(suma(filas, x => x.clinica)), '']
  const anchosDet = [16, 28, 24, 32, 7, 20, 16, 14, 18, 22, 14, 14, 14, 14, 14, 14, 5]
  const pesosDet = [7, 10, 11, 13, 14, 15]
  agregar(hoja([encabezado, ...det.map(filaDet), [], totalDet(det)], pesosDet, anchosDet), 'Generado (detalle)')

  // 3. Evolucionado 100% (listo para liquidar) y 4. En proceso
  const evol = det.filter(x => x.clasificacion === 'Evolucionado 100%')
  agregar(hoja([encabezado, ...evol.map(filaDet), [], totalDet(evol)], pesosDet, anchosDet), 'Evolucionado 100%')
  const proceso = det.filter(x => x.clasificacion === 'En proceso')
  agregar(hoja([encabezado, ...proceso.map(filaDet), [], totalDet(proceso)], pesosDet, anchosDet), 'En proceso')

  // 5. Laboratorio
  const lab = det.filter(x => x.lab > 0)
  const filasLab = [
    ['Fecha', 'Paciente', 'Doctor', 'Prestación', 'Pieza', 'Monto cobrado', 'Precio prestación', 'Costo lab. total de la prestación',
      'Costo lab. de este pago', 'Lab. pagado por el doctor (reembolsar)', 'Estado prestación'],
    ...lab.map(x => [fechaTexto(x.fecha), x.paciente, x.doctor, x.prestacion, x.pieza, r(x.monto), r(x.precioPrestacion), r(x.labTotalPrestacion),
      r(x.lab), x.labPagadoPorDoctor ? 'Sí' : 'No', x.estadoPrestacion]),
    [],
    ['TOTAL', '', '', `${lab.length} pagos`, '', r(suma(lab, x => x.monto)), '', '', r(suma(lab, x => x.lab)),
      r(suma(lab.filter(x => x.labPagadoPorDoctor), x => x.lab)), ''],
    [],
    ['El costo de laboratorio se reparte en proporción a lo pagado: si se paga el 50% de la prestación, se cuenta el 50% del costo de laboratorio.'],
  ]
  agregar(hoja(filasLab, [5, 6, 7, 8, 9], [16, 28, 24, 32, 7, 14, 14, 18, 16, 18, 14]), 'Laboratorio')

  // 6. RX (detalle + resumen por tipo)
  const rx = det.filter(x => x.esRx)
  const porTipo: Record<string, { n: number; monto: number }> = {}
  for (const x of rx) { const t = (porTipo[x.prestacion] ||= { n: 0, monto: 0 }); t.n++; t.monto += x.monto }
  const filasRx = [
    ['Fecha', 'Paciente', 'Doctor', 'Prestación', 'Medio de pago', 'Monto', 'Honorario doctor', 'Queda a la clínica'],
    ...rx.map(x => [fechaTexto(x.fecha), x.paciente, x.doctor, x.prestacion, x.medioPago, r(x.monto), r(x.honorario), r(x.clinica)]),
    [],
    ['TOTAL', '', '', `${rx.length} RX`, '', r(suma(rx, x => x.monto)), r(suma(rx, x => x.honorario)), r(suma(rx, x => x.clinica))],
    [],
    ['Resumen por tipo de RX', '', '', 'Cantidad', '', 'Monto'],
    ...Object.entries(porTipo).sort((a, b) => b[1].monto - a[1].monto).map(([t, v]) => [t, '', '', v.n, '', r(v.monto)]),
  ]
  agregar(hoja(filasRx, [5, 6, 7], [16, 28, 24, 32, 16, 14, 14, 14]), 'RX')

  // 7. Doctores
  const filasDoc = [
    ['Doctor', 'Especialidad', 'Generado', 'Evolucionado 100%', 'En proceso', 'RX', 'Laboratorio', 'Honorarios', 'Queda a la clínica',
      'Pacientes', 'Ocupación %', 'Horas libres que quedan', 'Valor hora', 'No asistieron', 'Espera (min)'],
    ...m.doctores.map(d => [d.nombre, d.especialidad, r(d.produccion), r(d.liquidable), r(d.produccion - d.liquidable), r(d.rx), r(d.lab), r(d.honorarios), r(d.clinica),
      d.pacientes, d.ocupacion === null ? '' : Math.round(d.ocupacion * 100), Math.round(d.minLibresFuturos / 6) / 10,
      d.valorHora === null ? '' : r(d.valorHora), d.noAsiste, d.espera === null ? '' : Math.round(d.espera)]),
  ]
  agregar(hoja(filasDoc, [2, 3, 4, 5, 6, 7, 8, 12], [26, 20, 14, 16, 14, 12, 12, 14, 16, 10, 11, 12, 12, 12, 11]), 'Doctores')

  // 8. Categorías y tratamientos
  const filasVentas = [
    ['Categoría', 'Generado'], ...m.ventas.categorias.map(c => [c.name, r(c.value)]),
    [],
    ['Tratamiento', 'Generado', 'Cantidad'], ...m.ventas.tratamientos.map(t => [t.name, r(t.value), t.cantidad]),
  ]
  agregar(hoja(filasVentas, [1], [36, 16, 10]), 'Categorías')

  // 9. Recomendaciones
  const filasRec = [['Recomendación', 'Prioridad', 'Potencial estimado'],
    ...opciones.recomendaciones.map(d => [d.titulo, d.nivel, d.impacto ? r(d.impacto) : ''])]
  agregar(hoja(filasRec, [2], [70, 14, 18]), 'Recomendaciones')

  return wb
}

export async function exportarExcel(opciones: OpcionesExcel) {
  descargarXlsx(opciones.nombreArchivo, armarHojas(opciones))
}

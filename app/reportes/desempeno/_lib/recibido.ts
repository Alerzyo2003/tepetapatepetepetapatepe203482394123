// Panel de Desempeño: dinero recibido en el mes y en qué se reparte (laboratorio, RX y resto).
// Laboratorio + RX + Resto = Dinero recibido (se calculan sobre los mismos pagos).
import { supabase } from '@/lib/supabase'
import { cargarPacientes, fetchAll, fetchPorIds } from './consultas'
import { esRx, esSaldoAFavor, labProporcional, limpiarNombrePrestacion, nombreCompleto, type Rango } from './util'
import { descargarXlsx, type Hoja } from './xlsx'

const PAGO_VIGENTE = 'estado.is.null,estado.neq.Anulado' // .neq solo excluye también los NULL

export interface DatosRecibido {
  pagos: any[] // solo pagos que entraron a caja (sin los pagados con saldo a favor)
  items: Record<string, any>
  categoriaPrestacion: Record<string, string>
}

// Pagos vigentes del periodo + la prestación a la que se abonaron (y su carpeta)
export async function cargarRecibido(r: Rango): Promise<DatosRecibido> {
  const todos = await fetchAll((a, b) => supabase.from('pagos')
    .select('id, monto, metodo_pago, fecha_pago, profesional_id, paciente_id, item_id')
    .gte('fecha_pago', r.desdeTz).lt('fecha_pago', r.hastaTz).or(PAGO_VIGENTE).order('id').range(a, b))
  // Pagar con saldo a favor no es dinero nuevo: ya se contó cuando el paciente lo abonó
  const pagos = todos.filter(p => Number(p.monto || 0) > 0 && !esSaldoAFavor(p))

  const itemsLista = await fetchPorIds('presupuesto_items',
    'id, profesional_id, prestacion_id, nombre_prestacion, diente_id, precio_pactado, costo_laboratorio, lab_pagado_por_dr',
    pagos.map(p => p.item_id))
  const items = Object.fromEntries(itemsLista.map(i => [i.id, i]))

  const prestaciones = await fetchPorIds('prestaciones', 'id, "Nombre Categoria"', itemsLista.map(i => i.prestacion_id))
  const categoriaPrestacion = Object.fromEntries(prestaciones.map(p => [p.id, p['Nombre Categoria'] || 'Sin categoría']))

  return { pagos, items, categoriaPrestacion }
}

export async function cargarProfesionales(): Promise<any[]> {
  const { data, error } = await supabase.from('profesionales').select('id, user_id, nombre, apellido, activo')
  if (error) throw new Error(error.message)
  return data || []
}

export interface LineaRecibido {
  fecha: string
  pacienteId: string | null
  doctorId: string | null
  prestacion: string
  categoria: string
  pieza: string
  medioPago: string
  monto: number
  lab: number
  rx: number
  resto: number
  precioPrestacion: number
  labTotalPrestacion: number
  labPagadoPorDoctor: boolean
}

export interface Recibido {
  total: number // dinero recibido
  lab: number // parte que va al laboratorio
  rx: number // parte que corresponde a radiografías (carpeta RADIOGRAFIAS)
  resto: number // total − lab − rx
  rxN: number // radiografías distintas pagadas
  ventaConLab: number // pagos de trabajos con laboratorio
  abonosSaldo: number // abonos a saldo a favor (sin prestación), van dentro de "resto"
  lineas: LineaRecibido[]
}

export function calcularRecibido(d: DatosRecibido, filtroDoc: string | null): Recibido {
  let total = 0, lab = 0, rx = 0, ventaConLab = 0, abonosSaldo = 0
  const itemsRx = new Set<string>()
  const lineas: LineaRecibido[] = []

  for (const p of d.pagos) {
    const monto = Number(p.monto || 0)
    const item = d.items[p.item_id]
    const doctorId = p.profesional_id || item?.profesional_id || null
    if (filtroDoc && doctorId !== filtroDoc) continue
    total += monto

    const base = { fecha: p.fecha_pago, pacienteId: p.paciente_id || null, doctorId, medioPago: p.metodo_pago || '', monto }
    if (!item) {
      // Abono a saldo a favor: entra a caja, todavía no es de ninguna prestación
      abonosSaldo += monto
      lineas.push({ ...base, prestacion: 'Abono a saldo a favor', categoria: '', pieza: '', lab: 0, rx: 0, resto: monto,
        precioPrestacion: 0, labTotalPrestacion: 0, labPagadoPorDoctor: false })
      continue
    }

    const categoria = d.categoriaPrestacion[item.prestacion_id] || 'Sin categoría'
    const labPago = Math.min(monto, labProporcional(monto, item))
    const rxPago = esRx(categoria) ? monto - labPago : 0
    lab += labPago
    rx += rxPago
    if (labPago > 0) ventaConLab += monto
    if (rxPago > 0) itemsRx.add(item.id)
    lineas.push({
      ...base, prestacion: limpiarNombrePrestacion(item.nombre_prestacion) || 'Prestación sin nombre', categoria,
      pieza: item.diente_id ? String(item.diente_id) : '', lab: labPago, rx: rxPago, resto: monto - labPago - rxPago,
      precioPrestacion: Number(item.precio_pactado || 0), labTotalPrestacion: Number(item.costo_laboratorio || 0),
      labPagadoPorDoctor: !!item.lab_pagado_por_dr,
    })
  }

  // Redondeo a pesos: el resto se calcula por diferencia para que la suma calce exacta con el total
  total = Math.round(total)
  lab = Math.round(lab)
  rx = Math.round(rx)
  return {
    total, lab, rx, resto: total - lab - rx, rxN: itemsRx.size, ventaConLab: Math.round(ventaConLab), abonosSaldo: Math.round(abonosSaldo),
    lineas: lineas.sort((x, y) => String(x.fecha).localeCompare(String(y.fecha))),
  }
}

// ── Excel ──
const fechaTexto = (s: string) => {
  const d = new Date(String(s).includes('T') || String(s).includes('+') ? s : String(s).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(s || '')
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(d.getDate())}-${dos(d.getMonth() + 1)}-${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`
}
const r = (n: number) => Math.round(n || 0)
const suma = (filas: LineaRecibido[], f: (x: LineaRecibido) => number) => filas.reduce((s, x) => s + f(x), 0)

export async function exportarRecibido(o: {
  nombreArchivo: string
  titulo: string
  columnaActual: string
  columnaPrevia: string
  actual: Recibido
  previo: Recibido | null
  profesionales: any[]
}) {
  const { actual: a, previo: p } = o
  const pacientes = await cargarPacientes(a.lineas.map(x => x.pacienteId).filter(Boolean) as string[], 'nombre')
  const pacPorId = Object.fromEntries(pacientes.map(x => [x.id, x]))
  const docPorUser = new Map<string, any>(o.profesionales.filter(x => x.user_id).map(x => [x.user_id, x]))
  const paciente = (x: LineaRecibido) => nombreCompleto(x.pacienteId ? pacPorId[x.pacienteId] : null)
  const doctor = (x: LineaRecibido) => { const d = x.doctorId ? docPorUser.get(x.doctorId) : null; return d ? nombreCompleto(d) : 'Sin asignar' }
  const hojas: Hoja[] = []

  // 1. Resumen
  const fila = (label: string, v: number, prev?: number) => [label, v, prev === undefined ? '' : prev]
  hojas.push({
    nombre: 'Resumen', columnasPesos: [1, 2], anchos: [42, 18, 24],
    filas: [
      [o.titulo], [],
      ['Indicador', o.columnaActual, o.columnaPrevia],
      fila('Para laboratorio', a.lab, p?.lab),
      fila('Radiografías (RX)', a.rx, p?.rx),
      fila('Resto', a.resto, p?.resto),
      fila('   (de eso, abonos a saldo a favor)', a.abonosSaldo, p?.abonosSaldo),
      fila('TOTAL', a.total, p?.total),
      [],
      ['Laboratorio + RX + Resto = Dinero recibido (lo que entró a caja en el mes, sin contar pagos hechos con saldo a favor).'],
    ],
  })

  // 2. Detalle de todo lo recibido
  hojas.push({
    nombre: 'Dinero recibido', columnasPesos: [7, 8, 9, 10], anchos: [16, 28, 24, 32, 7, 20, 16, 14, 14, 14, 14],
    filas: [
      ['Fecha', 'Paciente', 'Doctor', 'Prestación', 'Pieza', 'Carpeta', 'Medio de pago', 'Monto', 'Laboratorio', 'RX', 'Resto'],
      ...a.lineas.map(x => [fechaTexto(x.fecha), paciente(x), doctor(x), x.prestacion, x.pieza, x.categoria, x.medioPago, r(x.monto), r(x.lab), r(x.rx), r(x.resto)]),
      [],
      ['TOTAL', '', '', `${a.lineas.length} pagos`, '', '', '', a.total, a.lab, a.rx, a.resto],
    ],
  })

  // 3. Laboratorio
  const lab = a.lineas.filter(x => x.lab > 0)
  hojas.push({
    nombre: 'Laboratorio', columnasPesos: [5, 6, 7, 8], anchos: [16, 28, 24, 32, 7, 14, 14, 18, 16, 18],
    filas: [
      ['Fecha', 'Paciente', 'Doctor', 'Prestación', 'Pieza', 'Monto pagado', 'Precio prestación', 'Costo lab. total de la prestación', 'Costo lab. de este pago', 'Lab. pagado por el doctor'],
      ...lab.map(x => [fechaTexto(x.fecha), paciente(x), doctor(x), x.prestacion, x.pieza, r(x.monto), r(x.precioPrestacion), r(x.labTotalPrestacion), r(x.lab), x.labPagadoPorDoctor ? 'Sí' : 'No']),
      [],
      ['TOTAL', '', '', `${lab.length} pagos`, '', r(suma(lab, x => x.monto)), '', '', a.lab, ''],
      [],
      ['El costo de laboratorio se reparte en proporción a lo pagado: si se paga el 50% de la prestación, se cuenta el 50% del costo de laboratorio.'],
    ],
  })

  // 4. RX (detalle + resumen por tipo)
  const rx = a.lineas.filter(x => x.rx > 0)
  const porTipo: Record<string, { n: number; monto: number }> = {}
  for (const x of rx) { const t = (porTipo[x.prestacion] ||= { n: 0, monto: 0 }); t.n++; t.monto += x.rx }
  hojas.push({
    nombre: 'RX', columnasPesos: [5], anchos: [16, 28, 24, 32, 16, 14],
    filas: [
      ['Fecha', 'Paciente', 'Doctor', 'Prestación', 'Medio de pago', 'Monto'],
      ...rx.map(x => [fechaTexto(x.fecha), paciente(x), doctor(x), x.prestacion, x.medioPago, r(x.rx)]),
      [],
      ['TOTAL', '', '', `${rx.length} pagos · ${a.rxN} RX`, '', a.rx],
      [],
      ['Resumen por tipo de RX', '', '', 'Pagos', '', 'Monto'],
      ...Object.entries(porTipo).sort((x, y) => y[1].monto - x[1].monto).map(([t, v]) => [t, '', '', v.n, '', r(v.monto)]),
    ],
  })

  descargarXlsx(o.nombreArchivo, hojas)
}

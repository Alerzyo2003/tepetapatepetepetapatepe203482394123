// "Rx tomada": las radiografías las toman asistentes y recepción, y los doctores no las evolucionan.
// Si quedan "pendientes" no aparecen como deuda en Pagos y el paciente se va sin pagarlas.
// Aquí se marcan como realizadas (quedan por cobrar) dejando registro de quién lo hizo.
import { supabase } from '@/lib/supabase'

export const ES_RX = /(retroalv|radiograf|^\s*rx\b|panor[aá]mic|bite ?wing|aleta (de )?mordida|oclusal|telerradiograf)/i
const NO_ES_RX = /(limpieza|plano|alivio|estudio|gu[ií]a|contenci[oó]n|evaluaci[oó]n)/i

export const esRadiografia = (nombre: string | null | undefined) => !!nombre && ES_RX.test(nombre) && !NO_ES_RX.test(nombre)

export const piezaTexto = (d: number | null | undefined) => (d && d >= 11 ? `${Math.floor(d / 10)}.${d % 10}` : '—')

// Piezas que aparecen en el motivo de la cita ("RX 3.6 y 1.5", "rx 46/47")
export function piezasDelMotivo(motivo?: string | null): Set<number> {
  const s = new Set<number>()
  if (!motivo) return s
  for (const m of motivo.matchAll(/\b([1-8])\s*\.\s*([1-8])\b/g)) s.add(Number(m[1]) * 10 + Number(m[2]))
  for (const m of motivo.matchAll(/(?<![\d.:])([1-4][1-8]|[5-8][1-5])(?![\d.:])/g)) s.add(Number(m[1]))
  return s
}

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
const fechaChile = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
const tag = (texto: string, clave: string) => texto.match(new RegExp(`\\| ${clave}: ([^|]+)`))?.[1]?.trim() || null
const sinTags = (texto: string) => texto.replace(/\s*\|\s*(RxTomada|RxFec):[^|]*/g, '').replace(/\s*\|\s*RxAgregada\b/g, '').trim()

export interface RxItem {
  id: string
  presupuestoId: string
  presupuesto: string
  doctor: string
  nombre: string
  diente: number | null
  precio: number
  abonado: number
  estado: string
  texto: string
  tomadaPor: string | null
  tomadaFec: string | null
  agregada: boolean
}

export async function cargarRxPaciente(pacienteId: string) {
  const { data: pres, error } = await supabase.from('presupuestos')
    .select('id, nombre_tratamiento, especialista_id, created_at, profesionales:especialista_id(nombre, apellido)')
    .eq('paciente_id', pacienteId)
  if (error) throw error
  const ids = (pres || []).map(p => p.id)
  if (!ids.length) return { pendientes: [] as RxItem[], tomadasHoy: [] as RxItem[], presupuestos: pres || [] }
  const { data: items, error: e2 } = await supabase.from('presupuesto_items')
    .select('id, presupuesto_id, precio_pactado, abonado, estado, diente_id, nombre_prestacion, observacion, prestaciones:prestacion_id("Nombre Accion"), profesional:profesional_id(nombre, apellido)')
    .in('presupuesto_id', ids)
    .neq('estado', 'cancelada')
  if (e2) throw e2
  const porId = new Map((pres || []).map((p: any) => [p.id, p]))
  const hoy = hoyChile()
  const todos: RxItem[] = (items || []).map((i: any) => {
    const pr = Array.isArray(i.prestaciones) ? i.prestaciones[0] : i.prestaciones
    const texto = i.nombre_prestacion || i.observacion || ''
    const nombre = pr?.['Nombre Accion'] || texto.split('|')[0].trim()
    const p: any = porId.get(i.presupuesto_id)
    const docItem = Array.isArray(i.profesional) ? i.profesional[0] : i.profesional
    const docPres = Array.isArray(p?.profesionales) ? p.profesionales[0] : p?.profesionales
    const doc = docItem || docPres
    return {
      id: i.id, presupuestoId: i.presupuesto_id, presupuesto: (p?.nombre_tratamiento || 'Plan de tratamiento').trim(),
      doctor: doc ? `${doc.nombre || ''} ${doc.apellido || ''}`.trim() : '',
      nombre: String(nombre).trim(), diente: i.diente_id, precio: Number(i.precio_pactado || 0), abonado: Number(i.abonado || 0),
      estado: i.estado, texto, tomadaPor: tag(texto, 'RxTomada'), tomadaFec: tag(texto, 'RxFec'), agregada: /\| RxAgregada\b/.test(texto),
    }
  }).filter(r => esRadiografia(r.nombre))
  const pendientes = todos.filter(r => r.estado !== 'realizado').sort((a, b) => (a.diente || 99) - (b.diente || 99))
  const tomadasHoy = todos.filter(r => r.estado === 'realizado' && r.tomadaFec && fechaChile(r.tomadaFec) === hoy)
  return { pendientes, tomadasHoy, presupuestos: pres || [] }
}

export async function cargarCatalogoRx() {
  const { data } = await supabase.from('prestaciones').select('id, "Nombre Accion", "Precio", "Nombre Categoria", "Habilitado", tipo_reparto')
  return (data || []).filter((p: any) => String(p.Habilitado || '').trim().toLowerCase() !== 'no' && esRadiografia(p['Nombre Accion']))
    .sort((a: any, b: any) => String(a['Nombre Accion']).localeCompare(String(b['Nombre Accion'])))
}

async function auditar(usuarioId: string | null, pacienteId: string, accion: string, detalles: string, registro?: string | null) {
  const { error } = await supabase.from('auditoria_clinica').insert([{ usuario_id: usuarioId, accion, tabla: 'presupuesto_items, evoluciones', detalles, paciente_id: pacienteId, registro_afectado_id: registro || null }])
  if (error) console.error('No se pudo registrar la auditoría', error)
}

// Marca las Rx elegidas como tomadas (realizadas = quedan por cobrar en Pagos).
// No cambia el profesional ni el reparto de cada Rx: la liquidación sigue igual que si la hubiera evolucionado el doctor.
export async function marcarRxTomadas(opts: {
  pacienteId: string; pacienteNombre: string; usuarioId: string | null; usuarioNombre: string
  items: RxItem[]; citaId?: string | null
}) {
  const { pacienteId, pacienteNombre, usuarioId, usuarioNombre, items, citaId } = opts
  const ahora = new Date().toISOString()
  for (const it of items) {
    const texto = `${sinTags(it.texto || it.nombre)} | RxTomada: ${usuarioNombre} | RxFec: ${ahora}${it.agregada ? ' | RxAgregada' : ''}`
    const { error } = await supabase.from('presupuesto_items').update({ estado: 'realizado', progreso: 100, nombre_prestacion: texto }).eq('id', it.id).neq('estado', 'cancelada')
    if (error) throw error
  }
  const porPresupuesto = new Map<string, RxItem[]>()
  items.forEach(i => porPresupuesto.set(i.presupuestoId, [...(porPresupuesto.get(i.presupuestoId) || []), i]))
  for (const [presupuestoId, xs] of porPresupuesto) {
    await supabase.from('presupuestos').update({ aprobado: true }).eq('id', presupuestoId).eq('aprobado', false)
    const lista = xs.map(x => `${x.nombre}${x.diente ? ` pieza ${piezaTexto(x.diente)}` : ''}`).join(', ')
    const base: any = {
      paciente_id: pacienteId, profesional_id: null, creado_por: usuarioId, cita_id: citaId || null,
      descripcion_procedimiento: `Rx tomada: ${lista}.`,
      observaciones: `Marcada como tomada por ${usuarioNombre} desde "Rx tomada" (queda por cobrar).`,
    }
    let { error } = await supabase.from('evoluciones').insert([{ ...base, presupuesto_id: presupuestoId, prestaciones: xs.map(x => ({ id: x.id, nombre: x.nombre, pieza: x.diente, avance: 100 })) }])
    if (error) ({ error } = await supabase.from('evoluciones').insert([base]))
    if (error) console.error('No se pudo registrar la evolución', error)
  }
  const total = items.reduce((a, i) => a + Math.max(i.precio - i.abonado, 0), 0)
  await auditar(usuarioId, pacienteId, 'UPDATE / RX TOMADA',
    `${usuarioNombre} marcó ${items.length} radiografía(s) como tomada(s) para ${pacienteNombre}: ${items.map(x => `${x.nombre}${x.diente ? ` ${piezaTexto(x.diente)}` : ''}`).join(', ')}. Quedan por cobrar $${total.toLocaleString('es-CL')}.`)
  return total
}

// Deshacer el mismo día (solo si todavía no se pagó). Las Rx que se agregaron desde aquí se borran.
export async function desmarcarRxTomada(opts: { pacienteId: string; pacienteNombre: string; usuarioId: string | null; usuarioNombre: string; item: RxItem }) {
  const { pacienteId, pacienteNombre, usuarioId, usuarioNombre, item } = opts
  if (item.abonado > 0) throw new Error('Esta radiografía ya tiene pagos; anula el pago primero.')
  if (item.agregada) {
    const { error } = await supabase.from('presupuesto_items').delete().eq('id', item.id).eq('abonado', 0)
    if (error) throw error
  } else {
    const { error } = await supabase.from('presupuesto_items').update({ estado: 'pendiente', progreso: 0, nombre_prestacion: sinTags(item.texto) }).eq('id', item.id).eq('abonado', 0)
    if (error) throw error
  }
  await auditar(usuarioId, pacienteId, 'UPDATE / RX TOMADA (DESHACER)',
    `${usuarioNombre} deshizo "Rx tomada" de ${item.nombre}${item.diente ? ` pieza ${piezaTexto(item.diente)}` : ''} de ${pacienteNombre}${item.agregada ? ' (se eliminó porque se había agregado desde aquí)' : ''}.`, item.id)
}

// Rx que no estaba presupuestada: se agrega al presupuesto más reciente (o a uno nuevo "Radiografías") ya tomada.
export async function agregarRxTomada(opts: {
  pacienteId: string; pacienteNombre: string; usuarioId: string | null; usuarioNombre: string
  prestacion: any; dientes: number[]; presupuestoId?: string | null; citaId?: string | null
}) {
  const { pacienteId, prestacion, dientes } = opts
  let presupuestoId = opts.presupuestoId || null
  if (!presupuestoId) {
    const { data, error } = await supabase.from('presupuestos').insert([{ paciente_id: pacienteId, nombre_tratamiento: 'Radiografías', estado: 'BORRADOR', aprobado: true, total: 0, total_abonado: 0, creado_por: opts.usuarioId }]).select('id').single()
    if (error) throw error
    presupuestoId = data.id
  }
  let regla: any = null
  if (prestacion['Nombre Categoria']) {
    const { data } = await supabase.from('categorias_prestaciones').select('tipo_reparto, profesional_id, porcentaje_forzado').eq('nombre', prestacion['Nombre Categoria']).maybeSingle()
    regla = data
  }
  const tipo = prestacion.tipo_reparto || regla?.tipo_reparto || 'general'
  const nombre = `${prestacion['Nombre Accion']} | Fase: Plan General | RxAgregada`
  const base = {
    presupuesto_id: presupuestoId, prestacion_id: prestacion.id, precio_pactado: Number(prestacion.Precio || 0), abonado: 0, estado: 'pendiente',
    profesional_id: tipo === 'doctor' && regla?.profesional_id ? regla.profesional_id : null,
    nombre_prestacion: nombre, observacion: nombre, tipo_reparto: tipo, porcentaje_forzado: regla?.porcentaje_forzado || null,
    costo_laboratorio: 0, lab_pagado_por_dr: false,
  }
  const filas = (dientes.length ? dientes : [null]).map(d => ({ ...base, diente_id: d }))
  const { data: nuevos, error } = await supabase.from('presupuesto_items').insert(filas).select('id, presupuesto_id, precio_pactado, diente_id, nombre_prestacion')
  if (error) throw error
  const items: RxItem[] = (nuevos || []).map((n: any) => ({
    id: n.id, presupuestoId: n.presupuesto_id, presupuesto: '', doctor: '', nombre: prestacion['Nombre Accion'], diente: n.diente_id,
    precio: Number(n.precio_pactado || 0), abonado: 0, estado: 'pendiente', texto: n.nombre_prestacion, tomadaPor: null, tomadaFec: null, agregada: true,
  }))
  return marcarRxTomadas({ pacienteId, pacienteNombre: opts.pacienteNombre, usuarioId: opts.usuarioId, usuarioNombre: opts.usuarioNombre, items, citaId: opts.citaId })
}

// Cambiar (o poner) la pieza de una Rx: muchas vienen sin pieza desde el presupuesto
export async function cambiarPiezaRx(opts: { pacienteId: string; pacienteNombre: string; usuarioId: string | null; usuarioNombre: string; item: RxItem; diente: number | null }) {
  const { pacienteId, pacienteNombre, usuarioId, usuarioNombre, item, diente } = opts
  if (diente === item.diente) return
  const { error } = await supabase.from('presupuesto_items').update({ diente_id: diente }).eq('id', item.id)
  if (error) throw error
  await auditar(usuarioId, pacienteId, 'UPDATE / RX PIEZA',
    `${usuarioNombre} cambió la pieza de ${item.nombre} de ${pacienteNombre}: ${item.diente ? piezaTexto(item.diente) : 'sin pieza'} → ${diente ? piezaTexto(diente) : 'sin pieza'}.`, item.id)
}

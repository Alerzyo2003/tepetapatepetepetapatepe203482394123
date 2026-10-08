// Cajas por usuario: cada ADMIN / RECEPCIONISTA tiene su propia caja.
// Varias cajas pueden estar abiertas a la vez (una por persona).
// Si la persona registra un pago y no tiene caja abierta, se le abre automáticamente.
import { supabase } from '@/lib/supabase'

export const ROLES_CAJA = ['ADMIN', 'RECEPCIONISTA']
export const puedeGestionarCaja = (rol?: string | null) => !!rol && ROLES_CAJA.includes(rol)

const esSaldoAFavor = (metodo: any) => String(metodo || '').toLowerCase().includes('saldo')

// Caja abierta del usuario (o null)
export async function obtenerMiCaja(userId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('sesiones_caja')
    .select('*')
    .eq('usuario_id', userId)
    .eq('estado', 'abierta')
    .order('fecha_apertura', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] || null
}

// Abre la caja del usuario. Si ya tiene una abierta, devuelve esa.
export async function abrirCaja(userId: string, nombreResponsable: string, montoApertura = 0): Promise<any> {
  const existente = await obtenerMiCaja(userId)
  if (existente) return existente

  const { data, error } = await supabase
    .from('sesiones_caja')
    .insert([{
      usuario_id: userId,
      nombre_responsable: nombreResponsable,
      monto_apertura: Number(montoApertura) || 0,
      estado: 'abierta',
      fecha_apertura: new Date().toISOString(),
    }])
    .select('*')
    .single()

  if (error) {
    // 23505 = ya existe una caja abierta para este usuario (se abrió en otra pestaña al mismo tiempo)
    if (error.code === '23505') {
      const otra = await obtenerMiCaja(userId)
      if (otra) return otra
    }
    throw error
  }

  // Si la numeración automática (SQL) no está instalada, se asigna aquí
  if (data.numero_caja === null || data.numero_caja === undefined) {
    const { data: ultima } = await supabase
      .from('sesiones_caja')
      .select('numero_caja')
      .not('numero_caja', 'is', null)
      .order('numero_caja', { ascending: false })
      .limit(1)
      .maybeSingle()
    const numero = (ultima?.numero_caja || 0) + 1
    await supabase.from('sesiones_caja').update({ numero_caja: numero }).eq('id', data.id)
    data.numero_caja = numero
  }
  return data
}

// Devuelve la caja abierta del usuario; si no tiene, la abre (fondo inicial $0)
export async function asegurarMiCaja(userId: string, nombreResponsable: string): Promise<{ caja: any; recienAbierta: boolean }> {
  const existente = await obtenerMiCaja(userId)
  if (existente) return { caja: existente, recienAbierta: false }
  return { caja: await abrirCaja(userId, nombreResponsable, 0), recienAbierta: true }
}

// Totales de una caja (sin pagos anulados ni pagos hechos con saldo a favor)
export function resumirPagosCaja(pagos: any[]) {
  const validos = (pagos || []).filter(p => p.estado !== 'Anulado' && p.metodo_pago && !esSaldoAFavor(p.metodo_pago))
  let efectivo = 0, tarjeta = 0, transferencia = 0, otros = 0
  for (const p of validos) {
    const m = String(p.metodo_pago).toLowerCase()
    const monto = Number(p.monto || 0)
    if (m.includes('efectivo')) efectivo += monto
    else if (m.includes('transfer')) transferencia += monto
    else if (m.includes('tarjeta') || m.includes('débito') || m.includes('debito') || m.includes('crédito') || m.includes('credito')) tarjeta += monto
    else otros += monto
  }
  return { validos, cantidad: validos.length, total: efectivo + tarjeta + transferencia + otros, efectivo, tarjeta, transferencia, otros }
}

// Cierra una caja guardando el total y el desglose por medio de pago
export async function cerrarCaja(cajaId: string): Promise<void> {
  const [{ data: caja, error: e1 }, { data: pagos, error: e2 }] = await Promise.all([
    supabase.from('sesiones_caja').select('id, monto_apertura, estado').eq('id', cajaId).single(),
    supabase.from('pagos').select('monto, estado, metodo_pago').eq('caja_id', cajaId),
  ])
  if (e1) throw e1
  if (e2) throw e2
  if (caja.estado !== 'abierta') throw new Error('La caja ya estaba cerrada')

  const r = resumirPagosCaja(pagos || [])
  const { error } = await supabase.from('sesiones_caja').update({
    estado: 'cerrada',
    fecha_cierre: new Date().toISOString(),
    monto_cierre: Number(caja.monto_apertura || 0) + r.total,
    total_efectivo_esperado: r.efectivo,
    total_tarjeta_esperado: r.tarjeta,
    total_transferencia_esperado: r.transferencia + r.otros,
  }).eq('id', cajaId).eq('estado', 'abierta')
  if (error) throw error
}

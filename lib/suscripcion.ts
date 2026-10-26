import { supabaseAdmin } from '@/lib/admin'
import { ROLES_STAFF, NOMBRE_ROL, obtenerPlan, limiteRol, type Plan, type RolStaff } from '@/lib/planes'

// Solo para el servidor: lee la suscripción de la clínica y cuenta los usuarios activos por rol.
// Si la clínica está conectada al portal central (PORTAL_URL + PORTAL_LICENCIA), el plan viene de ahí y se
// guarda en la tabla local 'suscripcion' como respaldo por si el portal no responde.
// Sin portal, se usa solo la tabla local (ver supabase/suscripcion.sql). Sin tabla, la app no tiene límites.

export type EstadoSuscripcion = 'PRUEBA' | 'ACTIVA' | 'VENCIDA' | 'SUSPENDIDA'

export interface Suscripcion {
  plan: Plan
  estado: EstadoSuscripcion
  ciclo: 'MENSUAL' | 'ANUAL'
  venceEl: string | null
  cuposExtra: Partial<Record<RolStaff, number>>
  cobroAutomatico: boolean
}

export const conectadaAlPortal = () => !!(process.env.PORTAL_URL && process.env.PORTAL_LICENCIA)

export async function llamarPortal(ruta: string, init: RequestInit = {}) {
  return fetch(`${process.env.PORTAL_URL!.replace(/\/$/, '')}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.PORTAL_LICENCIA}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
}

// El plan se consulta al portal como máximo una vez por minuto
let cachePortal: { fila: any; hasta: number } | null = null

async function leerDelPortal(): Promise<any | null> {
  if (!conectadaAlPortal()) return null
  if (cachePortal && cachePortal.hasta > Date.now()) return cachePortal.fila
  let fila: any
  try {
    const res = await llamarPortal('/api/licencia')
    if (res.status === 401 || res.status === 404) {
      // Licencia revocada o clínica desactivada en el portal
      fila = { estado: 'SUSPENDIDA' }
    } else if (res.ok) {
      const d = await res.json()
      fila = { plan: d.plan, estado: d.estado, ciclo: d.ciclo, vence_el: d.vence_el, cupos_extra: d.cupos_extra, cobro_automatico: d.cobro_automatico }
    } else {
      return null
    }
  } catch {
    return null // portal caído: se usa el último plan guardado
  }
  const { cobro_automatico, ...paraGuardar } = fila
  await supabaseAdmin.from('suscripcion').upsert({ id: 1, ...paraGuardar, actualizado_el: new Date().toISOString() })
  const { data } = await supabaseAdmin.from('suscripcion').select('*').eq('id', 1).maybeSingle()
  const completa = data ? { ...data, cobro_automatico: !!cobro_automatico } : null
  cachePortal = { fila: completa, hasta: Date.now() + 60_000 }
  return completa
}

export async function leerSuscripcion(): Promise<Suscripcion | null> {
  let data = await leerDelPortal()
  if (!data) {
    const local = await supabaseAdmin.from('suscripcion').select('*').eq('id', 1).maybeSingle()
    if (local.error || !local.data) return null
    data = local.data
  }
  const plan = obtenerPlan(data.plan)
  if (!plan) return null

  // Un plan con fecha de vencimiento pasada se considera vencido aunque nadie haya cambiado el estado
  let estado = (data.estado || 'ACTIVA') as EstadoSuscripcion
  if (data.vence_el && (estado === 'ACTIVA' || estado === 'PRUEBA')) {
    const vence = new Date(`${data.vence_el}T23:59:59-03:00`)
    if (vence.getTime() < Date.now()) estado = 'VENCIDA'
  }

  return {
    plan,
    estado,
    ciclo: data.ciclo === 'ANUAL' ? 'ANUAL' : 'MENSUAL',
    venceEl: data.vence_el || null,
    cuposExtra: data.cupos_extra || {},
    cobroAutomatico: !!data.cobro_automatico,
  }
}

// IDs de cuentas desactivadas (las que "eliminarCuentaProfesional" bloquea por tener historial): no ocupan cupo
async function cuentasBloqueadas(): Promise<Set<string>> {
  const bloqueadas = new Set<string>()
  const ahora = Date.now()
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) break
    for (const u of data.users) {
      const hasta = (u as any).banned_until
      if (hasta && new Date(hasta).getTime() > ahora) bloqueadas.add(u.id)
    }
    if (data.users.length < 1000) break
  }
  return bloqueadas
}

export async function contarUsoPorRol(): Promise<Record<RolStaff, number>> {
  const uso: Record<RolStaff, number> = { ADMIN: 0, DENTISTA: 0, ASISTENTE: 0, RECEPCIONISTA: 0 }
  const [{ data: perfiles }, bloqueadas] = await Promise.all([
    supabaseAdmin.from('perfiles').select('id, rol'),
    cuentasBloqueadas(),
  ])
  for (const p of perfiles || []) {
    if (bloqueadas.has(p.id)) continue
    if (ROLES_STAFF.includes(p.rol)) uso[p.rol as RolStaff]++
  }
  return uso
}

// Devuelve un mensaje de error si no se puede asignar 'rol' a una cuenta más; null si hay cupo.
export async function validarCupo(rol: string): Promise<string | null> {
  const sus = await leerSuscripcion()
  if (!sus) return null // sin plan configurado: sin límites

  if (sus.estado === 'VENCIDA' || sus.estado === 'SUSPENDIDA') {
    return `La suscripción está ${sus.estado.toLowerCase()}. Renueva el plan para crear o modificar cuentas.`
  }
  if (!ROLES_STAFF.includes(rol as RolStaff)) return null

  const limite = limiteRol(sus.plan, rol as RolStaff, sus.cuposExtra)
  if (limite === null) return null

  const uso = await contarUsoPorRol()
  if (uso[rol as RolStaff] >= limite) {
    return `Tu plan ${sus.plan.nombre} permite ${limite} ${NOMBRE_ROL[rol as RolStaff].toLowerCase()} y ya están todos ocupados. Mejora el plan o contrata un cupo adicional.`
  }
  return null
}

import { supabaseAdmin } from '@/lib/admin'
import { ROLES_STAFF, NOMBRE_ROL, obtenerPlan, limiteRol, type Plan, type RolStaff } from '@/lib/planes'

// Solo para el servidor: lee la suscripción de la clínica y cuenta los usuarios activos por rol.
// La suscripción vive en la tabla 'suscripcion' (una sola fila, ver supabase/suscripcion.sql).
// Si la tabla aún no existe o está vacía, la app funciona sin límites (como antes).

export type EstadoSuscripcion = 'PRUEBA' | 'ACTIVA' | 'VENCIDA' | 'SUSPENDIDA'

export interface Suscripcion {
  plan: Plan
  estado: EstadoSuscripcion
  ciclo: 'MENSUAL' | 'ANUAL'
  venceEl: string | null
  cuposExtra: Partial<Record<RolStaff, number>>
}

export async function leerSuscripcion(): Promise<Suscripcion | null> {
  const { data, error } = await supabaseAdmin.from('suscripcion').select('*').eq('id', 1).maybeSingle()
  if (error || !data) return null
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

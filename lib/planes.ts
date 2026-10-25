// Planes de suscripción de la app (precios en pesos chilenos, valores netos: + IVA 19%).
// Este archivo no tiene secretos: lo usan tanto el servidor (para hacer cumplir los límites)
// como las páginas (para mostrar el plan y el uso).

export type RolStaff = 'ADMIN' | 'DENTISTA' | 'ASISTENTE' | 'RECEPCIONISTA'
export type PlanId = 'BASICO' | 'CLINICA' | 'CENTRO' | 'EMPRESARIAL'

export const ROLES_STAFF: RolStaff[] = ['ADMIN', 'DENTISTA', 'ASISTENTE', 'RECEPCIONISTA']

export const NOMBRE_ROL: Record<RolStaff, string> = {
  ADMIN: 'Administrativos',
  DENTISTA: 'Dentistas',
  ASISTENTE: 'Asistentes',
  RECEPCIONISTA: 'Recepcionistas',
}

// null = sin límite
export type Limites = Record<RolStaff, number | null>

export interface Plan {
  id: PlanId
  nombre: string
  descripcion: string
  precioMensual: number   // CLP neto
  precioAnual: number     // CLP neto (equivale a 10 meses: 2 meses gratis)
  limites: Limites
  modulos: string[]
  destacado?: boolean
}

export const PLANES: Plan[] = [
  {
    id: 'BASICO',
    nombre: 'Consulta',
    descripcion: 'Consulta pequeña o dentista independiente',
    precioMensual: 34990,
    precioAnual: 349900,
    limites: { ADMIN: 1, DENTISTA: 2, ASISTENTE: 1, RECEPCIONISTA: 1 },
    modulos: ['Agenda y pacientes', 'Ficha clínica y odontograma', 'Presupuestos y pagos', 'Cajas'],
  },
  {
    id: 'CLINICA',
    nombre: 'Clínica',
    descripcion: 'Clínica en crecimiento con equipo completo',
    precioMensual: 69990,
    precioAnual: 699900,
    limites: { ADMIN: 3, DENTISTA: 5, ASISTENTE: 3, RECEPCIONISTA: 1 },
    modulos: ['Todo lo de Consulta', 'Seguimiento de pacientes', 'Liquidaciones', 'Laboratorios e inventario'],
    destacado: true,
  },
  {
    id: 'CENTRO',
    nombre: 'Centro Dental',
    descripcion: 'Centro con varios box y especialistas',
    precioMensual: 119990,
    precioAnual: 1199900,
    limites: { ADMIN: 5, DENTISTA: 12, ASISTENTE: 8, RECEPCIONISTA: 3 },
    modulos: ['Todo lo de Clínica', 'Reportes de desempeño', 'Exportación a Excel', 'Auditoría'],
  },
  {
    id: 'EMPRESARIAL',
    nombre: 'Empresarial',
    descripcion: 'Redes de clínicas: usuarios ilimitados y soporte prioritario',
    precioMensual: 199990,
    precioAnual: 1999900,
    limites: { ADMIN: null, DENTISTA: null, ASISTENTE: null, RECEPCIONISTA: null },
    modulos: ['Todo lo de Centro Dental', 'Usuarios ilimitados', 'Soporte prioritario', 'Migración de datos incluida'],
  },
]

// Cupos adicionales que se pueden comprar sobre cualquier plan (CLP neto mensual por usuario)
export const PRECIO_CUPO_EXTRA: Record<RolStaff, number> = {
  ADMIN: 7990,
  DENTISTA: 12990,
  ASISTENTE: 5990,
  RECEPCIONISTA: 5990,
}

export const IVA = 0.19

export function obtenerPlan(id: string | null | undefined): Plan | null {
  return PLANES.find(p => p.id === id) || null
}

// Límite efectivo de un rol = límite del plan + cupos extra contratados. null = sin límite.
export function limiteRol(plan: Plan, rol: RolStaff, extras?: Partial<Record<RolStaff, number>> | null): number | null {
  const base = plan.limites[rol]
  if (base === null) return null
  return base + Math.max(0, Number(extras?.[rol]) || 0)
}

export function formatoCLP(monto: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(monto)
}

export function conIVA(monto: number) {
  return Math.round(monto * (1 + IVA))
}

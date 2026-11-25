// Convenios que pagan sus tratamientos en cuotas (ej: sindicatos de buses, máximo 6 cuotas).
// A los pacientes de estos convenios cada cuota entra a la liquidación del doctor en el mes en que se paga,
// sin esperar a que el tratamiento esté pagado al 100%.
import { supabase } from '@/lib/supabase'

export const normConvenio = (s?: string | null) => (s || '').trim().toLowerCase()

// Nombres (normalizados) de los convenios marcados "pago en cuotas". Los pacientes guardan el convenio en `prevision`.
export async function conveniosEnCuotas(): Promise<Set<string>> {
  const { data } = await supabase.from('convenios').select('nombre_convenio').eq('pago_en_cuotas', true)
  return new Set((data || []).map((c: any) => normConvenio(c.nombre_convenio)))
}

export const esConvenioEnCuotas = (prevision: string | null | undefined, set: Set<string>) =>
  !!prevision && set.has(normConvenio(prevision))

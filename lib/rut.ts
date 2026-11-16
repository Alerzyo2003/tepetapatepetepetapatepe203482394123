// RUT chileno: comparar sin importar puntos, guion, espacios, ceros a la izquierda ni mayúsculas.
// "20.200.200-2", "20200200-2", "202002002" y "020200200-2" son el mismo RUT.
import { supabase } from '@/lib/supabase'

// Solo números y K, sin ceros a la izquierda: "20.200.200-2" -> "202002002"
export const limpiarRut = (valor?: string | null) =>
  (valor || '').toUpperCase().replace(/[^0-9K]/g, '').replace(/^0+/, '')

// Dígito verificador (módulo 11) de un cuerpo de RUT
export const calcularDv = (cuerpo: string) => {
  let suma = 0, mul = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const r = 11 - (suma % 11)
  return r === 11 ? '0' : r === 10 ? 'K' : String(r)
}

export const rutValido = (valor?: string | null) => {
  const l = limpiarRut(valor)
  if (l.length < 2 || !/^\d+[0-9K]$/.test(l)) return false
  return calcularDv(l.slice(0, -1)) === l.slice(-1)
}

// ¿Parece un RUT chileno (números + dígito verificador, con o sin puntos/guion)?
export const esRutChileno = (valor?: string | null) => /^[0-9.\s]+-?\s*[0-9kK]$/.test((valor || '').trim())

// Forma en que se guarda: cuerpo-DV sin puntos ("20200200-2")
export const rutParaGuardar = (valor?: string | null) => {
  const l = limpiarRut(valor)
  return l.length < 2 ? l : `${l.slice(0, -1)}-${l.slice(-1)}`
}

// Para mostrar: 20.200.200-2
export const rutParaMostrar = (valor?: string | null) => {
  const l = limpiarRut(valor)
  if (l.length < 2 || !/^\d+[0-9K]$/.test(l)) return valor || ''
  return `${l.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${l.slice(-1)}`
}

// Expresión para buscar en la base el RUT escrito de cualquier forma
const expresionBusqueda = (limpio: string) =>
  '^[0. -]*' + limpio.split('').map(c => (c === 'K' ? '[kK]' : c)).join('[. -]*') + '[. ]*$'

export interface PacienteMismoRut {
  id: string
  nombre: string | null
  apellido: string | null
  rut: string | null
  activo: boolean | null
  motivo_deshabilitado: string | null
  // 'igual': mismo RUT. 'sin_dv': se escribió el RUT sin el dígito verificador.
  coincidencia: 'igual' | 'sin_dv'
}

// Pacientes que ya tienen este RUT (escrito de cualquier forma).
// Si lo escrito no tiene un dígito verificador válido, también revisa si se olvidó el DV
// (ej: escribieron "20200200" y existe "20200200-2").
export async function buscarPacientesMismoRut(valor: string, excluirId?: string | null): Promise<PacienteMismoRut[]> {
  const limpio = limpiarRut(valor)
  if (limpio.length < 6 || !/^\d+[0-9K]$/.test(limpio)) return []

  const candidatos: { limpio: string; coincidencia: PacienteMismoRut['coincidencia'] }[] = [{ limpio, coincidencia: 'igual' }]
  if (!rutValido(limpio) && /^\d+$/.test(limpio)) candidatos.push({ limpio: limpio + calcularDv(limpio), coincidencia: 'sin_dv' })

  const resultados: PacienteMismoRut[] = []
  for (const c of candidatos) {
    let q = supabase.from('pacientes')
      .select('id, nombre, apellido, rut, activo, motivo_deshabilitado')
      .filter('rut', 'imatch', expresionBusqueda(c.limpio))
      .limit(10)
    if (excluirId) q = q.neq('id', excluirId)
    const { data, error } = await q
    if (error) { console.error('Buscar RUT repetido:', error); continue }
    ;(data || [])
      .filter((p: any) => limpiarRut(p.rut) === c.limpio && !resultados.some(r => r.id === p.id))
      .forEach((p: any) => resultados.push({ ...p, coincidencia: c.coincidencia }))
  }
  return resultados
}

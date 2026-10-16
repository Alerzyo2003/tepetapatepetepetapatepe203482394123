// Ocupación de la agenda de los próximos días: horario de cada doctor − bloqueos − horas tomadas.
import { CONFIG } from './config'
import { fechaISO, inicioDelDia, sumarDias } from './util'

type Tramo = [number, number] // minutos desde las 00:00

const aMin = (h: any) => { const [a, b] = String(h || '').substring(0, 5).split(':').map(Number); return (a || 0) * 60 + (b || 0) }
const minDeCita = (s: string) => { const t = String(s).replace(' ', 'T').split('T')[1] || '00:00'; return aMin(t) }

function unir(tramos: Tramo[]): Tramo[] {
  const t = tramos.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  const out: Tramo[] = []
  for (const [a, b] of t) {
    const ult = out[out.length - 1]
    if (ult && a <= ult[1]) ult[1] = Math.max(ult[1], b)
    else out.push([a, b])
  }
  return out
}
function restar(base: Tramo[], quitar: Tramo[]): Tramo[] {
  let res = unir(base)
  for (const [qa, qb] of unir(quitar)) {
    res = res.flatMap(([a, b]): Tramo[] => {
      if (qb <= a || qa >= b) return [[a, b]]
      const partes: Tramo[] = []
      if (qa > a) partes.push([a, qa])
      if (qb < b) partes.push([qb, b])
      return partes
    })
  }
  return res
}
const largo = (t: Tramo[]) => t.reduce((s, [a, b]) => s + (b - a), 0)

export interface DiaOcupacion { fecha: string; disponible: number; ocupado: number }
export interface DoctorOcupacion { userId: string; nombre: string; disponible: number; ocupado: number }
export interface Ocupacion { dias: DiaOcupacion[]; doctores: DoctorOcupacion[]; disponible: number; ocupado: number }

export function calcularOcupacion(profesionales: any[], disponibilidad: any[], bloqueos: any[], citasFuturas: any[], ahora: Date): Ocupacion {
  const activos = profesionales.filter(p => p.activo !== false && p.user_id)
  const hoy = inicioDelDia(ahora)
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes()
  const inactivas = CONFIG.ESTADOS_CITA_INACTIVA
  // Las solicitudes web sin validar no ocupan hora (igual que en "Buscar hora" de la agenda)
  const citas = citasFuturas.filter(c => !inactivas.includes(c.estado) && !(c.estado_confirmacion === 'pendiente' && String(c.motivo || '').includes('Online')))

  const dias: DiaOcupacion[] = []
  const porDoctor = new Map<string, DoctorOcupacion>(activos.map(p => [p.user_id, {
    userId: p.user_id, nombre: `${String(p.nombre || '').split(' ')[0]} ${String(p.apellido || '').split(' ')[0]}`.trim(), disponible: 0, ocupado: 0,
  }]))

  for (let i = 0; i < CONFIG.DIAS_OCUPACION; i++) {
    const dia = sumarDias(hoy, i)
    const f = fechaISO(dia)
    const d: DiaOcupacion = { fecha: f, disponible: 0, ocupado: 0 }
    for (const pro of activos) {
      const suyos = disponibilidad.filter(x => x.profesional_id === pro.user_id)
      const especiales = suyos.filter(x => x.fecha_especifica === f)
      const bloques = especiales.length ? especiales : suyos.filter(x => !x.fecha_especifica && Number(x.dia_semana) === dia.getDay())
      if (!bloques.length) continue
      const bloqDia = bloqueos.filter(b => b.profesional_id === pro.id && b.fecha === f)
      if (bloqDia.some(b => !b.hora_inicio || !b.hora_fin)) continue // día completo bloqueado

      let libre = restar(bloques.map(b => [aMin(b.hora_inicio), aMin(b.hora_fin)] as Tramo), bloqDia.map(b => [aMin(b.hora_inicio), aMin(b.hora_fin)] as Tramo))
      if (i === 0) libre = restar(libre, [[0, minAhora]]) // hoy: solo lo que queda del día
      const total = largo(libre)
      if (!total) continue
      const tomadas = citas.filter(c => c.profesional_id === pro.user_id && String(c.inicio).startsWith(f) && c.fin)
        .map(c => [minDeCita(c.inicio), minDeCita(c.fin)] as Tramo)
      const ocupado = total - largo(restar(libre, tomadas))
      d.disponible += total; d.ocupado += ocupado
      const doc = porDoctor.get(pro.user_id)!
      doc.disponible += total; doc.ocupado += ocupado
    }
    dias.push(d)
  }
  const doctores = [...porDoctor.values()].filter(x => x.disponible > 0).sort((a, b) => (b.disponible - b.ocupado) - (a.disponible - a.ocupado))
  return {
    dias, doctores,
    disponible: dias.reduce((s, x) => s + x.disponible, 0),
    ocupado: dias.reduce((s, x) => s + x.ocupado, 0),
  }
}

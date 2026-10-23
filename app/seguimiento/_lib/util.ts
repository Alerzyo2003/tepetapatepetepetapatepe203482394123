// Utilidades del Panel de Seguimiento (sin acceso a la base de datos)
import { CONFIG } from './config'

export const DIA_MS = 86_400_000

export const money = (v: number) => `$${Math.round(v || 0).toLocaleString('es-CL')}`
export const normalizar = (v: any) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
export const coincide = (texto: string, palabras: string[]) => palabras.some(p => texto.includes(normalizar(p)))
export const nombrePaciente = (p: any) => (p ? `${p.nombre || ''} ${p.apellido || ''}`.trim() : '') || 'Paciente sin ficha'
export const primerNombre = (p: any) => String(p?.nombre || '').trim().split(/\s+/)[0] || ''

// ── Fechas ──
const dos = (n: number) => String(n).padStart(2, '0')
export const fechaISO = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
// Las citas se guardan en hora local sin zona; los timestamptz (created_at, EvoFec) traen zona
export const aFecha = (s: any): Date | null => {
  if (!s) return null
  let txt = String(s).trim().replace(' ', 'T')
  if (txt.includes('T') && /[+-]\d\d$/.test(txt)) txt += ':00' // "…+00" → "…+00:00"
  const d = /[zZ]$|[+-]\d\d:?\d\d$/.test(txt) ? new Date(txt) : new Date(txt.length <= 10 ? `${txt}T00:00:00` : txt)
  return Number.isNaN(d.getTime()) ? null : d
}
export const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const sumarDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const sumarMeses = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }
// Días calendario entre dos fechas (round: los cambios de horario dejan días de 23 o 25 horas)
export const diasDesde = (d: Date | null, ahora: Date) => (d ? Math.round((inicioDelDia(ahora).getTime() - inicioDelDia(d).getTime()) / DIA_MS) : null)

export function haceTexto(dias: number | null) {
  if (dias === null) return ''
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 45) return `hace ${dias} días`
  const meses = Math.round(dias / 30.4)
  if (meses <= 1) return 'hace 1 mes'
  return meses < 18 ? `hace ${meses} meses` : `hace ${Math.round((dias / 365) * 10) / 10} años`.replace('.', ',')
}
export const fechaCorta = (d: Date | null) => (d ? d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: '2-digit' }) : '')
export const fechaConHora = (s: string | null | undefined) => {
  const d = aFecha(s)
  if (!d) return ''
  return `${d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })} ${dos(d.getHours())}:${dos(d.getMinutes())}`
}
export const fechaLargaTexto = (d: Date | null) => (d ? d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) : '')

// ── Prestaciones (presupuesto_items) ──
// nombre_prestacion trae metadatos: "NOMBRE | Cara: … | Fase: … | EvoDoc: … | EvoFec: 2026-10-01T…Z"
export const nombreItem = (item: any) => String(item?.nombre_prestacion || '').split('|')[0].trim()
export const nombreItemNorm = (item: any) => normalizar(nombreItem(item))
export const fechaEvolucion = (item: any): Date | null => {
  const m = String(item?.nombre_prestacion || '').match(/EvoFec:\s*([^|]+)/) || String(item?.observacion || '').match(/EvoFec:\s*([^|]+)/)
  return m ? aFecha(m[1].trim()) : null
}
export const itemRealizado = (item: any) =>
  CONFIG.ESTADOS_ITEM_REALIZADO.includes(String(item?.estado || '').toLowerCase().trim()) || Number(item?.progreso || 0) >= 100
export const itemIniciado = (item: any) => itemRealizado(item) || Number(item?.progreso || 0) > 0
export const itemAnulado = (item: any) => /cancel|anul/.test(String(item?.estado || '').toLowerCase())
export const pieza = (item: any): number | null => {
  const n = parseInt(String(item?.diente_id ?? '').trim(), 10)
  return Number.isNaN(n) || n <= 0 ? null : n
}
export const fechaPlan = (plan: any): Date | null => aFecha(plan?.fecha_creacion) || aFecha(plan?.created_at)
// Fecha en que se hizo la prestación: la última evolución; si no tiene, la fecha del plan (aproximada)
export function fechaItem(item: any, plan: any): { fecha: Date | null; aproximada: boolean } {
  const evo = fechaEvolucion(item)
  if (evo) return { fecha: evo, aproximada: false }
  return { fecha: fechaPlan(plan), aproximada: true }
}
export const saldoItem = (item: any) => Math.max(0, Number(item?.precio_pactado || 0) - Number(item?.abonado || 0))
export const textoPiezas = (piezas: (number | null)[]) => {
  const p = [...new Set(piezas.filter((x): x is number => x !== null))].sort((a, b) => a - b)
  return p.length === 0 ? '' : p.length === 1 ? `pieza ${p[0]}` : `piezas ${p.join(', ')}`
}

// ── Teléfono / WhatsApp ──
export function telefonoWA(tel: any): string | null {
  const n = String(tel || '').replace(/\D/g, '')
  if (!n) return null
  if (n.length === 9) return `56${n}`
  if (n.length === 8) return `569${n}`
  return n.length >= 10 ? n : null
}
let ventanaWhatsApp: Window | null = null
export function abrirWhatsApp(tel: any, mensaje: string): boolean {
  const num = telefonoWA(tel)
  if (!num) return false
  const texto = encodeURIComponent(mensaje)
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    window.open(`https://wa.me/${num}?text=${texto}`, '_blank')
    return true
  }
  const url = `https://web.whatsapp.com/send?phone=${num}&text=${texto}`
  if (ventanaWhatsApp && !ventanaWhatsApp.closed) {
    ventanaWhatsApp.location.href = url // carga el nuevo chat en la misma pestaña
    ventanaWhatsApp.focus()
  } else {
    ventanaWhatsApp = window.open(url, 'whatsapp-clinica')
  }
  return true
}

// Link a la agenda con el modal de "Agendar" abierto y el paciente precargado
export function linkAgendar(pacienteId: string, motivo?: string, doctorId?: string | null) {
  const p = new URLSearchParams({ agendar: pacienteId })
  if (motivo) p.set('motivo', motivo)
  if (doctorId) p.set('doctor', doctorId)
  return `/agenda?${p.toString()}`
}

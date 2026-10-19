'use client'
// Horario especial en varios días a la vez: se eligen los días en un calendario (o con una repetición
// "cada N semanas") y cada día puede tener su propio horario. Un horario especial reemplaza el horario
// semanal de ese día en la agenda.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Repeat, Save, Trash2, X } from 'lucide-react'

const DIAS_CORTOS = [
  { id: 1, corto: 'Lu', largo: 'lunes' }, { id: 2, corto: 'Ma', largo: 'martes' }, { id: 3, corto: 'Mi', largo: 'miércoles' },
  { id: 4, corto: 'Ju', largo: 'jueves' }, { id: 5, corto: 'Vi', largo: 'viernes' }, { id: 6, corto: 'Sá', largo: 'sábado' }, { id: 0, corto: 'Do', largo: 'domingo' },
]
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const aISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const deISO = (s: string) => new Date(`${s}T12:00:00`)
const sumarDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const lunesDe = (d: Date) => { const x = new Date(d); const dia = x.getDay() || 7; x.setDate(x.getDate() - dia + 1); return x }
const hhmm = (t: any) => String(t || '').substring(0, 5)
const etiquetaFecha = (s: string) => deISO(s).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })

interface Horario { inicio: string; fin: string }

interface Props {
  abierto: boolean
  onClose: () => void
  profesional: any | null      // fila de profesionales (id, user_id, nombre, apellido)
  disponibilidad: any[]        // horarios del profesional (semanales y especiales)
  bloqueos: any[]              // bloqueos_agenda del profesional
  onGuardado: () => void
}

export default function ModalHorarioEspecial({ abierto, onClose, profesional, disponibilidad, bloqueos, onGuardado }: Props) {
  const hoy = aISO(new Date())
  const [montado, setMontado] = useState(false)
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [seleccion, setSeleccion] = useState<Record<string, Horario>>({})
  const [inicio, setInicio] = useState('09:00')
  const [fin, setFin] = useState('13:00')
  const [box, setBox] = useState(1)
  // Repetición
  const [diasRep, setDiasRep] = useState<number[]>([])
  const [desde, setDesde] = useState(hoy)
  const [cada, setCada] = useState(2)
  const [semanas, setSemanas] = useState(8)
  const [cerrarIntermedias, setCerrarIntermedias] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => setMontado(true), [])
  useEffect(() => {
    if (!abierto) return
    const d = new Date()
    setMes(new Date(d.getFullYear(), d.getMonth(), 1))
    setSeleccion({}); setDiasRep([]); setDesde(aISO(d)); setCada(2); setSemanas(8); setCerrarIntermedias(false)
  }, [abierto])
  useEffect(() => {
    if (!abierto) return
    const alPresionar = (e: KeyboardEvent) => { if (e.key === 'Escape' && !guardando) onClose() }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [abierto, guardando, onClose])

  // ── Lo que ya existe para este profesional ──
  const especiales = useMemo(() => {
    const m: Record<string, any[]> = {}
    for (const d of disponibilidad) if (d.fecha_especifica) (m[d.fecha_especifica] ||= []).push(d)
    return m
  }, [disponibilidad])
  const semanales = useMemo(() => {
    const m: Record<number, any[]> = {}
    for (const d of disponibilidad) if (!d.fecha_especifica) (m[Number(d.dia_semana)] ||= []).push(d)
    return m
  }, [disponibilidad])
  const bloqueados = useMemo(() => {
    const m: Record<string, any> = {}
    for (const b of bloqueos) if (b.fecha) m[b.fecha] = b
    return m
  }, [bloqueos])

  // ── Repetición "cada N semanas" ──
  const repeticion = useMemo(() => {
    const abiertas: string[] = []
    const intermedias: string[] = []
    if (!diasRep.length || !desde || cada < 1 || semanas < 1) return { abiertas, intermedias }
    const inicioRep = deISO(desde)
    const lunes0 = lunesDe(inicioRep)
    for (let w = 0; w < Math.min(semanas, 104); w++) {
      for (const d of diasRep) {
        const fecha = aISO(sumarDias(lunes0, 7 * w + (d === 0 ? 6 : d - 1)))
        if (fecha < desde || fecha < hoy) continue
        if (w % cada === 0) abiertas.push(fecha); else intermedias.push(fecha)
      }
    }
    return { abiertas: abiertas.sort(), intermedias: intermedias.sort() }
  }, [diasRep, desde, cada, semanas, hoy])
  // Días de la repetición en que el doctor ya atiende todas las semanas: las semanas intermedias quedarían abiertas
  const diasConSemanal = diasRep.filter(d => semanales[d]?.length)

  const marcarRepeticion = () => {
    if (!repeticion.abiertas.length) return toast.error('Elige al menos un día de la semana y desde cuándo')
    setSeleccion(prev => {
      const nueva = { ...prev }
      for (const f of repeticion.abiertas) if (!nueva[f]) nueva[f] = { inicio, fin }
      return nueva
    })
    const primero = deISO(repeticion.abiertas[0])
    setMes(new Date(primero.getFullYear(), primero.getMonth(), 1))
    toast.success(`${repeticion.abiertas.length} días marcados en el calendario`)
  }

  const alternar = (fecha: string) => {
    if (fecha < hoy) return
    setSeleccion(prev => {
      const nueva = { ...prev }
      if (nueva[fecha]) delete nueva[fecha]; else nueva[fecha] = { inicio, fin }
      return nueva
    })
  }
  const cambiarHora = (fecha: string, campo: keyof Horario, valor: string) =>
    setSeleccion(prev => ({ ...prev, [fecha]: { ...prev[fecha], [campo]: valor } }))
  const aplicarATodos = () => setSeleccion(prev => Object.fromEntries(Object.keys(prev).map(f => [f, { inicio, fin }])))

  const fechas = Object.keys(seleccion).sort()
  const invalidas = fechas.filter(f => !seleccion[f].inicio || !seleccion[f].fin || seleccion[f].inicio >= seleccion[f].fin)
  const intermediasACerrar = cerrarIntermedias ? repeticion.intermedias.filter(f => !bloqueados[f]) : []

  async function guardar() {
    if (!profesional) return
    if (!fechas.length) return toast.error('Elige al menos un día en el calendario')
    if (invalidas.length) return toast.error(`Revisa el horario de ${invalidas.map(etiquetaFecha).join(', ')}: la hora de término debe ser después de la de inicio`)
    setGuardando(true)
    try {
      // No se duplica un horario idéntico que ya exista ese día
      const filas = fechas
        .filter(f => !(especiales[f] || []).some(e => hhmm(e.hora_inicio) === seleccion[f].inicio && hhmm(e.hora_fin) === seleccion[f].fin))
        .map(f => ({
          profesional_id: profesional.user_id,
          dia_semana: deISO(f).getDay(),
          hora_inicio: seleccion[f].inicio,
          hora_fin: seleccion[f].fin,
          box_id: box,
          fecha_especifica: f,
        }))
      if (filas.length) {
        const { error } = await supabase.from('disponibilidad_profesional').insert(filas)
        if (error) throw error
      }

      // Semanas intermedias: se cierran solo los días sin pacientes agendados
      let cerradas = 0
      let conPacientes: string[] = []
      if (intermediasACerrar.length) {
        const { data: citas, error: errCitas } = await supabase.from('citas').select('inicio')
          .eq('profesional_id', profesional.user_id).neq('estado', 'cancelada')
          .gte('inicio', `${intermediasACerrar[0]}T00:00:00`).lte('inicio', `${intermediasACerrar[intermediasACerrar.length - 1]}T23:59:59`)
        if (errCitas) throw errCitas
        const diasConCitas = new Set((citas || []).map(c => String(c.inicio).substring(0, 10)))
        conPacientes = intermediasACerrar.filter(f => diasConCitas.has(f))
        const aCerrar = intermediasACerrar.filter(f => !diasConCitas.has(f))
        if (aCerrar.length) {
          const { error } = await supabase.from('bloqueos_agenda')
            .insert(aCerrar.map(f => ({ profesional_id: profesional.id, fecha: f, motivo: 'Semana sin atención (horario intercalado)' })))
          if (error) throw error
          cerradas = aCerrar.length
        }
      }

      const omitidos = fechas.length - filas.length
      toast.success(`Horario especial guardado en ${filas.length} día${filas.length === 1 ? '' : 's'}`, {
        description: [
          omitidos ? `${omitidos} ya tenían ese mismo horario.` : '',
          cerradas ? `${cerradas} día${cerradas === 1 ? '' : 's'} intermedio${cerradas === 1 ? '' : 's'} cerrado${cerradas === 1 ? '' : 's'}.` : '',
        ].filter(Boolean).join(' ') || undefined,
      })
      if (conPacientes.length) {
        toast.warning(`No se cerraron ${conPacientes.length} día${conPacientes.length === 1 ? '' : 's'} porque tienen pacientes agendados`, {
          description: `${conPacientes.map(etiquetaFecha).join(', ')}. Bloquéalos desde "Inasistencia" para reagendar a esos pacientes.`, duration: 10000,
        })
      }
      onGuardado()
      onClose()
    } catch (e: any) {
      console.error(e)
      toast.error('No se pudo guardar el horario especial', { description: e?.message })
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto || !montado) return null

  // Grilla del mes (lunes a domingo)
  const primerDia = lunesDe(mes)
  const celdas = Array.from({ length: 42 }, (_, i) => sumarDias(primerDia, i))
  let ultimoDelMes = 0
  celdas.forEach((d, i) => { if (d.getMonth() === mes.getMonth()) ultimoDelMes = i })
  const visibles = celdas.slice(0, Math.ceil((ultimoDelMes + 1) / 7) * 7)
  const marcadasRep = new Set(repeticion.abiertas)

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-[#0A111F]/60 backdrop-blur-sm p-2 sm:p-4" onClick={() => !guardando && onClose()}>
      <div className="bg-[#FBF8F2] w-full max-w-6xl max-h-[94vh] flex flex-col rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Encabezado */}
        <div className="bg-[#0A111F] px-6 sm:px-8 py-5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4 text-white min-w-0">
            <div className="bg-[#C9A24B]/15 border border-[#C9A24B]/50 p-3 rounded-2xl shrink-0"><CalendarDays size={24} className="text-[#C9A24B]" /></div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black uppercase italic leading-none tracking-tight">Horario especial</h2>
              <p className="text-[#E8CD8A] text-[10px] font-black uppercase tracking-[0.2em] mt-1.5 truncate">
                Dr. {profesional?.nombre} {profesional?.apellido} · elige uno o varios días
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={guardando} className="p-2.5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full" aria-label="Cerrar"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-8 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6">
          {/* Columna izquierda: repetición + calendario */}
          <div className="space-y-5">
            {/* Repetición cada N semanas */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Repeat size={13} className="text-[#C9A24B]" /> Repetir (opcional)</p>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Días</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {DIAS_CORTOS.map(d => {
                    const activo = diasRep.includes(d.id)
                    return (
                      <button key={d.id} type="button" onClick={() => setDiasRep(prev => (activo ? prev.filter(x => x !== d.id) : [...prev, d.id]))}
                        className={`w-10 h-10 rounded-xl text-[11px] font-black border transition-all ${activo ? 'bg-[#0A111F] text-[#C9A24B] border-[#0A111F]' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-white'}`}>
                        {d.corto}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Desde</span>
                  <input type="date" min={hoy} value={desde} onChange={e => setDesde(e.target.value)} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:border-[#C9A24B]" />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Frecuencia</span>
                  <select value={cada} onChange={e => setCada(Number(e.target.value))} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:border-[#C9A24B]">
                    <option value={1}>Todas las semanas</option>
                    <option value={2}>Semana por medio</option>
                    <option value={3}>Cada 3 semanas</option>
                    <option value={4}>Cada 4 semanas</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Durante</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input type="number" min={1} max={104} value={semanas} onChange={e => setSemanas(Math.max(1, Math.min(104, Number(e.target.value) || 1)))} className="w-20 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:border-[#C9A24B]" />
                    <span className="text-xs font-bold text-slate-500">semanas</span>
                  </div>
                </label>
              </div>
              {diasRep.length > 0 && (
                <p className="text-[11px] font-semibold text-slate-500">
                  Se abrirán <span className="font-black text-slate-800">{repeticion.abiertas.length}</span> días
                  {cada > 1 && repeticion.intermedias.length > 0 && <> y quedan <span className="font-black text-slate-800">{repeticion.intermedias.length}</span> días intermedios sin atención</>}.
                </p>
              )}
              {cada > 1 && diasConSemanal.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 space-y-2">
                  <p className="flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                    <span>El doctor ya atiende los {diasConSemanal.map(d => DIAS_CORTOS.find(x => x.id === d)?.largo).join(' y ')} todas las semanas (horario semanal). Las semanas intermedias quedarían abiertas igual.</span>
                  </p>
                  <label className="flex items-center gap-2 font-bold cursor-pointer">
                    <input type="checkbox" checked={cerrarIntermedias} onChange={e => setCerrarIntermedias(e.target.checked)} className="w-4 h-4 accent-[#0A111F]" />
                    Cerrar los días intermedios (se bloquean los que no tienen pacientes)
                  </label>
                </div>
              )}
              <button type="button" onClick={marcarRepeticion} disabled={!diasRep.length}
                className="w-full py-3 rounded-xl bg-[#C9A24B] text-[#0A111F] text-[11px] font-black uppercase tracking-widest hover:bg-[#B38D3A] disabled:opacity-40 flex items-center justify-center gap-2">
                <Repeat size={14} /> Marcar en el calendario
              </button>
            </div>

            {/* Calendario */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500" aria-label="Mes anterior"><ChevronLeft size={18} /></button>
                <p className="text-sm font-black uppercase tracking-widest text-[#0A111F]">{MESES[mes.getMonth()]} {mes.getFullYear()}</p>
                <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500" aria-label="Mes siguiente"><ChevronRight size={18} /></button>
              </div>
              <div className="grid grid-cols-7 gap-1.5 text-center">
                {DIAS_CORTOS.map(d => <span key={d.id} className="text-[10px] font-black uppercase text-slate-400 pb-1">{d.corto}</span>)}
                {visibles.map(d => {
                  const f = aISO(d)
                  const delMes = d.getMonth() === mes.getMonth()
                  const pasado = f < hoy
                  const elegido = !!seleccion[f]
                  const yaEspecial = !!especiales[f]
                  const bloqueado = !!bloqueados[f]
                  const atiende = !!semanales[d.getDay()]?.length
                  return (
                    <button key={f} type="button" disabled={pasado} onClick={() => alternar(f)}
                      title={[yaEspecial ? `Ya tiene horario especial: ${especiales[f].map(e => `${hhmm(e.hora_inicio)}–${hhmm(e.hora_fin)}`).join(', ')}` : '', bloqueado ? 'Día bloqueado' : '', atiende ? 'Atiende normalmente (horario semanal)' : ''].filter(Boolean).join(' · ') || undefined}
                      className={`relative h-11 sm:h-12 rounded-xl text-xs font-black transition-all border
                        ${!delMes ? 'opacity-35' : ''}
                        ${pasado ? 'text-slate-300 border-transparent cursor-not-allowed' :
                          elegido ? 'bg-[#0A111F] text-white border-[#0A111F] shadow-md' :
                          marcadasRep.has(f) ? 'bg-[#C9A24B]/10 border-[#C9A24B]/40 text-[#8A6D2F]' :
                          atiende ? 'bg-slate-50 border-slate-200 text-slate-700 hover:border-[#C9A24B]' : 'bg-white border-slate-100 text-slate-500 hover:border-[#C9A24B]'}
                        ${bloqueado && !elegido ? 'line-through decoration-red-400' : ''}`}>
                      {d.getDate()}
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                        {yaEspecial && <span className="w-1.5 h-1.5 rounded-full bg-[#C9A24B]" />}
                        {bloqueado && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-bold text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#0A111F]" /> Elegido</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-50 border border-slate-300" /> Atiende normalmente</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#C9A24B]" /> Ya tiene horario especial</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Bloqueado</span>
              </div>
            </div>
          </div>

          {/* Columna derecha: horario por día */}
          <div className="space-y-5">
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Horario para los días nuevos</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Desde</span>
                  <input type="time" value={inicio} onChange={e => setInicio(e.target.value)} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:border-[#C9A24B]" />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hasta</span>
                  <input type="time" value={fin} onChange={e => setFin(e.target.value)} className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none focus:border-[#C9A24B]" />
                </label>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Box</span>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {[1, 2, 3].map(n => (
                    <button type="button" key={n} onClick={() => setBox(n)} className={`py-2.5 rounded-xl text-[11px] font-black tracking-widest border ${box === n ? 'bg-[#0A111F] text-[#C9A24B] border-[#0A111F]' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-white'}`}>BOX {n}</button>
                  ))}
                </div>
              </div>
              {fechas.length > 0 && (
                <button type="button" onClick={aplicarATodos} className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50">
                  Aplicar {inicio}–{fin} a los {fechas.length} días elegidos
                </button>
              )}
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Días elegidos · {fechas.length}</p>
                {fechas.length > 0 && <button type="button" onClick={() => setSeleccion({})} className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:underline">Quitar todos</button>}
              </div>
              {fechas.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">Toca los días en el calendario o usa "Repetir".</p>
              ) : (
                <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                  {fechas.map(f => {
                    const h = seleccion[f]
                    const mal = invalidas.includes(f)
                    const avisos = [
                      especiales[f] ? `Ya tiene: ${especiales[f].map(e => `${hhmm(e.hora_inicio)}–${hhmm(e.hora_fin)}`).join(', ')}` : '',
                      bloqueados[f] ? (bloqueados[f].hora_inicio ? 'Tiene un bloqueo de algunas horas' : 'Día bloqueado: no se podrá agendar') : '',
                      !especiales[f] && semanales[deISO(f).getDay()]?.length ? `Reemplaza su horario semanal (${semanales[deISO(f).getDay()].map(e => `${hhmm(e.hora_inicio)}–${hhmm(e.hora_fin)}`).join(', ')})` : '',
                    ].filter(Boolean)
                    return (
                      <div key={f} className={`rounded-2xl border p-3 ${mal ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-slate-50/50'}`}>
                        <div className="flex items-center gap-2">
                          <span className="w-24 shrink-0 text-xs font-black text-slate-800 capitalize">{etiquetaFecha(f)}</span>
                          <input type="time" value={h.inicio} onChange={e => cambiarHora(f, 'inicio', e.target.value)} className="flex-1 min-w-0 p-2 bg-white border border-slate-200 rounded-lg font-bold text-xs text-slate-900 outline-none focus:border-[#C9A24B]" aria-label="Desde" />
                          <span className="text-slate-400 text-xs">a</span>
                          <input type="time" value={h.fin} onChange={e => cambiarHora(f, 'fin', e.target.value)} className="flex-1 min-w-0 p-2 bg-white border border-slate-200 rounded-lg font-bold text-xs text-slate-900 outline-none focus:border-[#C9A24B]" aria-label="Hasta" />
                          <button type="button" onClick={() => alternar(f)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50" aria-label="Quitar día"><Trash2 size={14} /></button>
                        </div>
                        {avisos.length > 0 && <p className="mt-1.5 text-[10px] font-semibold text-amber-700">{avisos.join(' · ')}</p>}
                        {mal && <p className="mt-1 text-[10px] font-bold text-red-600">La hora de término debe ser después de la de inicio</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pie */}
        <div className="px-4 sm:px-8 py-4 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] font-semibold text-slate-500 flex items-start gap-2">
            <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-[#C9A24B]" />
            Un horario especial reemplaza el horario semanal de ese día. Para agregar un segundo tramo (ej. la tarde), vuelve a abrir el calendario con esos mismos días.
          </p>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={onClose} disabled={guardando} className="px-5 py-3.5 rounded-2xl border border-slate-200 text-slate-600 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50">Cancelar</button>
            <button type="button" onClick={guardar} disabled={guardando || !fechas.length}
              className="px-6 py-3.5 rounded-2xl bg-[#0A111F] text-white text-[11px] font-black uppercase tracking-widest hover:bg-[#1a2538] disabled:opacity-40 flex items-center justify-center gap-2">
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Guardar {fechas.length || ''} día{fechas.length === 1 ? '' : 's'}{intermediasACerrar.length ? ` y cerrar ${intermediasACerrar.length}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

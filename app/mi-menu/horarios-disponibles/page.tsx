'use client'
// Horarios que quedaron libres porque otro doctor no viene (bloqueo/inasistencia).
// Un doctor puede reclamar el tramo y se le asigna de inmediato como horario especial ese día.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CalendarCheck2, Loader2, Sun, Sunset, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRole } from '@/app/hooks/useRole'

const hhmm = (t: any) => String(t || '').substring(0, 5)
const etiquetaDia = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
const nombreCorto = (n?: string) => (n || '').split(/\s+/).filter(Boolean).slice(0, 3).join(' ')
const esAM = (t: any) => hhmm(t) < '13:30'

export default function HorariosDisponiblesPage() {
  const { rol } = useRole() as any
  const [filas, setFilas] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const esAdmin = rol === 'ADMIN'
  const puedeReclamar = rol === 'DENTISTA'

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('horarios_liberados', { p_dias: 30 })
    if (error) toast.error('No se pudieron cargar los horarios', { description: error.message })
    else setFilas(data || [])
    setCargando(false)
  }, [])
  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 30000)
    return () => clearInterval(t)
  }, [cargar])

  const clave = (f: any) => `${f.bloqueo_id}-${f.hora_inicio}-${f.hora_fin}`

  const reclamar = async (f: any) => {
    if (!window.confirm(`¿Reclamar ${etiquetaDia(f.fecha)} de ${hhmm(f.hora_inicio)} a ${hhmm(f.hora_fin)}?\n\nSe agregará a tu agenda como horario especial ese día.`)) return
    setTrabajando(clave(f))
    const { error } = await supabase.rpc('reclamar_horario', { p_bloqueo: f.bloqueo_id, p_fecha: f.fecha, p_inicio: f.hora_inicio, p_fin: f.hora_fin })
    setTrabajando(null)
    if (error) toast.error('No se pudo reclamar el horario', { description: error.message })
    else toast.success('Horario asignado', { description: `${etiquetaDia(f.fecha)} · ${hhmm(f.hora_inicio)}–${hhmm(f.hora_fin)}` })
    cargar()
  }
  const liberar = async (f: any) => {
    if (!window.confirm('¿Liberar este horario? Volverá a quedar disponible para otros doctores y se quita de tu agenda.')) return
    setTrabajando(clave(f))
    const { error } = await supabase.rpc('liberar_horario_reclamado', { p_id: f.reclamado_id })
    setTrabajando(null)
    if (error) toast.error('No se pudo liberar', { description: error.message })
    else toast.success('Horario liberado')
    cargar()
  }

  const mios = filas.filter(f => f.es_mio)
  const porDia = filas.reduce((acc: Record<string, any[]>, f) => { (acc[f.fecha] ||= []).push(f); return acc }, {})
  const dias = Object.keys(porDia).sort()

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#C9A24B]">Mi menú</p>
      <h1 className="font-serif text-3xl font-black text-[#0A111F]">Horarios disponibles</h1>
      <p className="mt-1 max-w-2xl text-[12px] font-semibold text-slate-500">
        Cuando un doctor no puede venir, su horario queda libre. Aquí puedes reclamarlo: el primero que lo toma se lo queda y se agrega de inmediato a su agenda.
        {!puedeReclamar && !esAdmin && ' Solo los doctores pueden reclamar horarios.'}
      </p>

      {mios.length > 0 && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Tus horarios reclamados</p>
          <ul className="mt-2 space-y-1.5">
            {mios.map(f => (
              <li key={clave(f)} className="flex items-center justify-between gap-3 text-[12px] font-bold text-slate-700">
                <span className="capitalize">{etiquetaDia(f.fecha)} · {hhmm(f.hora_inicio)}–{hhmm(f.hora_fin)} <span className="font-semibold text-slate-400">(de {nombreCorto(f.origen_nombre)})</span></span>
                <button onClick={() => liberar(f)} disabled={trabajando === clave(f)} className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rose-600 hover:underline"><Undo2 size={12} /> Liberar</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cargando ? <p className="mt-8 flex items-center gap-2 text-sm font-semibold text-slate-400"><Loader2 size={16} className="animate-spin" /> Cargando…</p>
        : dias.length === 0 ? <p className="mt-8 text-sm font-semibold text-slate-400">No hay horarios liberados por ahora.</p> : (
        <div className="mt-5 space-y-3">
          {dias.map(d => (
            <div key={d} className="rounded-2xl border border-slate-100 bg-white p-4">
              <p className="text-[12px] font-black capitalize text-[#0A111F]">{etiquetaDia(d)}</p>
              <div className="mt-2 space-y-2">
                {porDia[d].map((f: any) => (
                  <div key={clave(f)} className="flex flex-wrap items-center gap-3 rounded-xl bg-[#FBF8F2] px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-[12px] font-black text-slate-700">
                      {esAM(f.hora_inicio) ? <Sun size={13} className="text-[#C9A24B]" /> : <Sunset size={13} className="text-[#C9A24B]" />}
                      {esAM(f.hora_inicio) ? 'AM' : 'PM'} · {hhmm(f.hora_inicio)}–{hhmm(f.hora_fin)}
                    </span>
                    <span className="flex-1 text-[11px] font-semibold text-slate-500">
                      Libera: {nombreCorto(f.origen_nombre)}{esAdmin && f.motivo ? ` (${f.motivo})` : ''}
                    </span>
                    {f.reclamado ? (
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {f.es_mio ? 'Es tuyo' : `Reclamado por ${nombreCorto(f.reclamado_por)}`}
                        {(f.es_mio || esAdmin) && <button onClick={() => liberar(f)} disabled={trabajando === clave(f)} className="ml-3 text-rose-600 hover:underline">Liberar</button>}
                      </span>
                    ) : f.cubierto_por ? (
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ya cubierto por {nombreCorto(f.cubierto_por)}</span>
                    ) : puedeReclamar && f.origen_user_id !== undefined ? (
                      <button onClick={() => reclamar(f)} disabled={trabajando === clave(f)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A111F] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40">
                        {trabajando === clave(f) ? <Loader2 size={12} className="animate-spin" /> : <CalendarCheck2 size={12} />} Reclamar
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

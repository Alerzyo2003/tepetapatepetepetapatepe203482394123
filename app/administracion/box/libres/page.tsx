'use client'
// Boxes libres por día y turno (AM / PM): se calcula con los horarios de los doctores dentales
// (semanal o especial de ese día) menos sus bloqueos. Sirve para ofrecer un box cuando un doctor no puede venir.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2, Sun, Sunset, DoorOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const aISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const deISO = (s: string) => new Date(`${s}T12:00:00`)
const hhmm = (t: any) => String(t || '').substring(0, 5)
const aMin = (t: any) => { const [h, m] = hhmm(t).split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const deMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
const etiquetaDia = (s: string) => deISO(s).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
const nombreCorto = (p: any) => `${String(p.nombre || '').split(' ')[0]} ${String(p.apellido || '').split(' ')[0]}`.trim()

// Turnos: AM hasta las 13:00, PM desde las 14:00 (la colación 13:00–14:00 no se ofrece)
const TURNOS = { AM: { desde: 8 * 60 + 30, hasta: 13 * 60 }, PM: { desde: 14 * 60, hasta: 20 * 60 } } as const
const PASO = 30

interface Tramo { desde: number; hasta: number }

export default function BoxesLibresPage() {
  const [capacidad, setCapacidad] = useState(4)
  const [dias, setDias] = useState(14)
  const [turno, setTurno] = useState<'AM' | 'PM' | 'ambos'>('ambos')
  const [soloLiberados, setSoloLiberados] = useState(false)
  const [profs, setProfs] = useState<any[]>([])
  const [disp, setDisp] = useState<any[]>([])
  const [bloqueos, setBloqueos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    try { const g = Number(localStorage.getItem('boxes-capacidad')); if (g >= 1 && g <= 12) setCapacidad(g) } catch { /* sin acceso */ }
  }, [])
  const cambiarCapacidad = (n: number) => {
    const v = Math.max(1, Math.min(12, n || 1)); setCapacidad(v)
    try { localStorage.setItem('boxes-capacidad', String(v)) } catch { /* sin acceso */ }
  }

  const fechas = useMemo(() => {
    const out: string[] = []
    const hoy = new Date()
    for (let i = 0; i < dias; i++) { const d = new Date(hoy); d.setDate(hoy.getDate() + i); out.push(aISO(d)) }
    return out
  }, [dias])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      const [p, d, b] = await Promise.all([
        supabase.from('profesionales').select('id, user_id, nombre, apellido, tipo_box').eq('activo', true).eq('tipo_box', 'dental'),
        supabase.from('disponibilidad_profesional').select('profesional_id, dia_semana, hora_inicio, hora_fin, fecha_especifica').or(`fecha_especifica.is.null,and(fecha_especifica.gte.${fechas[0]},fecha_especifica.lte.${fechas[fechas.length - 1]})`).limit(5000),
        supabase.from('bloqueos_agenda').select('profesional_id, fecha, hora_inicio, hora_fin, motivo').gte('fecha', fechas[0]).lte('fecha', fechas[fechas.length - 1]).limit(5000),
      ])
      if (!vivo) return
      setProfs(p.data || []); setDisp(d.data || []); setBloqueos(b.data || [])
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [fechas])

  // Para cada día: tramos de cada doctor (horario especial del día si existe; si no, el semanal), con y sin bloqueos
  const resultado = useMemo(() => {
    return fechas.map(f => {
      const dow = deISO(f).getDay()
      const porDoctor = profs.map(p => {
        const filas = disp.filter(x => x.profesional_id === p.user_id)
        const especiales = filas.filter(x => x.fecha_especifica === f)
        const base = (especiales.length ? especiales : filas.filter(x => !x.fecha_especifica && Number(x.dia_semana) === dow))
        const normal: Tramo[] = base.map(x => ({ desde: aMin(x.hora_inicio), hasta: aMin(x.hora_fin) }))
        const bl = bloqueos.filter(x => x.profesional_id === p.id && x.fecha === f)
        const diaCompleto = bl.some(x => !x.hora_inicio)
        const parciales: Tramo[] = bl.filter(x => x.hora_inicio).map(x => ({ desde: aMin(x.hora_inicio), hasta: aMin(x.hora_fin) }))
        const motivo = bl.find(x => x.motivo)?.motivo || ''
        return { p, normal, diaCompleto, parciales, motivo, semanal: filas.filter(x => !x.fecha_especifica && Number(x.dia_semana) === dow).map(x => ({ desde: aMin(x.hora_inicio), hasta: aMin(x.hora_fin) })) }
      })
      const cubre = (tr: Tramo[], m: number) => tr.some(t => m >= t.desde && m < t.hasta)
      const turnos = (['AM', 'PM'] as const).map(nombre => {
        const { desde, hasta } = TURNOS[nombre]
        const slots: { m: number; libres: number; liberados: any[] }[] = []
        for (let m = desde; m < hasta; m += PASO) {
          let trabajando = 0
          const liberados: any[] = []
          for (const x of porDoctor) {
            const atiende = cubre(x.normal, m) && !x.diaCompleto && !cubre(x.parciales, m)
            if (atiende) trabajando++
            else if (cubre(x.semanal, m) || cubre(x.normal, m)) liberados.push(x) // debería atender pero no viene (bloqueo)
          }
          slots.push({ m, libres: Math.max(0, capacidad - trabajando), liberados })
        }
        // Une tramos seguidos con la misma cantidad de boxes libres
        const rangos: { desde: number; hasta: number; libres: number; liberados: any[] }[] = []
        for (const s of slots) {
          if (s.libres <= 0) continue
          const ult = rangos[rangos.length - 1]
          const mismos = ult && ult.hasta === s.m && ult.libres === s.libres && ult.liberados.map(l => l.p.id).join() === s.liberados.map(l => l.p.id).join()
          if (mismos) ult.hasta = s.m + PASO
          else rangos.push({ desde: s.m, hasta: s.m + PASO, libres: s.libres, liberados: s.liberados })
        }
        return { nombre, rangos }
      })
      return { fecha: f, turnos }
    })
  }, [fechas, profs, disp, bloqueos, capacidad])

  const dom = (f: string) => deISO(f).getDay() === 0

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <Link href="/administracion/box" className="mb-4 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-[#C9A24B]"><ChevronLeft size={14} /> Gestión de Box</Link>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#C9A24B]">Disponibilidad</p>
      <h1 className="font-serif text-3xl font-black text-[#0A111F]">Boxes libres</h1>
      <p className="mt-1 max-w-2xl text-[12px] font-semibold text-slate-500">
        Muestra cuándo queda al menos un box sin doctor, por turno (AM hasta las 13:00, PM desde las 14:00). Considera el horario semanal o especial de cada doctor y descuenta sus bloqueos, así ves qué se liberó cuando alguien no puede venir.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4 rounded-2xl border border-slate-100 bg-white p-4">
        <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Boxes de la clínica</span>
          <input type="number" min={1} max={12} value={capacidad} onChange={e => cambiarCapacidad(Number(e.target.value))} className="mt-1 block w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" /></label>
        <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Próximos</span>
          <select value={dias} onChange={e => setDias(Number(e.target.value))} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"><option value={7}>7 días</option><option value={14}>14 días</option><option value={30}>30 días</option></select></label>
        <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Turno</span>
          <select value={turno} onChange={e => setTurno(e.target.value as any)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"><option value="ambos">AM y PM</option><option value="AM">Solo AM</option><option value="PM">Solo PM</option></select></label>
        <label className="flex items-center gap-2 pb-2 text-[11px] font-bold text-slate-500"><input type="checkbox" checked={soloLiberados} onChange={e => setSoloLiberados(e.target.checked)} /> Solo los liberados por un doctor que no viene</label>
      </div>
      <p className="mt-2 text-[10px] font-semibold text-slate-400">Los horarios están todos registrados en “Box 1”, por eso el cálculo es: boxes de la clínica menos doctores atendiendo a esa hora. Solo considera doctores dentales activos.</p>

      {cargando ? <p className="mt-8 flex items-center gap-2 text-sm font-semibold text-slate-400"><Loader2 size={16} className="animate-spin" /> Calculando…</p> : (
        <div className="mt-5 space-y-3">
          {resultado.filter(r => !dom(r.fecha)).map(r => {
            const turnosVer = r.turnos.filter(t => (turno === 'ambos' || turno === t.nombre)).map(t => ({ ...t, rangos: soloLiberados ? t.rangos.filter(x => x.liberados.length) : t.rangos }))
            const hay = turnosVer.some(t => t.rangos.length)
            return (
              <div key={r.fecha} className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-[12px] font-black capitalize text-[#0A111F]">{etiquetaDia(r.fecha)}</p>
                {!hay ? <p className="mt-1 text-[11px] font-semibold text-slate-400">Sin boxes libres.</p> : (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {turnosVer.map(t => (
                      <div key={t.nombre} className="rounded-xl bg-[#FBF8F2] p-3">
                        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">{t.nombre === 'AM' ? <Sun size={12} className="text-[#C9A24B]" /> : <Sunset size={12} className="text-[#C9A24B]" />} {t.nombre}</p>
                        {t.rangos.length === 0 ? <p className="mt-1 text-[11px] font-semibold text-slate-400">Completo</p> : t.rangos.map((g, i) => (
                          <div key={i} className="mt-1.5 text-[12px] font-bold text-slate-700">
                            <span className="inline-flex items-center gap-1.5"><DoorOpen size={13} className="text-emerald-600" /> {deMin(g.desde)}–{deMin(g.hasta)} · <span className="text-emerald-700">{g.libres} box{g.libres === 1 ? '' : 'es'} libre{g.libres === 1 ? '' : 's'}</span></span>
                            {g.liberados.length > 0 && <span className="block pl-5 text-[10px] font-semibold text-amber-700">Liberado: {g.liberados.map(l => `${nombreCorto(l.p)}${l.motivo ? ` (${l.motivo})` : ''}`).join(', ')}</span>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

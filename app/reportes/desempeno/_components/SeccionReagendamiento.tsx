'use client'
// Sección del panel de Desempeño: cuántos pacientes se reagendan solos con el enlace de WhatsApp.
import { useEffect, useRef, useState } from 'react'
import { CalendarCheck2, CalendarSync, CalendarX, Hourglass, Link2, Percent, UserCheck } from 'lucide-react'
import { cargarReagendamiento, textoEstadoCita, type ResumenReagendamiento } from '@/lib/reagendamientoEnlaces'
import { Card, EmptyState, Kpi, MiniStat, SectionTitle, Seccion } from './ui'
import { nombreCompleto, porcentaje, rangoMes, ratio } from '../_lib/util'

const fechaHora = (s: string | null, conZona = false) => {
  if (!s) return '—'
  const d = new Date(conZona ? s : s.replace(' ', 'T'))
  return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', '')
}

export default function SeccionReagendamiento({ numero, anio, mes, filtroDoc, profesionales }: {
  numero: number; anio: number; mes: number; filtroDoc: string | null; profesionales: any[]
}) {
  const [datos, setDatos] = useState<ResumenReagendamiento | null>(null)
  const [error, setError] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  const req = useRef(0)

  useEffect(() => {
    const n = ++req.current
    const r = rangoMes(anio, mes)
    setError(false)
    cargarReagendamiento(r.desdeTz, r.hastaTz, filtroDoc)
      .then(d => { if (n === req.current) setDatos(d) })
      .catch(e => { console.error('Reagendamiento por enlace:', e); if (n === req.current) setError(true) })
  }, [anio, mes, filtroDoc])

  const doctor = (id: string | null) => {
    const p = profesionales.find(x => x.user_id === id)
    return p ? nombreCompleto(p) : '—'
  }

  const d = datos
  const tasa = d ? ratio(d.reagendaronDeEsteEnvio, d.pacientesConEnlace) : 0
  const lista = d ? (verTodos ? d.lista : d.lista.slice(0, 12)) : []

  return (
    <Seccion id="reagendamiento" numero={numero} titulo="Reagendamiento por enlace"
      subtitulo="Pacientes que eligieron su nueva hora solos con el enlace que se manda por WhatsApp (sobre todo a los que no asistieron).">
      {error && <EmptyState text="No se pudo cargar el reagendamiento por enlace." />}
      {!error && !d && <EmptyState text="Cargando…" />}
      {d && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={CalendarSync} accent="#7c3aed" label="Se reagendaron con el enlace" value={String(d.reagendaron)} sub="Usaron el enlace este mes" />
            <Kpi icon={Link2} accent="#0d9488" label="Pacientes con enlace" value={String(d.pacientesConEnlace)} sub="A quienes se les mandó este mes" />
            <Kpi icon={Percent} accent="#0284c7" label="Lo usaron" value={d.pacientesConEnlace ? porcentaje(tasa, 0) : '—'}
              sub={`${d.reagendaronDeEsteEnvio} de ${d.pacientesConEnlace} enlaces mandados este mes`} />
            <Kpi icon={UserCheck} accent="#059669" label="Asistieron a la nueva hora" value={String(d.asistieron)}
              sub={d.noAsistieron ? `${d.noAsistieron} volvieron a faltar` : 'De los que se reagendaron este mes'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <SectionTitle icon={Hourglass} label="Enlaces mandados este mes" />
              <MiniStat label="Pacientes con enlace" value={d.pacientesConEnlace} />
              <MiniStat label="Se reagendaron" value={d.reagendaronDeEsteEnvio} />
              <MiniStat label="Todavía pueden usarlo" value={d.esperando} hint="El enlace dura 7 días" />
              <MiniStat label="Vencieron sin usarse" value={d.vencidos} negativo={d.vencidos > 0} hint="Conviene llamarlos" />
            </Card>
            <Card className="lg:col-span-2">
              <SectionTitle icon={CalendarCheck2} label={`Quiénes se reagendaron (${d.lista.length})`}
                extra={d.lista.length > 12 && (
                  <button type="button" onClick={() => setVerTodos(v => !v)} className="text-[10px] font-black uppercase tracking-widest text-teal-600 hover:underline">
                    {verTodos ? 'Ver menos' : 'Ver todos'}
                  </button>
                )} />
              {d.lista.length === 0 ? <EmptyState text="Nadie se ha reagendado con el enlace este mes." /> : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <th className="px-2 py-2">Paciente</th>
                        <th className="px-2 py-2">Doctor</th>
                        <th className="px-2 py-2">Hora que perdió</th>
                        <th className="px-2 py-2">Nueva hora</th>
                        <th className="px-2 py-2">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map(r => {
                        const e = textoEstadoCita(r.estado_cita_nueva, r.inicio_nuevo)
                        return (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="px-2 py-2 font-bold text-slate-700">
                              <a href={`/pacientes/${r.paciente_id}`} className="hover:text-teal-600 hover:underline">{r.paciente}</a>
                              <span className="block text-[10px] font-semibold text-slate-400">Eligió el {fechaHora(r.usado_en, true)}</span>
                            </td>
                            <td className="px-2 py-2 text-slate-500">{doctor(r.profesional_id)}</td>
                            <td className="px-2 py-2 text-slate-500 whitespace-nowrap"><CalendarX size={11} className="inline mr-1 text-rose-400" />{fechaHora(r.inicio_original)}</td>
                            <td className="px-2 py-2 font-bold text-slate-700 whitespace-nowrap">{fechaHora(r.inicio_nuevo)}</td>
                            <td className="px-2 py-2"><span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-black ${e.clase}`}>{e.texto}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </Seccion>
  )
}

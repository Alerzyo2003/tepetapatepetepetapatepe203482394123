'use client'
// Agenda de los próximos días: cuánto está ocupado y cuántas horas quedan libres para llenar
import Link from 'next/link'
import { CalendarDays, Search } from 'lucide-react'
import type { Ocupacion } from '../_lib/agenda'

const horas = (min: number) => `${(Math.round((min / 60) * 10) / 10).toLocaleString('es-CL')} h`
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const color = (p: number) => (p >= 85 ? 'bg-emerald-500' : p >= 60 ? 'bg-amber-400' : 'bg-rose-400')

export default function PanelAgenda({ ocupacion }: { ocupacion: Ocupacion }) {
  const libre = ocupacion.disponible - ocupacion.ocupado
  const total = pct(ocupacion.ocupado, ocupacion.disponible)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0"><CalendarDays size={20} /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Agenda de los próximos {ocupacion.dias.length} días</p>
            <p className="text-sm font-bold text-slate-700">
              {ocupacion.disponible ? <>Ocupada al <span className="font-black text-slate-900">{total}%</span> · quedan <span className="font-black text-rose-600">{horas(libre)}</span> libres para llenar</> : 'Sin horarios de atención configurados'}
            </p>
          </div>
        </div>
        <Link prefetch={false} href="/agenda?abrir=buscarHora" className="self-start md:self-auto px-4 py-2.5 rounded-xl bg-[#0A111F] text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#1a2538]">
          <Search size={14} /> Buscar hora libre
        </Link>
      </div>

      {ocupacion.disponible > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {ocupacion.dias.map(d => {
              const p = pct(d.ocupado, d.disponible)
              const fecha = new Date(`${d.fecha}T00:00:00`)
              return (
                <div key={d.fecha} className="flex flex-col items-center gap-1.5" title={d.disponible ? `${p}% ocupado · ${horas(d.disponible - d.ocupado)} libres` : 'Sin atención'}>
                  <div className="w-full h-20 bg-slate-100 rounded-lg overflow-hidden flex flex-col justify-end">
                    {d.disponible > 0 && <div className={`${color(p)} w-full`} style={{ height: `${Math.max(4, p)}%` }} />}
                  </div>
                  <p className="text-[10px] font-black uppercase text-slate-500 leading-none">{fecha.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')}</p>
                  <p className="text-[10px] font-bold text-slate-400 leading-none">{fecha.getDate()}</p>
                  <p className="text-[10px] font-black text-slate-700 leading-none tabular-nums">{d.disponible ? `${p}%` : '—'}</p>
                </div>
              )
            })}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Horas libres por doctor</p>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {ocupacion.doctores.map(d => {
                const p = pct(d.ocupado, d.disponible)
                return (
                  <div key={d.userId} className="flex items-center gap-2 text-xs">
                    <span className="w-28 truncate font-bold text-slate-700">{d.nombre}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`${color(p)} h-full`} style={{ width: `${p}%` }} /></div>
                    <span className="w-16 text-right font-black text-slate-600 tabular-nums">{horas(d.disponible - d.ocupado)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

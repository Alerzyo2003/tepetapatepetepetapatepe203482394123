'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  AlertOctagon, ArrowDownRight, ArrowUpRight, Award, CheckCircle2, ChevronDown, FileText, Lightbulb, MessageCircle, Minus, TrendingUp, TriangleAlert, X,
} from 'lucide-react'
import type { Decision, Nivel } from '../_lib/decisiones'
import { abrirWhatsApp, money, moneyCorto } from '../_lib/util'

export function Seccion({ id, numero, titulo, subtitulo, children }: { id: string; numero: number; titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <div className="flex items-baseline gap-3 border-b border-slate-200 pb-2">
        <span className="text-xs font-black text-teal-600 tabular-nums">{String(numero).padStart(2, '0')}</span>
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900">{titulo}</h2>
          {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200 ${className}`}>{children}</div>
}

export function SectionTitle({ icon: Icon, label, extra }: { icon: any; label: string; extra?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Icon size={16} /> {label}</h3>
      {extra}
    </div>
  )
}

// Texto que acompaña a las variaciones (ej. "vs. 1–8 sep" cuando el mes está en curso)
export const TextoComparacion = createContext('vs. mes ant.')

// Variación vs. el periodo de comparación. "invertido": bajar es bueno (ej. ausencias, gastos)
export function Delta({ v, invertido, texto }: { v: number | null | undefined; invertido?: boolean; texto?: string }) {
  const textoContexto: string = useContext(TextoComparacion)
  texto = texto ?? textoContexto
  if (v === null || v === undefined || Number.isNaN(v)) return null
  if (v === 0) return <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-400"><Minus size={12} /> igual {texto}</span>
  const bueno = invertido ? v < 0 : v > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${bueno ? 'text-teal-600' : 'text-rose-500'}`}>
      {v > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {Math.abs(v)}% {texto}
    </span>
  )
}

export function Kpi({ icon: Icon, label, value, delta, invertido, sub, accent, valorClase = 'text-slate-800' }: {
  icon: any; label: string; value: string; delta?: number | null; invertido?: boolean; sub?: ReactNode; accent: string; valorClase?: string
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}1a` }}>
          <Icon size={14} style={{ color: accent }} />
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{label}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-black tabular-nums truncate mt-1 ${valorClase}`}>{value}</div>
      <Delta v={delta} invertido={invertido} />
      {sub && <div className="text-[10px] text-slate-400 leading-snug">{sub}</div>}
    </div>
  )
}

export function MiniStat({ label, value, delta, invertido, negativo, hint, texto }: { label: string; value: ReactNode; delta?: number | null; invertido?: boolean; negativo?: boolean; hint?: string; texto?: string }) {
  return (
    <div className="flex justify-between items-center gap-3 py-2 border-b border-slate-100 last:border-0" title={hint}>
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <span className="text-right">
        <span className={`block text-base font-black tabular-nums ${negativo ? 'text-rose-500' : 'text-slate-800'}`}>{value}</span>
        <Delta v={delta} invertido={invertido} texto={texto} />
      </span>
    </div>
  )
}

export function BarList({ items, formato = 'money', color = 'bg-teal-500', vacio = 'Sin datos para este periodo.', onClick, activo }: {
  items: { name: string; value: number; sub?: string; id?: string }[]
  formato?: 'money' | 'count' | 'minutes'
  color?: string
  vacio?: string
  onClick?: (item: any) => void
  activo?: string | null
}) {
  if (!items.length) return <EmptyState text={vacio} />
  const max = Math.max(...items.map(i => i.value), 1)
  const fmt = (v: number) => (formato === 'money' ? money(v) : `${Math.round(v).toLocaleString('es-CL')}${formato === 'minutes' ? ' min' : ''}`)
  return (
    <div className="space-y-3.5">
      {items.map((it, i) => {
        const Comp: any = onClick ? 'button' : 'div'
        return (
          <Comp key={`${it.name}-${i}`} {...(onClick ? { type: 'button', onClick: () => onClick(it) } : {})}
            className={`block w-full text-left ${onClick ? 'rounded-lg -mx-2 px-2 py-1 hover:bg-slate-50' : ''} ${activo && activo === it.id ? 'bg-teal-50' : ''}`}>
            <div className="flex justify-between gap-3 text-xs font-bold text-slate-600 mb-1.5">
              <span className="truncate">{it.name}{it.sub && <span className="ml-2 font-medium text-slate-400">{it.sub}</span>}</span>
              <span className="shrink-0 text-slate-800 tabular-nums">{fmt(it.value)}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max((it.value / max) * 100, 2)}%` }} />
            </div>
          </Comp>
        )
      })}
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
      <FileText size={18} />
      <span className="text-xs font-bold">{text}</span>
    </div>
  )
}

export function LegendItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black text-slate-800">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{text}</p>
    </div>
  )
}

// ── Lista de pacientes con botón de WhatsApp ──
export interface FilaContacto { id: string; nombre: string; detalle: string; monto?: number; telefono?: string | null; mensaje: string }

export function ListaContactos({ filas, vacio, total }: { filas: FilaContacto[]; vacio: string; total?: number }) {
  const [verTodos, setVerTodos] = useState(false)
  if (!filas.length) return <EmptyState text={vacio} />
  const visibles = verTodos ? filas : filas.slice(0, 8)
  return (
    <div>
      <div className="divide-y divide-slate-100">
        {visibles.map(f => (
          <div key={f.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">{f.nombre}</p>
              <p className="text-[10px] text-slate-400 truncate">{f.detalle}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {f.monto !== undefined && <span className="text-sm font-black text-amber-600 tabular-nums">{money(f.monto)}</span>}
              <button type="button" title="Escribir por WhatsApp"
                onClick={() => { if (!abrirWhatsApp(f.telefono, f.mensaje)) toast.error('El paciente no tiene un teléfono válido') }}
                className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 disabled:opacity-30" disabled={!f.telefono}>
                <MessageCircle size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {filas.length > 8 && (
        <button type="button" onClick={() => setVerTodos(v => !v)} className="mt-2 text-[11px] font-bold text-teal-700 hover:underline">
          {verTodos ? 'Ver menos' : `Ver los ${total ?? filas.length}`}
        </button>
      )}
    </div>
  )
}

// ── Panel "Qué hacer este mes" ──
const ESTILO_NIVEL: Record<Nivel, { icon: any; borde: string; chip: string; texto: string }> = {
  urgente: { icon: AlertOctagon, borde: 'border-l-rose-500', chip: 'bg-rose-100 text-rose-700', texto: 'Urgente' },
  oportunidad: { icon: TrendingUp, borde: 'border-l-teal-500', chip: 'bg-teal-100 text-teal-700', texto: 'Oportunidad' },
  atencion: { icon: TriangleAlert, borde: 'border-l-amber-500', chip: 'bg-amber-100 text-amber-700', texto: 'Revisar' },
  bien: { icon: CheckCircle2, borde: 'border-l-emerald-400', chip: 'bg-emerald-100 text-emerald-700', texto: 'Va bien' },
}

export function PanelDecisiones({ decisiones, onIr, onCerrar }: { decisiones: Decision[]; onIr: (ancla: string) => void; onCerrar?: () => void }) {
  const [abierta, setAbierta] = useState<string | null>(decisiones.find(d => d.nivel !== 'bien')?.id || null)
  const [verTodas, setVerTodas] = useState(false)
  const potencial = decisiones.reduce((s, d) => s + (d.nivel !== 'bien' && d.impacto ? d.impacto : 0), 0)
  const visibles = verTodas ? decisiones : decisiones.slice(0, 6)

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-teal-50 to-white px-5 sm:px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center"><Lightbulb size={18} /></div>
          <div>
            <h2 className="text-base font-black text-slate-900">Qué hacer este mes</h2>
            <p className="text-[11px] text-slate-500">Acciones ordenadas por urgencia y por cuánta plata pueden generar.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {potencial > 0 && (
            <div className="text-left sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Potencial estimado</p>
              <p className="text-xl font-black text-teal-700 tabular-nums">{moneyCorto(potencial)}</p>
            </div>
          )}
          {onCerrar && (
            <button type="button" onClick={onCerrar} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar"><X size={18} /></button>
          )}
        </div>
      </div>
      {decisiones.length === 0 ? (
        <div className="p-6"><EmptyState text="No hay alertas para este periodo." /></div>
      ) : (
        <div className="divide-y divide-slate-100">
          {visibles.map(d => {
            const e = ESTILO_NIVEL[d.nivel]
            const Icon = e.icon
            const open = abierta === d.id
            return (
              <div key={d.id} className={`border-l-4 ${e.borde}`}>
                <button type="button" onClick={() => setAbierta(open ? null : d.id)} className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-slate-50">
                  <Icon size={16} className="shrink-0 text-slate-500" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-slate-800">{d.titulo}</span>
                  </span>
                  <span className={`hidden sm:inline shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${e.chip}`}>{e.texto}</span>
                  {d.impacto ? <span className="shrink-0 text-xs font-black text-teal-700 tabular-nums">+{moneyCorto(d.impacto)}</span> : null}
                  <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <div className="px-4 sm:px-5 pb-4 pl-11 sm:pl-12 space-y-2">
                    {d.detalle && <p className="text-xs text-slate-600">{d.detalle}</p>}
                    <ul className="space-y-1">
                      {d.acciones.map((a, i) => (
                        <li key={i} className="flex gap-2 text-xs text-slate-700"><span className="text-teal-600 font-black">→</span><span>{a}</span></li>
                      ))}
                    </ul>
                    {d.ancla && (
                      <button type="button" onClick={() => onIr(d.ancla!)} className="text-[11px] font-bold text-teal-700 hover:underline">Ver detalle ↓</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {decisiones.length > 6 && (
        <button type="button" onClick={() => setVerTodas(v => !v)} className="w-full border-t border-slate-100 py-2.5 text-[11px] font-bold text-teal-700 hover:bg-slate-50">
          {verTodas ? 'Ver menos' : `Ver las ${decisiones.length} recomendaciones`}
        </button>
      )}
      <p className="border-t border-slate-100 px-5 py-2 text-[10px] text-slate-400">
        El potencial es una estimación para priorizar (ej. cerrar 30% de los presupuestos pendientes, llenar la mitad de las horas libres).
      </p>
    </div>
  )
}

// ── Modal genérico ──
export function Modal({ abierto, onCerrar, children, ancho = 'max-w-3xl' }: { abierto: boolean; onCerrar: () => void; children: ReactNode; ancho?: string }) {
  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true" onClick={onCerrar}>
      <div className={`w-full ${ancho} max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// ── Metas de ventas por tramos con bono ──
export function MetaVentas({ venta, proyeccion, metas, esMesActual, diasRestantes, baseLabel }: {
  venta: number
  proyeccion: number | null
  metas: { monto: number; bono: number }[]
  esMesActual: boolean
  diasRestantes: number
  baseLabel: string
}) {
  const tope = Math.max(...metas.map(x => x.monto)) * 1.08
  const pos = (v: number) => `${Math.min(100, (v / tope) * 100)}%`
  const logrado = [...metas].reverse().find(x => venta >= x.monto)
  const siguiente = metas.find(x => venta < x.monto)
  const proyectado = proyeccion !== null ? [...metas].reverse().find(x => proyeccion >= x.monto) : undefined

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Award size={16} /> Meta de ventas del mes</h3>
          <p className="mt-2 text-3xl font-black tabular-nums text-slate-900">{money(venta)}</p>
          <p className="text-[11px] text-slate-500">{baseLabel}</p>
        </div>
        <div className={`rounded-2xl px-4 py-3 text-left sm:text-right ${logrado ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-500'}`}>
          <p className="text-[10px] font-black uppercase tracking-widest">Bono asegurado</p>
          <p className="text-2xl font-black tabular-nums">{logrado ? money(logrado.bono) : '$0'}</p>
          {esMesActual && proyectado && proyectado !== logrado && (
            <p className="text-[11px] font-bold text-teal-700">A este ritmo: {money(proyectado.bono)}</p>
          )}
        </div>
      </div>

      {/* Barra con los tres tramos */}
      <div className="relative pt-7 pb-9">
        <div className="relative h-4 w-full rounded-full bg-slate-100 overflow-hidden">
          {esMesActual && proyeccion !== null && proyeccion > venta && (
            <div className="absolute inset-y-0 left-0 rounded-full bg-teal-200/70" style={{ width: pos(proyeccion) }} title={`Proyección ${money(proyeccion)}`} />
          )}
          <div className={`absolute inset-y-0 left-0 rounded-full ${logrado ? 'bg-emerald-500' : 'bg-teal-500'}`} style={{ width: pos(venta) }} />
        </div>
        {metas.map((x, i) => {
          const ok = venta >= x.monto
          return (
            <div key={x.monto} className="absolute top-0 bottom-0 flex flex-col items-center -translate-x-1/2" style={{ left: pos(x.monto) }}>
              <span className={`text-[10px] font-black tabular-nums whitespace-nowrap ${ok ? 'text-emerald-600' : 'text-slate-500'}`}>{moneyCorto(x.monto)}</span>
              <span className={`my-1 w-0.5 flex-1 ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className={`hidden sm:inline rounded-full px-1.5 py-0.5 text-[10px] font-black whitespace-nowrap ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {ok ? '✓ ' : ''}{moneyCorto(x.bono)}
              </span>
              <span className="sr-only">Meta {i + 1}</span>
            </div>
          )
        })}
      </div>

      {/* Detalle por tramo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {metas.map((x, i) => {
          const ok = venta >= x.monto
          const falta = x.monto - venta
          const llega = proyeccion !== null && proyeccion >= x.monto
          return (
            <div key={x.monto} className={`rounded-xl border p-3 ${ok ? 'border-emerald-200 bg-emerald-50/60' : x === siguiente ? 'border-teal-300 bg-teal-50/40' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Meta {i + 1}</span>
                <span className={`text-xs font-black ${ok ? 'text-emerald-700' : 'text-slate-700'}`}>Bono {money(x.bono)}</span>
              </div>
              <p className="mt-1 text-lg font-black tabular-nums text-slate-900">{money(x.monto)}</p>
              {ok ? (
                <p className="text-[11px] font-bold text-emerald-700">✓ Lograda</p>
              ) : (
                <>
                  <p className="text-[11px] font-bold text-slate-600">Faltan {money(falta)} ({Math.round((venta / x.monto) * 100)}% logrado)</p>
                  {esMesActual && (
                    <p className="text-[11px] text-slate-500">
                      {diasRestantes > 0 ? `${money(falta / diasRestantes)} por día hábil · ` : ''}
                      <span className={llega ? 'text-teal-700 font-bold' : 'text-amber-600 font-bold'}>{llega ? 'se alcanza a este ritmo' : 'no se alcanza a este ritmo'}</span>
                    </p>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function PulseSpinner() {
  return (
    <svg width="64" height="24" viewBox="0 0 64 24">
      <polyline points="0,12 18,12 22,4 26,20 30,12 64,12" fill="none" stroke="#0d9488" strokeWidth="2">
        <animate attributeName="stroke-dasharray" values="0,80;80,80" dur="1.1s" repeatCount="indefinite" />
      </polyline>
    </svg>
  )
}

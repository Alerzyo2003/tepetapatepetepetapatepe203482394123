'use client'
// Paneles de solicitudes internas:
//  - modo 'agenda': lo que piden los doctores (abrir agenda, bloquear agenda, horario especial)
//  - modo 'general': lo que pide recepción (editar un pago, corregir N° de voucher/boleta, etc.)
// Cualquiera del personal anota; administración cambia el estado (Pendiente → En proceso → Listo / Rechazado).
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CalendarPlus, CalendarX2, CalendarClock, ClipboardList, Loader2, Plus, Trash2, Search, X, Check, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRole } from '@/app/hooks/useRole'

type Categoria = 'abrir_agenda' | 'bloquear_agenda' | 'horario_especial' | 'general'
type Estado = 'pendiente' | 'en_proceso' | 'listo' | 'rechazado'

const ESTADOS: { id: Estado; label: string; clase: string }[] = [
  { id: 'pendiente', label: 'Pendiente', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'en_proceso', label: 'En proceso', clase: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'listo', label: 'Listo', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'rechazado', label: 'Rechazado', clase: 'bg-slate-100 text-slate-500 border-slate-200' },
]
const estadoDe = (e: string) => ESTADOS.find(x => x.id === e) || ESTADOS[0]

const SECCIONES_AGENDA: { id: Categoria; titulo: string; icono: any; colFecha: string; colHorario: string }[] = [
  { id: 'abrir_agenda', titulo: '1. Abrir agenda', icono: CalendarPlus, colFecha: 'Fecha', colHorario: 'Horario solicitado' },
  { id: 'bloquear_agenda', titulo: '2. Bloquear agenda', icono: CalendarX2, colFecha: 'Fecha a bloquear', colHorario: 'Horario' },
  { id: 'horario_especial', titulo: '3. Horario especial', icono: CalendarClock, colFecha: 'Fecha', colHorario: 'Horario especial solicitado' },
]

const TIPOS_GENERAL = ['General', 'Editar pago', 'Corregir N° de voucher / boleta', 'Cambiar medio de pago', 'Anular pago', 'Corregir datos del paciente', 'Otro']

const fechaCorta = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : ''
const corto = (n?: string) => (n || '').split(/\s+/).filter(Boolean).slice(0, 2).join(' ')

export default function PanelSolicitudes({ modo }: { modo: 'agenda' | 'general' }) {
  const { rol, user } = useRole() as any
  const esAdmin = rol === 'ADMIN'
  const [filas, setFilas] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [verTodas, setVerTodas] = useState(false)
  const [profesionales, setProfesionales] = useState<any[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})

  const categorias: Categoria[] = modo === 'agenda' ? ['abrir_agenda', 'bloquear_agenda', 'horario_especial'] : ['general']

  const cargar = useCallback(async () => {
    setCargando(true)
    let q = supabase.from('solicitudes')
      .select('*, pacientes(id, nombre, apellido, rut), profesionales(id, nombre, apellido)')
      .in('categoria', categorias)
      .order('created_at', { ascending: false })
      .limit(300)
    if (!verTodas) q = q.in('estado', ['pendiente', 'en_proceso'])
    const { data, error } = await q
    if (error) toast.error('No se pudieron cargar las solicitudes', { description: error.message })
    setFilas(data || [])
    setCargando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, verTodas])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    supabase.from('profesionales').select('id, nombre, apellido, user_id').eq('activo', true).order('nombre').then(({ data }) => setProfesionales(data || []))
    supabase.from('perfiles').select('id, nombre_completo').then(({ data }) => {
      const m: Record<string, string> = {}
      ;(data || []).forEach((p: any) => { m[p.id] = p.nombre_completo || 'Usuario' })
      setNombres(m)
    })
  }, [])

  const cambiarEstado = async (f: any, estado: Estado) => {
    const { error } = await supabase.from('solicitudes').update({ estado }).eq('id', f.id)
    if (error) return toast.error('No se pudo cambiar el estado', { description: error.message })
    toast.success(`Marcada como "${estadoDe(estado).label}"`)
    cargar()
  }
  const guardarRespuesta = async (f: any, respuesta: string) => {
    const { error } = await supabase.from('solicitudes').update({ respuesta: respuesta.trim() || null }).eq('id', f.id)
    if (error) return toast.error('No se pudo guardar la nota', { description: error.message })
    cargar()
  }
  const borrar = async (f: any) => {
    if (!window.confirm('¿Eliminar esta solicitud?')) return
    const { error } = await supabase.from('solicitudes').delete().eq('id', f.id)
    if (error) return toast.error('No se pudo eliminar', { description: error.message })
    cargar()
  }

  const pendientes = filas.filter(f => f.estado === 'pendiente' || f.estado === 'en_proceso').length

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C9A24B]">Centro Odontológico Dignidad</p>
          <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] tracking-tight">
            {modo === 'agenda' ? 'Solicitudes de agenda' : 'Solicitudes a administración'}
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            {modo === 'agenda'
              ? 'Lo que piden los doctores: abrir, bloquear u horarios especiales. Anótalo aquí y administración lo marca cuando esté hecho.'
              : 'Cambios que recepción necesita (editar un pago, corregir un N° de voucher, etc.). Administración lo marca como listo.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{pendientes} por resolver</span>
          <div className="flex p-1 bg-white rounded-xl border border-slate-200">
            <button onClick={() => setVerTodas(false)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${!verTodas ? 'bg-[#0A111F] text-white' : 'text-slate-500'}`}>Por resolver</button>
            <button onClick={() => setVerTodas(true)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${verTodas ? 'bg-[#0A111F] text-white' : 'text-slate-500'}`}>Todas</button>
          </div>
        </div>
      </header>

      {cargando && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>}

      {!cargando && modo === 'agenda' && SECCIONES_AGENDA.map(sec => (
        <SeccionAgenda key={sec.id} sec={sec} filas={filas.filter(f => f.categoria === sec.id)} profesionales={profesionales}
          nombres={nombres} esAdmin={esAdmin} miId={user?.id} onCambio={cargar}
          cambiarEstado={cambiarEstado} guardarRespuesta={guardarRespuesta} borrar={borrar} />
      ))}

      {!cargando && modo === 'general' && (
        <SeccionGeneral filas={filas} nombres={nombres} esAdmin={esAdmin} miId={user?.id} onCambio={cargar}
          cambiarEstado={cambiarEstado} guardarRespuesta={guardarRespuesta} borrar={borrar} />
      )}
    </div>
  )
}

// ---------- piezas comunes ----------

function SelectorEstado({ f, esAdmin, cambiarEstado }: any) {
  const e = estadoDe(f.estado)
  if (!esAdmin) return <span className={`inline-block rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase ${e.clase}`}>{e.label}</span>
  return (
    <select value={f.estado} onChange={ev => cambiarEstado(f, ev.target.value as Estado)}
      className={`rounded-lg border px-2 py-1 text-[10px] font-black uppercase outline-none cursor-pointer ${e.clase}`}>
      {ESTADOS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
    </select>
  )
}

function Autoria({ f, nombres }: any) {
  return (
    <div className="text-[9px] font-semibold text-slate-400 leading-snug">
      <span>Pidió: <b className="text-slate-500">{corto(nombres[f.creado_por]) || '—'}</b> · {fechaCorta(f.created_at)}</span>
      {f.resuelto_por && <span className="block">{f.estado === 'rechazado' ? 'Rechazó' : 'Realizó'}: <b className="text-slate-500">{corto(nombres[f.resuelto_por])}</b> · {fechaCorta(f.resuelto_en)}</span>}
    </div>
  )
}

function NotaAdmin({ f, esAdmin, guardarRespuesta }: any) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(f.respuesta || '')
  if (!esAdmin) return f.respuesta ? <p className="text-[10px] font-semibold text-slate-600 bg-slate-50 rounded-lg px-2 py-1 mt-1"><MessageSquare size={10} className="inline mr-1" />{f.respuesta}</p> : null
  if (!editando) return (
    <button type="button" onClick={() => setEditando(true)} className="text-[10px] font-semibold text-slate-500 hover:text-[#0A111F] mt-1 text-left">
      <MessageSquare size={10} className="inline mr-1" />{f.respuesta || 'Agregar nota'}
    </button>
  )
  return (
    <div className="flex gap-1 mt-1">
      <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { guardarRespuesta(f, texto); setEditando(false) } if (e.key === 'Escape') setEditando(false) }}
        className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-[#C9A24B]" placeholder="Nota para quien pidió" />
      <button onClick={() => { guardarRespuesta(f, texto); setEditando(false) }} className="p-1 rounded-lg bg-[#0A111F] text-white"><Check size={12} /></button>
    </div>
  )
}

const puedeBorrar = (f: any, esAdmin: boolean, miId?: string) => esAdmin || (f.creado_por === miId && f.estado === 'pendiente')

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-[#C9A24B]'

// ---------- agenda ----------

function SeccionAgenda({ sec, filas, profesionales, nombres, esAdmin, miId, onCambio, cambiarEstado, guardarRespuesta, borrar }: any) {
  const Icono = sec.icono
  // Si quien escribe es un profesional, se preselecciona a sí mismo (puede cambiarlo para pedir por otro doctor)
  const miProfId = profesionales.find((p: any) => p.user_id && p.user_id === miId)?.id || ''
  const vacio = { profesional_id: miProfId, profesional_texto: '', fecha_texto: '', horario_texto: '', detalle: '' }
  const [nueva, setNueva] = useState<any>(vacio)
  useEffect(() => { if (miProfId) setNueva((n: any) => (n.profesional_id ? n : { ...n, profesional_id: miProfId })) }, [miProfId])
  const [guardando, setGuardando] = useState(false)
  const nombreProf = (f: any) => f.profesionales ? `${f.profesionales.nombre || ''} ${f.profesionales.apellido || ''}`.trim() : ''

  const agregar = async () => {
    if (!nueva.profesional_id && !nueva.profesional_texto.trim()) return toast.error('Indica el profesional')
    if (!nueva.fecha_texto.trim()) return toast.error('Indica la fecha')
    setGuardando(true)
    const { error } = await supabase.from('solicitudes').insert({
      categoria: sec.id,
      profesional_id: nueva.profesional_id || null,
      profesional_texto: nueva.profesional_texto.trim() || null,
      fecha_texto: nueva.fecha_texto.trim(),
      horario_texto: nueva.horario_texto.trim() || null,
      detalle: nueva.detalle.trim() || null,
    })
    setGuardando(false)
    if (error) return toast.error('No se pudo guardar', { description: error.message })
    toast.success('Solicitud anotada')
    setNueva(vacio)
    onCambio()
  }

  return (
    <section className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <Icono size={16} className="text-[#C9A24B]" />
        <h2 className="text-[12px] font-black uppercase tracking-widest text-[#0A111F]">{sec.titulo}</h2>
        <span className="ml-auto text-[10px] font-bold text-slate-400">{filas.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50/60">
              <th className="px-4 py-2 w-[22%]">Profesional</th>
              <th className="px-4 py-2 w-[20%]">{sec.colFecha}</th>
              <th className="px-4 py-2 w-[20%]">{sec.colHorario}</th>
              <th className="px-4 py-2 w-[12%]">Estado</th>
              <th className="px-4 py-2">Quién / nota</th>
              <th className="px-2 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f: any) => (
              <tr key={f.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3 font-bold text-slate-800">
                  {nombreProf(f) || f.profesional_texto}
                  {nombreProf(f) && f.profesional_texto && <span className="block text-[10px] font-semibold text-slate-500">{f.profesional_texto}</span>}
                  {f.detalle && <span className="block text-[10px] font-semibold text-slate-500 mt-0.5">{f.detalle}</span>}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-700">{f.fecha_texto}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{f.horario_texto || '—'}</td>
                <td className="px-4 py-3"><SelectorEstado f={f} esAdmin={esAdmin} cambiarEstado={cambiarEstado} /></td>
                <td className="px-4 py-3"><Autoria f={f} nombres={nombres} /><NotaAdmin f={f} esAdmin={esAdmin} guardarRespuesta={guardarRespuesta} /></td>
                <td className="px-2 py-3">{puedeBorrar(f, esAdmin, miId) && <button onClick={() => borrar(f)} className="text-slate-300 hover:text-red-500" title="Eliminar"><Trash2 size={14} /></button>}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-[11px] font-semibold text-slate-400 italic">Sin solicitudes.</td></tr>}
            {/* Fila para agregar */}
            <tr className="border-t border-dashed border-slate-200 bg-[#FBF8F2]/60 align-top">
              <td className="px-4 py-3 space-y-1.5">
                <select value={nueva.profesional_id} onChange={e => setNueva({ ...nueva, profesional_id: e.target.value })} className={inputCls}>
                  <option value="">— Profesional —</option>
                  {profesionales.map((p: any) => <option key={p.id} value={p.id}>{`${p.nombre || ''} ${p.apellido || ''}`.trim()}</option>)}
                </select>
                <input value={nueva.profesional_texto} onChange={e => setNueva({ ...nueva, profesional_texto: e.target.value })} className={inputCls} placeholder="o texto (ej: reemplazo de Pedro)" />
              </td>
              <td className="px-4 py-3"><input value={nueva.fecha_texto} onChange={e => setNueva({ ...nueva, fecha_texto: e.target.value })} className={inputCls} placeholder="Ej: jueves 26.11 y 03.12" /></td>
              <td className="px-4 py-3"><input value={nueva.horario_texto} onChange={e => setNueva({ ...nueva, horario_texto: e.target.value })} className={inputCls} placeholder="Ej: AM (hasta 13:00)" /></td>
              <td className="px-4 py-3" colSpan={2}><input value={nueva.detalle} onChange={e => setNueva({ ...nueva, detalle: e.target.value })} onKeyDown={e => e.key === 'Enter' && agregar()} className={inputCls} placeholder="Comentario (opcional)" /></td>
              <td className="px-2 py-3">
                <button onClick={agregar} disabled={guardando} className="w-8 h-8 rounded-xl bg-[#0A111F] text-white flex items-center justify-center hover:bg-[#104a5a] disabled:opacity-50" title="Agregar">
                  {guardando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------- general ----------

function BuscadorPaciente({ valor, onElegir }: { valor: any; onElegir: (p: any | null) => void }) {
  const [texto, setTexto] = useState('')
  const [res, setRes] = useState<any[]>([])
  useEffect(() => {
    const t = texto.trim()
    if (t.length < 3) { setRes([]); return }
    const id = setTimeout(async () => {
      const limpio = t.replace(/[^0-9kK]/g, '')
      const q = supabase.from('pacientes').select('id, nombre, apellido, rut').limit(6)
      const { data } = /^\d/.test(t) && limpio.length >= 4
        ? await q.ilike('rut', `%${limpio.slice(0, 8)}%`)
        : await q.or(`nombre.ilike.%${t}%,apellido.ilike.%${t}%`)
      setRes(data || [])
    }, 300)
    return () => clearTimeout(id)
  }, [texto])

  if (valor) return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800">
      <span className="truncate">{valor.nombre} {valor.apellido}</span>
      <button onClick={() => onElegir(null)} className="ml-auto text-slate-400 hover:text-red-500"><X size={12} /></button>
    </div>
  )
  return (
    <div className="relative">
      <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input value={texto} onChange={e => setTexto(e.target.value)} className={`${inputCls} pl-8`} placeholder="Paciente (nombre o RUT)" />
      {res.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          {res.map(p => (
            <button key={p.id} type="button" onClick={() => { onElegir(p); setTexto(''); setRes([]) }} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">
              <b>{p.nombre} {p.apellido}</b> <span className="text-slate-400">{p.rut}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SeccionGeneral({ filas, nombres, esAdmin, miId, onCambio, cambiarEstado, guardarRespuesta, borrar }: any) {
  const [tipo, setTipo] = useState(TIPOS_GENERAL[0])
  const [paciente, setPaciente] = useState<any>(null)
  const [detalle, setDetalle] = useState('')
  const [guardando, setGuardando] = useState(false)

  const agregar = async () => {
    if (!detalle.trim()) return toast.error('Escribe qué hay que hacer')
    setGuardando(true)
    const { error } = await supabase.from('solicitudes').insert({ categoria: 'general', tipo, paciente_id: paciente?.id || null, detalle: detalle.trim() })
    setGuardando(false)
    if (error) return toast.error('No se pudo guardar', { description: error.message })
    toast.success('Solicitud enviada a administración')
    setDetalle(''); setPaciente(null)
    onCambio()
  }

  return (
    <>
      <section className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm p-5 space-y-3">
        <h2 className="text-[12px] font-black uppercase tracking-widest text-[#0A111F] flex items-center gap-2"><Plus size={14} className="text-[#C9A24B]" /> Nueva solicitud</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls}>
            {TIPOS_GENERAL.map(t => <option key={t}>{t}</option>)}
          </select>
          <div className="md:col-span-2"><BuscadorPaciente valor={paciente} onElegir={setPaciente} /></div>
        </div>
        <textarea value={detalle} onChange={e => setDetalle(e.target.value)} rows={3} className={inputCls}
          placeholder="Ej: El pago del 23-11 de $3.500 era $3.000 con transferencia, voucher 20733" />
        <div className="flex justify-end">
          <button onClick={agregar} disabled={guardando} className="px-5 py-2.5 rounded-xl bg-[#0A111F] text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#104a5a] disabled:opacity-50">
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />} Enviar a administración
          </button>
        </div>
      </section>

      <section className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50/60">
                <th className="px-4 py-2 w-[16%]">Tipo</th>
                <th className="px-4 py-2 w-[18%]">Paciente</th>
                <th className="px-4 py-2">Qué hay que hacer</th>
                <th className="px-4 py-2 w-[12%]">Estado</th>
                <th className="px-4 py-2 w-[22%]">Quién / nota</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f: any) => (
                <tr key={f.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 font-bold text-slate-700">{f.tipo || '—'}</td>
                  <td className="px-4 py-3 font-semibold">
                    {f.pacientes ? <Link href={`/pacientes/${f.pacientes.id}/pagos`} className="text-[#0A111F] hover:text-[#C9A24B] hover:underline">{f.pacientes.nombre} {f.pacientes.apellido}</Link> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700 whitespace-pre-line">{f.detalle}</td>
                  <td className="px-4 py-3"><SelectorEstado f={f} esAdmin={esAdmin} cambiarEstado={cambiarEstado} /></td>
                  <td className="px-4 py-3"><Autoria f={f} nombres={nombres} /><NotaAdmin f={f} esAdmin={esAdmin} guardarRespuesta={guardarRespuesta} /></td>
                  <td className="px-2 py-3">{puedeBorrar(f, esAdmin, miId) && <button onClick={() => borrar(f)} className="text-slate-300 hover:text-red-500" title="Eliminar"><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
              {filas.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-[11px] font-semibold text-slate-400 italic">Sin solicitudes.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

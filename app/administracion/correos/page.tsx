'use client'
// Correos automáticos: estado de la casilla, correo de prueba e historial de envíos.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, Mail, RefreshCcw, Send, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { enviarCorreoPrueba, estadoCorreo } from '@/app/correo/actions'

const TIPOS: Record<string, string> = {
  recordatorio: 'Recordatorio de cita', confirmacion: 'Confirmación de hora', presupuesto: 'Presupuesto',
  receta: 'Receta', comprobante: 'Comprobante de pago', prueba: 'Prueba',
}
const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-slate-700 outline-none focus:border-[#C9A24B]'

export default function CorreosPage() {
  const [estado, setEstado] = useState<{ configurado: boolean; casilla: string | null } | null>(null)
  const [filas, setFilas] = useState<any[]>([])
  const [pacientes, setPacientes] = useState<Record<string, string>>({})
  const [tipo, setTipo] = useState('')
  const [cargando, setCargando] = useState(true)
  const [para, setPara] = useState('')
  const [probando, setProbando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    let q = supabase.from('correos_enviados').select('*').order('creado_en', { ascending: false }).limit(200)
    if (tipo) q = q.eq('tipo', tipo)
    const { data } = await q
    setFilas(data || [])
    const ids = Array.from(new Set((data || []).map((f: any) => f.paciente_id).filter(Boolean)))
    if (ids.length) {
      const { data: ps } = await supabase.from('pacientes').select('id, nombre, apellido').in('id', ids)
      const m: Record<string, string> = {}
      ;(ps || []).forEach((p: any) => { m[p.id] = `${p.nombre} ${p.apellido}` })
      setPacientes(m)
    }
    setCargando(false)
  }, [tipo])

  useEffect(() => { estadoCorreo().then(setEstado).catch(() => setEstado({ configurado: false, casilla: null })) }, [])
  useEffect(() => { cargar() }, [cargar])

  const probar = async () => {
    setProbando(true)
    const r = await enviarCorreoPrueba(para.trim())
    setProbando(false)
    if (r.ok) { toast.success(`Correo de prueba enviado a ${para.trim()}`, { description: 'Revisa la bandeja de entrada y también spam.' }); cargar() }
    else toast.error('No se pudo enviar la prueba', { description: r.error })
  }

  const hoy = filas.filter(f => new Date(f.creado_en).toDateString() === new Date().toDateString())

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#C9A24B]">Administración</p>
      <h1 className="font-serif text-3xl font-black text-[#0A111F]">Correos automáticos</h1>
      <p className="mt-1 max-w-2xl text-[12px] font-semibold text-slate-500">
        Se envían desde la casilla de la clínica: recordatorio de cita (todos los días a las 10:00 para las citas de mañana), confirmación al agendar, y presupuestos, recetas y comprobantes cuando se apreta “Enviar por correo”.
        Solo llegan a pacientes con correo en su ficha.
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Casilla de envío</p>
          {!estado ? <Loader2 size={16} className="mt-2 animate-spin text-slate-300" /> : estado.configurado ? (
            <p className="mt-2 flex items-center gap-2 text-[14px] font-black text-emerald-600"><CheckCircle2 size={16} /> {estado.casilla}</p>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-[13px] font-black text-rose-600"><XCircle size={16} /> No configurada (faltan las variables SMTP en Vercel)</p>
          )}
          <p className="mt-3 text-[11px] font-semibold text-slate-400">Enviados hoy: {hoy.filter(f => f.estado === 'enviado').length} · con error: {hoy.filter(f => f.estado === 'error').length}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Enviar correo de prueba</p>
          <div className="mt-2 flex gap-2">
            <input value={para} onChange={e => setPara(e.target.value)} placeholder="tu@correo.com" className={inputCls} />
            <button onClick={probar} disabled={probando || !para.trim() || !estado?.configurado} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#0A111F] px-4 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40">
              {probando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Probar
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select value={tipo} onChange={e => setTipo(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={cargar} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:border-[#C9A24B]"><RefreshCcw size={13} /> Actualizar</button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 bg-white">
        <table className="w-full min-w-[640px] text-left">
          <thead><tr className="border-b border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <th className="px-4 py-3">Fecha</th><th>Tipo</th><th>Paciente</th><th>Para</th><th className="pr-4">Estado</th>
          </tr></thead>
          <tbody>
            {cargando && <tr><td colSpan={5} className="px-4 py-6 text-sm font-semibold text-slate-400"><Loader2 size={16} className="inline animate-spin" /> Cargando…</td></tr>}
            {!cargando && !filas.length && <tr><td colSpan={5} className="px-4 py-6 text-sm font-semibold text-slate-400"><Mail size={16} className="mr-2 inline" />Aún no hay correos enviados.</td></tr>}
            {!cargando && filas.map(f => (
              <tr key={f.id} className="border-b border-slate-50 text-[12px] font-semibold text-slate-600">
                <td className="whitespace-nowrap px-4 py-2.5">{new Date(f.creado_en).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td>{TIPOS[f.tipo] || f.tipo}</td>
                <td>{pacientes[f.paciente_id] || '—'}</td>
                <td className="max-w-[200px] truncate">{f.para}</td>
                <td className="pr-4">{f.estado === 'enviado'
                  ? <span className="text-[10px] font-black uppercase text-emerald-600">Enviado</span>
                  : <span className="text-[10px] font-black uppercase text-rose-600" title={f.error || ''}>Error{f.error ? `: ${String(f.error).slice(0, 60)}` : ''}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

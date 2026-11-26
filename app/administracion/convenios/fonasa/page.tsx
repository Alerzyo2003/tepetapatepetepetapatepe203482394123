'use client'
// Pacientes con prestaciones Fonasa presupuestadas: deuda y registro de pagos.
// Cada pago queda como pago normal (con su caja y boleta). El doctor cobra su honorario solo cuando la prestación
// está realizada y pagada al 100%: esa es la regla general de la liquidación, así que aquí no hay que hacer nada especial.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CheckCircle2, ChevronDown, ChevronLeft, Clock, Loader2, Search, Users, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRole } from '@/app/hooks/useRole'
import { asegurarMiCaja } from '@/lib/cajas'

const clp = (n: number) => `$${Math.round(n || 0).toLocaleString('es-CL')}`
const METODOS = ['Transferencia', 'Efectivo', 'Tarjeta de Débito', 'Tarjeta de Crédito']
const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-[#C9A24B]'
const nuevaClave = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
const ESTADOS_REALIZADO = ['realizado', 'atendido', 'terminado', 'finalizado', 'completado']
const nombreLimpio = (s: string) => String(s || '').split(' | ')[0]

export default function PagosFonasaPage() {
  const { rol, user } = useRole() as any
  const [pacientes, setPacientes] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [doctores, setDoctores] = useState<Record<string, string>>({})
  const [bancos, setBancos] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState<'deuda' | 'todos'>('deuda')
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('perfiles').select('id, nombre_completo').then(({ data }) => {
      const m: Record<string, string> = {}
      ;(data || []).forEach((p: any) => { m[p.id] = p.nombre_completo })
      setDoctores(m)
    })
    supabase.from('bancos').select('nombre').eq('activo', true).order('nombre').then(({ data }) => setBancos((data || []).map((b: any) => b.nombre)))
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    const todos: any[] = []
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase
        .from('presupuesto_items')
        .select('id, presupuesto_id, nombre_prestacion, diente_id, precio_pactado, abonado, estado, progreso, profesional_id, presupuestos!inner(paciente_id, nombre_tratamiento, estado)')
        .ilike('nombre_prestacion', '%fonasa%')
        .order('id')
        .range(desde, desde + 999)
      if (error) { toast.error('No se pudieron cargar las prestaciones', { description: error.message }); break }
      if (!data?.length) break
      todos.push(...data)
      if (data.length < 1000) break
    }
    const validos = todos.filter((i: any) => Number(i.precio_pactado || 0) > 0
      && String(i.estado || '').toLowerCase() !== 'cancelada'
      && !String(i.presupuestos?.estado || '').toLowerCase().includes('anul'))
    setItems(validos)
    const ids = Array.from(new Set(validos.map((i: any) => i.presupuestos?.paciente_id).filter(Boolean)))
    const pacs: any[] = []
    for (let k = 0; k < ids.length; k += 150) {
      const { data } = await supabase.from('pacientes').select('id, nombre, apellido, rut, telefono').in('id', ids.slice(k, k + 150))
      pacs.push(...(data || []))
    }
    setPacientes(pacs)
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const filas = useMemo(() => {
    const t = buscar.trim().toLowerCase()
    return pacientes.map(p => {
      const its = items.filter(i => i.presupuestos?.paciente_id === p.id).map(i => ({
        ...i,
        deuda: Math.max(0, Number(i.precio_pactado || 0) - Number(i.abonado || 0)),
        realizada: ESTADOS_REALIZADO.includes(String(i.estado || '').toLowerCase()),
      }))
      const total = its.reduce((a, i) => a + Number(i.precio_pactado || 0), 0)
      const abonado = its.reduce((a, i) => a + Number(i.abonado || 0), 0)
      return { ...p, items: its, total, abonado, deuda: its.reduce((a, i) => a + i.deuda, 0) }
    })
      .filter(p => (filtro === 'todos' || p.deuda > 0) && (!t || `${p.nombre} ${p.apellido} ${p.rut || ''}`.toLowerCase().includes(t)))
      .sort((a, b) => b.deuda - a.deuda)
  }, [pacientes, items, buscar, filtro])

  const totalDeuda = filas.reduce((a, p) => a + p.deuda, 0)

  if (rol && rol !== 'ADMIN') return <div className="p-10 text-sm font-bold text-slate-500">Solo administración puede ver esta página.</div>

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <Link href="/administracion/convenios" className="mb-4 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-[#C9A24B]"><ChevronLeft size={14} /> Convenios</Link>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#C9A24B]">Prestaciones Fonasa</p>
      <h1 className="font-serif text-3xl font-black text-[#0A111F]">Pagos Fonasa</h1>
      <p className="mt-1 max-w-2xl text-[12px] font-semibold text-slate-500">
        Pacientes con prestaciones Fonasa presupuestadas, con su deuda. Cada pago que registres aquí queda como pago del paciente (en tu caja).
        El doctor recibe su honorario en la liquidación solo cuando la prestación está <b>realizada y pagada al 100%</b>, todo en una misma liquidación.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-4"><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400"><Users size={12} /> Pacientes con deuda</p><p className="mt-1 text-2xl font-black text-[#0A111F]">{filas.filter(p => p.deuda > 0).length}</p></div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4"><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400"><Wallet size={12} /> Deuda Fonasa</p><p className="mt-1 text-2xl font-black text-[#0A111F]">{clp(totalDeuda)}</p></div>
        <div className="col-span-2 rounded-2xl border border-slate-100 bg-white p-4 md:col-span-1"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prestaciones</p><p className="mt-1 text-2xl font-black text-[#0A111F]">{filas.reduce((a, p) => a + p.items.length, 0)}</p></div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar paciente o RUT" className={`${inputCls} pl-9`} />
        </div>
        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500"><input type="checkbox" checked={filtro === 'deuda'} onChange={e => setFiltro(e.target.checked ? 'deuda' : 'todos')} /> Solo con deuda</label>
      </div>

      <div className="mt-4 space-y-3">
        {cargando && <p className="flex items-center gap-2 text-sm font-semibold text-slate-400"><Loader2 size={16} className="animate-spin" /> Cargando…</p>}
        {!cargando && filas.length === 0 && <p className="text-sm font-semibold text-slate-400">Sin pacientes para mostrar.</p>}
        {filas.map(p => (
          <div key={p.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <button onClick={() => setAbierto(abierto === p.id ? null : p.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-black uppercase text-[#0A111F]">{p.nombre} {p.apellido}</p>
                <p className="text-[10px] font-semibold text-slate-400">{p.rut || 'Sin RUT'} · {p.items.length} prestación(es) Fonasa</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Deuda</p>
                <p className={`text-[15px] font-black ${p.deuda > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{clp(p.deuda)}</p>
                <p className="text-[10px] font-semibold text-slate-400">de {clp(p.total)} · pagado {clp(p.abonado)}</p>
              </div>
              <ChevronDown size={16} className={`shrink-0 text-slate-300 transition ${abierto === p.id ? 'rotate-180' : ''}`} />
            </button>
            {abierto === p.id && <PagoFonasa paciente={p} doctores={doctores} bancos={bancos} user={user} onListo={cargar} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function PagoFonasa({ paciente, doctores, bancos, user, onListo }: any) {
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [metodo, setMetodo] = useState('Transferencia')
  const [banco, setBanco] = useState('')
  const [ref, setRef] = useState('')
  const [boleta, setBoleta] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const claveRef = useRef<{ huella: string; clave: string } | null>(null)

  const conDeuda = paciente.items.filter((i: any) => i.deuda > 0)
  const total = Object.values(montos).reduce((a, v) => a + (Number(v) || 0), 0)

  const registrar = async () => {
    const sel = conDeuda.filter((i: any) => Number(montos[i.id]) > 0)
    if (!sel.length) return toast.error('Escribe el monto a pagar en alguna prestación')
    for (const i of sel) if (Number(montos[i.id]) > i.deuda + 1) return toast.error(`El pago de “${nombreLimpio(i.nombre_prestacion)}” supera su deuda (${clp(i.deuda)})`)
    if (!boleta.trim()) return toast.error('Ingresa el N° de boleta')
    if (metodo === 'Transferencia' && (!banco.trim() || !ref.trim())) return toast.error('Ingresa el banco y el N° de transferencia')
    if (!user?.id) return toast.error('Sesión no válida')

    setGuardando(true)
    try {
      const { caja, recienAbierta } = await asegurarMiCaja(user.id, user.email || 'Administración')
      if (recienAbierta) toast.info(`Se abrió tu caja #${caja.numero_caja}. El pago quedará en ella.`)
      const fecha = new Date().toISOString()
      const lineas = sel.map((i: any) => {
        const monto = Math.round(Math.min(Number(montos[i.id]), i.deuda))
        return {
          paciente_id: paciente.id,
          monto,
          metodo_pago: metodo,
          numero_boleta: boleta.trim(),
          numero_referencia: metodo === 'Transferencia' ? `${banco.trim()} - Ref: ${ref.trim()}` : null,
          profesional_id: i.profesional_id,
          item_id: i.id,
          fecha_pago: fecha,
          comentario: JSON.stringify([{ id: i.id, prestacion: nombreLimpio(i.nombre_prestacion), diente: i.diente_id, precio: i.precio_pactado, doctor: doctores[i.profesional_id] || '-', abonado_ahora: monto }]),
          nota: nota.trim() || `Pago Fonasa (${nombreLimpio(i.nombre_prestacion)})`,
          caja_id: caja.id,
        }
      })
      // La clave evita duplicar el pago si se corta internet y se reintenta
      const huella = JSON.stringify(lineas.map(({ fecha_pago, ...r }: any) => r))
      if (!claveRef.current || claveRef.current.huella !== huella) claveRef.current = { huella, clave: nuevaClave() }
      const { error } = await supabase.rpc('registrar_pago', { p_lineas: lineas, p_saldo_usado: 0, p_clave: claveRef.current.clave })
      if (error) throw error
      claveRef.current = null
      toast.success(`Pago registrado: ${clp(total)}`)
      setMontos({}); setRef(''); setBoleta(''); setNota('')
      onListo()
    } catch (e: any) {
      toast.error('No se pudo registrar el pago', { description: e?.message })
    } finally { setGuardando(false) }
  }

  return (
    <div className="border-t border-slate-100 bg-[#FBF8F2]/60 px-5 py-4">
      <div className="space-y-2">
        {paciente.items.map((i: any) => (
          <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-black uppercase text-[#0A111F]">{nombreLimpio(i.nombre_prestacion)}{i.diente_id ? ` (${i.diente_id})` : ''}</p>
              <p className="text-[10px] font-semibold text-slate-400">
                {doctores[i.profesional_id] || 'Sin doctor'} · total {clp(i.precio_pactado)} · pagado {clp(i.abonado)}
              </p>
              <p className={`mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${i.realizada ? 'text-emerald-600' : 'text-amber-600'}`}>
                {i.realizada ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                {i.realizada ? (i.deuda <= 0 ? 'Realizada y pagada: doctor liquidable' : 'Realizada · falta pagar') : (i.deuda <= 0 ? 'Pagada · falta realizar' : 'Por realizar')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Deuda</p>
              <p className={`text-[14px] font-black ${i.deuda > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{clp(i.deuda)}</p>
            </div>
            {i.deuda > 0 ? (
              <div className="w-44">
                <input type="number" min={0} value={montos[i.id] || ''} onChange={e => setMontos({ ...montos, [i.id]: e.target.value })} placeholder="Pago $" className={inputCls} />
                <div className="mt-1 flex gap-1">
                  <button type="button" onClick={() => setMontos({ ...montos, [i.id]: String(i.deuda) })} className="rounded-md border border-slate-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500 hover:border-[#C9A24B]">Saldo completo</button>
                  {Number(i.abonado) === 0 && <button type="button" onClick={() => setMontos({ ...montos, [i.id]: String(Math.round(Number(i.precio_pactado) * 0.6)) })} className="rounded-md border border-slate-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500 hover:border-[#C9A24B]">60%</button>}
                </div>
              </div>
            ) : <div className="w-44" />}
          </div>
        ))}
      </div>
      {conDeuda.length === 0 ? <p className="mt-3 text-[12px] font-semibold text-emerald-600">Sin deuda pendiente.</p> : (
        <>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <select value={metodo} onChange={e => setMetodo(e.target.value)} className={inputCls}>{METODOS.map(m => <option key={m}>{m}</option>)}</select>
            {metodo === 'Transferencia' && <>
              <select value={banco} onChange={e => setBanco(e.target.value)} className={inputCls}><option value="">Banco…</option>{bancos.map((b: string) => <option key={b}>{b}</option>)}</select>
              <input value={ref} onChange={e => setRef(e.target.value)} placeholder="N° transferencia" className={inputCls} />
            </>}
            <input value={boleta} onChange={e => setBoleta(e.target.value)} placeholder="N° boleta" className={inputCls} />
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional)" className={`${inputCls} md:col-span-2`} />
          </div>
          <div className="mt-3 flex items-center justify-end gap-4">
            <p className="text-[12px] font-black text-slate-500">Total: <span className="text-[#0A111F]">{clp(total)}</span></p>
            <button onClick={registrar} disabled={guardando || total <= 0} className="inline-flex items-center gap-2 rounded-xl bg-[#0A111F] px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40">
              {guardando && <Loader2 size={14} className="animate-spin" />} Registrar pago
            </button>
          </div>
        </>
      )}
    </div>
  )
}

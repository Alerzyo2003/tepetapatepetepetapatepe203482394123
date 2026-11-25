'use client'
// Convenios que pagan en cuotas (sindicatos): pacientes, deuda y registro de cada cuota mensual.
// Cada cuota se registra como un pago normal (con su caja y boleta) y entra a la liquidación del doctor en el mes en que se paga.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronDown, ChevronLeft, Loader2, Search, Users, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRole } from '@/app/hooks/useRole'
import { asegurarMiCaja } from '@/lib/cajas'

const clp = (n: number) => `$${Math.round(n || 0).toLocaleString('es-CL')}`
const METODOS = ['Transferencia', 'Efectivo', 'Tarjeta de Débito', 'Tarjeta de Crédito']
const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-[#C9A24B]'
const nuevaClave = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export default function CuotasConveniosPage() {
  const { rol, user } = useRole() as any
  const [convenios, setConvenios] = useState<any[]>([])
  const [convenioSel, setConvenioSel] = useState<string>('')
  const [pacientes, setPacientes] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [doctores, setDoctores] = useState<Record<string, string>>({})
  const [bancos, setBancos] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [soloDeuda, setSoloDeuda] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('convenios').select('id, nombre_convenio, max_cuotas').eq('pago_en_cuotas', true).order('nombre_convenio').then(({ data }) => {
      setConvenios(data || [])
      if (data?.length) setConvenioSel(data[0].nombre_convenio)
      else setCargando(false)
    })
    supabase.from('perfiles').select('id, nombre_completo').then(({ data }) => {
      const m: Record<string, string> = {}
      ;(data || []).forEach((p: any) => { m[p.id] = p.nombre_completo })
      setDoctores(m)
    })
    supabase.from('bancos').select('nombre').eq('activo', true).order('nombre').then(({ data }) => setBancos((data || []).map((b: any) => b.nombre)))
  }, [])

  const cargar = useCallback(async () => {
    if (!convenioSel) return
    setCargando(true)
    const { data: pacs } = await supabase.from('pacientes').select('id, nombre, apellido, rut, telefono').eq('prevision', convenioSel).order('apellido')
    const lista = pacs || []
    setPacientes(lista)
    if (!lista.length) { setItems([]); setCargando(false); return }
    const { data: its } = await supabase
      .from('presupuesto_items')
      .select('id, presupuesto_id, nombre_prestacion, diente_id, precio_pactado, abonado, estado, progreso, profesional_id, presupuestos!inner(paciente_id, nombre_tratamiento, estado)')
      .in('presupuestos.paciente_id', lista.map((p: any) => p.id))
    // Solo cuentan los tratamientos iniciados: el plan está activo/finalizado, o alguna de sus prestaciones ya se inició (realizada, con avance o con abono).
    // Los borradores y planes sin iniciar no generan deuda en este panel.
    const todos = ((its || []) as any[]).filter((i: any) => !String(i.presupuestos?.estado || '').toLowerCase().includes('anul'))
    const iniciada = (i: any) => String(i.estado || '').toLowerCase() !== 'pendiente' || Number(i.progreso || 0) > 0 || Number(i.abonado || 0) > 0
    const planesIniciados = new Set<string>()
    for (const i of todos) {
      const estadoPlan = String(i.presupuestos?.estado || '').toLowerCase()
      if (estadoPlan.includes('activo') || estadoPlan.includes('finalizado') || iniciada(i)) planesIniciados.add(i.presupuesto_id)
    }
    setItems(todos.filter((i: any) => planesIniciados.has(i.presupuesto_id)))
    setCargando(false)
  }, [convenioSel])
  useEffect(() => { cargar() }, [cargar])

  const filas = useMemo(() => {
    const t = buscar.trim().toLowerCase()
    return pacientes.map(p => {
      const its = items.filter(i => i.presupuestos?.paciente_id === p.id).map(i => ({ ...i, deuda: Math.max(0, Number(i.precio_pactado || 0) - Number(i.abonado || 0)) }))
      const total = its.reduce((a, i) => a + Number(i.precio_pactado || 0), 0)
      const abonado = its.reduce((a, i) => a + Number(i.abonado || 0), 0)
      return { ...p, items: its, total, abonado, deuda: its.reduce((a, i) => a + i.deuda, 0) }
    })
      .filter(p => (!soloDeuda || p.deuda > 0) && (!t || `${p.nombre} ${p.apellido} ${p.rut || ''}`.toLowerCase().includes(t)))
      .sort((a, b) => b.deuda - a.deuda)
  }, [pacientes, items, buscar, soloDeuda])

  const totalDeuda = filas.reduce((a, p) => a + p.deuda, 0)
  const convActual = convenios.find(c => c.nombre_convenio === convenioSel)

  if (rol && rol !== 'ADMIN') return <div className="p-10 text-sm font-bold text-slate-500">Solo administración puede ver esta página.</div>

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <Link href="/administracion/convenios" className="mb-4 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-[#C9A24B]"><ChevronLeft size={14} /> Convenios</Link>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#C9A24B]">Convenios en cuotas</p>
      <h1 className="font-serif text-3xl font-black text-[#0A111F]">Cuotas de sindicatos</h1>
      <p className="mt-1 max-w-2xl text-[12px] font-semibold text-slate-500">
        Pacientes del convenio con su deuda (solo de tratamientos ya iniciados). Cada cuota que registres aquí queda como pago del paciente (en tu caja) y entra a la liquidación del doctor en el mes en que se paga, sin esperar a que el tratamiento esté pagado al 100%.
      </p>

      {!convenios.length && !cargando && <p className="mt-8 text-sm font-semibold text-slate-400">No hay convenios marcados como “pago en cuotas”.</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        {convenios.map(c => (
          <button key={c.id} onClick={() => { setConvenioSel(c.nombre_convenio); setAbierto(null) }}
            className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wider transition ${convenioSel === c.nombre_convenio ? 'border-[#0A111F] bg-[#0A111F] text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-[#C9A24B]'}`}>
            {c.nombre_convenio.trim()}
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-4"><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400"><Users size={12} /> Pacientes con deuda</p><p className="mt-1 text-2xl font-black text-[#0A111F]">{filas.filter(p => p.deuda > 0).length}</p></div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4"><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400"><Wallet size={12} /> Deuda del convenio</p><p className="mt-1 text-2xl font-black text-[#0A111F]">{clp(totalDeuda)}</p></div>
        <div className="col-span-2 rounded-2xl border border-slate-100 bg-white p-4 md:col-span-1"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Máximo de cuotas</p><p className="mt-1 text-2xl font-black text-[#0A111F]">{convActual?.max_cuotas ?? 6}</p></div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar paciente o RUT" className={`${inputCls} pl-9`} />
        </div>
        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500"><input type="checkbox" checked={soloDeuda} onChange={e => setSoloDeuda(e.target.checked)} /> Solo con deuda</label>
      </div>

      <div className="mt-4 space-y-3">
        {cargando && <p className="flex items-center gap-2 text-sm font-semibold text-slate-400"><Loader2 size={16} className="animate-spin" /> Cargando…</p>}
        {!cargando && filas.length === 0 && convenios.length > 0 && <p className="text-sm font-semibold text-slate-400">Sin pacientes para mostrar.</p>}
        {filas.map(p => (
          <div key={p.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <button onClick={() => setAbierto(abierto === p.id ? null : p.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-black uppercase text-[#0A111F]">{p.nombre} {p.apellido}</p>
                <p className="text-[10px] font-semibold text-slate-400">{p.rut || 'Sin RUT'} · {p.items.length} prestación(es)</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Deuda</p>
                <p className={`text-[15px] font-black ${p.deuda > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{clp(p.deuda)}</p>
                <p className="text-[10px] font-semibold text-slate-400">de {clp(p.total)} · pagado {clp(p.abonado)}</p>
              </div>
              <ChevronDown size={16} className={`shrink-0 text-slate-300 transition ${abierto === p.id ? 'rotate-180' : ''}`} />
            </button>
            {abierto === p.id && <PagoCuota paciente={p} doctores={doctores} bancos={bancos} user={user} convenio={convenioSel} onListo={cargar} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function PagoCuota({ paciente, doctores, bancos, user, convenio, onListo }: any) {
  const pendientes = paciente.items.filter((i: any) => i.deuda > 0)
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [metodo, setMetodo] = useState('Transferencia')
  const [banco, setBanco] = useState('')
  const [ref, setRef] = useState('')
  const [boleta, setBoleta] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const claveRef = useRef<{ huella: string; clave: string } | null>(null)

  const total = Object.values(montos).reduce((a, v) => a + (Number(v) || 0), 0)

  const registrar = async () => {
    const lineasSel = pendientes.filter((i: any) => Number(montos[i.id]) > 0)
    if (!lineasSel.length) return toast.error('Escribe el monto de la cuota en al menos una prestación')
    for (const i of lineasSel) if (Number(montos[i.id]) > i.deuda + 1) return toast.error(`La cuota de “${i.nombre_prestacion}” supera su deuda (${clp(i.deuda)})`)
    if (!boleta.trim()) return toast.error('Ingresa el N° de boleta')
    if (metodo === 'Transferencia' && (!banco.trim() || !ref.trim())) return toast.error('Ingresa el banco y el N° de transferencia')
    if (!user?.id) return toast.error('Sesión no válida')

    setGuardando(true)
    try {
      const { caja, recienAbierta } = await asegurarMiCaja(user.id, user.email || 'Administración')
      if (recienAbierta) toast.info(`Se abrió tu caja #${caja.numero_caja}. El pago quedará en ella.`)
      const fecha = new Date().toISOString()
      const lineas = lineasSel.map((i: any) => {
        const monto = Number(montos[i.id])
        return {
          paciente_id: paciente.id,
          monto,
          metodo_pago: metodo,
          numero_boleta: boleta.trim(),
          numero_referencia: metodo === 'Transferencia' ? `${banco.trim()} - Ref: ${ref.trim()}` : null,
          profesional_id: i.profesional_id,
          item_id: i.id,
          fecha_pago: fecha,
          comentario: JSON.stringify([{ id: i.id, prestacion: i.nombre_prestacion, diente: i.diente_id, precio: i.precio_pactado, doctor: doctores[i.profesional_id] || '-', abonado_ahora: monto }]),
          nota: nota.trim() || `Cuota convenio ${convenio.trim()}`,
          caja_id: caja.id,
        }
      })
      // La clave evita duplicar el pago si se corta internet y se reintenta
      const huella = JSON.stringify(lineas.map(({ fecha_pago, ...r }: any) => r))
      if (!claveRef.current || claveRef.current.huella !== huella) claveRef.current = { huella, clave: nuevaClave() }
      const { error } = await supabase.rpc('registrar_pago', { p_lineas: lineas, p_saldo_usado: 0, p_clave: claveRef.current.clave })
      if (error) throw error
      claveRef.current = null
      toast.success(`Cuota registrada: ${clp(total)}`)
      setMontos({}); setRef(''); setBoleta(''); setNota('')
      onListo()
    } catch (e: any) {
      toast.error('No se pudo registrar la cuota', { description: e?.message })
    } finally { setGuardando(false) }
  }

  return (
    <div className="border-t border-slate-100 bg-[#FBF8F2]/60 px-5 py-4">
      {pendientes.length === 0 ? <p className="text-[12px] font-semibold text-emerald-600">Sin deuda pendiente.</p> : (
        <>
          <table className="w-full text-left">
            <thead><tr className="text-[9px] font-black uppercase tracking-widest text-slate-400"><th className="py-1">Prestación</th><th>Doctor</th><th className="text-right">Precio</th><th className="text-right">Pagado</th><th className="text-right">Deuda</th><th className="w-32 pl-3">Cuota a pagar</th></tr></thead>
            <tbody>
              {pendientes.map((i: any) => (
                <tr key={i.id} className="border-t border-slate-100 text-[12px] font-semibold text-slate-700">
                  <td className="py-2 pr-2">{i.nombre_prestacion}{i.diente_id ? ` (${i.diente_id})` : ''}<span className="block text-[10px] text-slate-400">{i.presupuestos?.nombre_tratamiento}</span></td>
                  <td className="pr-2 text-[11px]">{doctores[i.profesional_id] || '—'}</td>
                  <td className="text-right">{clp(i.precio_pactado)}</td>
                  <td className="text-right">{clp(i.abonado)}</td>
                  <td className="text-right font-black text-rose-600">{clp(i.deuda)}</td>
                  <td className="pl-3"><input type="number" min={0} value={montos[i.id] || ''} onChange={e => setMontos({ ...montos, [i.id]: e.target.value })} placeholder="$" className={inputCls} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 grid gap-2 md:grid-cols-4">
            <select value={metodo} onChange={e => setMetodo(e.target.value)} className={inputCls}>{METODOS.map(m => <option key={m}>{m}</option>)}</select>
            {metodo === 'Transferencia' && <>
              <select value={banco} onChange={e => setBanco(e.target.value)} className={inputCls}><option value="">Banco…</option>{bancos.map((b: string) => <option key={b}>{b}</option>)}</select>
              <input value={ref} onChange={e => setRef(e.target.value)} placeholder="N° transferencia" className={inputCls} />
            </>}
            <input value={boleta} onChange={e => setBoleta(e.target.value)} placeholder="N° boleta" className={inputCls} />
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (ej: cuota 2 de 3)" className={`${inputCls} md:col-span-2`} />
          </div>
          <div className="mt-3 flex items-center justify-end gap-4">
            <p className="text-[12px] font-black text-slate-500">Total cuota: <span className="text-[#0A111F]">{clp(total)}</span></p>
            <button onClick={registrar} disabled={guardando || total <= 0} className="inline-flex items-center gap-2 rounded-xl bg-[#0A111F] px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40">
              {guardando && <Loader2 size={14} className="animate-spin" />} Registrar cuota
            </button>
          </div>
        </>
      )}
    </div>
  )
}

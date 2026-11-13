'use client'
// Modal "Rx tomada": asistentes y recepción marcan qué radiografías se tomaron hoy (por pieza),
// así quedan como deuda en Pagos y el paciente no se va sin pagarlas.
import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Loader2, Plus, RotateCcw, ScanLine, Square, Wallet, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
  agregarRxTomada, cargarCatalogoRx, cargarRxPaciente, desmarcarRxTomada, marcarRxTomadas, piezaTexto, piezasDelMotivo, type RxItem,
} from '@/lib/rxTomada'

const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-CL')}`

export default function ModalRxTomada({ pacienteId, pacienteNombre, motivoCita, citaId, onClose, onGuardado, mostrarIrAPagos = true }: {
  pacienteId: string
  pacienteNombre: string
  motivoCita?: string | null
  citaId?: string | null
  onClose: () => void
  onGuardado?: () => void
  mostrarIrAPagos?: boolean
}) {
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [pendientes, setPendientes] = useState<RxItem[]>([])
  const [tomadasHoy, setTomadasHoy] = useState<RxItem[]>([])
  const [presupuestos, setPresupuestos] = useState<any[]>([])
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [usuario, setUsuario] = useState<{ id: string | null; nombre: string }>({ id: null, nombre: 'Usuario' })
  const [agregando, setAgregando] = useState(false)
  const [catalogo, setCatalogo] = useState<any[]>([])
  const [nuevaPrest, setNuevaPrest] = useState('')
  const [nuevasPiezas, setNuevasPiezas] = useState('')
  const [nuevoPresupuesto, setNuevoPresupuesto] = useState('')
  const piezasCita = useMemo(() => piezasDelMotivo(motivoCita), [motivoCita])

  const cargar = async (premarcar = false) => {
    setCargando(true)
    try {
      const r = await cargarRxPaciente(pacienteId)
      setPendientes(r.pendientes)
      setTomadasHoy(r.tomadasHoy)
      const recientes = [...r.presupuestos].sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      setPresupuestos(recientes)
      setNuevoPresupuesto(p => p || recientes.find((x: any) => !/^\[DL-/.test(x.nombre_tratamiento || ''))?.id || '')
      if (premarcar && piezasCita.size) setMarcadas(new Set(r.pendientes.filter(x => x.diente && piezasCita.has(x.diente)).map(x => x.id)))
    } catch (e: any) {
      toast.error('No se pudieron cargar las radiografías del paciente')
      console.error(e)
    } finally { setCargando(false) }
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data } = await supabase.from('perfiles').select('nombre_completo').eq('id', session.user.id).maybeSingle()
        setUsuario({ id: session.user.id, nombre: data?.nombre_completo || session.user.email || 'Usuario' })
      }
    })()
    cargar(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteId])

  const alternar = (id: string) => setMarcadas(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const seleccion = pendientes.filter(p => marcadas.has(p.id))
  const totalSeleccion = seleccion.reduce((a, i) => a + Math.max(i.precio - i.abonado, 0), 0)
  const base = { pacienteId, pacienteNombre, usuarioId: usuario.id, usuarioNombre: usuario.nombre, citaId: citaId || null }

  const confirmar = async () => {
    if (!seleccion.length) return toast.error('Marca al menos una radiografía')
    setGuardando(true)
    try {
      const total = await marcarRxTomadas({ ...base, items: seleccion })
      toast.success(`${seleccion.length === 1 ? 'Rx marcada como tomada' : `${seleccion.length} Rx marcadas como tomadas`}. Quedan por cobrar ${pesos(total)}.`)
      setMarcadas(new Set())
      await cargar()
      onGuardado?.()
    } catch (e: any) {
      toast.error('No se pudo guardar. Intenta de nuevo.'); console.error(e)
    } finally { setGuardando(false) }
  }

  const deshacer = async (item: RxItem) => {
    setGuardando(true)
    try {
      await desmarcarRxTomada({ ...base, item })
      toast.success('Listo, se deshizo')
      await cargar()
      onGuardado?.()
    } catch (e: any) { toast.error(e?.message || 'No se pudo deshacer') } finally { setGuardando(false) }
  }

  const abrirAgregar = async () => {
    setAgregando(true)
    if (!catalogo.length) setCatalogo(await cargarCatalogoRx())
  }

  const confirmarAgregar = async () => {
    const prest = catalogo.find(c => c.id === nuevaPrest)
    if (!prest) return toast.error('Elige el tipo de radiografía')
    const dientes = [...piezasDelMotivo(nuevasPiezas)]
    setGuardando(true)
    try {
      const total = await agregarRxTomada({ ...base, prestacion: prest, dientes, presupuestoId: nuevoPresupuesto || null })
      toast.success(`Rx agregada y marcada como tomada. Quedan por cobrar ${pesos(total)}.`)
      setAgregando(false); setNuevaPrest(''); setNuevasPiezas('')
      await cargar()
      onGuardado?.()
    } catch (e: any) { toast.error('No se pudo agregar la Rx'); console.error(e) } finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0A111F]/60 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl max-h-[92vh] rounded-[2rem] shadow-2xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70">
          <div className="min-w-0">
            <h2 className="text-base font-black text-[#0A111F] uppercase tracking-tight flex items-center gap-2"><ScanLine size={18} className="text-[#C9A24B]" /> Rx tomada</h2>
            <p className="text-[11px] font-bold text-slate-500 uppercase truncate">{pacienteNombre}</p>
            {motivoCita && <p className="text-[10px] font-semibold text-slate-400 mt-0.5 truncate">Cita: {motivoCita}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-200 text-slate-400" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <p className="text-[11px] font-semibold text-slate-500">Marca solo las radiografías que se tomaron hoy. Quedan como realizadas y aparecen en Pagos para cobrarlas antes de que el paciente se vaya.</p>

          {cargando ? (
            <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-[#C9A24B]" /></div>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Radiografías pendientes ({pendientes.length})</p>
                {!pendientes.length && <p className="text-xs font-semibold text-slate-400 bg-slate-50 rounded-xl p-4 text-center">No tiene radiografías presupuestadas pendientes. Si se tomó una, agrégala abajo.</p>}
                {pendientes.map(p => {
                  const on = marcadas.has(p.id)
                  const sugerida = !!p.diente && piezasCita.has(p.diente)
                  return (
                    <button key={p.id} type="button" onClick={() => alternar(p.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${on ? 'border-[#C9A24B] bg-[#C9A24B]/10 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      {on ? <CheckSquare size={20} className="text-[#C9A24B] shrink-0" /> : <Square size={20} className="text-slate-300 shrink-0" />}
                      <span className={`w-14 shrink-0 text-center rounded-xl py-1.5 font-black text-sm ${p.diente ? 'bg-[#0A111F] text-white' : 'bg-slate-100 text-slate-400'}`}>{piezaTexto(p.diente)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-black text-slate-800 truncate">{p.nombre}{sugerida && <span className="ml-2 text-[9px] font-black text-emerald-600 uppercase">según la cita</span>}</span>
                        <span className="block text-[10px] font-semibold text-slate-500 truncate">{p.presupuesto}{p.doctor ? ` · Dr/a. ${p.doctor}` : ''}</span>
                      </span>
                      <span className="text-xs font-black text-slate-700 shrink-0">{pesos(p.precio)}</span>
                    </button>
                  )
                })}
              </div>

              {!agregando ? (
                <button type="button" onClick={abrirAgregar} className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl border border-dashed border-slate-300 text-[11px] font-black text-slate-500 uppercase tracking-widest hover:border-[#C9A24B] hover:text-[#8A6D2F]">
                  <Plus size={14} /> Agregar Rx que no estaba presupuestada
                </button>
              ) : (
                <div className="p-4 rounded-2xl border border-[#C9A24B]/40 bg-[#C9A24B]/5 space-y-3">
                  <p className="text-[10px] font-black text-[#8A6D2F] uppercase tracking-widest">Agregar Rx tomada</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select value={nuevaPrest} onChange={e => setNuevaPrest(e.target.value)} className="p-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-white">
                      <option value="">— Tipo de radiografía —</option>
                      {catalogo.map(c => <option key={c.id} value={c.id}>{c['Nombre Accion']} · {pesos(c.Precio)}</option>)}
                    </select>
                    <input value={nuevasPiezas} onChange={e => setNuevasPiezas(e.target.value)} placeholder="Pieza(s), ej: 3.6 4.6 (opcional)" className="p-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-white" />
                  </div>
                  <select value={nuevoPresupuesto} onChange={e => setNuevoPresupuesto(e.target.value)} className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-white">
                    <option value="">Crear presupuesto nuevo "Radiografías"</option>
                    {presupuestos.map((p: any) => <option key={p.id} value={p.id}>Agregar a: {(p.nombre_tratamiento || 'Plan de tratamiento').trim()}</option>)}
                  </select>
                  <p className="text-[10px] font-semibold text-slate-500">Si pones varias piezas se agrega una Rx por cada pieza.</p>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setAgregando(false)} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase text-slate-500 hover:bg-slate-100">Cancelar</button>
                    <button type="button" disabled={guardando || !nuevaPrest} onClick={confirmarAgregar} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase text-white bg-[#0A111F] disabled:opacity-40 flex items-center gap-1.5">
                      {guardando ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Agregar como tomada
                    </button>
                  </div>
                </div>
              )}

              {tomadasHoy.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Marcadas hoy</p>
                  {tomadasHoy.map(t => (
                    <div key={t.id} className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                      <span className="w-14 shrink-0 text-center rounded-xl py-1.5 font-black text-sm bg-emerald-600 text-white">{piezaTexto(t.diente)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-black text-slate-800 truncate">{t.nombre}</span>
                        <span className="block text-[10px] font-semibold text-slate-500 truncate">
                          Tomada por {t.tomadaPor}{t.tomadaFec ? ` a las ${new Date(t.tomadaFec).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })}` : ''} · {t.abonado >= t.precio ? 'Pagada' : `Por cobrar ${pesos(t.precio - t.abonado)}`}
                        </span>
                      </span>
                      {t.abonado === 0 && (
                        <button type="button" disabled={guardando} onClick={() => deshacer(t)} className="shrink-0 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase text-slate-500 hover:bg-white hover:text-rose-600 flex items-center gap-1" title="Deshacer (me equivoqué)">
                          <RotateCcw size={11} /> Deshacer
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between bg-white">
          {mostrarIrAPagos ? (
            <a href={`/pacientes/${pacienteId}/pagos`} className="text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:underline flex items-center gap-1.5"><Wallet size={13} /> Ir a Pagos para cobrar</a>
          ) : <span />}
          <button type="button" disabled={guardando || !seleccion.length} onClick={confirmar}
            className="px-6 py-3 rounded-2xl bg-[#0A111F] text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg">
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} className="text-[#C9A24B]" />}
            {seleccion.length ? `Marcar ${seleccion.length} como tomada${seleccion.length > 1 ? 's' : ''} · ${pesos(totalSeleccion)}` : 'Marca las que se tomaron'}
          </button>
        </div>
      </div>
    </div>
  )
}

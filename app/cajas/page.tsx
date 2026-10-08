'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import {
  Plus, Lock, Unlock, Calendar, Loader2, History, Banknote, CreditCard, Landmark,
  ReceiptText, ChevronRight, TrendingUp, Clock4, Eye, RefreshCw, EyeOff, Info, Wallet,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { abrirCaja, cerrarCaja, puedeGestionarCaja, resumirPagosCaja } from '@/lib/cajas'

const money = (v: number) => `$${Math.round(Number(v) || 0).toLocaleString('es-CL')}`
const hora = (f: string) => new Date(f).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
const fecha = (f: string) => new Date(f).toLocaleDateString('es-CL')

export default function GestionCajasPage() {
  const router = useRouter()
  const [cajasAbiertas, setCajasAbiertas] = useState<any[]>([])
  const [cajasCerradas, setCajasCerradas] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalApertura, setModalApertura] = useState(false)
  const [abriendoCaja, setAbriendoCaja] = useState(false)
  const [cerrandoId, setCerrandoId] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  const [usuarioId, setUsuarioId] = useState<string | null>(null)
  const [rol, setRol] = useState<string | null>(null)
  const [responsable, setResponsable] = useState('Cargando...')
  const [montoInicial, setMontoInicial] = useState('0')

  const fetchCajas = useCallback(async () => {
    try {
      const [abiertasRes, cerradasRes] = await Promise.all([
        supabase.from('sesiones_caja').select('*, pagos(monto, estado, metodo_pago)').eq('estado', 'abierta').order('fecha_apertura', { ascending: true }),
        supabase.from('sesiones_caja').select('*, pagos(monto, estado, metodo_pago)').eq('estado', 'cerrada').order('fecha_cierre', { ascending: false }).limit(34),
      ])
      if (abiertasRes.error) throw abiertasRes.error
      if (cerradasRes.error) throw cerradasRes.error

      setCajasAbiertas((abiertasRes.data || []).map((caja: any) => {
        const r = resumirPagosCaja(caja.pagos)
        return { ...caja, resumen: r, acumulado: Number(caja.monto_apertura || 0) + r.total }
      }))
      setCajasCerradas((cerradasRes.data || []).map((caja: any) => {
        const r = resumirPagosCaja(caja.pagos)
        // Se recalcula al vuelo para no depender de cierres antiguos mal guardados
        return { ...caja, resumen: r, monto_cierre: Number(caja.monto_apertura || 0) + r.total }
      }))
    } catch {
      toast.error('Error al sincronizar datos de caja')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    setIsMounted(true)
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUsuarioId(user.id)
        const { data: perfil } = await supabase.from('perfiles').select('nombre_completo, rol').eq('id', user.id).maybeSingle()
        setRol(perfil?.rol || null)
        setResponsable(perfil?.nombre_completo || user.user_metadata?.nombre_completo || user.email || 'Usuario')
      }
      fetchCajas()
    })()
  }, [fetchCajas])

  // Mantener la vista al día cuando otra persona registra pagos o abre/cierra su caja
  useEffect(() => {
    let t: any
    const refrescar = () => { clearTimeout(t); t = setTimeout(fetchCajas, 600) }
    const canal = supabase.channel('cajas-multiples')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones_caja' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos' }, refrescar)
      .subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(canal) }
  }, [fetchCajas])

  const miCaja = cajasAbiertas.find(c => c.usuario_id === usuarioId) || null
  const otrasCajas = cajasAbiertas.filter(c => c.usuario_id !== usuarioId)
  const esAdmin = rol === 'ADMIN'
  const totalAbiertas = cajasAbiertas.reduce((s, c) => s + c.resumen.total, 0)

  const handleAbrirCaja = async () => {
    if (!usuarioId || abriendoCaja) return
    setAbriendoCaja(true)
    try {
      const caja = await abrirCaja(usuarioId, responsable, Number(montoInicial) || 0)
      toast.success(`Caja #${caja.numero_caja} abierta`)
      setModalApertura(false)
      setMontoInicial('0')
      fetchCajas()
    } catch (error: any) {
      toast.error(`Error: ${error.message}`)
    } finally {
      setAbriendoCaja(false)
    }
  }

  const handleCerrarCaja = async (caja: any) => {
    const propia = caja.usuario_id === usuarioId
    if (!propia && !esAdmin) return toast.error('Solo puedes cerrar tu propia caja.')
    const texto = propia
      ? `¿Cerrar tu caja #${caja.numero_caja}?\n\nTotal recaudado: ${money(caja.resumen.total)}\nTotal en caja (con fondo): ${money(caja.acumulado)}`
      : `Vas a cerrar la caja #${caja.numero_caja} de ${caja.nombre_responsable}.\n\nTotal recaudado: ${money(caja.resumen.total)}\n\n¿Continuar?`
    if (!window.confirm(texto)) return
    setCerrandoId(caja.id)
    try {
      await cerrarCaja(caja.id)
      toast.success(`Caja #${caja.numero_caja} cerrada`)
      fetchCajas()
    } catch (e: any) {
      toast.error(e?.message || 'Error al cerrar caja')
    } finally {
      setCerrandoId(null)
    }
  }

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-white">
      <Loader2 className="animate-spin text-[#C49A5C]" size={40} />
      <p className="font-bold text-xs uppercase tracking-widest text-slate-400">Verificando Finanzas...</p>
    </div>
  )

  if (rol !== null && !puedeGestionarCaja(rol)) return (
    <div className="h-screen flex flex-col items-center justify-center gap-3 bg-white text-center px-6">
      <EyeOff className="text-slate-300" size={44} />
      <p className="font-black text-slate-700 uppercase">Acceso restringido</p>
      <p className="text-sm text-slate-500">Solo administración y recepción gestionan cajas.</p>
    </div>
  )

  return (
    <main className="min-h-screen bg-white p-6 md:p-10 font-sans text-slate-900 relative overflow-hidden z-0">
      <div className="absolute top-0 right-0 w-[800px] h-[900px] bg-[url('/fondo-caja.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-100"></div>

      <div className="max-w-[1400px] mx-auto space-y-8 relative z-10">

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tight text-[#0B1527] leading-[1.1]">
              CONTROL <br />
              <span className="text-[#C49A5C]">DE CAJA</span>
            </h1>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-3">Terminal de Arqueo y Recaudación</p>
            <div className="w-12 h-[3px] bg-[#C49A5C] mt-2 rounded-full"></div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={fetchCajas} title="Actualizar"
              className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 text-slate-400 hover:text-[#C49A5C] transition-all">
              <RefreshCw size={20} />
            </button>
            <button
              disabled={!!miCaja}
              onClick={() => setModalApertura(true)}
              className={`flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-slate-100 min-w-[300px] transition-all ${miCaja ? 'opacity-90 cursor-default' : 'hover:border-[#C49A5C]/40 hover:shadow-md cursor-pointer active:scale-95'}`}
            >
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${miCaja ? 'bg-[#FCF8F2] text-[#C49A5C]' : 'bg-emerald-50 text-emerald-600'}`}>
                  {miCaja ? <Wallet size={20} /> : <Plus size={20} />}
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-800 text-sm">{miCaja ? `MI CAJA #${miCaja.numero_caja} ABIERTA` : 'ABRIR MI CAJA'}</p>
                  <p className="text-xs text-slate-400 font-medium">{miCaja ? `Desde las ${hora(miCaja.fecha_apertura)}` : 'Con fondo inicial (sencillo)'}</p>
                </div>
              </div>
              <ChevronRight className="text-slate-300" size={20} />
            </button>
          </div>
        </header>

        <div className="flex items-start gap-3 bg-[#FCF8F2] border border-[#C49A5C]/20 rounded-2xl p-4 max-w-[950px]">
          <Info size={18} className="text-[#C49A5C] shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 font-medium">
            Cada administrador y recepcionista tiene <b>su propia caja</b>. Si registras un pago sin tener la caja abierta, <b>se abre sola</b> y el pago queda en ella.
            Ábrela aquí solo si necesitas registrar un fondo inicial (sencillo).
          </p>
        </div>

        {/* MI CAJA */}
        {miCaja ? (
          <TarjetaCaja caja={miCaja} propia onVer={() => router.push(`/cajas/${miCaja.id}`)} onCerrar={() => handleCerrarCaja(miCaja)} cerrando={cerrandoId === miCaja.id} />
        ) : (
          <div className="bg-white p-10 rounded-3xl border border-dashed border-slate-200 text-center">
            <p className="text-slate-500 font-bold uppercase text-sm tracking-widest">No tienes una caja abierta</p>
            <p className="text-xs text-slate-400 mt-2">Se abrirá automáticamente con tu primer pago del turno.</p>
          </div>
        )}

        {/* OTRAS CAJAS ABIERTAS */}
        {otrasCajas.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase text-[#0B1527] tracking-wide flex items-center gap-3">
                <div className="p-2 bg-[#FCF8F2] text-[#C49A5C] rounded-lg"><Unlock size={18} /></div>
                Otras cajas abiertas ({otrasCajas.length})
              </h2>
              <p className="text-xs font-bold text-slate-500">Recaudado en todas las cajas abiertas: <span className="text-[#C49A5C] font-black">{money(totalAbiertas)}</span></p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {otrasCajas.map(c => (
                <TarjetaCajaCompacta key={c.id} caja={c} puedeCerrar={esAdmin} cerrando={cerrandoId === c.id}
                  onVer={() => router.push(`/cajas/${c.id}`)} onCerrar={() => handleCerrarCaja(c)} />
              ))}
            </div>
          </section>
        )}

        {/* HISTORIAL */}
        <section className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-sm border border-slate-100 overflow-hidden mt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between p-6 md:p-8 border-b border-slate-100 gap-4">
            <h2 className="text-sm font-black uppercase text-[#0B1527] tracking-wide flex items-center gap-3">
              <div className="p-2 bg-[#FCF8F2] text-[#C49A5C] rounded-lg"><History size={18} /></div>
              Registro Histórico
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-transparent text-[10px] text-[#C49A5C] uppercase tracking-[0.15em] font-black border-b border-slate-100">
                  <th className="px-8 py-5">N°</th>
                  <th className="px-8 py-5">Fecha</th>
                  <th className="px-8 py-5">Usuario</th>
                  <th className="px-8 py-5">Hora Inicio</th>
                  <th className="px-8 py-5">Hora Cierre</th>
                  <th className="px-8 py-5">Base Inicial</th>
                  <th className="px-8 py-5">Recaudado</th>
                  <th className="px-8 py-5">Total en Caja</th>
                  <th className="px-8 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {cajasCerradas.map((caja) => (
                  <tr key={caja.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-6 font-black text-[#C49A5C]">{caja.numero_caja ? `#${caja.numero_caja}` : '-'}</td>
                    <td className="px-8 py-6 font-bold text-[#0B1527]">{fecha(caja.fecha_apertura)}</td>
                    <td className="px-8 py-6 font-bold text-[#0B1527]">{caja.nombre_responsable}</td>
                    <td className="px-8 py-6 text-slate-500 font-medium">{hora(caja.fecha_apertura)}</td>
                    <td className="px-8 py-6 text-slate-500 font-medium">{caja.fecha_cierre ? hora(caja.fecha_cierre) : '—'}</td>
                    <td className="px-8 py-6 text-[#0B1527] font-bold">{money(caja.monto_apertura)}</td>
                    <td className="px-8 py-6 text-[#0B1527] font-bold">{money(caja.resumen.total)}</td>
                    <td className="px-8 py-6 text-emerald-600 font-black">{money(caja.monto_cierre)}</td>
                    <td className="px-8 py-6 text-center">
                      <button onClick={() => router.push(`/cajas/${caja.id}`)} className="p-2.5 bg-[#FCF8F2] text-[#C49A5C] rounded-xl hover:bg-[#C49A5C] hover:text-white transition-all inline-flex" title="Ver Detalles">
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {cajasCerradas.length === 0 && (
                  <tr><td colSpan={9} className="px-8 py-8 text-center text-slate-400 font-medium text-sm">No hay registros históricos disponibles.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {isMounted && typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
          {modalApertura && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100">
                <div className="p-8 text-center space-y-6">
                  <div className="bg-[#FCF8F2] w-20 h-20 rounded-[1.5rem] flex items-center justify-center text-[#C49A5C] mx-auto"><Unlock size={36} /></div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight text-[#0B1527]">Apertura de mi caja</h3>
                    <p className="text-xs font-bold text-[#C49A5C] uppercase tracking-wider mt-2">Configuración inicial del turno</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between mt-4">
                    <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">Cajero:</span>
                    <span className="font-bold text-slate-800">{responsable}</span>
                  </div>
                  <div className="space-y-3 pt-2">
                    <label className="text-xs font-bold uppercase text-slate-500 tracking-wider block text-left">Monto en caja (Sencillo)</label>
                    <div className="relative group">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xl font-black text-[#C49A5C]">$</span>
                      <input type="number" autoFocus value={montoInicial} onChange={(e) => setMontoInicial(e.target.value)}
                        className="w-full bg-white border-2 border-slate-200 focus:border-[#C49A5C] rounded-2xl py-4 pl-12 pr-6 text-2xl font-bold outline-none transition-all text-[#0B1527]" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 pt-4">
                    <button disabled={abriendoCaja} onClick={handleAbrirCaja}
                      className="w-full bg-[#0B1527] text-white py-4 rounded-2xl font-bold text-sm uppercase tracking-wide hover:bg-[#0B1527]/90 transition-all flex items-center justify-center gap-2 disabled:bg-slate-300">
                      {abriendoCaja ? <Loader2 className="animate-spin" /> : 'Confirmar Apertura'}
                    </button>
                    <button onClick={() => setModalApertura(false)} className="py-3 text-xs font-bold uppercase text-slate-400 hover:text-red-500 transition-colors tracking-wider">Cancelar</button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      ) : null}
    </main>
  )
}

// ── Tarjeta grande: mi caja ──
function TarjetaCaja({ caja, onVer, onCerrar, cerrando }: { caja: any; propia?: boolean; onVer: () => void; onCerrar: () => void; cerrando: boolean }) {
  const r = caja.resumen
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
      <div className="lg:col-span-2 bg-[#0A1629] rounded-3xl p-8 relative flex flex-col justify-between shadow-xl min-h-[300px]">
        <div className="relative z-10">
          <span className="bg-[#C49A5C] text-white text-[10px] font-bold uppercase tracking-widest px-5 py-2 rounded-full inline-block mb-6 shadow-sm">
            Mi caja {caja.numero_caja ? `#${caja.numero_caja}` : ''}
          </span>
          <h3 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight">{caja.nombre_responsable}</h3>
          <div className="flex items-center gap-6 text-slate-300 text-xs font-medium mt-3">
            <span className="flex items-center gap-2"><Calendar size={16} /> {fecha(caja.fecha_apertura)}</span>
            <span className="flex items-center gap-2"><Clock4 size={16} /> {hora(caja.fecha_apertura)}</span>
          </div>
        </div>
        <div className="w-full h-px bg-white/10 my-8"></div>
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between relative z-10 gap-6 md:gap-0">
          <div className="flex gap-12 md:gap-20">
            <div>
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-2">Base Inicial</p>
              <p className="text-3xl font-bold text-white">{money(caja.monto_apertura)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#C49A5C] uppercase tracking-widest mb-2">Total Acumulado</p>
              <p className="text-4xl md:text-5xl font-black text-[#C49A5C]">{money(caja.acumulado)}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto mt-6 md:mt-0">
            <button onClick={onVer} className="bg-white/10 text-white px-8 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 hover:bg-white/20 transition-all border border-white/20 w-full sm:w-auto">
              <Eye size={18} /> Ver Info
            </button>
            <button onClick={onCerrar} disabled={cerrando} className="bg-[#C49A5C] text-white px-8 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 hover:bg-[#b58b4f] transition-all shadow-lg shadow-[#C49A5C]/20 w-full sm:w-auto disabled:opacity-60">
              {cerrando ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />} Cerrar Turno
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-8 shadow-sm border border-slate-100">
        <div className="flex items-center gap-3 text-[#0B1527] font-black text-sm uppercase tracking-wide mb-6">
          <div className="p-2.5 bg-[#FCF8F2] text-[#C49A5C] rounded-xl"><TrendingUp size={20} /></div>
          Resumen de mi turno
        </div>
        <div className="space-y-4">
          <Fila icon={ReceiptText} label="Ingresos" valor={money(r.total)} destacado />
          <Fila icon={Banknote} label="Efectivo" valor={money(r.efectivo)} />
          <Fila icon={CreditCard} label="Tarjeta" valor={money(r.tarjeta)} />
          <Fila icon={Landmark} label="Transferencia" valor={money(r.transferencia + r.otros)} />
          <Fila icon={TrendingUp} label="Transacciones" valor={String(r.cantidad)} />
        </div>
      </div>
    </div>
  )
}

function Fila({ icon: Icon, label, valor, destacado }: { icon: any; label: string; valor: string; destacado?: boolean }) {
  return (
    <div className="flex justify-between items-center border-b border-slate-100 pb-3 last:border-0">
      <div className="flex items-center gap-3 text-[12px] text-slate-600 font-bold uppercase tracking-wider">
        <div className="p-2 bg-[#FCF8F2] rounded-lg text-[#C49A5C]"><Icon size={14} /></div>
        {label}
      </div>
      <div className={`font-black text-lg ${destacado ? 'text-[#C49A5C]' : 'text-[#0B1527]'}`}>{valor}</div>
    </div>
  )
}

// ── Tarjeta compacta: cajas de otras personas ──
function TarjetaCajaCompacta({ caja, puedeCerrar, onVer, onCerrar, cerrando }: { caja: any; puedeCerrar: boolean; onVer: () => void; onCerrar: () => void; cerrando: boolean }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] font-black text-[#C49A5C] uppercase tracking-widest">Caja #{caja.numero_caja}</span>
          <p className="font-black text-[#0B1527] uppercase leading-tight mt-1">{caja.nombre_responsable}</p>
          <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-1"><Clock4 size={12} /> Desde {hora(caja.fecha_apertura)} · {fecha(caja.fecha_apertura)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recaudado</p>
          <p className="text-xl font-black text-[#C49A5C]">{money(caja.resumen.total)}</p>
          <p className="text-[10px] text-slate-400">{caja.resumen.cantidad} pagos</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onVer} className="flex-1 py-2.5 rounded-xl bg-[#FCF8F2] text-[#C49A5C] font-bold text-[11px] uppercase tracking-widest hover:bg-[#C49A5C] hover:text-white transition-all flex items-center justify-center gap-2">
          <Eye size={14} /> Ver
        </button>
        {puedeCerrar && (
          <button onClick={onCerrar} disabled={cerrando} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-widest hover:border-red-200 hover:text-red-600 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
            {cerrando ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} Cerrar
          </button>
        )}
      </div>
    </div>
  )
}

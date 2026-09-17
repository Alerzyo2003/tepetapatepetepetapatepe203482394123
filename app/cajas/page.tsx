'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import { 
  Wallet, Plus, Lock, Unlock, Users, Info, 
  Calendar, ArrowRight, Loader2, CheckCircle2, History,
  Banknote, X, ReceiptText, ChevronRight, AlertCircle, TrendingUp, Clock4, Eye
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

export default function GestionCajasPage() {
  const router = useRouter()
  const [cajasAbiertas, setCajasAbiertas] = useState<any[]>([])
  const [cajasCerradas, setCajasCerradas] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalApertura, setModalApertura] = useState(false)
  const [abriendoCaja, setAbriendoCaja] = useState(false)
  
  const [isMounted, setIsMounted] = useState(false)
  
  const [responsable, setResponsable] = useState('Cargando...')
  const [montoInicial, setMontoInicial] = useState('0')

  useEffect(() => {
    setIsMounted(true)
    fetchCajas()
    obtenerNombreUsuario()
  }, [])

  async function obtenerNombreUsuario() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('nombre_completo')
          .eq('id', user.id)
          .maybeSingle()

        setResponsable(perfil?.nombre_completo || user.user_metadata?.nombre_completo || user.email || 'Recepcionista')
      }
    } catch (err) {
      setResponsable('Error al cargar nombre')
    }
  }

  async function fetchCajas() {
    setCargando(true)
    try {
      // 1. Buscamos cajas abiertas
      const { data: abiertas, error: errAb } = await supabase
        .from('sesiones_caja')
        .select(`*, pagos(monto, estado, metodo_pago)`)
        .eq('estado', 'abierta')
        .order('fecha_apertura', { ascending: false })

      if (errAb) throw errAb

      // 2. Buscamos cajas cerradas (AHORA TAMBIÉN TRAEMOS SUS PAGOS)
      const { data: cerradas, error: errCe } = await supabase
        .from('sesiones_caja')
        .select(`*, pagos(monto, estado, metodo_pago)`)
        .eq('estado', 'cerrada')
        .limit(34)
        .order('fecha_cierre', { ascending: false })
      
      if (errCe) throw errCe
      
      // Función auxiliar para procesar los pagos con la lógica correcta
      const procesarPagos = (caja: any) => {
        const pagosValidos = (caja.pagos as any[])?.filter((p: any) => {
          const estadoValido = p.estado !== 'Anulado' && p.estado !== null && p.estado !== undefined;
          const metodoValido = p.metodo_pago !== 'Saldo a Favor' && p.metodo_pago !== null && p.metodo_pago !== undefined;
          return estadoValido && metodoValido;
        }) || [];

        const sumaPagos = pagosValidos.reduce((acc: number, p: any) => acc + Number(p.monto || 0), 0);
        return { pagosValidos, sumaPagos };
      };

      const abiertasProcesadas = abiertas?.map((caja: any) => {
        const { pagosValidos, sumaPagos } = procesarPagos(caja);
        return { 
          ...caja, 
          acumulado: Number(caja.monto_apertura || 0) + sumaPagos,
          pagos: pagosValidos 
        }
      }) || []

      const cerradasProcesadas = cerradas?.map((caja: any) => {
        const { sumaPagos } = procesarPagos(caja);
        return {
          ...caja,
          // Recalculamos el monto de cierre al vuelo para ignorar si se guardó mal antes
          monto_cierre: Number(caja.monto_apertura || 0) + sumaPagos 
        }
      }) || []

      setCajasAbiertas(abiertasProcesadas)
      setCajasCerradas(cerradasProcesadas) // Guardamos las procesadas
    } catch (error) {
      toast.error("Error al sincronizar datos de caja")
    } finally {
      setCargando(false)
    }
  }

  const handleAbrirCaja = async () => {
    if (cajasAbiertas.length > 0) {
      toast.error("Ya existe una caja abierta.")
      return
    }
    if (abriendoCaja) return
    setAbriendoCaja(true)

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error("No autenticado")

      const { data: ultimaCaja } = await supabase
  .from('sesiones_caja')
  .select('numero_caja')
  .not('numero_caja', 'is', null) // Fuerza a ignorar registros antiguos sin número
  .order('numero_caja', { ascending: false })
  .limit(1)
  .maybeSingle();

const siguienteNumero = (ultimaCaja?.numero_caja || 0) + 1;

      const nuevaCaja = {
        usuario_id: user.id,
        nombre_responsable: responsable,
        monto_apertura: Number(montoInicial) || 0,
        estado: 'abierta',
        fecha_apertura: new Date().toISOString(),
        numero_caja: siguienteNumero
      }

      const { error } = await supabase.from('sesiones_caja').insert([nuevaCaja])
      if (error) throw error

      toast.success(`Caja #${siguienteNumero} abierta correctamente`)
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
    if (typeof window !== 'undefined') {
        if (!window.confirm(`¿Confirmas el cierre del turno de ${caja.nombre_responsable}?`)) return
    }

    try {
      const { error } = await supabase.from('sesiones_caja')
        .update({ 
          estado: 'cerrada', 
          fecha_cierre: new Date().toISOString(),
          monto_cierre: caja.acumulado 
        })
        .eq('id', caja.id)

      if (error) throw error
      toast.success("Caja liquidada con éxito")
      fetchCajas()
    } catch (error: any) {
      toast.error("Error al cerrar caja")
    }
  }

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-white">
      <Loader2 className="animate-spin text-[#C49A5C]" size={40} />
      <p className="font-bold text-xs uppercase tracking-widest text-slate-400">Verificando Finanzas...</p>
    </div>
  )

  const hayCajaAbierta = cajasAbiertas.length > 0
  const cajaActiva = hayCajaAbierta ? cajasAbiertas[0] : null

  return (
    <main className="min-h-screen bg-white p-6 md:p-10 font-sans text-slate-900 relative overflow-hidden z-0">
      
      <div 
        className="absolute top-0 right-0 w-[800px] h-[900px] bg-[url('/fondo-caja.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-100"
      ></div>

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
          
          <button 
            disabled={hayCajaAbierta}
            onClick={() => setModalApertura(true)}
            className={`flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-slate-100 min-w-[300px] transition-all ${
              hayCajaAbierta 
              ? 'opacity-90 cursor-not-allowed' 
              : 'hover:border-[#C49A5C]/40 hover:shadow-md cursor-pointer active:scale-95'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${hayCajaAbierta ? 'bg-[#FCF8F2] text-[#C49A5C]' : 'bg-emerald-50 text-emerald-600'}`}>
                {hayCajaAbierta ? <Lock size={20} /> : <Plus size={20} />}
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-800 text-sm">{hayCajaAbierta ? 'CAJA BLOQUEADA' : 'ABRIR CAJA'}</p>
                <p className="text-xs text-slate-400 font-medium">{hayCajaAbierta ? 'Solo usuarios autorizados' : 'Iniciar un nuevo turno'}</p>
              </div>
            </div>
            <ChevronRight className="text-slate-300" size={20} />
          </button>
        </header>

        {hayCajaAbierta && (
          <div className="flex flex-col md:flex-row items-center bg-white rounded-2xl p-5 border border-slate-100 shadow-sm gap-6 md:gap-0 max-w-[950px]">
            <div className="flex items-center gap-5 flex-1">
              <div className="bg-[#FCF8F2] p-3 rounded-full text-[#C49A5C] shrink-0">
                <TrendingUp size={22} />
              </div>
              <div>
                <p className="text-xs md:text-sm font-bold text-[#0B1527] uppercase tracking-wide">
                  SESIÓN ACTIVA INICIADA POR {cajaActiva.nombre_responsable}.
                </p>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Solo se permite una caja abierta a la vez.</p>
              </div>
            </div>
            
            <div className="hidden md:block w-px h-10 bg-slate-200 mx-8"></div>
            
            <div className="flex items-center gap-5 flex-1 md:flex-none md:pr-10">
              <div className="bg-[#FCF8F2] p-3 rounded-full text-[#C49A5C] shrink-0">
                <Clock4 size={22} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#0B1527] uppercase tracking-widest">INICIADA</p>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  {new Date(cajaActiva.fecha_apertura).toLocaleDateString('es-CL')} • {new Date(cajaActiva.fecha_apertura).toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'})}
                </p>
              </div>
            </div>
          </div>
        )}

        {hayCajaAbierta ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
            
            <div className="lg:col-span-2 bg-[#0A1629] rounded-3xl p-8 relative flex flex-col justify-between shadow-xl min-h-[340px]">
              <div className="relative z-10">
                <span className="bg-[#C49A5C] text-white text-[10px] font-bold uppercase tracking-widest px-5 py-2 rounded-full inline-block mb-6 shadow-sm">
                  Turno Activo {cajaActiva.numero_caja ? `#${cajaActiva.numero_caja}` : ''}
                </span>
                <h3 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight">{cajaActiva.nombre_responsable}</h3>
                <div className="flex items-center gap-6 text-slate-300 text-xs font-medium mt-3">
                  <span className="flex items-center gap-2"><Calendar size={16}/> {new Date(cajaActiva.fecha_apertura).toLocaleDateString('es-CL')}</span>
                  <span className="flex items-center gap-2"><Clock4 size={16}/> {new Date(cajaActiva.fecha_apertura).toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
              </div>

              <div className="w-full h-px bg-white/10 my-8"></div>

              <div className="flex flex-col md:flex-row items-start md:items-end justify-between relative z-10 gap-6 md:gap-0">
                <div className="flex gap-12 md:gap-20">
                  <div>
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-2">Base Inicial</p>
                    <p className="text-3xl font-bold text-white">${Number(cajaActiva.monto_apertura).toLocaleString('es-CL')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[#C49A5C] uppercase tracking-widest mb-2">Total Acumulado</p>
                    <p className="text-4xl md:text-5xl font-black text-[#C49A5C]">${Number(cajaActiva.acumulado || 0).toLocaleString('es-CL')}</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto mt-6 md:mt-0">
                  <button 
                    onClick={() => router.push(`/cajas/${cajaActiva.id}`)}
                    className="bg-white/10 text-white px-8 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 hover:bg-white/20 transition-all border border-white/20 w-full sm:w-auto"
                  >
                    <Eye size={18} /> Ver Info
                  </button>
                  
                  <button 
                    onClick={() => handleCerrarCaja(cajaActiva)}
                    className="bg-[#C49A5C] text-white px-8 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 hover:bg-[#b58b4f] transition-all shadow-lg shadow-[#C49A5C]/20 w-full sm:w-auto"
                  >
                    <Lock size={18} /> Cerrar Turno
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 text-[#0B1527] font-black text-sm uppercase tracking-wide mb-8">
                  <div className="p-2.5 bg-[#FCF8F2] text-[#C49A5C] rounded-xl"><TrendingUp size={20} /></div>
                  Resumen del Día
                </div>
                
                <div className="space-y-6">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-5">
                    <div className="flex items-center gap-4 text-[13px] text-slate-600 font-bold uppercase tracking-wider">
                      <div className="p-2 bg-[#FCF8F2] rounded-lg text-[#C49A5C]"><ReceiptText size={16} /></div>
                      Ingresos Totales
                    </div>
                    <div className="font-black text-[#C49A5C] text-xl">${(Number(cajaActiva.acumulado || 0) - Number(cajaActiva.monto_apertura)).toLocaleString('es-CL')}</div>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-5">
                    <div className="flex items-center gap-4 text-[13px] text-slate-600 font-bold uppercase tracking-wider">
                      <div className="p-2 bg-[#FCF8F2] rounded-lg text-[#C49A5C]"><TrendingUp size={16} /></div>
                      Transacciones
                    </div>
                    <div className="font-black text-[#0B1527] text-xl">{cajaActiva.pagos?.length || 0}</div>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-5">
                    <div className="flex items-center gap-4 text-[13px] text-slate-600 font-bold uppercase tracking-wider">
                      <div className="p-2 bg-[#FCF8F2] rounded-lg text-[#C49A5C]"><Banknote size={16} /></div>
                      Promedio por Transacción
                    </div>
                    <div className="font-black text-[#0B1527] text-xl">
                      ${cajaActiva.pagos?.length ? Math.round((Number(cajaActiva.acumulado) - Number(cajaActiva.monto_apertura)) / cajaActiva.pagos.length).toLocaleString('es-CL') : 0}
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <div className="flex items-center gap-4 text-[13px] text-slate-600 font-bold uppercase tracking-wider">
                      <div className="p-2 bg-[#FCF8F2] rounded-lg text-[#C49A5C]"><Users size={16} /></div>
                      Pacientes Atendidos
                    </div>
                    <div className="font-black text-[#0B1527] text-xl">{cajaActiva.pagos?.length || 0}</div>
                  </div>
                </div>
              </div>
            </div>
            
          </div>
        ) : (
          <div className="bg-white p-12 rounded-3xl border border-slate-100 shadow-sm text-center">
            <p className="text-slate-400 font-bold uppercase text-sm tracking-widest">No hay turnos abiertos actualmente</p>
          </div>
        )}

        <section className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-sm border border-slate-100 overflow-hidden mt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between p-6 md:p-8 border-b border-slate-100 gap-4">
            <h2 className="text-sm font-black uppercase text-[#0B1527] tracking-wide flex items-center gap-3">
              <div className="p-2 bg-[#FCF8F2] text-[#C49A5C] rounded-lg"><History size={18} /></div>
              Registro Histórico
            </h2>
            <button className="flex items-center gap-2 text-[11px] font-bold text-[#C49A5C] uppercase tracking-widest hover:text-[#0B1527] transition-colors">
              <History size={14} /> Ver histórico completo <ChevronRight size={14}/>
            </button>
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
                  <th className="px-8 py-5">Total Acumulado</th>
                  <th className="px-8 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {cajasCerradas.map((caja) => (
                  <tr key={caja.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-6 font-black text-[#C49A5C]">
                      {caja.numero_caja ? `#${caja.numero_caja}` : '-'}
                    </td>
                    <td className="px-8 py-6 font-bold text-[#0B1527]">{new Date(caja.fecha_apertura).toLocaleDateString('es-CL')}</td>
                    <td className="px-8 py-6 font-bold text-[#0B1527]">{caja.nombre_responsable}</td>
                    <td className="px-8 py-6 text-slate-500 font-medium">{new Date(caja.fecha_apertura).toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'})}</td>
                    <td className="px-8 py-6 text-slate-500 font-medium">{new Date(caja.fecha_cierre).toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'})}</td>
                    <td className="px-8 py-6 text-[#0B1527] font-bold">${Number(caja.monto_apertura).toLocaleString('es-CL')}</td>
                    <td className="px-8 py-6 text-emerald-600 font-black">${Number(caja.monto_cierre || 0).toLocaleString('es-CL')}</td>
                    <td className="px-8 py-6 text-center">
                      <button 
                        onClick={() => router.push(`/cajas/${caja.id}`)}
                        className="p-2.5 bg-[#FCF8F2] text-[#C49A5C] rounded-xl hover:bg-[#C49A5C] hover:text-white transition-all inline-flex"
                        title="Ver Detalles"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {cajasCerradas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-8 py-8 text-center text-slate-400 font-medium text-sm">
                      No hay registros históricos disponibles.
                    </td>
                  </tr>
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
                className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100"
              >
                <div className="p-8 text-center space-y-6">
                  <div className="bg-[#FCF8F2] w-20 h-20 rounded-[1.5rem] flex items-center justify-center text-[#C49A5C] mx-auto">
                    <Unlock size={36} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight text-[#0B1527]">Apertura de Caja</h3>
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
                      <input 
                        type="number" 
                        autoFocus
                        value={montoInicial} 
                        onChange={(e) => setMontoInicial(e.target.value)}
                        className="w-full bg-white border-2 border-slate-200 focus:border-[#C49A5C] rounded-2xl py-4 pl-12 pr-6 text-2xl font-bold outline-none transition-all text-[#0B1527]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 pt-4">
                    <button 
                      disabled={abriendoCaja}
                      onClick={handleAbrirCaja}
                      className="w-full bg-[#0B1527] text-white py-4 rounded-2xl font-bold text-sm uppercase tracking-wide hover:bg-[#0B1527]/90 transition-all flex items-center justify-center gap-2 disabled:bg-slate-300"
                    >
                      {abriendoCaja ? <Loader2 className="animate-spin" /> : 'Confirmar Apertura'}
                    </button>
                    <button onClick={() => setModalApertura(false)} className="py-3 text-xs font-bold uppercase text-slate-400 hover:text-red-500 transition-colors tracking-wider">
                      Cancelar
                    </button>
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

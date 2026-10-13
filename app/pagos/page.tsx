'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  DollarSign, TrendingUp, Users, 
  Download, Loader2, Calendar as CalendarIcon,
  ArrowUpRight, Wallet, Receipt, Stethoscope, Trash2, CreditCard, Banknote, Inbox
} from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

export default function PagosPage() {
  const [pagos, setPagos] = useState<any[]>([])
  const [stats, setStats] = useState({ total: 0, promedio: 0, cantidad: 0 })
  const [cargando, setCargando] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    fetchFinanzas()
  }, [])

  async function fetchFinanzas() {
    setCargando(true)
    
    try {
      const { data: profs } = await supabase.from('profesionales').select('user_id, nombre, apellido');
      
      const getDentista = (id: string) => {
          if (!id || !profs) return 'Sin asignar';
          const doc = profs.find((p: any) => p.user_id === id);
          return doc ? `Dr. ${doc.apellido}` : 'Sin asignar';
      }

      const { data: resPagos, error } = await supabase
        .from('pagos')
        .select(`
            id, monto, comentario, fecha_pago, metodo_pago, numero_referencia, numero_boleta, paciente_id,
            profesional_id, item_id, presupuesto_id, caja_id, estado,
            pacientes (nombre, apellido, rut),
            sesiones_caja (estado, nombre_responsable, fecha_apertura),
            presupuestos (nombre_tratamiento),
            presupuesto_items (
                observacion, 
                diente_id,
                cara,
                prestaciones:prestacion_id ("Nombre Accion", "Nombre", "Codigo Accion")
            ),
            receptor:profesional_id(nombre_completo)
        `)
        .order('fecha_pago', { ascending: false });

      if (error) throw error;

      const consolidado: any[] = []

      resPagos?.forEach((p: any) => {
        let detallePrestacion = 'Abono General';
        let nombrePresupuesto = p.presupuestos?.nombre_tratamiento || 'Tratamiento Clínico';
        let doctorJSON = null;
        
        if (p.presupuesto_items) {
            const prestacionData = p.presupuesto_items.prestaciones;
            let nombreReal = prestacionData?.["Nombre Accion"] || prestacionData?.["Nombre"] || p.presupuesto_items.observacion || 'Tratamiento';
            
            if (nombreReal.includes('|')) nombreReal = nombreReal.split('|')[0].trim();
            detallePrestacion = nombreReal;
            
            if (p.presupuesto_items.diente_id) {
                detallePrestacion += ` (Pieza: ${p.presupuesto_items.diente_id}`;
                if (p.presupuesto_items.cara) detallePrestacion += ` - Cara: ${p.presupuesto_items.cara}`;
                detallePrestacion += `)`;
            }
        } else if (p.comentario) {
            try { 
                const parsed = JSON.parse(p.comentario);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    if (parsed.length === 1) {
                        detallePrestacion = parsed[0]?.prestacion || 'Abono General';
                        doctorJSON = parsed[0]?.doctor;
                    } else {
                        detallePrestacion = `Pago Consolidado (${parsed.length} tratamientos)`;
                        doctorJSON = 'Múltiples Profesionales';
                    }
                } else {
                    detallePrestacion = p.comentario;
                }
            } catch(e) { detallePrestacion = p.comentario }
        }

        let doctorFinal = 'Sin asignar';
        if (p.receptor?.nombre_completo) {
            doctorFinal = `Dr/a. ${p.receptor.nombre_completo}`;
        } else if (doctorJSON && doctorJSON !== '-') {
            doctorFinal = doctorJSON;
        } else {
            doctorFinal = getDentista(p.profesional_id);
        }

        consolidado.push({
          id: p.id,
          monto: Number(p.monto || 0),
          detalle_prestacion: detallePrestacion,
          nombre_presupuesto: nombrePresupuesto,
          metodo_pago: p.metodo_pago,
          numero_boleta: p.numero_boleta || p.numero_referencia || 'N/A', 
          fecha: p.fecha_pago,
          estado: p.estado || 'Activo',
          paciente: p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellido}` : 'S/N',
          rut_paciente: p.pacientes?.rut || 'S/RUT',
          dentista: doctorFinal,
          paciente_id: p.paciente_id,
          caja_info: p.sesiones_caja ? `Caja de ${p.sesiones_caja.nombre_responsable} (${new Date(p.sesiones_caja.fecha_apertura).toLocaleDateString('es-CL')})` : 'Pago sin caja abierta',
          item_id: p.item_id, 
          presupuesto_id: p.presupuesto_id,
          comentario: p.comentario
        })
      })

      // Calculamos totales solo de pagos que no están anulados
      const pagosValidos = consolidado.filter(p => p.estado !== 'Anulado');
      const total = pagosValidos.reduce((acc: number, curr: any) => acc + (curr.monto || 0), 0)
      
      setPagos(consolidado)
      setStats({
        total: total,
        cantidad: pagosValidos.length,
        promedio: pagosValidos.length > 0 ? total / pagosValidos.length : 0
      })
    } catch (error) {
      console.error("Error en finanzas:", error)
      toast.error("Error al cargar la caja global")
    } finally {
      setCargando(false)
    }
  }

  const handleAnularPago = async (pago: any) => {
    // 1. Extraer detalles para identificar si es consolidado o abono libre
    let detallesPago: any[] = [];
    try {
      detallesPago = JSON.parse(pago.comentario || '[]');
    } catch (e) {
      detallesPago = [];
    }

    const itemsAsociados = Array.isArray(detallesPago) ? detallesPago.filter((d: any) => d.id) : [];
    const esAbonoLibre = itemsAsociados.length === 0 && !pago.item_id;

    const mensajeConfirmacion = esAbonoLibre
      ? `Estás a punto de anular un INGRESO MANUAL a la billetera por $${Number(pago.monto).toLocaleString('es-CL')}.\n\n` +
        `Al presionar "ACEPTAR", el pago se anulará y el monto se DESCONTARÁ del Saldo a Favor del paciente.\n\n` +
        `Si presionas "CANCELAR", no se realizará ninguna acción.`
      : `Estás a punto de anular un PAGO por $${Number(pago.monto).toLocaleString('es-CL')}.\n\n` +
        `Al presionar "ACEPTAR", se restaurará la deuda de lo(s) tratamiento(s) pagado(s) y el monto se AGREGARÁ al Saldo a Favor (Billetera Virtual) del paciente.\n\n` +
        `Si presionas "CANCELAR", no se realizará ninguna acción.`;

    const enviarASaldo = window.confirm(mensajeConfirmacion);

    if (!enviarASaldo) {
      return;
    }
    
    const toastId = toast.loading("Reversando finanzas y restaurando deuda...");

    try {
      const montoReversado = Number(pago.monto);

      // Revertimos la deuda de los tratamientos
      if (!esAbonoLibre) {
        if (itemsAsociados.length > 0) {
          // Es un pago múltiple consolidado
          for (const item of itemsAsociados) {
            const { data: itemActual } = await supabase.from('presupuesto_items').select('abonado, presupuesto_id').eq('id', item.id).single();
            if (itemActual) {
              const nuevoAbonoItem = Math.max(0, Number(itemActual.abonado || 0) - Number(item.abonado_ahora || 0));
              await supabase.from('presupuesto_items').update({ abonado: nuevoAbonoItem }).eq('id', item.id);

              if (itemActual.presupuesto_id) {
                const { data: presActual } = await supabase.from('presupuestos').select('total_abonado').eq('id', itemActual.presupuesto_id).single();
                if (presActual) {
                  const nuevoTotalAbonado = Math.max(0, Number(presActual.total_abonado || 0) - Number(item.abonado_ahora || 0));
                  await supabase.from('presupuestos').update({ total_abonado: nuevoTotalAbonado }).eq('id', itemActual.presupuesto_id);
                }
              }
            }
          }
        } else if (pago.item_id) {
           // Lógica legacy: es un pago de un solo item_id en la tabla pagos
           const { data: itemActual } = await supabase.from('presupuesto_items').select('abonado, presupuesto_id').eq('id', pago.item_id).single();
           if (itemActual) {
              const nuevoAbono = Math.max(0, Number(itemActual.abonado || 0) - montoReversado);
              await supabase.from('presupuesto_items').update({ abonado: nuevoAbono }).eq('id', pago.item_id);

              if (itemActual.presupuesto_id) {
                 const { data: presupuestoActual } = await supabase.from('presupuestos').select('total_abonado').eq('id', itemActual.presupuesto_id).single();
                 if (presupuestoActual) {
                    const nuevoTotalAbonado = Math.max(0, Number(presupuestoActual.total_abonado || 0) - montoReversado);
                    await supabase.from('presupuestos').update({ total_abonado: nuevoTotalAbonado }).eq('id', itemActual.presupuesto_id);
                 }
              }
           }
        }
      }

      // Revertimos o sumamos a la billetera virtual del paciente
      if (pago.paciente_id) {
         const { data: pacActual } = await supabase.from('pacientes').select('saldo_a_favor').eq('id', pago.paciente_id).single();
         const saldoActual = Number(pacActual?.saldo_a_favor || 0);
         
         let nuevoSaldo;
         if (!esAbonoLibre) {
             nuevoSaldo = saldoActual + montoReversado; // Devolvemos el dinero a la billetera
         } else {
             nuevoSaldo = Math.max(0, saldoActual - montoReversado); // Quitamos el abono que metimos por error
         }
         
         await supabase.from('pacientes').update({ saldo_a_favor: nuevoSaldo }).eq('id', pago.paciente_id);
      }

      // Marcamos el pago como anulado
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('pagos').update({
        estado: 'Anulado',
        anulado_por: session?.user?.id,
        fecha_anulacion: new Date().toISOString()
      }).eq('id', pago.id);

      // Auditoría
      await supabase.from('auditoria_clinica').insert([{
         usuario_id: session?.user?.id,
         accion: 'UPDATE / ANULACIÓN PAGO',
         tabla: 'pagos',
         detalles: `Anuló pago de $${pago.monto.toLocaleString('es-CL')}. ${esAbonoLibre ? 'Se descontó de SALDO A FAVOR' : 'Destino: SALDO A FAVOR'}`
      }]);

      toast.success("Pago anulado exitosamente.", { id: toastId });
      fetchFinanzas();

    } catch (error) {
      toast.error("Ocurrió un error al anular el pago.", { id: toastId });
    }
  }

  if (!mounted || cargando) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
      <Loader2 className="animate-spin text-blue-600" size={45} />
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Consolidando Caja Global...</p>
    </div>
  )

  return (
    <main className="min-h-screen p-6 md:p-10 font-sans text-left pb-24" style={{ backgroundImage: "url('/fondo-pacientes.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div className="max-w-screen-2xl mx-auto space-y-8 text-left">
        
        {/* HEADER PRINCIPAL */}
        <header className="bg-white/90 backdrop-blur-xl p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-white/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 text-left">
          <div className="flex items-center gap-4 text-left">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-4 rounded-[1.5rem] text-white shadow-xl shadow-emerald-500/20">
              <Wallet size={28} strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-black text-slate-800 uppercase italic leading-none text-left">Registro de Pagos</h1>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1 text-left">Auditoría completa de movimientos e ingresos</p>
            </div>
          </div>
          <button 
            onClick={() => window.print()}
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-7 py-3.5 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-slate-900 hover:to-slate-900 transition-all flex items-center gap-2 border border-blue-500 text-left"
          >
            <Download size={16} strokeWidth={2.5} /> Exportar
          </button>
        </header>

        {/* TARJETAS DE ESTADÍSTICAS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <StatCard label="Ingresos Activos" value={`$${stats.total.toLocaleString('es-CL')}`} icon={<DollarSign size={24} strokeWidth={2.5} />} color="text-emerald-600" bg="bg-emerald-50/80 border border-emerald-100" trend="Total percibido" />
          <StatCard label="Promedio Transacción" value={`$${Math.round(stats.promedio).toLocaleString('es-CL')}`} icon={<TrendingUp size={24} strokeWidth={2.5} />} color="text-blue-600" bg="bg-blue-50/80 border border-blue-100" trend="Ticket medio" />
          <StatCard label="Movimientos Válidos" value={stats.cantidad.toString()} icon={<Receipt size={24} strokeWidth={2.5} />} color="text-purple-600" bg="bg-purple-50/80 border border-purple-100" trend="Operaciones totales" />
        </div>

        {/* TABLA GLOBAL DE PAGOS */}
        <section className="bg-white/90 backdrop-blur-xl rounded-[2.5rem] shadow-xl border border-white/60 overflow-hidden text-left">
          <div className="overflow-x-auto text-left">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-[0.2em] text-left">
                  <th className="px-6 py-5 text-left whitespace-nowrap">Fecha y Caja</th>
                  <th className="px-6 py-5 text-left">Paciente</th>
                  <th className="px-6 py-5 text-left">Dr / Especialista</th>
                  <th className="px-6 py-5 text-left">Detalle de Prestación</th>
                  <th className="px-6 py-5 text-left">Información de Pago</th>
                  <th className="px-6 py-5 text-right">Monto</th>
                  <th className="px-6 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-left">
                {pagos.length > 0 ? pagos.map((p, index) => {
                  const isAnulado = p.estado === 'Anulado';

                  return (
                  <motion.tr 
                    key={`pago-${p.id}-${index}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.01 }}
                    className={`transition-colors group text-left align-top ${isAnulado ? 'bg-red-50/30' : 'hover:bg-blue-50/40'}`}
                  >
                    <td className="px-6 py-5 text-left">
                      <div className="flex flex-col gap-1 text-left">
                        <span className="text-xs font-black text-slate-800 text-left whitespace-nowrap">
                          {p.fecha ? new Date(p.fecha).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'S/F'}
                        </span>
                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight w-48">
                           <Inbox size={12} className="shrink-0 text-amber-500" /> 
                           <span>{p.caja_info}</span>
                        </div>
                        {isAnulado && (
                            <span className="mt-1 px-2 py-0.5 w-fit bg-red-100 text-red-600 rounded text-[8px] font-black uppercase tracking-widest border border-red-200">
                                Pago Anulado
                            </span>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-5 text-left">
                        <div className="flex flex-col text-left">
                            <span className={`font-black uppercase text-xs text-left leading-tight ${isAnulado ? 'text-slate-400' : 'text-slate-800'}`}>{p.paciente}</span>
                            <span className="text-[10px] font-bold text-slate-400 mt-1">{p.rut_paciente}</span>
                        </div>
                    </td>
                    
                    <td className="px-6 py-5 text-left">
                      <div className="flex items-center gap-2">
                        <Stethoscope size={14} className="text-slate-400 shrink-0" />
                        <span className={`text-[10px] font-black uppercase ${p.dentista === 'Sin asignar' || isAnulado ? 'text-slate-400 italic' : 'text-blue-600'}`}>
                          {p.dentista}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-5 text-left">
                       <div className="flex flex-col gap-1 text-left max-w-sm">
                          <span className={`text-xs font-bold leading-tight ${isAnulado ? 'text-slate-400' : 'text-slate-700'}`}>
                             {p.detalle_prestacion}
                          </span>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                             Ppto: {p.nombre_presupuesto}
                          </span>
                       </div>
                    </td>

                    <td className="px-6 py-5 text-left">
                        <div className="flex flex-col gap-2">
                            <span className={`flex items-center gap-1.5 px-3 py-1 w-fit rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm ${
                                isAnulado ? 'bg-slate-50 text-slate-400 border-slate-200' :
                                p.metodo_pago?.toLowerCase() === 'efectivo' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                p.metodo_pago?.toLowerCase() === 'transferencia' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                p.metodo_pago?.toLowerCase() === 'saldo a favor' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                                {p.metodo_pago?.toLowerCase() === 'efectivo' ? <Banknote size={12} /> : <CreditCard size={12} />}
                                {p.metodo_pago}
                            </span>
                            
                            <span className="flex items-center gap-1.5 px-3 py-1 w-fit bg-slate-50 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200/80 shadow-sm">
                                <Receipt size={12} /> N°: {p.numero_boleta}
                            </span>
                        </div>
                    </td>

                    <td className={`px-6 py-5 text-right font-black text-base align-middle ${isAnulado ? 'text-red-400 line-through' : 'text-emerald-600'}`}>
                      ${p.monto.toLocaleString('es-CL')}
                    </td>

                    <td className="px-6 py-5 text-center align-middle">
                        {!isAnulado && (
                            <button 
                                onClick={() => handleAnularPago(p)}
                                className="bg-white border border-red-200 text-red-400 hover:text-white hover:bg-red-500 hover:border-red-500 p-2.5 rounded-xl transition-all shadow-sm mx-auto flex items-center justify-center group"
                                title="Anular pago y restaurar deuda"
                            >
                                <Trash2 size={16} className="group-hover:scale-110 transition-transform" strokeWidth={2.5}/>
                            </button>
                        )}
                    </td>
                  </motion.tr>
                )}) : (
                  <tr>
                    <td colSpan={7} className="p-20 text-center">
                      <p className="text-slate-400 font-black text-xs uppercase italic tracking-widest text-center">No hay registros de dinero todavía</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
   </main>
  )
}

function StatCard({ label, value, icon, color, bg, trend }: any) {
  return (
    <motion.div whileHover={{ y: -5 }} className="bg-white/90 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/60 shadow-xl flex flex-col gap-6 relative overflow-hidden text-left">
      <div className="flex justify-between items-start relative z-10 text-left">
        <div className={`${bg} ${color} p-4 rounded-2xl shadow-sm`}>{icon}</div>
        <div className="text-[9px] font-black text-slate-400 uppercase bg-slate-100/80 px-3.5 py-1.5 rounded-full text-left tracking-wider">{trend}</div>
      </div>
      <div className="relative z-10 text-left">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 text-left">{label}</p>
        <h3 className={`text-3xl font-black ${color} text-left`}>{value}</h3>
      </div>
      <div className={`absolute -right-4 -bottom-4 opacity-[0.03] ${color} pointer-events-none`}>
        {icon}
      </div>
    </motion.div>
  )
}

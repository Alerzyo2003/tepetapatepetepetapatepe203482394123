'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
// 1. IMPORTAMOS CREATEPORTAL
import { createPortal } from 'react-dom'
import { 
  Calculator, Search, Eye, CheckCircle2, 
  Loader2, Calendar as CalendarIcon, DollarSign,
  TrendingUp, Users, ArrowUpRight, Edit3, X, Save, Wallet, Check
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

// Mes actual en hora de Chile (toISOString() usa UTC y después de las 21:00 del último día saltaba al mes siguiente)
const mesLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
// % de comisión: solo si está vacío se usa 40 (un 0% es válido)
const pctComision = (v: any) => (v === null || v === undefined || v === '' ? 40 : Number(v))
// Supabase entrega máximo 1.000 filas por consulta: se piden por páginas, siempre ordenadas
async function traerTodo(consulta: (desde: number, hasta: number) => any) {
  const filas: any[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999)
    if (error) throw error
    if (!data?.length) break
    filas.push(...data)
    if (data.length < 1000) break
  }
  return filas
}

export default function LiquidacionesPage() {
  const [liquidaciones, setLiquidaciones] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [mesSeleccionado, setMesSeleccionado] = useState(mesLocal())
  
  const [modalContrato, setModalContrato] = useState<{abierto: boolean, prof: any, porcentaje: number}>({abierto: false, prof: null, porcentaje: 40})
  const [guardandoContrato, setGuardandoContrato] = useState(false)
  const [procesandoPago, setProcesandoPago] = useState<string | null>(null) 

  // 2. ESTADO PARA LOS PORTALS (Asegurar que carga en el cliente)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    fetchData()
  }, [mesSeleccionado])

  async function fetchData() {
    setCargando(true)
    try {
      const [year, month] = mesSeleccionado.split('-');
      const ultimoDia = new Date(Number(year), Number(month), 0).getDate();
      
      // 🔥 FILTRO ESTRICTO NATIVO DE BASE DE DATOS PARA EVITAR QUE SE SUME EL HISTÓRICO 🔥
      const inicioRango = `${year}-${month}-01 00:00:00`;
      const finRango = `${year}-${month}-${ultimoDia} 23:59:59`;
      const fechaCortaInicio = `${year}-${month}-01`;
      const fechaCortaFin = `${year}-${month}-${ultimoDia}`;

      // 1. Obtener profesionales
      const { data: profs, error: errProfs } = await supabase
        .from('profesionales')
        .select('id, nombre, apellido, user_id, porcentaje_comision')
        .eq('activo', true)

      if (errProfs) throw errProfs;
      if (!profs) return

      // 2. Obtener atenciones realizadas estrictamente en el mes seleccionado
      const atenciones = await traerTodo((a, b) => supabase
        .from('atenciones_realizadas')
        .select('id, monto_cobrado, profesional_id')
        .gte('fecha', inicioRango)
        .lte('fecha', finRango)
        .order('id')
        .range(a, b))

      // 3. Obtener pagos/abonos cobrados estrictamente en el mes seleccionado
      // (antes se cortaba en 1.000 pagos y descartaba los pagos sin estado)
      const abonosData = await traerTodo((a, b) => supabase
        .from('pagos')
        .select(`
          id, monto, fecha_pago, profesional_id, item_id,
          presupuesto_items ( profesional_id, precio_pactado, costo_laboratorio, lab_pagado_por_dr, estado, tipo_reparto, porcentaje_forzado )
        `)
        .gte('fecha_pago', inicioRango)
        .lte('fecha_pago', finRango)
        .or('estado.is.null,estado.neq.Anulado')
        .order('id')
        .range(a, b))

      // 4. Obtener liquidaciones cerradas en este rango de mes
      const { data: liquidacionesCerradas } = await supabase
        .from('liquidaciones')
        .select('profesional_id, monto_total')
        .gte('periodo_desde', fechaCortaInicio)
        .lte('periodo_hasta', fechaCortaFin)
        .eq('estado', 'Finalizada')

      const abonosItems: any[] = abonosData || [];
      const cerradas = liquidacionesCerradas || [];

      // AGRUPAMOS LO YA PAGADO EN ESTE MES POR PROFESIONAL
      const historialPagosMap: Record<string, number> = {};
      cerradas.forEach(liq => {
        if (liq.profesional_id) {
          historialPagosMap[liq.profesional_id] = (historialPagosMap[liq.profesional_id] || 0) + Number(liq.monto_total || 0);
        }
      });

      const informeReal = profs.map(p => {
        const porcentajeDrNum = pctComision(p.porcentaje_comision);
        const porcentajeDr = porcentajeDrNum / 100;
        const porcentajeClinica = 1 - porcentajeDr;
        
        const atencionesDelDoc = atenciones?.filter(a => a.profesional_id === p.user_id) || [];
        const sumaAtenciones = atencionesDelDoc.reduce((acc, curr) => acc + Number(curr.monto_cobrado || 0), 0)
        
        const honorarioAtenciones = sumaAtenciones * porcentajeDr;
        const utilidadAtenciones = sumaAtenciones * porcentajeClinica;

        let sumaAbonos = 0;
        let honorariosAbonos = 0;
        let reembolsosDoctor = 0;
        let utilidadAbonos = 0;
        
        // Solo pagos a una prestación (los abonos libres / saldo a favor no son producción de ningún doctor).
        // El doctor es el de la prestación, igual que en el detalle de la liquidación.
        const abonosDelDoc = abonosItems.filter(pago => {
            const item = Array.isArray(pago.presupuesto_items) ? pago.presupuesto_items[0] : pago.presupuesto_items;
            if (!pago.item_id || !item) return false;
            const docId = item.profesional_id || pago.profesional_id;
            return docId === p.user_id;
        });

        abonosDelDoc.forEach(pago => {
            const montoPago = Number(pago.monto || 0);
            sumaAbonos += montoPago;

            const itemEstado = pago.presupuesto_items?.estado?.toLowerCase() || '';
            const estaTerminado = ['realizado', 'atendido', 'terminado', 'finalizado', 'completado'].includes(itemEstado);

            const tipoReparto = pago.presupuesto_items?.tipo_reparto || 'general';
const valorForzado = Number(pago.presupuesto_items?.porcentaje_forzado || 0) / 100;

let pctDrItem = porcentajeDr; // Valor por defecto ('general')

if (tipoReparto === 'doctor') {
    pctDrItem = 1;
} else if (tipoReparto === 'clinica') {
    pctDrItem = 0;
} else if (tipoReparto === 'forzado') {
    pctDrItem = valorForzado; // 👈 Toma el % específico que definiste, ej: 0.15 para 15%
}
            const pctClinicaItem = 1 - pctDrItem;

            const costoLab = Number(pago.presupuesto_items?.costo_laboratorio || 0);
            const precioPactado = Number(pago.presupuesto_items?.precio_pactado || montoPago || 1);
            const pagadoPorDr = Boolean(pago.presupuesto_items?.lab_pagado_por_dr);

            let fraccionPago = montoPago / precioPactado;
            if (fraccionPago > 1) fraccionPago = 1;

            const labADescontar = costoLab * fraccionPago;
            let montoImponible = montoPago;
            if (montoImponible < 0) montoImponible = 0;

            if (estaTerminado) {
              const comision = montoImponible * pctDrItem; 
              const reembolso = pagadoPorDr ? labADescontar : 0; 
              honorariosAbonos += comision;
              reembolsosDoctor += reembolso;
              utilidadAbonos += (montoImponible * pctClinicaItem);
            } else {
              utilidadAbonos += montoImponible;
            }
        });

        const totalProduccion = sumaAtenciones + sumaAbonos;
        
        const totalLiquidoMensual = honorarioAtenciones + honorariosAbonos + reembolsosDoctor;
        const margenClinica = utilidadAtenciones + utilidadAbonos;

        const totalYaPagadoHistorico = historialPagosMap[p.id] || 0;
        const saldoPendienteDoctor = Math.max(0, totalLiquidoMensual - totalYaPagadoHistorico);

        const completamentePagado = totalYaPagadoHistorico > 0 && saldoPendienteDoctor <= 0;

        return {
          id: p.id, 
          user_id: p.user_id, 
          nombreCompleto: `${p.nombre} ${p.apellido}`,
          porcentaje_comision: porcentajeDrNum,
          atenciones: sumaAtenciones,
          abonos: sumaAbonos,
          total: totalProduccion,
          honorarios: saldoPendienteDoctor, 
          utilidad: margenClinica,
          yaPagado: completamentePagado,
          totalYaPagado: totalYaPagadoHistorico
        }
      })

      informeReal.sort((a, b) => b.total - a.total);
      setLiquidaciones(informeReal)
    } catch (error) {
      toast.error("Error al calcular liquidaciones.")
    } finally {
      setCargando(false)
    }
  }

  const handleGuardarContrato = async () => {
    setGuardandoContrato(true);
    try {
      const { error } = await supabase
        .from('profesionales')
        .update({ porcentaje_comision: modalContrato.porcentaje })
        .eq('id', modalContrato.prof.id);
        
      if (error) throw error;
      toast.success("Contrato actualizado exitosamente");
      setModalContrato({abierto: false, prof: null, porcentaje: 40});
      fetchData(); 
    } catch (error) {
      toast.error("Error al actualizar el contrato");
    } finally {
      setGuardandoContrato(false);
    }
  }

  const handleFinalizarLiquidacion = async (liq: any) => {
    const confirmar = window.confirm(`¿Estás seguro de registrar el pago de $${Math.round(liq.honorarios).toLocaleString('es-CL')} para ${liq.nombreCompleto}? Este proceso generará el cierre de este monto pendiente.`);
    
    if (!confirmar) return;

    setProcesandoPago(liq.id);
    try {
      const [year, month] = mesSeleccionado.split('-');
      const ultimoDia = new Date(Number(year), Number(month), 0).getDate();
      
      const { data: authData } = await supabase.auth.getSession();
      const creadorId = authData.session?.user?.id;

      const { error } = await supabase
        .from('liquidaciones')
        .insert({
          profesional_id: liq.id, 
          monto_total: Math.round(liq.honorarios), 
          periodo_desde: `${year}-${month}-01`,
          periodo_hasta: `${year}-${month}-${ultimoDia}`,
          estado: 'Finalizada',
          creado_por: creadorId || null
        });

      if (error) throw error;
      toast.success(`Pago complementario registrado exitosamente.`);
      fetchData(); 
    } catch (error: any) {
      toast.error(`Error al registrar el pago: ${error.message}`);
    } finally {
      setProcesandoPago(null);
    }
  }

  const globalTotal = liquidaciones.reduce((acc, curr) => acc + curr.total, 0)
  const globalHonorarios = liquidaciones.reduce((acc, curr) => acc + curr.honorarios, 0)
  const globalUtilidad = globalTotal - (liquidaciones.reduce((acc, curr) => acc + (curr.totalYaPagado + curr.honorarios), 0))

  const filtradas = liquidaciones.filter(l => 
    l.nombreCompleto.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <main className="min-h-screen bg-[#FBF8F2] p-6 md:p-10 font-sans text-slate-900 relative overflow-hidden z-0">
      
      {/* IMAGEN DE FONDO GLOBAL */}
      <div 
        className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"
      ></div>

      <div className="max-w-7xl mx-auto space-y-8 relative z-10 text-left">
        
        {/* HEADER */}
        <header className="bg-white/90 backdrop-blur-md p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 text-left">
          <div className="flex items-center gap-5 text-left w-full lg:w-auto">
            <div className="bg-[#0A111F] w-16 h-16 rounded-full flex items-center justify-center text-[#C9A24B] shadow-lg shrink-0">
              <Calculator size={28} />
            </div>
            <div className="text-left">
              <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight text-left">
                CIERRE DE CAJA
              </h1>
              <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1.5 flex items-center gap-2">
                <TrendingUp size={14} className="text-[#C9A24B]"/> Rendimiento por especialista
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
            <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-full w-full sm:w-auto focus-within:border-[#C9A24B] transition-colors shadow-inner">
              <CalendarIcon size={16} className="text-slate-400"/>
              <input 
                type="month" 
                value={mesSeleccionado} 
                onChange={(e) => setMesSeleccionado(e.target.value)}
                className="bg-transparent font-black text-xs uppercase outline-none text-[#0A111F] cursor-pointer"
              />
            </div>
            <div className="relative w-full sm:w-auto text-left flex-1">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Buscar especialista..." 
                className="w-full pl-12 pr-6 py-3.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-bold outline-none focus:border-[#C9A24B] transition-colors shadow-inner text-[#0A111F] placeholder:text-slate-400"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              />
            </div>
          </div>
        </header>

        {/* MÉTRICAS (STAT CARDS) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <StatCard label="Producción Total" value={globalTotal} icon={<DollarSign size={20}/>} type="light" />
          <StatCard label="Pendiente de Pago" value={globalHonorarios} icon={<Users size={20}/>} type="gold" />
          <StatCard label="Margen Clínica Neta" value={globalUtilidad} icon={<ArrowUpRight size={20}/>} type="dark" />
        </div>

        {/* TABLA DE LIQUIDACIONES */}
        <div className="bg-white/95 backdrop-blur-sm rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden text-left">
          <div className="overflow-x-auto text-left">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-100 bg-[#FBF8F2]/50">
                  <th className="px-10 py-6 text-[10px] font-black text-[#0A111F] uppercase tracking-widest whitespace-nowrap">Especialista Responsable</th>
                  <th className="px-6 py-6 text-[10px] font-black text-[#0A111F] uppercase tracking-widest text-center whitespace-nowrap">Contrato (%)</th>
                  <th className="px-6 py-6 text-[10px] font-black text-[#0A111F] uppercase tracking-widest text-center whitespace-nowrap">Producción</th>
                  <th className="px-6 py-6 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-center whitespace-nowrap">Líquido a Pagar</th>
                  <th className="px-10 py-6 text-[10px] font-black text-[#0A111F] uppercase tracking-widest text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60 text-left">
                {cargando ? (
                  <tr>
                    <td colSpan={5} className="py-24 text-center">
                      <Loader2 className="animate-spin mx-auto text-[#C9A24B] mb-4" size={40} />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Calculando balances y contratos...</p>
                    </td>
                  </tr>
                ) : filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-24 text-center">
                      <CheckCircle2 className="mx-auto text-emerald-500 mb-4 opacity-50" size={40} />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">No hay producción en este mes</p>
                    </td>
                  </tr>
                ) : filtradas.map((liq) => (
                  <tr key={liq.id} className={`transition-all group text-left ${liq.yaPagado ? 'bg-slate-50/50 opacity-70' : 'hover:bg-slate-50/80 cursor-pointer'}`}>
                    <td className="px-10 py-6 text-left">
                      <div className="flex items-center gap-5 text-left">
                        <div className="w-12 h-12 bg-[#C9A24B]/10 rounded-2xl flex items-center justify-center font-black text-[#C9A24B] group-hover:bg-[#C9A24B] group-hover:text-white transition-colors shrink-0">
                          {liq.nombreCompleto.charAt(0)}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-black text-[#0A111F] uppercase leading-tight text-left">{liq.nombreCompleto}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-widest text-left">ID: {liq.user_id.substring(0,8)}</p>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-6 text-center">
                      <button 
                        onClick={() => setModalContrato({abierto: true, prof: liq, porcentaje: liq.porcentaje_comision})} 
                        className="flex items-center justify-center gap-2 mx-auto bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl hover:border-[#C9A24B] hover:bg-[#C9A24B]/10 hover:text-[#C9A24B] transition-colors text-[11px] font-black text-[#0A111F]"
                        title="Modificar porcentaje del doctor"
                      >
                        {liq.porcentaje_comision}% <Edit3 size={14} className="text-slate-400 group-hover:text-[#C9A24B]"/>
                      </button>
                    </td>

                    <td className="px-6 py-6 text-center">
                      <span className="bg-slate-50 px-4 py-2 rounded-xl text-xs font-black text-[#0A111F] border border-slate-100">
                        ${(liq.total || 0).toLocaleString('es-CL')}
                      </span>
                    </td>
                    
                    <td className="px-6 py-6 text-center">
                      <div className="flex flex-col items-center gap-1.5 justify-center">
                        <span className={`text-sm font-black px-4 py-2 rounded-xl border ${
                          liq.honorarios > 0 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-slate-400 bg-slate-50 border-slate-100'
                        }`}>
                          ${Math.round(liq.honorarios).toLocaleString('es-CL')}
                        </span>
                        {liq.totalYaPagado > 0 && (
                          <span className="text-[9px] font-black text-[#C9A24B] uppercase tracking-widest bg-[#C9A24B]/10 px-2.5 py-1 rounded-md border border-[#C9A24B]/20">
                            Ya Pagado: ${liq.totalYaPagado.toLocaleString('es-CL')}
                          </span>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-10 py-6 text-right">
                      <div className="flex items-center justify-end gap-3 text-right">
                        <Link 
                          href={`/administracion/liquidaciones/${liq.user_id}?mes=${mesSeleccionado}`}
                          className="inline-flex items-center justify-center w-12 h-12 bg-white text-slate-400 rounded-2xl hover:border-[#C9A24B] hover:text-[#C9A24B] transition-colors shadow-sm border border-slate-200"
                          title="Ver Detalle"
                        >
                          <Eye size={18} />
                        </Link>

                        {liq.yaPagado ? (
                          <div className="inline-flex items-center justify-center px-4 h-12 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 font-black text-[10px] uppercase tracking-widest gap-2 cursor-default">
                            <Check size={16} /> Al día
                          </div>
                        ) : (
                          <button 
                            onClick={() => handleFinalizarLiquidacion(liq)}
                            disabled={procesandoPago === liq.id || liq.honorarios <= 0}
                            className="inline-flex items-center justify-center px-5 h-12 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all shadow-md font-black text-[10px] uppercase tracking-widest gap-2"
                            title="Finalizar y Registrar Pago Complementario"
                          >
                            {procesandoPago === liq.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <>
                                <Wallet size={16} />
                                {liq.totalYaPagado > 0 ? 'Pagar Saldo' : 'Pagar'}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL EDITAR CONTRATO ENVOLVIDO EN CREATEPORTAL */}
      {isMounted && typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
          {modalContrato.abierto && (
            <div className="fixed inset-0 z-[999999] bg-[#0A111F]/60 backdrop-blur-sm flex items-center justify-center p-4 text-left">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden text-left border border-slate-100">
                <div className="p-8 bg-[#FBF8F2] flex justify-between items-center text-left border-b border-slate-100">
                  <h3 className="text-xl font-black text-[#0A111F] uppercase italic tracking-tight text-left">Editar Contrato</h3>
                  <button onClick={() => setModalContrato({abierto: false, prof: null, porcentaje: 40})} className="p-2 bg-white rounded-full hover:text-red-500 transition-colors shadow-sm text-slate-400 text-left"><X size={20}/></button>
                </div>
                
                <div className="p-8 space-y-6 text-left">
                  <div className="text-left bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-left">Especialista</p>
                    <p className="text-sm font-black text-[#0A111F] uppercase leading-tight mt-1.5 text-left">{modalContrato.prof?.nombreCompleto}</p>
                  </div>
                  
                  <div className="space-y-3 text-left">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1 text-left">Porcentaje Dr. (%)</label>
                    <div className="relative group">
                      <input 
                        type="number" 
                        autoFocus 
                        min={0} max={100}
                        className="w-full p-5 rounded-2xl bg-white font-black text-xl text-[#C9A24B] border border-slate-200 outline-none focus:border-[#C9A24B] transition-colors text-center shadow-sm" 
                        value={modalContrato.porcentaje} 
                        onChange={(e) => setModalContrato({...modalContrato, porcentaje: Number(e.target.value)})} 
                      />
                      <span className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                    </div>
                    
                    <div className="bg-[#C9A24B]/10 p-3 rounded-xl border border-[#C9A24B]/20 text-center">
                      <p className="text-[9px] font-bold text-[#8A6D2F] uppercase tracking-widest leading-relaxed">
                        Clínica margen: <span className="font-black">{100 - modalContrato.porcentaje}%</span>
                      </p>
                    </div>
                  </div>

                  <button 
                    onClick={handleGuardarContrato} 
                    disabled={guardandoContrato} 
                    className="w-full bg-[#0A111F] text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-left mt-4"
                  >
                    {guardandoContrato ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>}
                    Actualizar Contrato
                  </button>
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

function StatCard({ label, value, icon, type }: { label: string, value: number, icon: any, type: 'light' | 'dark' | 'gold' }) {
  let styleClasses = '';
  let iconStyle = '';
  let badgeStyle = '';

  if (type === 'dark') {
    styleClasses = 'bg-[#0A111F] border-[#0A111F] text-white shadow-2xl';
    iconStyle = 'bg-white/10 text-[#C9A24B]';
    badgeStyle = 'bg-white/10 text-[#C9A24B] border border-[#C9A24B]/30';
  } else if (type === 'gold') {
    styleClasses = 'bg-[#C9A24B] border-[#C9A24B] text-white shadow-xl';
    iconStyle = 'bg-white/20 text-white';
    badgeStyle = 'bg-white/20 text-white border border-white/40';
  } else {
    styleClasses = 'bg-white/95 backdrop-blur-sm border-slate-100 text-[#0A111F] shadow-sm';
    iconStyle = 'bg-[#0A111F] text-[#C9A24B] shadow-inner';
    badgeStyle = 'bg-[#FBF8F2] text-slate-500 border border-slate-200';
  }

  return (
    <div className={`p-8 rounded-[2.5rem] border transition-transform hover:-translate-y-1 duration-300 text-left flex flex-col justify-between min-h-[180px] ${styleClasses}`}>
      <div className="flex justify-between items-start mb-6 text-left">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${iconStyle}`}>
          {icon}
        </div>
        <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full ${badgeStyle}`}>Mes Actual</span>
      </div>
      <div>
        <p className={`text-[10px] font-black uppercase tracking-widest mb-1.5 text-left ${type === 'light' ? 'text-slate-500' : 'text-white/80'}`}>{label}</p>
        <p className="text-3xl lg:text-4xl font-black italic tracking-tighter truncate text-left">${(value || 0).toLocaleString('es-CL')}</p>
      </div>
    </div>
  )
}

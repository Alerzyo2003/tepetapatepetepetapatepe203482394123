'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import {
  Plus, Loader2, Wallet, Stethoscope, ChevronRight,
  FileText, Trash2, CheckCircle2, X, Calendar, Activity, AlertCircle, Tag, StethoscopeIcon, RefreshCcw, Settings
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { toast } from 'sonner'

const ESTADOS_PLAN: Record<string, { label: string, tagColor: string, borderColor: string, progressColor: string }> = {
  BORRADOR: { label: 'Borrador', tagColor: 'bg-slate-100 text-slate-600', borderColor: 'border-white/80 hover:border-blue-300', progressColor: 'bg-slate-400' },
  POR_INICIAR: { label: 'Por Iniciar', tagColor: 'bg-indigo-50 text-indigo-600 border border-indigo-100', borderColor: 'border-white/80 hover:border-indigo-300', progressColor: 'bg-indigo-500' },
  EN_CURSO: { label: 'En Curso', tagColor: 'bg-blue-50 text-blue-600 border border-blue-100', borderColor: 'border-white/80 hover:border-blue-400', progressColor: 'bg-blue-600' },
  FINALIZADO_CON_DEUDA: { label: 'Finalizado (con deuda)', tagColor: 'bg-amber-50 text-amber-700 border border-amber-200', borderColor: 'border-white/80 hover:border-amber-400', progressColor: 'bg-amber-500' },
  FINALIZADO: { label: 'Finalizado y Saldado', tagColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200', borderColor: 'border-white/80 hover:border-emerald-400', progressColor: 'bg-emerald-500' },
  IMPORTADO: { label: 'Importado', tagColor: 'bg-amber-50 text-amber-700 border border-amber-200', borderColor: 'border-white/80 hover:border-amber-300', progressColor: 'bg-amber-500' },
};

export default function ListaTratamientosPage() {
  const params = useParams()
  const paciente_id = params.id as string
  const router = useRouter()
  
  // ESTADO PARA EL PORTAL
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  const [planes, setPlanes] = useState<any[]>([])
  const [profesionales, setProfesionales] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtroActivo, setFiltroActivo] = useState<string>('TODOS')

  const [perfil, setPerfil] = useState<any>(null)
  const [usuarioId, setUsuarioId] = useState<string>('')
  
  const [modalNuevoPlan, setModalNuevoPlan] = useState(false)
  const [creandoPlan, setCreandoPlan] = useState(false)
  const [nuevoPlan, setNuevoPlan] = useState({
    nombre: '',
    especialista_id: ''
  })

  // ESTADOS PARA EDICIÓN
  const [modalEditarPlan, setModalEditarPlan] = useState(false)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [planEnEdicion, setPlanEnEdicion] = useState({ id: '', nombre: '', especialista_id: '' })

  // EFECTO PARA CREAR EL NODO DEL PORTAL SEGURO EN NEXT.JS
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const node = document.createElement('div');
      node.id = 'modal-root-lista-tratamientos';
      node.style.position = 'relative';
      node.style.zIndex = '999999';
      document.body.appendChild(node);
      setPortalNode(node);

      return () => {
        if (document.body.contains(node)) {
          document.body.removeChild(node);
        }
      };
    }
  }, []);

  useEffect(() => {
    if (paciente_id) {
      fetchInicial()
    }
  }, [paciente_id])

  async function fetchInicial() {
    setCargando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setUsuarioId(session.user.id);
        const { data: pData } = await supabase.from('perfiles').select('rol').eq('id', session.user.id).single()
        setPerfil(pData)
        
        if (pData?.rol === 'DENTISTA') {
          const { data: profData } = await supabase
            .from('profesionales')
            .select('id')
            .eq('user_id', session.user.id)
            .single();

          if (profData) {
            setNuevoPlan(prev => ({ ...prev, especialista_id: String(profData.id) }));
          }
        }
      }

      await Promise.all([fetchPlanes(), fetchProfesionales()])
    } catch (error) {
      console.error("Error en carga inicial:", error)
    } finally {
      setCargando(false)
    }
  }

  const puedeVerFinanzas = perfil?.rol === 'ADMIN' || perfil?.rol === 'RECEPCIONISTA' || perfil?.rol === 'DENTISTA';

  async function fetchProfesionales() {
    const { data } = await supabase.from('profesionales').select('id, user_id, nombre, apellido').eq('activo', true)
    setProfesionales(data || [])
  }

  async function fetchPlanes() {
    const { data: paciente } = await supabase.from('pacientes').select('rut, nombre').eq('id', paciente_id).single();
    if (!paciente) return;

    const rutLimpio = paciente.rut.trim();
    const rutFuzzy = `%${rutLimpio.replaceAll('.', '').split('').join('%')}%`;

    const { data: oficiales } = await supabase
      .from('presupuestos')
      .select(`id, id_dentalink, nombre_tratamiento, estado, aprobado, especialista_id, total, total_abonado, created_at, profesionales(nombre, apellido, especialidades(nombre)), presupuesto_items(id, estado, precio_pactado, abonado, progreso), citas(inicio)`)
      .eq('paciente_id', paciente_id)
      .order('created_at', { ascending: false });

    const { data: temporales } = await supabase
      .from('temp_presupuestos')
      .select('id, id_dentalink, nombre, total, total_abonado, rut')
      .or(`rut.eq.${rutLimpio},rut.ilike.${rutFuzzy}`);
    
    const idsDentalinkOficiales = oficiales?.map(p => String(p.id_dentalink)).filter(id => id !== "null") || [];
    const idsSoloTemporales = (temporales || []).map(p => String(p.id_dentalink));
    const todosIdsDentalink = [...new Set([...idsDentalinkOficiales, ...idsSoloTemporales])];

    let itemsTempGlobal: any[] = [];
    if (todosIdsDentalink.length > 0) {
        const { data: it } = await supabase
          .from('temp_items')
          .select('id_dentalink, estado, precio_pactado, abonado, progreso')
          .in('id_dentalink', todosIdsDentalink);
        itemsTempGlobal = it || [];
    }

    const oficialesProcesados = (oficiales || []).map(plan => {
        let items = plan.presupuesto_items || [];
        if (plan.id_dentalink) {
            const extra = itemsTempGlobal.filter(i => String(i.id_dentalink) === String(plan.id_dentalink));
            if (items.length === 0) items = extra;
        }
        return procesarPlan(plan, items);
    });

    const idsOficialesYaMigrados = oficiales?.map(o => String(o.id_dentalink)) || [];
    const temporalesNoMigrados = (temporales || []).filter(t => !idsOficialesYaMigrados.includes(String(t.id_dentalink)));
    
    const temporalesProcesados = temporalesNoMigrados.map(plan => {
        const items = itemsTempGlobal.filter(i => String(i.id_dentalink) === String(plan.id_dentalink));
        return procesarPlan({ ...plan, id: `temp-${plan.id_dentalink}`, estado: 'pendiente' }, items);
    });

    const listaFinal = [...oficialesProcesados, ...temporalesProcesados];
    setPlanes(listaFinal);
  }

  function procesarPlan(plan: any, items: any[]) {
    const totalItems = items.length;

    const sumaProgresos = items.reduce((acc, item) => {
        const estado = String(item.estado).toLowerCase();
        if (['realizado', 'atendido', 'finalizado', 'terminado', 'completado'].includes(estado)) {
            return acc + 100;
        }
        return acc + (Number(item.progreso) || 0);
    }, 0);
    const progreso = totalItems > 0 ? Math.round(sumaProgresos / totalItems) : 0;

    const totalPlan = items.reduce((acc, curr) => acc + Number(curr.precio_pactado || 0), 0) || Number(plan.total || 0);
    const totalAbonado = items.reduce((acc, curr) => acc + Number(curr.abonado || 0), 0) || Number(plan.total_abonado || 0);
    
    const valorExigible = items.reduce((acc, item) => {
        const estado = String(item.estado).toLowerCase();
        const isRealizado = ['realizado', 'atendido', 'finalizado', 'terminado', 'completado'].includes(estado);
        const avance = Number(item.progreso) || 0;
        const precio = Number(item.precio_pactado || 0);

        if (isRealizado) return acc + precio;
        if (avance > 0) return acc + (precio * (avance / 100));
        return acc;
    }, 0);

    const deudaExigible = Math.max(0, valorExigible - totalAbonado);
    const deudaTotalDelPlan = Math.max(0, totalPlan - totalAbonado);

    const estadoFinanciero = deudaExigible > 0 ? 'CON DEUDA' : (deudaTotalDelPlan <= 0 && totalPlan > 0 ? 'SALDADO' : 'AL DIA');

    let estadoGeneral = 'BORRADOR';
    const isManualFinalizado = plan.estado === 'FINALIZADO';
    const isManualEnCurso = plan.estado === 'EN_CURSO';

    if (String(plan.id).startsWith('temp-')) {
        estadoGeneral = 'IMPORTADO';
    } else if (isManualFinalizado) {
        // Fuerza el estado finalizado si así lo mandó el usuario en la BD
        estadoGeneral = deudaTotalDelPlan <= 0 ? 'FINALIZADO' : 'FINALIZADO_CON_DEUDA';
    } else if (progreso === 100 && !isManualEnCurso) {
        // Cálculo automático
        estadoGeneral = deudaTotalDelPlan <= 0 ? 'FINALIZADO' : 'FINALIZADO_CON_DEUDA';
    } else if (progreso > 0 || isManualEnCurso) {
        estadoGeneral = 'EN_CURSO';
    } else if (plan.aprobado || totalAbonado > 0) {
        estadoGeneral = 'POR_INICIAR';
    }
    
    return {
      ...plan,
      progresoClinico: progreso,
      totalCalculado: totalPlan,
      abonadoCalculado: totalAbonado,
      deuda: deudaExigible,
      estadoFinanciero,
      nombreDoctor: plan.profesionales ? `Dr/a. ${plan.profesionales.nombre} ${plan.profesionales.apellido}` : 'Importado de Dentalink',
      especialidad: plan.profesionales?.especialidades?.nombre || 'Odontología',
      estadoGeneral,
    };
  }

  const handleCrearPlan = async () => {
    if (!nuevoPlan.nombre || !nuevoPlan.especialista_id) {
      return toast.error("Completa los datos");
    }
    
    setCreandoPlan(true);
    try {
      const { data, error } = await supabase
        .from('presupuestos')
        .insert([
          {
            paciente_id: paciente_id,
            nombre_tratamiento: nuevoPlan.nombre.toUpperCase(),
            especialista_id: nuevoPlan.especialista_id,
            estado: 'BORRADOR',
            aprobado: false,
          },
        ])
        .select();

      if (error) throw error;

      await supabase.from('auditoria_clinica').insert([{
        usuario_id: usuarioId,
        accion: 'INSERT / PLAN',
        tabla: 'presupuestos',
        detalles: `Creó el plan "${nuevoPlan.nombre.toUpperCase()}".`
      }]);

      toast.success("Plan creado exitosamente");
      setModalNuevoPlan(false);
      setNuevoPlan({ nombre: '', especialista_id: '' });
      fetchPlanes();
    } catch (e: any) { 
      console.error("Error detallado de Supabase:", e);
      toast.error(e.message || "Error al crear el tratamiento"); 
    } finally { 
      setCreandoPlan(false); 
    }
  }

  // =========== NUEVAS FUNCIONES: ELIMINAR, FINALIZAR, REANUDAR Y EDITAR ===========
  const handleEliminarPlan = async (e: React.MouseEvent, plan: any) => {
    e.stopPropagation();
    
    if (plan.abonadoCalculado > 0) {
      return toast.error("Este plan tiene abonos o pagos registrados. No puedes eliminarlo hasta anular esos pagos primero.");
    }

    if (!window.confirm(`⚠️ ¿Estás seguro de ELIMINAR permanentemente el plan "${plan.nombre_tratamiento || plan.nombre}"?\nEsta acción eliminará todos los tratamientos asociados a este folio y no se puede deshacer.`)) {
      return;
    }

    const toastId = toast.loading("Eliminando plan...");
    try {
      if (String(plan.id).startsWith('temp-')) {
        const { error } = await supabase.from('temp_presupuestos').delete().eq('id_dentalink', plan.id_dentalink);
        if (error) throw error;
      } else {
        await supabase.from('presupuesto_items').delete().eq('presupuesto_id', plan.id);
        const { error } = await supabase.from('presupuestos').delete().eq('id', plan.id);
        if (error) throw error;
      }

      await supabase.from('auditoria_clinica').insert([{
        usuario_id: usuarioId,
        accion: 'DELETE / PLAN',
        tabla: 'presupuestos',
        detalles: `Eliminó el plan "${plan.nombre_tratamiento || plan.nombre}" y todas sus prestaciones asociadas.`
      }]);

      toast.success("Tratamiento eliminado correctamente", { id: toastId });
      fetchPlanes();
    } catch (error: any) {
      console.error(error);
      toast.error("Error al eliminar el tratamiento.", { id: toastId });
    }
  };

  const handleFinalizarPlan = async (e: React.MouseEvent, plan: any) => {
    e.stopPropagation();
    if (String(plan.id).startsWith('temp-')) {
      return toast.error("No se puede forzar el cierre de un plan importado. Se calcula automáticamente.");
    }

    if (!window.confirm(`🔒 ¿Estás seguro de MARCAR COMO FINALIZADO el plan "${plan.nombre_tratamiento || plan.nombre}"?\nQuedará archivado como cerrado y no se registrará más progreso clínico en él.`)) {
      return;
    }

    const toastId = toast.loading("Finalizando...");
    try {
      const { error } = await supabase.from('presupuestos').update({ estado: 'FINALIZADO' }).eq('id', plan.id);
      if (error) throw error;

      await supabase.from('auditoria_clinica').insert([{
        usuario_id: usuarioId,
        accion: 'UPDATE / FINALIZAR PLAN',
        tabla: 'presupuestos',
        detalles: `Marcó manualmente como finalizado el plan "${plan.nombre_tratamiento || plan.nombre}".`
      }]);

      toast.success("Tratamiento archivado y finalizado", { id: toastId });
      fetchPlanes();
    } catch (error: any) {
      console.error(error);
      toast.error("Error al finalizar el tratamiento.", { id: toastId });
    }
  };

  const handleReanudarPlan = async (e: React.MouseEvent, plan: any) => {
    e.stopPropagation();
    if (String(plan.id).startsWith('temp-')) {
      return toast.error("No se puede reanudar un plan importado.");
    }

    if (!window.confirm(`🔄 ¿Estás seguro de REANUDAR el plan "${plan.nombre_tratamiento || plan.nombre}"?`)) {
      return;
    }

    const toastId = toast.loading("Reanudando...");
    try {
      const { error } = await supabase.from('presupuestos').update({ estado: 'EN_CURSO' }).eq('id', plan.id);
      if (error) throw error;

      await supabase.from('auditoria_clinica').insert([{
        usuario_id: usuarioId,
        accion: 'UPDATE / REANUDAR PLAN',
        tabla: 'presupuestos',
        detalles: `Reanudó el plan "${plan.nombre_tratamiento || plan.nombre}".`
      }]);

      toast.success("Tratamiento reanudado", { id: toastId });
      fetchPlanes();
    } catch (error: any) {
      toast.error("Error al reanudar el tratamiento.", { id: toastId });
    }
  };

  const abrirModalEditarPlan = (e: React.MouseEvent, plan: any) => {
    e.stopPropagation();
    if (String(plan.id).startsWith('temp-')) {
      return toast.error("No se puede editar la estructura de un plan importado.");
    }
    setPlanEnEdicion({
      id: plan.id,
      nombre: plan.nombre_tratamiento || plan.nombre || '',
      especialista_id: plan.especialista_id || ''
    });
    setModalEditarPlan(true);
  };

  const handleGuardarEdicionPlan = async () => {
    if (!planEnEdicion.nombre || !planEnEdicion.especialista_id) {
      return toast.error("Completa los datos para actualizar");
    }
    setGuardandoEdicion(true);
    try {
      const { error } = await supabase
        .from('presupuestos')
        .update({
          nombre_tratamiento: planEnEdicion.nombre.toUpperCase(),
          especialista_id: planEnEdicion.especialista_id
        })
        .eq('id', planEnEdicion.id);

      if (error) throw error;

      await supabase.from('auditoria_clinica').insert([{
        usuario_id: usuarioId,
        accion: 'UPDATE / EDITAR PLAN',
        tabla: 'presupuestos',
        detalles: `Editó el plan #${String(planEnEdicion.id).substring(0,8)}. Nuevo nombre: ${planEnEdicion.nombre.toUpperCase()}.`
      }]);

      toast.success("Plan actualizado correctamente");
      setModalEditarPlan(false);
      fetchPlanes();
    } catch (e: any) {
      toast.error("Error al actualizar el plan");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const planesFiltrados = planes.filter(plan => {
    if (filtroActivo === 'TODOS') return true;
    if (filtroActivo === 'EN CURSO') return plan.estadoGeneral === 'EN_CURSO' || plan.estadoGeneral === 'POR_INICIAR' || plan.estadoGeneral === 'BORRADOR';
    if (filtroActivo === 'FINALIZADOS') return plan.estadoGeneral === 'FINALIZADO' || plan.estadoGeneral === 'FINALIZADO_CON_DEUDA';
    if (puedeVerFinanzas && filtroActivo === 'DEUDA') return plan.estadoFinanciero === 'CON DEUDA';
    return true;
  });

  if (cargando) return (
    <div className="h-[70vh] flex flex-col items-center justify-center gap-4">
      <Loader2 className="animate-spin text-blue-600" size={45} />
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando historial clínico...</p>
    </div>
  )

  return (
    // 1. Usamos -m-4 lg:-m-6 para anular el padding del Layout padre
    // 2. Volvemos a aplicar padding interno (p-6 md:p-10) para que el contenido no pegue a los bordes
    <div 
      className="-m-5 lg:-m-6 p-6 md:p-10 min-h-[calc(100vh-200px)] font-sans text-left pb-24 bg-cover bg-center bg-no-repeat" 
      style={{ backgroundImage: "url('/fondo-pacientes.png')" }}
    >
    <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER PRINCIPAL */}
        <div className="bg-white/90 backdrop-blur-xl p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-white/60 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-4 rounded-[1.5rem] text-white shadow-xl shadow-blue-600/20">
              {puedeVerFinanzas ? <Wallet size={24} strokeWidth={2.5} /> : <StethoscopeIcon size={24} strokeWidth={2.5} />}
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-slate-800 leading-none">Tratamientos y Evoluciones</h2>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Historial Clínico del Paciente</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link prefetch={false} href={`/pacientes/${paciente_id}`} className="bg-slate-100 text-slate-600 px-5 py-3.5 rounded-2xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all shadow-sm">
              Volver
            </Link>
            <button onClick={() => setModalNuevoPlan(true)} className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-7 py-3.5 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-slate-900 hover:to-slate-900 transition-all flex items-center gap-2 border border-blue-500">
              <Plus size={16} strokeWidth={3} /> Nuevo Tratamiento
            </button>
          </div>
        </div>

        {/* FILTROS */}
        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {['TODOS', 'EN CURSO', 'FINALIZADOS', ...(puedeVerFinanzas ? ['DEUDA'] : [])].map(f => (
            <button key={f} onClick={() => setFiltroActivo(f)} className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border shadow-sm ${filtroActivo === f ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white/90 backdrop-blur-xl text-slate-600 border-white/80 hover:border-slate-300'}`}>
              {f}
            </button>
          ))}
        </div>

        {/* GRID DE PLANES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {planesFiltrados.length === 0 ? (
            <div className="lg:col-span-2 bg-white/90 backdrop-blur-xl p-20 rounded-[3rem] text-center border border-white/60 shadow-xl">
              <FileText size={48} className="mx-auto text-slate-300 mb-4" />
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Sin registros de tratamientos</p>
            </div>
          ) : (
            planesFiltrados.map((plan) => {
              const configEstado = ESTADOS_PLAN[plan.estadoGeneral] || ESTADOS_PLAN.BORRADOR;
              return (
              <motion.div layout key={plan.id} onClick={() => {
                  const idReal = plan.id.startsWith('temp-') ? plan.id_dentalink : plan.id;
                  router.push(`/pacientes/${paciente_id}/tratamientos/${idReal}`);
                }} className={`group bg-white/90 backdrop-blur-xl p-8 rounded-[2.5rem] border ${configEstado.borderColor} transition-all cursor-pointer shadow-xl relative flex flex-col justify-between h-full`}>
                
                {puedeVerFinanzas && (
                  <div className="absolute top-6 right-6">
                     {plan.estadoFinanciero === 'SALDADO' && <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3.5 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 shadow-sm"><CheckCircle2 size={12}/> Saldado</span>}
                     {plan.estadoFinanciero === 'CON DEUDA' && <span className="bg-red-50 text-red-500 border border-red-200 px-3.5 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center gap-1.5 shadow-sm"><AlertCircle size={12}/> Con Deuda</span>}
                  </div>
                )}

                <div className="flex items-start gap-5 mb-8">
                  <div className="bg-slate-100/80 w-16 h-16 rounded-2xl flex flex-col items-center justify-center text-slate-500 shrink-0 border border-slate-200/60 shadow-inner">
                    <span className="text-[7px] font-black uppercase opacity-60">Folio</span>
                    <span className="text-xs font-black italic">#{String(plan.id_dentalink || plan.id).substring(0,4)}</span>
                  </div>
                  <div className="flex-1 pr-24 text-left">
                    <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full mb-2 inline-block ${configEstado.tagColor}`}>
                      {configEstado.label}
                    </span>
                    <h3 className="text-lg font-black text-slate-800 uppercase leading-tight mb-1.5 mt-0.5">{plan.nombre_tratamiento || plan.nombre || 'Diagnóstico'}</h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5"><Stethoscope size={12} className="text-blue-600"/> {plan.nombreDoctor}</p>
                  </div>
                </div>

                <div className="mb-4 flex-1">
                    <div className="flex justify-between items-end mb-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Activity size={12}/> Progreso Clínico</p>
                      <p className="text-xs font-black text-slate-800">{plan.progresoClinico}%</p>
                    </div>
                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden relative shadow-inner">
                      <div className={`h-full absolute left-0 top-0 rounded-full ${configEstado.progressColor}`} style={{ width: `${plan.progresoClinico}%` }} />
                    </div>
                </div>

                {puedeVerFinanzas && (
                  <div className="flex justify-between items-end border-t border-slate-100/50 pt-6">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Finanzas</p>
                      <p className="text-[10px] font-bold text-slate-500">
                        Total: ${Number(plan.totalCalculado).toLocaleString('es-CL')} <br/>
                        Abonado: <span className="text-emerald-600">${Number(plan.abonadoCalculado).toLocaleString('es-CL')}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pendiente</p>
                      <p className={`text-2xl font-black leading-none mt-1 ${plan.deuda > 0 ? 'text-red-500' : 'text-slate-300'}`}>${Number(plan.deuda).toLocaleString('es-CL')}</p>
                    </div>
                  </div>
                )}

                {/* BOTONERA DE ACCIONES RÁPIDAS */}
                <div className="border-t border-slate-100/50 pt-4 mt-4 flex justify-end gap-2 items-center">
                  {plan.estadoGeneral !== 'FINALIZADO' && plan.estadoGeneral !== 'FINALIZADO_CON_DEUDA' && plan.estadoGeneral !== 'IMPORTADO' && puedeVerFinanzas && (
                    <button
                      onClick={(e) => handleFinalizarPlan(e, plan)}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 rounded-lg border border-slate-200 transition-colors text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm"
                      title="Marcar como Finalizado (Bloquear para edición)"
                    >
                      <CheckCircle2 size={12} /> Finalizar
                    </button>
                  )}

                  {(plan.estadoGeneral === 'FINALIZADO' || plan.estadoGeneral === 'FINALIZADO_CON_DEUDA') && plan.estadoGeneral !== 'IMPORTADO' && puedeVerFinanzas && (
                    <button
                      onClick={(e) => handleReanudarPlan(e, plan)}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded-lg border border-slate-200 transition-colors text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm"
                      title="Reanudar Tratamiento"
                    >
                      <RefreshCcw size={12} /> Reanudar
                    </button>
                  )}

                  {plan.estadoGeneral !== 'IMPORTADO' && puedeVerFinanzas && (
                    <button
                      onClick={(e) => abrirModalEditarPlan(e, plan)}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-amber-50 text-slate-500 hover:text-amber-600 rounded-lg border border-slate-200 transition-colors text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm"
                      title="Editar Nombre y Doctor"
                    >
                      <Settings size={12} /> Editar
                    </button>
                  )}
                  
                  {puedeVerFinanzas && (
                    <button
                      onClick={(e) => handleEliminarPlan(e, plan)}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg border border-slate-200 transition-colors text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm"
                      title="Eliminar Plan Completamente"
                    >
                      <Trash2 size={12} /> Eliminar
                    </button>
                  )}
                </div>

              </motion.div>
            )})
          )}
        </div>

        {/* MODAL NUEVO PLAN - PORTAL */}
        {portalNode ? createPortal(
          <AnimatePresence>
            {modalNuevoPlan && (
              <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white/95 backdrop-blur-2xl w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden text-left border border-white/80">
                  <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
                    <h2 className="text-xl font-black uppercase italic tracking-tighter">Nuevo Tratamiento</h2>
                    <button onClick={() => setModalNuevoPlan(false)} className="p-2 text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1">Nombre del Plan</label><input autoFocus className="w-full p-4 bg-slate-50/80 hover:bg-white focus:bg-white rounded-2xl outline-none font-bold text-xs uppercase text-slate-800 border border-slate-200/60 shadow-sm" value={nuevoPlan.nombre} onChange={(e) => setNuevoPlan({...nuevoPlan, nombre: e.target.value})} placeholder="Ej: Rehabilitación Oral" /></div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1">Especialista</label>
                      <select className="w-full p-4 bg-slate-50/80 hover:bg-white focus:bg-white rounded-2xl outline-none font-bold text-xs uppercase text-slate-800 border border-slate-200/60 shadow-sm cursor-pointer" value={nuevoPlan.especialista_id} onChange={(e) => setNuevoPlan({...nuevoPlan, especialista_id: e.target.value})} disabled={perfil?.rol === 'DENTISTA'}>
                        <option value="">SELECCIONAR...</option>
                        {profesionales.map(p => (
                          <option key={p.id} value={p.id}>
                            DR/A. {p.nombre} {p.apellido}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button onClick={handleCrearPlan} disabled={creandoPlan} className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-2 border border-blue-500 disabled:opacity-50">
                      {creandoPlan ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} Crear Plan
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          portalNode
        ) : null}

        {/* MODAL EDITAR PLAN - PORTAL */}
        {portalNode ? createPortal(
          <AnimatePresence>
            {modalEditarPlan && (
              <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white/95 backdrop-blur-2xl w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden text-left border border-white/80">
                  <div className="bg-amber-500 p-8 text-white flex justify-between items-center">
                    <h2 className="text-xl font-black uppercase italic tracking-tighter">Editar Tratamiento</h2>
                    <button onClick={() => setModalEditarPlan(false)} className="p-2 text-white/60 hover:text-white transition-colors"><X size={20}/></button>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1">Nombre del Plan</label><input autoFocus className="w-full p-4 bg-slate-50/80 hover:bg-white focus:bg-white rounded-2xl outline-none font-bold text-xs uppercase text-slate-800 border border-slate-200/60 shadow-sm" value={planEnEdicion.nombre} onChange={(e) => setPlanEnEdicion({...planEnEdicion, nombre: e.target.value})} placeholder="Ej: Rehabilitación Oral" /></div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1">Especialista</label>
                      <select className="w-full p-4 bg-slate-50/80 hover:bg-white focus:bg-white rounded-2xl outline-none font-bold text-xs uppercase text-slate-800 border border-slate-200/60 shadow-sm cursor-pointer" value={planEnEdicion.especialista_id} onChange={(e) => setPlanEnEdicion({...planEnEdicion, especialista_id: e.target.value})}>
                        <option value="">SELECCIONAR...</option>
                        {profesionales.map(p => (
                          <option key={p.id} value={p.id}>
                            DR/A. {p.nombre} {p.apellido}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button onClick={handleGuardarEdicionPlan} disabled={guardandoEdicion} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50">
                      {guardandoEdicion ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} Guardar Cambios
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          portalNode
        ) : null}

      </div>
    </div>
  )
}

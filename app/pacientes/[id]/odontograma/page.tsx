'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { 
  Loader2, ChevronLeft, X, User, Baby, 
  Trash2, Info, CalendarDays, EyeOff, Settings, CheckCircle2, ChevronRight, Activity, Stethoscope
} from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// DENTICIÓN PERMANENTE
const c1 = [18, 17, 16, 15, 14, 13, 12, 11];
const c2 = [21, 22, 23, 24, 25, 26, 27, 28];
const c3 = [48, 47, 46, 45, 44, 43, 42, 41];
const c4 = [31, 32, 33, 34, 35, 36, 37, 38];

// DENTICIÓN TEMPORAL
const t1 = [55, 54, 53, 52, 51];
const t2 = [61, 62, 63, 64, 65];
const t3 = [85, 84, 83, 82, 81];
const t4 = [71, 72, 73, 74, 75];

const PREEXISTENCIAS_LISTA = [
  "Corona", "Corona provisoria", "Endodoncia", "Restauración", "Implante", "Perno muñon",
  "Prótesis removible", "Amalgama", "Sellante", "Ausente"
];

const LESIONES_LISTA = [
  "Caries", "Infección Pulpar", "Fractura", "Movilidad", "Residuo Radicular", "Erosión", "Atrición", "Abfracción", 
  "Corona (mal estado)", "Corona provisoria (mal estado)", "Perno muñon (mal estado)", 
  "Restauración (mal estado)", "Amalgama (mal estado)", "Implante (mal estado)", "Endodoncia (mal estado)", "Otro"
];

const obtenerDientesPorZona = (zona: string, temporal: boolean): number[] => {
  if (zona === 'Arcada Superior') return temporal ? [...t1, ...t2] : [...c1, ...c2];
  if (zona === 'Arcada Inferior') return temporal ? [...c3, ...c4] : [...c3, ...c4];
  if (!temporal) {
    if (zona === 'Sextante 1') return [18, 17, 16, 15, 14];
    if (zona === 'Sextante 2') return [13, 12, 11, 21, 22, 23];
    if (zona === 'Sextante 3') return [24, 25, 26, 27, 28];
    if (zona === 'Sextante 4') return [38, 37, 36, 35, 34];
    if (zona === 'Sextante 5') return [33, 32, 31, 41, 42, 43];
    if (zona === 'Sextante 6') return [44, 45, 46, 47, 48];
  } else {
    if (zona === 'Sextante 1') return [55, 54];
    if (zona === 'Sextante 2') return [53, 52, 51, 61, 62, 63];
    if (zona === 'Sextante 3') return [64, 65];
    if (zona === 'Sextante 4') return [75, 74];
    if (zona === 'Sextante 5') return [73, 72, 71, 81, 82, 83];
    if (zona === 'Sextante 6') return [84, 85];
  }
  return [];
}

export default function OdontogramaHistorialPage() {
  const params = useParams()
  const pacienteId = params?.id as string
  
  const [cargando, setCargando] = useState(true)
  const [dentadura, setDentadura] = useState<Record<string, any>>({})
  const [todosLosTratamientos, setTodosLosTratamientos] = useState<any[]>([])
  const [historial, setHistorial] = useState<any[]>([])
  const [vistaTemporal, setVistaTemporal] = useState(false) 
  const [verInfoElemento, setVerInfoElemento] = useState<number | string | null>(null)
  
  // ESTADOS PARA AUDITORÍA
  const [sessionUser, setSessionUser] = useState<any>(null)
  const [sessionUserProfile, setSessionUserProfile] = useState<any>(null)

  const [menuContextual, setMenuContextual] = useState<{ x: number, y: number, diente: number | null, cara?: string, zona?: string, lado: 'derecha' | 'izquierda' } | null>(null)
  const [vistaMenu, setVistaMenu] = useState<'principal' | 'preexistencias' | 'lesiones'>('principal')

  useEffect(() => {
    if (pacienteId) {
      obtenerUsuario()
      fetchDatosOdontograma()
    }
  }, [pacienteId])

  async function obtenerUsuario() {
    const { data: { user } } = await supabase.auth.getUser()
    setSessionUser(user)
    if (user) {
      const { data: profile } = await supabase.from('perfiles').select('nombre_completo, rol, rut').eq('id', user.id).single();
      if (profile) setSessionUserProfile(profile);
    }
  }

  // FUNCIÓN CENTRAL DE AUDITORÍA
  const registrarAuditoria = async (accion: string, registroId: string, datosAnteriores: any, datosNuevos: any, detalles: string) => {
    try {
      await supabase.from('auditoria_clinica').insert([{
        usuario_id: sessionUser?.id,
        accion,
        tabla: 'odontogramas',
        detalles,
        paciente_id: pacienteId,
        registro_afectado_id: registroId,
        user_agent: window.navigator.userAgent,
        rut_usuario: sessionUserProfile?.rut || null,
        nombre_usuario: sessionUserProfile?.nombre_completo || sessionUser?.email || 'Sistema',
        rol_al_momento: sessionUserProfile?.rol || null,
        datos_anteriores: datosAnteriores,
        datos_nuevos: datosNuevos
      }]);
    } catch (error) {
      console.error("No se pudo registrar la auditoría:", error);
    }
  };

  async function fetchDatosOdontograma() {
    setCargando(true)
    try {
      const { data: odontoData } = await supabase.from('odontogramas').select('dentadura').eq('paciente_id', pacienteId).maybeSingle();
      if (odontoData?.dentadura) {
          const rawData = typeof odontoData.dentadura === 'string' ? JSON.parse(odontoData.dentadura) : odontoData.dentadura;
          setDentadura(rawData);
          generarHistorialDesdeDentadura(rawData);
      }
      const { data: presupuestos } = await supabase.from('presupuestos').select('id').eq('paciente_id', pacienteId);
      if (presupuestos?.length) {
          const { data: allItems } = await supabase
            .from('presupuesto_items')
            .select(`*, progreso, prestaciones:prestacion_id("Nombre Accion", "Nombre", icono_tipo)`)
            .in('presupuesto_id', presupuestos.map(p => p.id))
            .neq('estado', 'cancelada');

          if (allItems) {
            const tratamientosIniciados = allItems.filter(i => {
                const est = String(i.estado || 'pendiente').toLowerCase();
                const finalizado = ['realizado', 'atendido', 'terminado', 'completado', 'finalizado'].includes(est);
                const enProgreso = ['en proceso', 'iniciado'].includes(est) || (i.progreso && Number(i.progreso) > 0);
                
                return finalizado || enProgreso;
            });

            const tratamientosMapeados = tratamientosIniciados.map(i => {
              const estadoNormalizado = String(i.estado || 'pendiente').toLowerCase();
              const estadoFinal = ['realizado', 'atendido', 'terminado', 'completado', 'finalizado'].includes(estadoNormalizado) ? 'realizado' : 'pendiente';
              const displayName = (i.prestaciones?.["Nombre Accion"] || i.prestaciones?.["Nombre"] || i.nombre_prestacion || i.observacion || "Tto").split('|')[0].trim();
              return { ...i, estado: estadoFinal, display_nombre: displayName };
            });
            setTodosLosTratamientos(tratamientosMapeados);
          }
      }
    } catch (e) { console.error(e) } finally { setCargando(false) }
  }

  const generarHistorialDesdeDentadura = (estadoDentadura: Record<string, any>) => {
      let historialArmado: any[] = [];
      const fechaActualStr = new Date().toLocaleDateString('es-CL');
      Object.entries(estadoDentadura).forEach(([pieza, datos]) => {
          if (datos.hallazgos) datos.hallazgos.forEach((h: string) => historialArmado.push({ idUnico: `${pieza}-h-${h}`, fecha: fechaActualStr, pieza, caras: 'General', estado: LESIONES_LISTA.includes(h) ? 'Lesión' : 'Preexistencia', tipo: h, esManual: true }));
          if (datos.caras) Object.entries(datos.caras).forEach(([cara, cond]) => { if (cond) historialArmado.push({ idUnico: `${pieza}-c-${cara}-${cond}`, fecha: fechaActualStr, pieza, caras: `Cara ${cara}`, estado: LESIONES_LISTA.includes(String(cond)) ? 'Lesión' : 'Preexistencia', tipo: String(cond), esManual: true }); });
      });
      setHistorial(historialArmado.reverse());
  }

  const historialCombinado = useMemo(() => {
      let filas = [...historial];
      todosLosTratamientos.forEach(t => {
          const estadoFinal = t.estado === 'realizado' ? 'Realizado' : 'En Proceso';
          filas.push({ idUnico: `tto-${t.id}`, fecha: new Date(t.created_at || new Date()).toLocaleDateString('es-CL'), pieza: t.zona || t.diente_id || 'General', caras: t.cara || '-', estado: estadoFinal, tipo: t.display_nombre, esManual: false });
      });
      return filas.sort((a, b) => new Date(b.fecha.split('/').reverse().join('-')).getTime() - new Date(a.fecha.split('/').reverse().join('-')).getTime());
  }, [historial, todosLosTratamientos]);

  const handleContextMenu = (e: React.MouseEvent, diente: number | null, cara?: string, zona?: string) => {
    e.preventDefault(); e.stopPropagation();
    const container = document.getElementById('odontograma-historial');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const lado: 'derecha' | 'izquierda' = e.clientX + 300 > window.innerWidth ? 'izquierda' : 'derecha';
    setMenuContextual({ x: e.clientX - rect.left, y: e.clientY - rect.top, diente, cara, zona, lado });
    setVistaMenu('principal');
  };

  // ACTUALIZACIÓN DE GUARDADO CON AUDITORÍA
  const guardarEnBD = async (nuevoEstado: any, accionLog: string, detallesLog: string) => {
      const { data, error } = await supabase
        .from('odontogramas')
        .upsert({ paciente_id: pacienteId, dentadura: nuevoEstado }, { onConflict: 'paciente_id' })
        .select();
        
      if (!error) { 
        setDentadura(nuevoEstado); 
        generarHistorialDesdeDentadura(nuevoEstado); 
        
        // Registrar en Auditoría si se guardó correctamente
        if (data && data.length > 0) {
            await registrarAuditoria(
                accionLog,
                data[0].id,
                { dentadura: dentadura }, // El estado actual antes del cambio
                { dentadura: nuevoEstado }, // El nuevo estado
                detallesLog
            );
        }
      } else {
        toast.error("Error al actualizar el odontograma");
      }
  }

  const aplicarHallazgo = async (tipo: string) => {
    if (!menuContextual) return;
    let nuevoEstado = { ...dentadura };
    const teeth = menuContextual.zona ? obtenerDientesPorZona(menuContextual.zona, vistaTemporal) : [menuContextual.diente!];

    teeth.forEach(d => {
        const dId = d.toString();
        if (!nuevoEstado[dId]) nuevoEstado[dId] = { hallazgos: [], caras: {} };
        if (menuContextual.cara) {
            nuevoEstado[dId].caras[menuContextual.cara] = (nuevoEstado[dId].caras[menuContextual.cara] === tipo) ? null : tipo;
        } else {
            if (tipo === 'Sano') { nuevoEstado[dId].hallazgos = []; nuevoEstado[dId].caras = {}; }
            else if (tipo === 'Ausente') nuevoEstado[dId].hallazgos = ['Ausente'];
            else {
                const existen = (nuevoEstado[dId].hallazgos || []).filter((h:string) => h !== 'Sano' && h !== 'Ausente');
                nuevoEstado[dId].hallazgos = existen.includes(tipo) ? existen.filter((h:string) => h !== tipo) : [...existen, tipo];
            }
        }
    });

    const objetivoStr = menuContextual.zona || `Pieza ${menuContextual.diente}${menuContextual.cara ? ` (Cara ${menuContextual.cara})` : ''}`;
    const accionStr = (tipo === 'Sano' || tipo === 'Ausente') ? `MARCAR_DIENTE_${tipo.toUpperCase()}` : 'MODIFICAR_HALLAZGO_ODONTOGRAMA';
    const detallesStr = `Se aplicó '${tipo}' en ${objetivoStr}`;

    guardarEnBD(nuevoEstado, accionStr, detallesStr);
    setMenuContextual(null);
  }

  const eliminarRegistroManual = async (reg: any) => {
      let nuevoEstado = { ...dentadura };
      const dId = reg.pieza.toString();
      if (reg.caras.includes('Cara')) {
        delete nuevoEstado[dId].caras[reg.caras.replace('Cara ', '')];
      } else {
        nuevoEstado[dId].hallazgos = nuevoEstado[dId].hallazgos.filter((h:string) => h !== reg.tipo);
      }
      
      guardarEnBD(
        nuevoEstado, 
        'ELIMINAR_HALLAZGO_ODONTOGRAMA', 
        `Se eliminó el hallazgo '${reg.tipo}' en Pieza ${reg.pieza} (${reg.caras})`
      );
  }

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
      <Loader2 className="animate-spin text-blue-600" size={45} />
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando Odontograma Histórico...</p>
    </div>
  )

  return (
    <div className="min-h-screen p-6 md:p-10 font-sans text-left pb-24" style={{ backgroundImage: "url('/fondo-pacientes.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }} onClick={() => setMenuContextual(null)}>
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER / NAVEGACIÓN */}
        <div className="flex justify-between items-center bg-white/90 backdrop-blur-xl p-6 rounded-[2rem] shadow-xl border border-white/60">
            <Link href={`/pacientes/${pacienteId}`} className="group inline-flex items-center gap-2 font-black text-[10px] text-slate-500 uppercase tracking-widest hover:text-blue-600 transition-all bg-slate-100/80 px-4 py-2.5 rounded-xl shadow-sm border border-slate-200/60">
              <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform"/> Volver a la ficha
            </Link>
            
            <div className="flex bg-slate-100/80 backdrop-blur-md rounded-2xl shadow-sm border border-slate-200/60 p-1.5">
                <button onClick={() => setVistaTemporal(false)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${!vistaTemporal ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Permanente</button>
                <button onClick={() => setVistaTemporal(true)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${vistaTemporal ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Temporal</button>
            </div>
        </div>

        {/* ODONTOGRAMA VISUAL */}
        <section id="odontograma-historial" className="bg-white/90 backdrop-blur-xl p-8 md:p-12 rounded-[3rem] shadow-2xl border border-white/60 overflow-visible relative">
          <div className="flex items-center gap-3 mb-8 text-blue-600 border-b border-slate-100 pb-6">
            <div className="bg-blue-50 p-2.5 rounded-2xl shadow-inner">
              <Stethoscope size={22} strokeWidth={2.5}/>
            </div>
            <div>
              <h2 className="text-xl font-black uppercase italic tracking-tight text-slate-800">Odontograma Histórico</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Tratamientos Iniciados y Realizados</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-16 py-6 overflow-x-auto min-w-max">
            <div className="flex gap-8">
              <div className="flex gap-1.5 border-r-2 border-slate-100 pr-8">
                {(!vistaTemporal ? c1 : t1).map(id => <DienteVisual key={id} id={id} seleccionado={false} onSelect={()=>{}} estadoDiente={dentadura[id.toString()]} itemsDiente={todosLosTratamientos.filter(t => String(t.diente_id) === String(id))} onContextMenu={(e:any) => handleContextMenu(e, id)} onFaceClick={(e:any, c:string) => handleContextMenu(e, id, c)} abrirPanelAgregar={()=>{}} />)}
              </div>
              <div className="flex gap-1.5">
                {(!vistaTemporal ? c2 : t2).map(id => <DienteVisual key={id} id={id} seleccionado={false} onSelect={()=>{}} estadoDiente={dentadura[id.toString()]} itemsDiente={todosLosTratamientos.filter(t => String(t.diente_id) === String(id))} onContextMenu={(e:any) => handleContextMenu(e, id)} onFaceClick={(e:any, c:string) => handleContextMenu(e, id, c)} abrirPanelAgregar={()=>{}} />)}
              </div>
            </div>
            <div className="flex gap-8 mt-2">
              <div className="flex gap-1.5 border-r-2 border-slate-100 pr-8">
                {(!vistaTemporal ? c3 : t3).map(id => <DienteVisual key={id} id={id} invert seleccionado={false} onSelect={()=>{}} estadoDiente={dentadura[id.toString()]} itemsDiente={todosLosTratamientos.filter(t => String(t.diente_id) === String(id))} onContextMenu={(e:any) => handleContextMenu(e, id)} onFaceClick={(e:any, c:string) => handleContextMenu(e, id, c)} abrirPanelAgregar={()=>{}} />)}
              </div>
              <div className="flex gap-1.5">
                {(!vistaTemporal ? c4 : t4).map(id => <DienteVisual key={id} id={id} invert seleccionado={false} onSelect={()=>{}} estadoDiente={dentadura[id.toString()]} itemsDiente={todosLosTratamientos.filter(t => String(t.diente_id) === String(id))} onContextMenu={(e:any) => handleContextMenu(e, id)} onFaceClick={(e:any, c:string) => handleContextMenu(e, id, c)} abrirPanelAgregar={()=>{}} />)}
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap gap-6 justify-center border-t border-slate-100 pt-8">
             <div className="grid grid-cols-3 gap-2">
                {[1,2,3,6,5,4].map(s => <button key={s} onContextMenu={(e) => handleContextMenu(e, null, undefined, `Sextante ${s}`)} className="px-4 py-2.5 bg-slate-50 hover:bg-white border border-slate-200/80 rounded-xl text-[9px] font-black uppercase text-slate-600 shadow-sm transition-all">Sextante {s}</button>)}
             </div>
             <div className="flex flex-col gap-2">
                <button onContextMenu={(e) => handleContextMenu(e, null, undefined, 'Arcada Superior')} className="px-5 py-2.5 bg-slate-50 hover:bg-white border border-slate-200/80 rounded-xl text-[9px] font-black uppercase text-slate-600 shadow-sm transition-all">Arcada Superior</button>
                <button onContextMenu={(e) => handleContextMenu(e, null, undefined, 'Arcada Inferior')} className="px-5 py-2.5 bg-slate-50 hover:bg-white border border-slate-200/80 rounded-xl text-[9px] font-black uppercase text-slate-600 shadow-sm transition-all">Arcada Inferior</button>
             </div>
          </div>

          <AnimatePresence>
            {menuContextual && (
              <div style={{ position: 'absolute', top: menuContextual.y + 10, left: menuContextual.lado === 'derecha' ? menuContextual.x + 20 : menuContextual.x - 220, zIndex: 999 }}>
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="bg-white/95 backdrop-blur-2xl border border-white/80 shadow-2xl rounded-[2rem] p-3 w-[220px]" onClick={(e) => e.stopPropagation()}>
                  {vistaMenu === 'principal' ? (
                      <div className="space-y-1 text-left">
                        <p className="px-3 py-2 text-[10px] font-black uppercase text-blue-600 border-b border-slate-100 mb-2 text-center italic">{menuContextual.zona || (menuContextual.cara ? `Pieza ${menuContextual.diente} (${menuContextual.cara})` : `Pieza ${menuContextual.diente}`)}</p>
                        <button onClick={() => setVistaMenu('preexistencias')} className="w-full flex justify-between items-center px-3 py-2.5 rounded-xl hover:bg-blue-50 font-black uppercase text-[9px] text-slate-700 transition-colors">Preexistencia <ChevronRight size={14}/></button>
                        <button onClick={() => setVistaMenu('lesiones')} className="w-full flex justify-between items-center px-3 py-2.5 rounded-xl hover:bg-red-50 font-black uppercase text-[9px] text-slate-700 transition-colors">Definir Lesión <ChevronRight size={14}/></button>
                        <div className="h-px bg-slate-100 my-1"></div>
                        <button onClick={() => toast.info("Funcionalidad disponible en Planificación")} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 font-black uppercase text-[9px] text-slate-600 transition-colors"><Settings size={14}/> Agregar Prestación</button>
                        
                        <button onClick={() => { setVerInfoElemento(menuContextual.diente || menuContextual.zona!); setMenuContextual(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 font-black uppercase text-[9px] text-slate-600 transition-colors"><Info size={14} className="text-blue-500"/> Ver Información</button>
                        
                        <button onClick={() => aplicarHallazgo('Ausente')} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-red-50 font-black uppercase text-[9px] text-red-500 transition-colors"><EyeOff size={14}/> Ausente</button>
                        <button onClick={() => aplicarHallazgo('Sano')} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-emerald-50 font-black uppercase text-[9px] text-emerald-600 transition-colors"><CheckCircle2 size={14}/> Diente Sano</button>
                      </div>
                  ) : (
                      <div className="p-1 flex flex-col">
                        <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-2 px-2"><p className="text-[9px] font-black uppercase text-slate-400 italic">{vistaMenu}</p><button onClick={() => setVistaMenu('principal')} className="text-[8px] font-black uppercase bg-slate-100 px-2.5 py-1 rounded-full hover:bg-slate-200 transition-all">Volver</button></div>
                        <div className="grid grid-cols-1 gap-1 max-h-[260px] overflow-y-auto custom-scrollbar p-1">
                          {(vistaMenu === 'preexistencias' ? PREEXISTENCIAS_LISTA : LESIONES_LISTA).map(op => (
                            <button key={op} onClick={() => aplicarHallazgo(op)} className="flex items-center gap-3 w-full p-2.5 hover:bg-blue-50 rounded-xl text-left transition-colors">
                              <div className="w-6 h-6 shrink-0"><svg viewBox="-10 -10 120 140" className="w-full h-full"><LogoRender hallazgo={op} /></svg></div>
                              <span className="text-[9px] font-black uppercase text-slate-700">{op}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </section>

        {/* TABLA HISTORIAL */}
        <section className="bg-white/90 backdrop-blur-xl rounded-[3rem] shadow-2xl border border-white/60 overflow-hidden">
          <div className="p-8 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
            <div className="bg-blue-50 p-2.5 rounded-2xl text-blue-600 shadow-inner">
              <CalendarDays size={20} strokeWidth={2.5}/>
            </div>
            <h3 className="text-lg font-black uppercase italic tracking-tight text-slate-800">Registro Clínico</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-[0.2em]">
                  <th className="px-8 py-5">Fecha</th>
                  <th className="px-6 py-5 text-center">Pieza</th>
                  <th className="px-6 py-5 text-center">Caras</th>
                  <th className="px-6 py-5">Diagnóstico</th>
                  <th className="px-6 py-5 text-center">Estado</th>
                  <th className="px-8 py-5 text-right">Anular</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historialCombinado.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400 italic text-xs uppercase tracking-wider font-bold">Sin registros clínicos</td>
                  </tr>
                ) : (
                  historialCombinado.map((h, i) => (
                    <tr key={i} className={`hover:bg-blue-50/30 transition-colors group ${h.estado === 'Realizado' ? 'bg-emerald-50/20' : !h.esManual ? 'bg-amber-50/20' : ''}`}>
                      <td className="px-8 py-5 text-[10px] font-bold text-slate-500">{h.fecha}</td>
                      <td className="px-6 py-5 text-center font-black text-xs text-slate-700">{h.pieza}</td>
                      <td className="px-6 py-5 text-center text-[10px] font-black text-slate-400 uppercase">{h.caras}</td>
                      <td className="px-6 py-5 text-xs font-black uppercase text-slate-800">{h.tipo}</td>
                      <td className="px-6 py-5 text-center">
                        <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${h.estado === 'Preexistencia' ? 'bg-blue-50 text-blue-600 border border-blue-100' : h.estado === 'Realizado' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : h.estado === 'En Proceso' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                          {h.estado}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        {h.esManual ? (
                          <button onClick={() => eliminarRegistroManual(h)} className="p-2.5 bg-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all shadow-sm">
                            <Trash2 size={16}/>
                          </button>
                        ) : (
                          <span className="text-[8px] font-black text-slate-400 uppercase px-3 py-1 bg-slate-100/80 rounded-xl border border-slate-200/60 shadow-sm">Histórico</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* PANEL LATERAL: INFORMACIÓN DEL DIENTE */}
      <AnimatePresence>
        {verInfoElemento && (
          <motion.aside initial={{ x: 450, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 450, opacity: 0 }} className="fixed top-0 right-0 h-screen w-[400px] bg-white/95 backdrop-blur-2xl shadow-2xl z-[1000] border-l border-white/80 flex flex-col overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-black text-base uppercase italic tracking-tight">Detalles {typeof verInfoElemento === 'number' ? `Pieza ${verInfoElemento}` : verInfoElemento}</h3>
              <button onClick={() => setVerInfoElemento(null)} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-2xl transition-all"><X size={18}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8 text-left text-slate-800">
               {typeof verInfoElemento === 'number' && (
                 <div className="bg-slate-50/80 p-6 rounded-[2rem] border border-slate-200/60 flex flex-col items-center shadow-inner">
                    <div className="w-24 h-28 mb-4 pointer-events-none">
                       <DienteVisual id={verInfoElemento} seleccionado={false} onSelect={()=>{}} estadoDiente={dentadura[verInfoElemento.toString()]} itemsDiente={todosLosTratamientos.filter(t => String(t.diente_id) === String(verInfoElemento))} onFaceClick={()=>{}} onContextMenu={()=>{}} abrirPanelAgregar={()=>{}} />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vista Previa anatómica</span>
                 </div>
               )}

               <div className="space-y-4">
                 <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b border-slate-100 pb-2">Hallazgos Manuales</h4>
                 {typeof verInfoElemento === 'number' && (dentadura[verInfoElemento.toString()]?.hallazgos?.length || dentadura[verInfoElemento.toString()]?.caras) ? (
                   <>
                     {dentadura[verInfoElemento.toString()]?.hallazgos?.map((h:string, idx:number)=>(
                        <div key={idx} className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center gap-4 shadow-sm">
                          <div className="w-8 h-8"><svg viewBox="-10 -10 120 140" className="w-full h-full"><LogoRender hallazgo={h} /></svg></div>
                          <span className="text-xs font-black uppercase text-slate-700">{h} (Raíz)</span>
                        </div>
                     ))}
                     {dentadura[verInfoElemento.toString()]?.caras && Object.entries(dentadura[verInfoElemento.toString()].caras).map(([cara, val]) => val && (
                        <div key={cara} className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center gap-4 shadow-sm">
                          <div className="w-8 h-8"><svg viewBox="-10 -10 120 140" className="w-full h-full"><LogoRender hallazgo={val as string} /></svg></div>
                          <span className="text-xs font-black uppercase text-slate-700">{String(val)} (Cara {cara})</span>
                        </div>
                     ))}
                   </>
                 ) : <p className="text-xs text-slate-400 italic">Sin hallazgos clínicos manuales</p>}
               </div>

               <div className="space-y-4">
                 <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest border-b border-slate-100 pb-2 mt-8">Tratamientos Iniciados</h4>
                 {(() => {
                    const tratsFiltrados = typeof verInfoElemento === 'number' 
                        ? todosLosTratamientos.filter(t => String(t.diente_id) === String(verInfoElemento))
                        : todosLosTratamientos.filter(t => t.zona === verInfoElemento);
                    
                    if (tratsFiltrados.length === 0) return <p className="text-xs text-slate-400 italic">No hay tratamientos en curso para esta área.</p>;

                    return tratsFiltrados.map((t, idx) => (
                        <div key={idx} className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center gap-4 shadow-sm">
                          <div className="w-8 h-8 shrink-0">
                             <svg viewBox="-10 -10 120 140" className="w-full h-full">
                                <LogoRender hallazgo={t.display_nombre} iconoKey={t.prestaciones?.icono_tipo} isRealizado={t.estado === 'realizado'} isPendiente={t.estado === 'pendiente'} />
                             </svg>
                          </div>
                          <div className="flex-1">
                             <p className="text-xs font-black uppercase text-slate-700 leading-tight">{t.display_nombre}</p>
                             <div className="flex items-center gap-2 mt-1.5">
                                <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest leading-none ${t.estado === 'realizado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {t.estado === 'realizado' ? 'Realizado' : 'En Proceso'}
                                </span>
                                {t.progreso > 0 && t.estado !== 'realizado' && <span className="text-[9px] font-bold text-slate-400">{t.progreso}%</span>}
                             </div>
                          </div>
                        </div>
                    ));
                 })()}
               </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}

function CarasDentales({ id, itemsDiente = [], estado, onFaceClick, invert }: any) {
  const screenLeft = (id >= 11 && id <= 18) || (id >= 41 && id <= 48) || (id >= 51 && id <= 55) || (id >= 81 && id <= 85);
  const faceLeft = screenLeft ? 'D' : 'M';
  const faceRight = screenLeft ? 'M' : 'D';

  const getFill = (c: string) => {
    const valCara = estado?.caras?.[c];
    if (valCara) {
        const low = valCara.toLowerCase();
        if (low.includes('caries') || low.includes('erosi') || low.includes('atrici') || low.includes('abfrac')) {
            return "#0f172a"; 
        }
        return "#2563eb"; 
    }

    const hallazgosGenerales = estado?.hallazgos || [];
    const tieneLesionGeneralNegra = hallazgosGenerales.some((h: string) => {
        const low = h.toLowerCase();
        return low.includes('caries') || low.includes('erosi') || low.includes('atrici') || low.includes('abfrac');
    });

    if (tieneLesionGeneralNegra) {
        return "#0f172a"; 
    }

    try {
        if (itemsDiente && itemsDiente.length > 0) {
            const realiz = itemsDiente.some((i:any) => i.cara && typeof i.cara === 'string' && i.cara.includes(c) && i.estado === 'realizado');
            if (realiz) return "#059669"; 
            
            const pend = itemsDiente.some((i:any) => i.cara && typeof i.cara === 'string' && i.cara.includes(c) && i.estado !== 'realizado');
            if (pend) return "#dc2626"; 
        }
    } catch (error) {
        console.error(`Error al evaluar color en diente ${id}:`, error);
    }

    return "white"; 
  }

  const paths = { 
      V: "M 16 16 A 48 48 0 0 1 84 16 L 64 36 A 20 20 0 0 0 36 36 Z", 
      L: "M 84 84 A 48 48 0 0 1 16 84 L 36 64 A 20 20 0 0 0 64 64 Z", 
      FL: "M 16 84 A 48 48 0 0 1 16 16 L 36 36 A 20 20 0 0 0 36 64 Z", 
      FR: "M 84 16 A 48 48 0 0 1 84 84 L 64 64 A 20 20 0 0 0 64 36 Z" 
  };

  return (
    <svg viewBox="0 0 100 100" className={`w-9 h-9 drop-shadow-sm ${invert ? 'rotate-180' : ''}`}>
       <path d={paths.V} fill={getFill('V')} stroke="#cbd5e1" strokeWidth="3" className="hover:opacity-70 cursor-pointer transition-colors" onClick={(e) => { e.stopPropagation(); onFaceClick(e, 'V'); }} onContextMenu={(e) => onFaceClick(e, 'V')} />
       <path d={paths.L} fill={getFill('L')} stroke="#cbd5e1" strokeWidth="3" className="hover:opacity-70 cursor-pointer transition-colors" onClick={(e) => { e.stopPropagation(); onFaceClick(e, 'L'); }} onContextMenu={(e) => onFaceClick(e, 'L')} />
       <path d={paths.FL} fill={getFill(faceLeft)} stroke="#cbd5e1" strokeWidth="3" className="hover:opacity-70 cursor-pointer transition-colors" onClick={(e) => { e.stopPropagation(); onFaceClick(e, faceLeft); }} onContextMenu={(e) => onFaceClick(e, faceLeft)} />
       <path d={paths.FR} fill={getFill(faceRight)} stroke="#cbd5e1" strokeWidth="3" className="hover:opacity-70 cursor-pointer transition-colors" onClick={(e) => { e.stopPropagation(); onFaceClick(e, faceRight); }} onContextMenu={(e) => onFaceClick(e, faceRight)} />
       <circle cx="50" cy="50" r="20" fill={getFill('O')} stroke="#cbd5e1" strokeWidth="3" className="hover:opacity-70 cursor-pointer transition-colors" onClick={(e) => { e.stopPropagation(); onFaceClick(e, 'O'); }} onContextMenu={(e) => onFaceClick(e, 'O')} />
    </svg>
  )
}

function DienteVisual({ id, invert = false, estadoDiente, onContextMenu, onFaceClick, itemsDiente = [] }: any) {
  const hallazgos = estadoDiente?.hallazgos || [];
  
  const tratamientosEnPieza = itemsDiente.filter((i:any) => !i.zona);
  const todosRealizados = tratamientosEnPieza.length > 0 && tratamientosEnPieza.every((i:any) => i.estado === 'realizado');
  const tienePendientes = tratamientosEnPieza.some((i:any) => i.estado !== 'realizado');
  
  const isAusenteManual = hallazgos.includes('Ausente');
  const isExodonciaRealizada = itemsDiente.some((i:any) => {
      const n = String(i.display_nombre).toLowerCase();
      const ico = String(i.icono_tipo || i.prestaciones?.icono_tipo || "").toLowerCase();
      return n.includes('extrac') || n.includes('exodoncia') || ico.includes('extrac');
  });
  const isAusente = isAusenteManual || isExodonciaRealizada;
  
  let elementosRaiz: any[] = hallazgos.map((h: string) => ({ nombre: h, icono: null, isManual: true }));
  
  itemsDiente.forEach((t:any) => {
      const n = String(t.display_nombre).toLowerCase();
      const ico = String(t.icono_tipo || t.prestaciones?.icono_tipo || "").toLowerCase();
      const esRaiz = n.includes("endo") || ico.includes("endo") || 
                     n.includes("impla") || ico.includes("impla") || 
                     n.includes("perno") || ico.includes("perno") || 
                     n.includes("corona") || ico.includes("corona") || 
                     n.includes("extra") || ico.includes("extra") || 
                     n.includes("exodoncia") ||
                     ico === "default" || 
                     ico === "otro"; 
      
      if (!t.cara || esRaiz) {
          if (!elementosRaiz.some(e => e.nombre === t.display_nombre)) {
              elementosRaiz.push({ nombre: t.display_nombre, icono: ico, isManual: false });
          }
      }
  });

  let start = "#ffffff", end = "#f8fafc", stroke = "#cbd5e1";
  
  if (isAusente) { 
      start = "#f8fafc"; end = "#f1f5f9"; stroke = "#e2e8f0"; 
  } else if (elementosRaiz.length > 0 || tienePendientes || todosRealizados) { 
      if (todosRealizados && !isAusente) { 
          start = "#ecfdf5"; end = "#d1fae5"; stroke = "#10b981"; 
      } else if (tienePendientes || hallazgos.some((h:string) => LESIONES_LISTA.includes(h))) { 
          start = "#fef2f2"; end = "#fecaca"; stroke = "#f87171"; 
      } else { 
          start = "#eff6ff"; end = "#dbeafe"; stroke = "#93c5fd"; 
      }
  } 
  
  const getP = (n: number) => {
    const x = n % 10;
    if (x < 3) return "M 35 15 Q 50 5 65 15 L 75 60 Q 80 90 75 105 L 25 105 Q 20 90 25 60 Z"; 
    if (x === 3) return "M 35 15 Q 50 5 65 15 L 75 50 Q 80 75 50 95 Q 20 75 25 50 Z"; 
    return "M 20 15 Q 30 0 45 15 L 50 45 L 55 15 Q 70 0 80 15 L 85 60 Q 95 90 80 110 Q 50 115 20 110 Q 5 90 15 60 Z"; 
  }

  return (
    <div className={`flex flex-col items-center gap-1.5 group ${invert ? 'flex-col-reverse' : ''}`}>
      <div onClick={onContextMenu} onContextMenu={onContextMenu} className="relative w-12 h-14 cursor-pointer transition-all duration-300 drop-shadow-sm hover:scale-105">
        <svg viewBox="-10 -10 120 140" className={`w-full h-full overflow-visible ${invert ? 'rotate-180' : ''}`}>
          <defs>
            <linearGradient id={`g-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={start} />
              <stop offset="100%" stopColor={end} />
            </linearGradient>
          </defs>
          
          <path d={getP(id)} fill={`url(#g-${id})`} stroke={stroke} strokeWidth="4" strokeLinejoin="round" />
          
          {isAusente ? (
             <g stroke={isExodonciaRealizada ? "#059669" : "#ef4444"} strokeWidth="12" strokeLinecap="round" opacity="0.8">
               <line x1="10" y1="20" x2="90" y2="100" />
               <line x1="90" y1="20" x2="10" y2="100" />
             </g>
          ) : (
             elementosRaiz.map((el, i) => {
                 const isTtoRealizado = !el.isManual && itemsDiente.some((t:any) => t.display_nombre === el.nombre && t.estado === 'realizado');
                 const isTtoPendiente = !el.isManual && itemsDiente.some((t:any) => t.display_nombre === el.nombre && t.estado !== 'realizado');
                 return <LogoRender key={`h-${i}`} hallazgo={el.nombre} iconoKey={el.icono} isRealizado={isTtoRealizado} isPendiente={isTtoPendiente} />
             })
          )}
        </svg>
      </div>
      <span className="text-[10px] font-black text-slate-400 italic group-hover:text-blue-600 transition-colors cursor-pointer" onClick={onContextMenu} onContextMenu={onContextMenu}>{id}</span>
      
      <div>
         <CarasDentales id={id} estado={estadoDiente} itemsDiente={itemsDiente} onFaceClick={onFaceClick} invert={invert} />
      </div>
    </div>
  )
}

function LogoRender({ hallazgo, iconoKey, colorOverride, isRealizado, isPendiente }: { hallazgo?: string, iconoKey?: string, colorOverride?: string, isRealizado?: boolean, isPendiente?: boolean }) {
  const originalName = (hallazgo || "").toLowerCase();
  const explicitIcon = (iconoKey || "").toLowerCase();
  const h = explicitIcon || originalName; 
  
  const isLesion = LESIONES_LISTA.some(l => l.toLowerCase() === originalName);
  const isMalEstado = originalName.includes("mal estado") || originalName.includes("fractu") || originalName.includes("infec");
  
  let color = "#2563eb"; 
  if (colorOverride) color = colorOverride;
  else if (isRealizado) color = "#059669"; 
  else if (isPendiente) color = "#dc2626"; 
  else if (isLesion || isMalEstado) color = "#0f172a"; 

  const patternId = `hash-${Math.random().toString(36).substring(2, 9)}`;
  const pattern = isMalEstado ? (<defs><pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke={color} strokeWidth="3" /></pattern></defs>) : null;
  const fill = isMalEstado ? `url(#${patternId})` : color;
  
  if (h === "otro" || h.includes("estrella")) return <g>{pattern}<polygon points="50,15 61,35 83,38 68,54 71,76 50,66 29,76 32,54 17,38 39,35" fill={fill} /></g>;
  if (h.includes("erosi") || h.includes("abfrac")) return <g>{pattern}<path d="M 25 80 Q 50 100 75 80" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" /></g>;
  if (h.includes("atrici")) return <g>{pattern}<line x1="20" y1="10" x2="80" y2="10" stroke={color} strokeWidth="10" strokeLinecap="round" /></g>;
  if (h.includes("infecci")) return <g>{pattern}<circle cx="50" cy="110" r="14" fill={fill} /></g>;
  if (h.includes("fractu")) return <path d="M 65 10 L 45 50 L 60 50 L 35 100" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  if (h.includes("movilidad")) return <g stroke={color} strokeWidth="6" fill="none" strokeLinecap="round"><path d="M 15 30 Q -5 60 15 90" /><path d="M 85 30 Q 105 60 85 90" /></g>;
  if (h.includes("endo")) return <g><path d="M 35 25 L 35 95 M 65 25 L 65 95" stroke={isMalEstado ? "url(#" + patternId + ")" : color} strokeWidth="8" strokeLinecap="round" /></g>;
  if (h.includes("impla")) return <g fill={fill}><rect x="40" y="20" width="20" height="70" rx="4" /><line x1="32" y1="35" x2="68" y2="35" stroke={color} strokeWidth="6" strokeLinecap="round"/><line x1="32" y1="55" x2="68" y2="55" stroke={color} strokeWidth="6" strokeLinecap="round"/><line x1="32" y1="75" x2="68" y2="75" stroke={color} strokeWidth="6" strokeLinecap="round"/></g>;
  if (h.includes("perno") || h.includes("muñón") || h.includes("munon")) return <path d="M 25 20 L 75 20 L 50 90 Z" fill={fill} stroke={color} strokeWidth="4" strokeLinejoin="round" />;
  if (h.includes("provisoria")) return <g><circle cx="50" cy="50" r="35" fill={isMalEstado ? fill : "none"} stroke={color} strokeWidth="6" /><text x="50" y="65" textAnchor="middle" fontSize="40" fontWeight="900" fill={isMalEstado ? "#fff" : color}>P</text></g>;
  if (h.includes("corona")) return <circle cx="50" cy="50" r="35" fill={isMalEstado ? fill : "none"} stroke={color} strokeWidth="6" />;
  if (h.includes("protesis") || h.includes("removible")) return <g stroke={color} strokeWidth="8" strokeLinecap="round"><line x1="15" y1="40" x2="85" y2="40" /><line x1="15" y1="60" x2="85" y2="60" /></g>;
  if (h.includes("sellante")) return <path d="M 20 30 Q 50 50 80 30" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />;
  if (h.includes("rr") || h.includes("residuo radicular")) return <g><rect x="15" y="30" width="70" height="40" rx="8" fill={color} /><text x="50" y="58" fill="#fff" fontSize="28" fontWeight="900" textAnchor="middle">RR</text></g>;
  if (h.includes("extrac") || h.includes("exodoncia") || h.includes("ausente")) return <g stroke={color} strokeWidth="12" strokeLinecap="round" opacity="0.8"><line x1="15" y1="15" x2="85" y2="85" /><line x1="85" y1="15" x2="15" y2="85" /></g>;
  if (h.includes("limpieza") || h.includes("pulido") || h.includes("destartraje") || h.includes("profilaxis")) return <g fill={color}><circle cx="30" cy="30" r="10"/><circle cx="75" cy="45" r="8"/><circle cx="45" cy="75" r="14"/></g>;
  if (h.includes("rayos") || h.includes("radiografia") || h.includes("scanner") || h.includes("panoramica")) return <g stroke={color} strokeWidth="8" fill="none"><rect x="15" y="20" width="70" height="60" rx="8" /><circle cx="50" cy="50" r="16"/></g>;
  if (h.includes("sano")) return <path d="M 25 50 L 45 70 L 80 30" stroke={color} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  if (h.includes("caries") || h.includes("restauraci") || h.includes("amalgama") || h.includes("resina") || h.includes("ionomero")) return <g>{pattern}<path d="M 35 35 Q 50 20 65 35 Q 80 50 65 65 Q 50 80 35 65 Q 20 50 35 35 Z" fill={fill} /></g>;

  return <circle cx="50" cy="50" r="25" fill={fill} opacity="0.8" />;
}

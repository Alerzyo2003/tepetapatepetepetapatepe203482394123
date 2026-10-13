'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import DOMPurify from 'isomorphic-dompurify'
import { 
  Stethoscope, Plus, Save, X, Loader2, 
  Clipboard, Trash2, Edit3, 
  Printer, EyeOff, User, Calendar, Clock,
  Bold, Italic, Underline, Highlighter, Eraser, List
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

export default function EvolucionesPage() {
  const { id: paciente_id } = useParams()
  const [evoluciones, setEvoluciones] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [sessionUserProfile, setSessionUserProfile] = useState<any>(null)
  const [sessionUser, setSessionUser] = useState<any>(null)
  const [especialistaId, setEspecialistaId] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  
  const [verAnuladas, setVerAnuladas] = useState(false)
  const [soloMias, setSoloMisEvoluciones] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [nuevaEv, setNuevaEv] = useState({ 
    descripcion_procedimiento: '', 
    observaciones: '' 
  })

  // Ref para el editor de texto enriquecido
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => { 
    setMounted(true)
    if (paciente_id) {
      obtenerUsuario()
      fetchEvoluciones()
    }
  }, [paciente_id])

  // Sincronizar el contenido del editor cuando se abre el modal
  useEffect(() => {
    if (modalAbierto && editorRef.current) {
      editorRef.current.innerHTML = nuevaEv.descripcion_procedimiento || '';
    }
  }, [modalAbierto])

  async function obtenerUsuario() {
    const { data: { user } } = await supabase.auth.getUser()
    setSessionUser(user)

    if (user) {
      const { data: profile } = await supabase.from('perfiles').select('nombre_completo, rol, rut').eq('id', user.id).single();
      if (profile) setSessionUserProfile(profile);
    }

    if (user) {
      const { data: profesional, error } = await supabase
        .from('profesionales')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!error && profesional) {
        setEspecialistaId(profesional.id)
      } 
    }
  }

  async function fetchEvoluciones() {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('evoluciones')
        .select(`
          *,
          profesionales:especialista_id ( nombre, apellido )
        `)
        .eq('paciente_id', paciente_id)
        .order('fecha_registro', { ascending: false })
      
      if (!error) setEvoluciones(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setCargando(false)
    }
  }

  // NUEVA FUNCIÓN: Registrar evento en la tabla de auditoría
  const registrarAuditoria = async (accion: string, registroId: string, datosAnteriores: any, datosNuevos: any, detalles: string) => {
    try {
      await supabase.from('auditoria_clinica').insert([{
        usuario_id: sessionUser?.id,
        accion,
        tabla: 'evoluciones',
        detalles,
        paciente_id,
        registro_afectado_id: registroId,
        user_agent: window.navigator.userAgent,
        rut_usuario: sessionUserProfile?.rut || null, // Asume que el rut puede venir del perfil
        nombre_usuario: sessionUserProfile?.nombre_completo || sessionUser?.email || 'Sistema',
        rol_al_momento: sessionUserProfile?.rol || null,
        datos_anteriores: datosAnteriores,
        datos_nuevos: datosNuevos
      }]);
    } catch (error) {
      console.error("No se pudo registrar la auditoría:", error);
    }
  };

  const executeCommand = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    if (editorRef.current) {
        editorRef.current.focus();
        setNuevaEv({ ...nuevaEv, descripcion_procedimiento: editorRef.current.innerHTML });
    }
  };

  const guardarEvolucion = async () => {
    const textoLimpio = nuevaEv.descripcion_procedimiento.replace(/<[^>]*>?/gm, '').trim();
    if (!textoLimpio) return toast.error("La descripción del procedimiento es obligatoria");
    
    setGuardando(true)
    try {
      if (editandoId) {
        // Rescatar evolución antigua para auditoría
        const evAntigua = evoluciones.find(e => e.id === editandoId);
        const datosActualizar = {
          descripcion_procedimiento: nuevaEv.descripcion_procedimiento,
          observaciones: nuevaEv.observaciones,
        };

        const { data, error } = await supabase
          .from('evoluciones')
          .update(datosActualizar)
          .eq('id', editandoId)
          .select() // <-- Agregado para confirmar ejecución
        if (error) throw error

        // AUDITORÍA: Actualización
        await registrarAuditoria(
          'ACTUALIZAR_EVOLUCION',
          editandoId,
          { 
            descripcion_procedimiento: evAntigua?.descripcion_procedimiento, 
            observaciones: evAntigua?.observaciones 
          },
          datosActualizar,
          'Se editó el texto y/o las observaciones de la evolución clínica'
        );

      } else {
        const insertData: any = { 
          paciente_id,
          descripcion_procedimiento: nuevaEv.descripcion_procedimiento,
          observaciones: nuevaEv.observaciones,
          especialista_id: especialistaId,
          estado: 'activa',
          creado_por: sessionUser?.id
        };

        if (!especialistaId) {
          const creatorName = sessionUserProfile?.nombre_completo || sessionUser?.email || 'Usuario del Sistema';
          insertData.descripcion_procedimiento = `<p><strong>[REGISTRADO POR: ${creatorName}]</strong></p><br/>${nuevaEv.descripcion_procedimiento}`;
        }

        // Se agrega .select() para obtener el ID generado y poder auditarlo
        const { data, error } = await supabase.from('evoluciones').insert([insertData]).select();
        if (error) throw error
        
        // AUDITORÍA: Creación
        if (data && data.length > 0) {
          await registrarAuditoria(
            'CREAR_EVOLUCION',
            data[0].id,
            null,
            insertData,
            'Se registró una nueva evolución clínica'
          );
        }
      }
      
      toast.success(editandoId ? "Registro actualizado" : "Atención registrada")
      cerrarModal()
      fetchEvoluciones()
    } catch (e: any) {
      toast.error("Error: " + e.message);
    } finally {
      setGuardando(false)
    }
  }

  const anularEvolucion = async (evId: string, estadoActual: string) => {
    const nuevoEstado = estadoActual === 'anulada' ? 'activa' : 'anulada';
    const confirmar = window.confirm(`¿Seguro que desea ${nuevoEstado === 'anulada' ? 'anular' : 'restaurar'} este registro?`);
    
    if (confirmar) {
      const evolucionesOriginales = [...evoluciones];
      setEvoluciones(prev => prev.map(ev => ev.id === evId ? { ...ev, estado: nuevoEstado } : ev));

      const { data, error } = await supabase
        .from('evoluciones')
        .update({ estado: nuevoEstado })
        .eq('id', evId)
        .select();
      
      if (error || data?.length === 0) {
        toast.error("Error al anular. Es posible que no tengas permisos.");
        setEvoluciones(evolucionesOriginales);
      } else { 
        toast.success(`Registro marcado como '${nuevoEstado}'.`); 
        
        // AUDITORÍA: Cambio de Estado
        await registrarAuditoria(
          nuevoEstado === 'anulada' ? 'ANULAR_EVOLUCION' : 'RESTAURAR_EVOLUCION',
          evId,
          { estado: estadoActual },
          { estado: nuevoEstado },
          `El registro cambió su estado a ${nuevoEstado}`
        );
      }
    }
  }

  // === El resto del código de renderizado (UI / Modal) se mantiene igual === 
  
  const imprimirEvolucion = (ev: any) => {
    // [código de imprimirEvolucion original...]
    const prof = ev.profesionales;
    const creador = ev.creador_nombre;
    const descripcion = ev.descripcion_limpia;
    const responsable = prof ? `Dr/a. ${prof.nombre} ${prof.apellido}` : creador || 'Sistema';

    const isHtml = /<[a-z][\s\S]*>/i.test(descripcion);
    const contenidoImprimir = isHtml ? descripcion : descripcion.replace(/\n/g, '<br/>');

    const ventanaImpresion = window.open('', '_blank');
    if (!ventanaImpresion) return;
    const fecha = new Date(ev.fecha_registro).toLocaleString('es-CL');
    ventanaImpresion.document.write(`
      <html>
        <head>
          <style>
            body { font-family: sans-serif; padding: 40px; } 
            .header { border-bottom: 2px solid #000; margin-bottom: 20px;}
            b, strong { font-weight: 800; color: #000; }
            u { text-decoration: underline; }
            span[style*="background-color"] { background-color: #fef08a !important; padding: 0 4px; }
            ul { padding-left: 20px; }
          </style>
        </head>
        <body>
          <div class="header"><h2>EVOLUCIÓN CLÍNICA</h2></div>
          <p><strong>Fecha:</strong> ${fecha}</p>
          <p><strong>Responsable:</strong> ${responsable}</p>
          <hr/>
          <div style="margin-top: 20px; line-height: 1.6;">${contenidoImprimir}</div>
        </body>
      </html>
    `);
    ventanaImpresion.document.close();
    setTimeout(() => {
        ventanaImpresion.print();
    }, 250);
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setEditandoId(null)
    setNuevaEv({ descripcion_procedimiento: '', observaciones: '' })
  }

  const evolucionesProcesadas = evoluciones.map(ev => {
    let creadorNombre: string | null = null;
    let descripcionLimpia = ev.descripcion_procedimiento;

    if (!ev.profesionales) {
        const match = ev.descripcion_procedimiento?.match(/\[REGISTRADO POR: (.*?)\]/);
        if (match && match[1]) {
            creadorNombre = match[1];
            descripcionLimpia = ev.descripcion_procedimiento
               .replace(/<p><strong>\[REGISTRADO POR: .*?\]<\/strong><\/p><br\/>/, '')
               .replace(/^\[REGISTRADO POR: .*?\]\n\n/, '');
        }
    }
    return { ...ev, creador_nombre: creadorNombre, descripcion_limpia: descripcionLimpia };
  });

  const evolucionesFiltradas = evolucionesProcesadas.filter(ev => {
    const cumpleEstado = verAnuladas ? ev.estado === 'anulada' : ev.estado === 'activa';
    
    let cumpleAutor = true;
    if (soloMias) {
      if (especialistaId) {
        cumpleAutor = ev.especialista_id === especialistaId;
      } else if (sessionUserProfile?.nombre_completo) {
        cumpleAutor = !ev.especialista_id && ev.creador_nombre === sessionUserProfile.nombre_completo;
      } else {
        cumpleAutor = false;
      }
    }

    return cumpleEstado && cumpleAutor;
  });

  return (
    // [Se mantiene todo el código JSX original del componente sin alteraciones]
    <div className="max-w-4xl mx-auto space-y-8 p-4 text-left min-h-screen pb-20">
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 bg-white/90 backdrop-blur-xl p-8 rounded-[2.5rem] shadow-xl border border-white/60 relative overflow-hidden text-left">
        <div className="flex items-center gap-4 relative z-10 text-left">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-4 rounded-[1.5rem] text-white shadow-xl shadow-blue-600/20">
            <Clipboard size={24} strokeWidth={2.5} />
          </div>
          <div className="text-left">
            <h2 className="text-2xl font-black text-slate-800 uppercase italic leading-none text-left">Ficha de Evoluciones</h2>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1 text-left">Historial y Procedimientos Clínicos</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <div className="bg-slate-100/80 backdrop-blur-md p-1.5 rounded-2xl flex items-center gap-1 border border-slate-200/80 shadow-sm">
            <button onClick={() => setVerAnuladas(false)} className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all ${!verAnuladas ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              Activas ({evoluciones.filter(e => e.estado === 'activa').length})
            </button>
            <button onClick={() => setVerAnuladas(true)} className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all ${verAnuladas ? 'bg-white text-red-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              Anuladas ({evoluciones.filter(e => e.estado === 'anulada').length})
            </button>
          </div>

          <div className="bg-slate-100/80 backdrop-blur-md p-1.5 rounded-2xl flex items-center gap-1 border border-slate-200/80 shadow-sm">
            <button onClick={() => setSoloMisEvoluciones(!soloMias)} className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all flex items-center gap-2 ${soloMias ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <User size={12}/> Mis Registros
            </button>
          </div>

          <button onClick={() => { setEditandoId(null); setNuevaEv({ descripcion_procedimiento: '', observaciones: '' }); setModalAbierto(true); }} className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-95 transition-all flex items-center gap-2 border border-blue-500">
            <Plus size={16} strokeWidth={3}/> Registrar
          </button>
        </div>
      </div>

      {/* LISTADO DE EVOLUCIONES */}
      <div className="space-y-6 text-left">
        <AnimatePresence mode='popLayout'>
          {cargando ? (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
              <Loader2 className="animate-spin text-blue-600" size={40} />
              <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest animate-pulse text-center">Cargando Evoluciones...</p>
            </div>
          ) : evolucionesFiltradas.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 text-center flex flex-col items-center gap-4 bg-white/90 backdrop-blur-xl rounded-[3rem] shadow-xl border border-white/60">
              <Clipboard className="text-slate-300" size={48} />
              <p className="text-slate-400 font-black uppercase text-xs italic tracking-widest text-center">No hay registros de actividad todavía</p>
            </motion.div>
          ) : (
            evolucionesFiltradas.map((ev) => {
              const prof = ev.profesionales as any;
              const creador = ev.creador_nombre;
              const esAdmin = sessionUserProfile?.rol === 'ADMIN';
              const esCreadorOriginal = ev.creado_por === sessionUser?.id;
              const puedeModificar = true;
              const isHtml = /<[a-z][\s\S]*>/i.test(ev.descripcion_limpia);
              
              return (
                <motion.div 
                  layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={ev.id} 
                  className={`bg-white/90 backdrop-blur-xl p-7 rounded-[2.5rem] shadow-xl border border-white/60 hover:shadow-2xl transition-all group relative overflow-hidden text-left ${ev.estado === 'anulada' ? 'opacity-60 bg-slate-50' : ''}`}
                >
                  <div className="flex justify-between items-start mb-5 relative z-10 text-left">
                    <div className="flex items-center gap-4 text-left">
                      <div className={`p-3 rounded-2xl shadow-sm ${ev.estado === 'anulada' ? 'bg-slate-200 text-slate-500' : 'bg-blue-50 text-blue-600'}`}>
                        <Stethoscope size={24}/>
                      </div>
                      <div className="text-left">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight text-left">
                          Atención Clínica {ev.estado === 'anulada' && '- ANULADA'}
                        </h4>
                        <div className="flex items-center gap-2 text-[9px] text-slate-400 font-bold uppercase mt-1 text-left">
                          <Calendar size={12}/> {new Date(ev.fecha_registro).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}
                          <span className="mx-1">•</span>
                          <Clock size={12}/> {new Date(ev.fecha_registro).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} hrs
                        </div>
                      </div>
                    </div>
                    
                    {/* BOTONES DE ACCIÓN */}
                    <div className="flex gap-2 relative z-20 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => imprimirEvolucion(ev)} className="p-2.5 bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all shadow-sm"><Printer size={16}/></button>
                      {puedeModificar && ev.estado !== 'anulada' && (
                        <button onClick={() => { setEditandoId(ev.id); setNuevaEv({ descripcion_procedimiento: ev.descripcion_procedimiento, observaciones: ev.observaciones }); setModalAbierto(true); }} className="p-2.5 bg-slate-100 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all shadow-sm"><Edit3 size={16}/></button>
                      )}
                      {puedeModificar && (
                        <button onClick={() => anularEvolucion(ev.id, ev.estado)} className={`p-2.5 bg-slate-100 rounded-xl transition-all shadow-sm ${ev.estado === 'anulada' ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-500 hover:text-red-600 hover:bg-red-50'}`}>
                          {ev.estado === 'anulada' ? <Plus size={16}/> : <EyeOff size={16}/>}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className={`bg-slate-50/80 p-6 rounded-3xl border ${ev.estado === 'anulada' ? 'border-slate-200' : 'border-slate-200/60'} relative z-10 text-left shadow-inner`}>
                    
                    {/* RENDERIZADO SEGURO DE HTML O TEXTO PLANO */}
                    <div 
                        className={`text-xs text-slate-700 font-medium leading-relaxed text-left rich-text-content ${!isHtml ? 'whitespace-pre-wrap italic' : ''}`}
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ev.descripcion_limpia || '') }}
                    />

                    {ev.observaciones && puedeModificar && (
                      <div className="mt-4 pt-4 border-t border-slate-200/60">
                        <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest block mb-1">Notas Internas:</span>
                        <p className="text-xs text-slate-500 italic">{ev.observaciones}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-right flex flex-col items-end shrink-0 mt-5 relative z-10">
                    <span className="text-[7px] font-black text-slate-300 uppercase tracking-[0.2em] block mb-1">Responsable Clínico</span>
                    <div className="flex items-center gap-2 bg-slate-100 px-3.5 py-1.5 rounded-full border border-slate-200/60">
                        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[8px] text-white font-black uppercase shadow-sm">
                          {prof?.nombre?.[0] || creador?.split(' ').map((n: string) => n[0]).join('') || 'S'}
                        </div>
                        <span className="text-[9px] font-black text-slate-700 uppercase italic">
                          {prof ? `Dr/a. ${prof.nombre} ${prof.apellido}` : creador || 'Sistema'}
                        </span>
                    </div>
                  </div>

                  {/* ICONO DE FONDO FLOTANTE */}
                  <div className="absolute -bottom-6 -right-6 opacity-[0.03] rotate-12 group-hover:rotate-0 transition-transform duration-700 pointer-events-none text-slate-900">
                      <Stethoscope size={150} />
                  </div>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>

      {/* MODAL CON PORTAL, DISEÑO GLASSMORPHISM Y EDITOR ENRIQUECIDO */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {modalAbierto && (
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto" style={{ zIndex: 999999 }}>
              <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={cerrarModal} className="fixed inset-0 bg-slate-950/40 backdrop-blur-md" />
              <motion.div 
                initial={{ scale: 0.95, y: 15, opacity: 0 }} 
                animate={{ scale: 1, y: 0, opacity: 1 }} 
                exit={{ scale: 0.95, y: 15, opacity: 0 }} 
                className="bg-white/95 backdrop-blur-2xl w-full max-w-2xl rounded-[3rem] p-8 md:p-12 shadow-2xl relative z-[1000] border border-white/80 my-8 text-slate-900"
              >
                <button onClick={cerrarModal} className="absolute top-8 right-8 p-3 bg-slate-100 rounded-2xl text-slate-400 hover:text-red-500 transition-all shadow-sm"><X size={20}/></button>
                
                <div className="flex items-center gap-4 mb-8 text-left">
                  <div className={`p-4 rounded-2xl shadow-sm ${editandoId ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                    {editandoId ? <Edit3 size={28}/> : <Clipboard size={28}/>}
                  </div>
                  <div className="text-left">
                    <h2 className="text-2xl font-black uppercase italic text-slate-800 leading-none">
                      {editandoId ? "Editar Registro" : "Nueva Evolución"}
                    </h2>
                    <p className="text-slate-400 text-[10px] font-black uppercase mt-2 tracking-[0.2em]">Ficha Clínica Digital</p>
                  </div>
                </div>
                
                <div className="space-y-6 text-left">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1">Detalle del Procedimiento *</label>
                    
                    {/* CONTENEDOR DEL EDITOR ENRIQUECIDO */}
                    <div className="border border-slate-200 rounded-[1.5rem] overflow-hidden bg-white shadow-sm flex flex-col focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                        
                        {/* Toolbar de herramientas */}
                        <div className="flex flex-wrap items-center gap-1.5 p-2.5 border-b border-slate-100 bg-slate-50">
                            <button type="button" onClick={(e) => { e.preventDefault(); executeCommand('bold'); }} className="p-2 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors" title="Negrita">
                                <Bold size={16}/>
                            </button>
                            <button type="button" onClick={(e) => { e.preventDefault(); executeCommand('italic'); }} className="p-2 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors" title="Cursiva">
                                <Italic size={16}/>
                            </button>
                            <button type="button" onClick={(e) => { e.preventDefault(); executeCommand('underline'); }} className="p-2 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors" title="Subrayado">
                                <Underline size={16}/>
                            </button>
                            <div className="w-px h-5 bg-slate-300 mx-1"></div>
                            <button type="button" onClick={(e) => { e.preventDefault(); executeCommand('insertUnorderedList'); }} className="p-2 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors" title="Viñetas">
                                <List size={16}/>
                            </button>
                            <div className="w-px h-5 bg-slate-300 mx-1"></div>
                            <button type="button" onClick={(e) => { e.preventDefault(); executeCommand('backColor', '#fef08a'); }} className="p-2 hover:bg-yellow-100 rounded-lg text-yellow-600 transition-colors" title="Destacar amarillo">
                                <Highlighter size={16}/>
                            </button>
                            <button type="button" onClick={(e) => { e.preventDefault(); executeCommand('removeFormat'); }} className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors" title="Limpiar formato">
                                <Eraser size={16}/>
                            </button>
                        </div>

                        {/* Área Content Editable */}
                        <div 
                            ref={editorRef}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={(e) => setNuevaEv({...nuevaEv, descripcion_procedimiento: e.currentTarget.innerHTML})}
                            className="w-full min-h-[12rem] max-h-[20rem] p-5 text-[14px] outline-none text-slate-700 bg-white custom-scrollbar rich-text-content overflow-y-auto"
                        />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1">Notas Internas (Opcional)</label>
                    <input 
                      type="text" 
                      className="w-full p-5 bg-slate-50/80 hover:bg-white focus:bg-white rounded-2xl font-medium text-slate-700 outline-none border border-slate-200/60 focus:border-blue-500/50 focus:ring-4 ring-blue-500/10 shadow-inner text-sm placeholder:text-slate-300" 
                      value={nuevaEv.observaciones} 
                      onChange={(e) => setNuevaEv({...nuevaEv, observaciones: e.target.value})} 
                      placeholder="Solo visibles para ti..."
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button onClick={cerrarModal} className="flex-1 bg-slate-100 text-slate-600 py-5 rounded-2xl font-black text-xs uppercase hover:bg-slate-200 transition-all shadow-sm">Cancelar</button>
                    <button 
                      onClick={guardarEvolucion} 
                      disabled={guardando || !nuevaEv.descripcion_procedimiento.replace(/<[^>]*>?/gm, '').trim()}
                      className={`flex-[2.5] py-5 rounded-2xl font-black text-sm uppercase tracking-[0.15em] shadow-xl transition-all flex items-center justify-center gap-2.5 text-white border disabled:opacity-50 ${editandoId ? 'bg-amber-500 hover:bg-amber-600 border-amber-400 shadow-amber-500/20' : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:shadow-blue-500/40 border-blue-500 shadow-blue-500/25'}`}
                    >
                      {guardando ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} strokeWidth={2.5}/>} 
                      {editandoId ? "Actualizar" : "Guardar Registro"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ESTILOS GLOBALES DEL EDITOR ENRIQUECIDO */}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        
        .rich-text-content b, .rich-text-content strong { font-weight: 800 !important; color: #0f172a; }
        .rich-text-content i, .rich-text-content em { font-style: italic !important; }
        .rich-text-content u { text-decoration: underline !important; text-underline-offset: 2px; }
        .rich-text-content span[style*="background-color"] { padding: 0 4px; border-radius: 4px; color: #854d0e; font-weight: 600; }
        .rich-text-content ul { list-style-type: disc !important; padding-left: 1.5rem !important; margin-top: 0.5rem; margin-bottom: 0.5rem; }
        .rich-text-content { line-height: 1.6; }
        
        /* Placeholder para el div contenteditable vacío */
        .rich-text-content[contenteditable]:empty:before {
            content: "Escriba aquí los detalles del procedimiento...";
            color: #cbd5e1;
            pointer-events: none;
            display: block;
        }
      `}}></style>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  Pill, Plus, Loader2, Save, ClipboardList, ArrowLeft, Printer, Edit, Trash2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

export default function RecetasPage() {
  const { id: paciente_id } = useParams()
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [sessionUserProfile, setSessionUserProfile] = useState<any>(null)
  
  const [recetas, setRecetas] = useState<any[]>([])
  const [planes, setPlanes] = useState<any[]>([])
  const [profesionales, setProfesionales] = useState<any[]>([])
  const [paciente, setPaciente] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  
  const [showForm, setShowForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [recetaSeleccionada, setRecetaSeleccionada] = useState<any>(null)
  const [formData, setFormData] = useState({ id: '', presupuesto_id: '', indicaciones: '', profesional_id: '' })

  useEffect(() => {
    const initSession = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setSessionUserId(user.id);
            const { data: profile } = await supabase.from('perfiles').select('nombre_completo, rol, rut').eq('id', user.id).single();
            if (profile) setSessionUserProfile(profile);
        }
    };
    initSession();

    if (paciente_id) {
      fetchData()
      fetchPaciente()
    }
  }, [paciente_id])

  // FUNCIÓN CENTRAL DE AUDITORÍA
  const registrarAuditoria = async (accion: string, registroId: string | null, datosAnteriores: any, datosNuevos: any, detalles: string) => {
    if (!sessionUserId) return;
    try {
      await supabase.from('auditoria_clinica').insert([{
        usuario_id: sessionUserId,
        accion,
        tabla: 'recetas',
        detalles,
        paciente_id: paciente_id,
        registro_afectado_id: registroId,
        user_agent: window.navigator.userAgent,
        rut_usuario: sessionUserProfile?.rut || null,
        nombre_usuario: sessionUserProfile?.nombre_completo || 'Sistema',
        rol_al_momento: sessionUserProfile?.rol || null,
        datos_anteriores: datosAnteriores,
        datos_nuevos: datosNuevos
      }]);
    } catch (error) {
      console.error("No se pudo registrar la auditoría:", error);
    }
  };

  async function fetchPaciente() {
    const { data } = await supabase.from('pacientes').select('*').eq('id', paciente_id).maybeSingle()
    if (data) setPaciente(data)
  }

  async function fetchData() {
    try {
      const [recsRes, tratsRes] = await Promise.all([
        supabase.from('recetas').select('*, presupuestos(nombre_tratamiento)').eq('paciente_id', paciente_id).order('fecha_emision', { ascending: false }),
        supabase.from('presupuestos').select('id, nombre_tratamiento').eq('paciente_id', paciente_id)
      ]);

      if (recsRes.error) throw recsRes.error;

      const { data: profs } = await supabase
        .from('profesionales')
        .select(`
          user_id,
          nombre,
          apellido,
          firma_base64,
          especialidades ( nombre )
        `);

      const { data: perfiles } = await supabase.from('perfiles').select('id, rut');

      // CORRECCIÓN 1: Manejo de arreglo en la lista de profesionales para el selector
      const listaProfesionales = (profs || []).map((p: any) => {
        const esp = Array.isArray(p.especialidades) ? p.especialidades[0] : p.especialidades;
        
        return {
          user_id: p.user_id,
          nombre_completo: `Dr/a. ${p.nombre} ${p.apellido}`,
          especialidad: esp?.nombre || 'Dentista'
        };
      });
      setProfesionales(listaProfesionales);

      // CORRECCIÓN 2: Manejo de arreglo al armar la tarjeta de las recetas
      const recetasCompletas = (recsRes.data || []).map((receta: any) => {
        const prof = profs?.find((p: any) => p.user_id === receta.profesional_id) as any;
        const perf = perfiles?.find((p: any) => p.id === receta.profesional_id) as any;
        
        const esp = Array.isArray(prof?.especialidades) ? prof.especialidades[0] : prof?.especialidades;
        
        return {
          ...receta,
          profesional_data: {
            nombre: prof?.nombre || 'Especialista',
            apellido: prof?.apellido || '',
            rut: perf?.rut || '---',
            especialidad_nombre: esp?.nombre || 'Dentista',
            firma_base64: prof?.firma_base64 || null
          }
        };
      });

      setRecetas(recetasCompletas);
      setPlanes(tratsRes.data || []);
    } catch (error: any) {
      console.error("Error cargando datos:", error.message);
    } finally {
      setCargando(false)
    }
  }

  const calcularEdad = (fechaNac: string) => {
    if (!fechaNac) return "---";
    const hoy = new Date();
    const cumple = new Date(fechaNac);
    let edad = hoy.getFullYear() - cumple.getFullYear();
    const m = hoy.getMonth() - cumple.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < cumple.getDate())) edad--;
    return `${edad} años`;
  }

  const iniciarCreacion = () => {
    setFormData({ id: '', presupuesto_id: '', indicaciones: '', profesional_id: '' });
    setRecetaSeleccionada(null);
    setShowForm(true);
  }

  const iniciarEdicion = () => {
    if (!recetaSeleccionada) return;
    setFormData({ 
      id: recetaSeleccionada.id, 
      presupuesto_id: recetaSeleccionada.presupuesto_id || '', 
      indicaciones: recetaSeleccionada.indicaciones || '', 
      profesional_id: recetaSeleccionada.profesional_id || '' 
    });
    setShowForm(true);
  }

  const volver = () => {
    if (showForm && recetaSeleccionada) {
      setShowForm(false);
    } else {
      setShowForm(false);
      setRecetaSeleccionada(null);
    }
  }

  const guardarReceta = async () => {
    if (!formData.profesional_id) return toast.error("Seleccione un especialista a cargo");
    if (!formData.indicaciones.trim()) return toast.error("Escriba las indicaciones");
    
    setGuardando(true);
    try {
      const payload = {
          presupuesto_id: formData.presupuesto_id || null,
          indicaciones: formData.indicaciones.trim(),
          profesional_id: formData.profesional_id
      };

      if (formData.id) {
        const { error, data } = await supabase.from('recetas').update(payload).eq('id', formData.id).select().single();
        if (error) throw error;
        
        // AUDITORÍA: ACTUALIZACIÓN
        await registrarAuditoria(
            'ACTUALIZAR_RECETA', 
            formData.id,
            { indicaciones: recetaSeleccionada?.indicaciones, profesional_id: recetaSeleccionada?.profesional_id },
            payload,
            `Editó la receta (ID: ${formData.id}) del paciente ${paciente?.nombre} ${paciente?.apellido}`
        );
        toast.success("Receta actualizada");
      } else {
        const fullPayload = {
          ...payload,
          paciente_id: paciente_id,
          medicamentos: "Rp."
        };

        const { data, error } = await supabase.from('recetas').insert([fullPayload]).select('id').single();
        if (error) throw error;

        // AUDITORÍA: CREACIÓN
        await registrarAuditoria(
            'CREAR_RECETA', 
            data?.id,
            null,
            fullPayload,
            `Creó una nueva receta médica para el paciente ${paciente?.nombre} ${paciente?.apellido}`
        );
        toast.success("Receta creada exitosamente");
      }
      
      setFormData({ id: '', presupuesto_id: '', indicaciones: '', profesional_id: '' });
      setShowForm(false);
      fetchData();
    } catch (error: any) {
      toast.error("Error: " + error.message);
    } finally {
      setGuardando(false);
    }
  }

  const eliminarReceta = async () => {
    if (!recetaSeleccionada) return;
    const confirmacion = window.confirm("¿Está seguro de que desea eliminar esta receta? Esta acción no se puede deshacer.");
    if (!confirmacion) return;

    try {
      const { error } = await supabase.from('recetas').delete().eq('id', recetaSeleccionada.id);
      if (error) throw error;

      // AUDITORÍA: ELIMINACIÓN
      await registrarAuditoria(
          'ELIMINAR_RECETA', 
          recetaSeleccionada.id,
          { indicaciones: recetaSeleccionada.indicaciones },
          null,
          `Eliminó la receta médica del ${new Date(recetaSeleccionada.fecha_emision).toLocaleDateString('es-CL')} del paciente ${paciente?.nombre} ${paciente?.apellido}`
      );

      toast.success("Receta eliminada correctamente");
      setRecetaSeleccionada(null);
      setShowForm(false);
      fetchData();
    } catch (e) {
      toast.error("Ocurrió un error al intentar eliminar la receta");
    }
  }

  const handlePrint = () => {
    const elementoOriginal = document.getElementById('hoja-impresion');
    if (!elementoOriginal) return toast.error("No hay documento para imprimir");

    const styles = Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(el => el.outerHTML)
      .join('');

    const contenido = elementoOriginal.outerHTML;
    const ventanaPoderosa = window.open('', '_blank');
    if (!ventanaPoderosa) return toast.error("Por favor permite los pop-ups");

    ventanaPoderosa.document.write(`
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <title>Receta - ${paciente?.nombre} ${paciente?.apellido}</title>
          ${styles}
          <style>
            @page { 
              size: A4;
              margin: 0; 
            }
            body {
              background-color: white !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            #hoja-impresion {
              width: 210mm !important;
              height: 297mm !important;
              margin: 0 !important;
              padding: 1.5cm !important;
              box-sizing: border-box !important;
              box-shadow: none !important;
              border: none !important;
            }
          </style>
        </head>
        <body>
          ${contenido}
          <script>
            window.onload = function() {
              setTimeout(() => { 
                window.print(); 
                window.close(); 
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    ventanaPoderosa.document.close();
  };

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4">
      <Loader2 className="animate-spin text-blue-600" size={45} />
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Generando Recetario...</p>
    </div>
  )

  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-10 font-sans text-left pb-24 print:bg-white print:p-0 print:m-0 print:block" style={{ backgroundImage: "url('/fondo-pacientes.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      
      {/* HEADER PRINCIPAL */}
      <header className="bg-white/90 backdrop-blur-xl p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border border-white/60 flex flex-col md:flex-row justify-between items-start md:items-center text-left print:hidden mb-6 md:mb-8 gap-5 md:gap-0">
        <div className="flex items-center gap-3 md:gap-4 text-left w-full md:w-auto">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-3 md:p-4 rounded-[1rem] md:rounded-[1.5rem] text-white shadow-xl shadow-blue-600/20">
            <Pill size={20} className="md:w-6 md:h-6" strokeWidth={2.5} />
          </div>
          <div className="text-left flex-1">
            <h3 className="text-xl md:text-2xl font-black text-slate-800 uppercase italic tracking-tight leading-none text-left">Recetario Maestro</h3>
            <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 text-left line-clamp-1">
              Paciente: {paciente?.nombre} {paciente?.apellido}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 md:gap-3 w-full md:w-auto">
          {/* Botones al ver una receta */}
          {recetaSeleccionada && !showForm && (
            <>
              <button onClick={handlePrint} className="bg-white border border-slate-200 text-slate-700 px-4 py-3 md:px-5 md:py-3.5 rounded-[1rem] md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase shadow-sm flex items-center gap-2 hover:bg-slate-50 transition-all flex-1 md:flex-none justify-center">
                <Printer size={14}/> <span className="hidden sm:inline">Imprimir</span>
              </button>
              <button onClick={iniciarEdicion} className="bg-amber-500 text-white px-4 py-3 md:px-5 md:py-3.5 rounded-[1rem] md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase shadow-md flex items-center gap-2 hover:bg-amber-600 transition-all border border-amber-600 flex-1 md:flex-none justify-center">
                <Edit size={14}/> <span className="hidden sm:inline">Editar</span>
              </button>
              <button onClick={eliminarReceta} className="bg-red-50 text-red-600 px-4 py-3 md:px-5 md:py-3.5 rounded-[1rem] md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase shadow-sm flex items-center gap-2 hover:bg-red-100 transition-all border border-red-200 flex-1 md:flex-none justify-center">
                <Trash2 size={14}/> <span className="hidden sm:inline">Eliminar</span>
              </button>
            </>
          )}

          {/* Botón Volver */}
          {(showForm || recetaSeleccionada) && (
            <button onClick={volver} className="bg-slate-100 text-slate-600 px-5 py-3 md:px-6 md:py-3.5 rounded-[1rem] md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase flex items-center gap-2 hover:bg-slate-200 transition-all shadow-sm border border-slate-200 w-full sm:w-auto justify-center">
              <ArrowLeft size={14}/> Volver
            </button>
          )}

          {/* Botón Nueva Receta */}
          {!showForm && !recetaSeleccionada && (
            <button onClick={iniciarCreacion} className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-3 md:px-7 md:py-3.5 rounded-[1rem] md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-95 transition-all border border-blue-500 flex items-center justify-center gap-2 w-full md:w-auto">
              <Plus size={14} strokeWidth={3}/> Nueva Receta
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-8 items-start text-left print:block print:w-full print:m-0">
        
        {/* HISTORIAL LATERAL */}
        <aside className={`lg:col-span-1 space-y-4 text-left print:hidden ${ (showForm || recetaSeleccionada) ? 'hidden lg:block' : 'block' }`}>
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 italic text-left">Historial de Recetas</h4>
          <div className="space-y-3 max-h-[60vh] lg:max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar text-left">
            {recetas.map(r => (
              <div key={r.id} onClick={() => { setRecetaSeleccionada(r); setShowForm(false); }}
                className={`p-4 md:p-5 rounded-2xl md:rounded-[2rem] border cursor-pointer transition-all text-left shadow-sm ${recetaSeleccionada?.id === r.id ? 'bg-blue-600 border-blue-600 text-white shadow-xl lg:scale-[1.02]' : 'bg-white/90 backdrop-blur-xl border-white/60 text-slate-700 hover:border-blue-200'}`}
              >
                <div className="flex justify-between items-center mb-1 text-left">
                    <span className="text-[9px] font-black uppercase opacity-75 text-left">
                      {r.fecha_emision ? new Date(r.fecha_emision).toLocaleDateString() : 'S/F'}
                    </span>
                </div>
                <p className="text-[10px] font-bold uppercase truncate text-left">{(r.presupuestos as any)?.nombre_tratamiento || 'Atención General'}</p>
              </div>
            ))}
            {recetas.length === 0 && (
              <div className="p-5 md:p-6 bg-white/50 backdrop-blur-md rounded-2xl md:rounded-[1.5rem] text-center border border-white/40">
                <p className="text-[9px] font-black uppercase text-slate-400">Sin recetas previas</p>
              </div>
            )}
          </div>
        </aside>

        {/* ÁREA PRINCIPAL / FORMULARIO / RECETA */}
        <main className="lg:col-span-3 text-left print:block print:w-full print:m-0">
          <AnimatePresence mode="wait">
            {showForm ? (
              <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-white/90 backdrop-blur-xl p-6 md:p-12 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border border-white/60 text-left print:hidden">
                <h4 className="text-xl md:text-2xl font-black text-slate-800 uppercase italic mb-6 md:mb-8 text-left">
                  {formData.id ? 'Editar Prescripción' : 'Nueva Prescripción'}
                </h4>
                <div className="space-y-5 md:space-y-6 text-left">
                  
                  {/* SELECTOR DE ESPECIALISTA */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block text-left">Especialista Responsable</label>
                    <select className="w-full bg-slate-50/80 hover:bg-white focus:bg-white p-3.5 md:p-4 rounded-[1rem] md:rounded-2xl text-xs md:text-sm font-bold border border-slate-200/60 shadow-sm text-slate-800 outline-none focus:border-blue-500 appearance-none cursor-pointer" value={formData.profesional_id} onChange={(e) => setFormData({...formData, profesional_id: e.target.value})}>
                      <option value="">-- Seleccione Profesional --</option>
                      {profesionales.map(p => <option key={p.user_id} value={p.user_id}>{p.nombre_completo}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5 text-left">
                    <label className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block text-left">Vincular Tratamiento (Opcional)</label>
                    <select className="w-full bg-slate-50/80 hover:bg-white focus:bg-white p-3.5 md:p-4 rounded-[1rem] md:rounded-2xl text-xs md:text-sm font-bold border border-slate-200/60 shadow-sm text-slate-800 outline-none focus:border-blue-500 appearance-none cursor-pointer" value={formData.presupuesto_id} onChange={(e) => setFormData({...formData, presupuesto_id: e.target.value})}>
                      <option value="">Atención General</option>
                      {planes.map(p => <option key={p.id} value={p.id}>{p.nombre_tratamiento}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5 text-left">
                    <label className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block italic text-left">Rp. Indicaciones</label>
                    <textarea rows={8} className="w-full bg-slate-50/80 hover:bg-white focus:bg-white p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] text-xs md:text-sm font-medium border border-slate-200/60 shadow-inner text-slate-800 outline-none focus:ring-4 ring-blue-500/10 leading-relaxed resize-none placeholder:text-slate-300" value={formData.indicaciones} onChange={(e) => setFormData({...formData, indicaciones: e.target.value})} placeholder="Rp. &#10;Medicamento..."/>
                  </div>
                  <button onClick={guardarReceta} disabled={guardando} className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 md:py-5 rounded-[1rem] md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-[0.1em] md:tracking-[0.2em] shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-slate-900 hover:to-slate-900 transition-all border border-blue-500 flex items-center justify-center gap-2">
                    {guardando ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} 
                    {formData.id ? 'Guardar Cambios' : 'Generar Receta'}
                  </button>
                </div>
              </motion.div>
            ) : recetaSeleccionada ? (
              <div className="w-full flex justify-center text-left print:block print:w-full print:m-0">
                
                {/* CONTENEDOR MAESTRO DE LA HOJA */}
                <div 
                  id="hoja-impresion"
                  className="bg-white shadow-xl md:shadow-2xl relative w-full max-w-[210mm] mx-auto flex flex-col justify-between p-6 sm:p-8 md:p-12 min-h-auto md:min-h-[280mm] rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-100 md:border-white/80 print:rounded-none print:border-none print:p-[1.5cm]"
                >
                  
                  <div>
                    {/* ENCABEZADO */}
                    <div className="text-left border-b-2 border-slate-900 pb-4 md:pb-5 mb-5 md:mb-6 flex flex-col sm:flex-row items-center sm:items-start gap-4 md:gap-6">
                      <img 
                          src="https://yqdpmaopnvrgdqbfaiok.supabase.co/storage/v1/object/public/documentos_imagenes/440749454_122171956712064634_7168698893214813270_n.jpg"
                          className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover shrink-0 mix-blend-multiply" 
                          alt="Logo" referrerPolicy="no-referrer" />
                      <div className="flex-1 text-center sm:text-left">
                        <h1 className="text-sm sm:text-base md:text-lg font-black text-slate-900 leading-tight">CENTRO MEDICO Y DENTAL DIGNIDAD SPA</h1>
                        <p className="text-[11px] md:text-[13px] font-black text-slate-800 uppercase mt-1">
                          Dr/a. {recetaSeleccionada.profesional_data?.nombre} {recetaSeleccionada.profesional_data?.apellido}
                        </p>
                        <p className="text-[9px] md:text-[10px] font-bold text-slate-600 uppercase tracking-widest leading-relaxed">
                          {recetaSeleccionada.profesional_data?.especialidad_nombre}
                          {recetaSeleccionada.profesional_data?.rut && ` • RUT: ${recetaSeleccionada.profesional_data.rut}`}
                        </p>
                      </div>
                    </div>

                    <h2 className="text-lg md:text-xl font-black uppercase italic text-center border-y border-slate-100 py-2.5 mb-5 md:mb-6 text-slate-800">Receta Médica</h2>

                    {/* DATOS DEL PACIENTE */}
                    <div className="bg-slate-50 p-4 md:p-5 rounded-2xl mb-5 md:mb-6 border border-slate-100 text-left print:bg-white print:border-slate-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4 sm:gap-x-10 text-left">
                          <div className="text-left"><p className="text-[8px] font-black text-slate-400 uppercase text-left">Nombre Paciente</p><p className="text-[11px] md:text-xs font-bold text-slate-900 uppercase text-left">{paciente?.nombre} {paciente?.apellido}</p></div>
                          <div className="text-left"><p className="text-[8px] font-black text-slate-400 uppercase text-left">RUT</p><p className="text-[11px] md:text-xs font-bold text-slate-900 text-left">{paciente?.rut || '---'}</p></div>
                          <div className="text-left"><p className="text-[8px] font-black text-slate-400 uppercase text-left">Edad</p><p className="text-[11px] md:text-xs font-bold text-slate-900 text-left">{calcularEdad(paciente?.fecha_nacimiento)}</p></div>
                          <div className="text-left"><p className="text-[8px] font-black text-slate-400 uppercase text-left">Sexo</p><p className="text-[11px] md:text-xs font-bold text-slate-900 uppercase text-left">{paciente?.sexo || '---'}</p></div>
                          <div className="sm:col-span-2 text-left"><p className="text-[8px] font-black text-slate-400 uppercase text-left">Fecha Emisión</p><p className="text-[11px] md:text-xs font-bold text-slate-900 text-left">{recetaSeleccionada.fecha_emision ? new Date(recetaSeleccionada.fecha_emision).toLocaleDateString('es-CL') : 'S/F'}</p></div>
                      </div>
                    </div>

                    {/* RP. CUERPO */}
                    <div className="text-left">
                      <h3 className="text-xl md:text-2xl font-black text-slate-900 mb-3 md:mb-4 italic opacity-10 text-left">Rp.</h3>
                      <p className="text-xs md:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-medium pl-4 md:pl-6 border-l-2 border-slate-200 text-left">
                        {recetaSeleccionada.indicaciones}
                      </p>
                    </div>
                  </div>

                  {/* PIE DE PÁGINA */}
                  <div>
                    <div className="pt-10 md:pt-16 flex justify-center md:justify-end">
                      <div className="w-full max-w-[20rem] flex flex-col items-center text-center">
                        <div className="w-full h-16 md:h-20 mb-2 flex items-center justify-center relative">
                          {recetaSeleccionada.profesional_data?.firma_base64 ? (
                            <img
                              src={recetaSeleccionada.profesional_data.firma_base64}
                              alt="Firma Especialista"
                              className="max-h-16 md:max-h-20 w-auto object-contain mix-blend-multiply"
                            />
                          ) : (
                            <div className="text-[8px] text-slate-300 uppercase font-black mb-4 italic">Firma no registrada</div>
                          )}
                        </div>
                        <div className="h-px bg-slate-900 w-full mb-2"/>
                        <p className="text-[11px] md:text-xs font-black uppercase text-slate-900 leading-tight">
                          Dr/a. {recetaSeleccionada.profesional_data?.nombre} {recetaSeleccionada.profesional_data?.apellido}
                        </p>
                        <p className="text-[9px] md:text-[10px] font-bold uppercase text-slate-500">{recetaSeleccionada.profesional_data?.especialidad_nombre}</p>
                        <p className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase mt-1 italic">RUT: {recetaSeleccionada.profesional_data?.rut}</p>
                      </div>
                    </div>
                    
                    <p className="mt-5 md:mt-6 text-center text-[7px] md:text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em] md:tracking-[0.4em]">
                      Venancia Leiva 1871, La Pintana • +569 6646 7641
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[400px] md:h-[600px] flex flex-col items-center justify-center bg-white/90 backdrop-blur-xl rounded-[2rem] md:rounded-[2.5rem] border border-white/60 shadow-xl text-center print:hidden">
                <ClipboardList size={40} className="text-slate-300 mb-4 md:w-12 md:h-12" />
                <p className="text-slate-400 font-black uppercase text-[10px] md:text-xs tracking-widest italic text-center">Seleccione una receta</p>
              </div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}} />
    </div>
  )
}

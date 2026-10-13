'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import {
  FileText, Plus, Printer, Trash2, Loader2, Save, 
  ChevronRight, Type, AlignLeft, Minus, AlignJustify, 
  PenTool, Download, UserCheck, Users, Search, X, ChevronDown
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import DOMPurify from 'isomorphic-dompurify'

export default function DocumentosClinicosPage() {
  const { id: paciente_id } = useParams()
  
  // --- ESTADOS PARA AUDITORÍA SEREMI ---
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [sessionUserRole, setSessionUserRole] = useState<string | null>(null)
  const [perfil, setPerfil] = useState<any>(null)

  const [documentos, setDocumentos] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [pacienteData, setPacienteData] = useState<any>(null)
  const [profesionalesFull, setProfesionalesFull] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  
  const [mostrandoCategorias, setMostrandoCategorias] = useState(false)
  const [showModalEspecialista, setShowModalEspecialista] = useState(false)
  const [isOpenLista, setIsOpenLista] = useState(false)
  const [docSeleccionado, setDocSeleccionado] = useState<any>(null)
  const [busquedaEspecialista, setBusquedaEspecialista] = useState('')
  
  const [bloquesEdicion, setBloquesEdicion] = useState<any[]>([])
  const [tituloEdicion, setTituloEdicion] = useState('')
  const [especialistaSeleccionadoId, setEspecialistaSeleccionadoId] = useState<string>('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true);
    
    // Obtener sesión y perfil para la auditoría SEREMI
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setSessionUserId(session.user.id);
        const { data: profile } = await supabase.from('perfiles').select('rut, nombre_completo, rol').eq('id', session.user.id).single();
        if (profile) {
          setPerfil(profile);
          setSessionUserRole(profile.rol);
        }
      }
    });

    if (paciente_id) {
      fetchDocumentos(); fetchCategorias(); fetchDatosEspecialistas(); fetchPaciente();
    }
  }, [paciente_id])

  // --- FUNCIÓN DE AUDITORÍA ENRIQUECIDA (SEREMI) ---
  const registrarAuditoria = async (accion: string, detalles: string, datos_anteriores: any = null, datos_nuevos: any = null) => {
    if (!sessionUserId || !perfil) return;
    try {
      await supabase.from('auditoria_clinica').insert([{
        usuario_id: sessionUserId,
        rut_usuario: perfil.rut,
        nombre_usuario: perfil.nombre_completo,
        rol_al_momento: perfil.rol,
        paciente_id: paciente_id as string,
        registro_afectado_id: docSeleccionado && docSeleccionado !== 'NUEVO' ? docSeleccionado.id : null,
        accion,
        tabla: 'documentos_clinicos',
        detalles,
        datos_anteriores,
        datos_nuevos,
        user_agent: navigator.userAgent
      }]);
    } catch (e) {
      console.error("Error al registrar auditoría", e);
    }
  }

  async function fetchPaciente() {
    const { data } = await supabase.from('pacientes').select('*').eq('id', paciente_id).single()
    if (data) setPacienteData(data)
  }

  async function fetchDatosEspecialistas() {
    try {
      const { data: profs, error: errProfs } = await supabase
        .from('profesionales')
        .select(`
          user_id, nombre, apellido, firma_base64, activo,
          especialidades ( nombre )
        `)
        .eq('activo', true);

      if (errProfs) throw errProfs;

      const { data: perfiles, error: errPerf } = await supabase.from('perfiles').select('id, rut');
      if (errPerf) throw errPerf;

      const mapeados = (profs || [])
        .filter((prof: any) => prof.user_id)
        .map((prof: any) => {
          const perf = perfiles?.find((p: any) => p.id === prof.user_id);
          return {
            user_id: prof.user_id,
            nombre_completo: `Dr/a. ${prof.nombre} ${prof.apellido}`,
            iniciales: `${(prof.nombre || ' ')[0]}${(prof.apellido || ' ')[0]}`.toUpperCase(),
            especialidad: prof.especialidades?.nombre || 'Especialista',
            rut: perf?.rut || '---',
            firma_base64: prof.firma_base64 || null
          };
        });

      setProfesionalesFull(mapeados as any[]);
    } catch (error) {
      console.error("Error al cargar datos de especialistas:", error);
    }
  }

  async function fetchDocumentos() {
    const { data } = await supabase.from('documentos_clinicos').select('*').eq('paciente_id', paciente_id).order('fecha_creacion', { ascending: false })
    if (data) setDocumentos(data)
    setCargando(false)
  }

  async function fetchCategorias() {
    const { data } = await supabase.from('documentos_plantillas').select('*, documentos_categorias(nombre)')
    if (data) {
      setCategorias(data.map((p: any) => ({ ...p, nombre_display: p.nombre && p.nombre !== 'NUEVO DOCUMENTO CLÍNICO' ? p.nombre : p.documentos_categorias?.nombre })))
    }
  }

  const handleNuevoDocumento = () => {
    setDocSeleccionado(null); 
    if (sessionUserRole === 'DENTISTA' && sessionUserId) {
      setEspecialistaSeleccionadoId(sessionUserId);
      setMostrandoCategorias(true);
    } else {
      setShowModalEspecialista(true);
      setIsOpenLista(false);
    }
  }

  const handlePrint = async (modo: 'imprimir' | 'descargar') => {
    const elementoWeb = document.getElementById('hoja-impresion');
    if (!elementoWeb) return toast.error("No hay contenido", { id: 'no-contenido' });
    
    setGenerandoPdf(true);
    toast.loading("Generando documento...", { id: 'pdf-toast' });
    
    try {
      // REGISTRAR AUDITORÍA DE EXPORTACIÓN (SEREMI)
      await registrarAuditoria('EXPORT / PDF DOCUMENTO CLÍNICO', `Generó vista de impresión/PDF del documento clínico "${tituloEdicion}"`);

      const html2pdf = (await import('html2pdf.js')).default;
      const autor = profesionalesFull.find(p => p.user_id === especialistaSeleccionadoId);
      
      const container = document.createElement('div');
      container.style.padding = '45px'; 
      container.style.color = '#000'; 
      container.style.fontFamily = 'Arial, sans-serif';

      const calcularEdad = (fecha: string) => {
        if (!fecha) return "---";
        const hoy = new Date(); const cumple = new Date(fecha);
        let edad = hoy.getFullYear() - cumple.getFullYear();
        if (hoy.getMonth() < cumple.getMonth() || (hoy.getMonth() === cumple.getMonth() && hoy.getDate() < cumple.getDate())) edad--;
        return `${edad} años`;
      };

      container.innerHTML = `
        <div style="border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end;">
          <div>
            <h2 style="margin: 0; font-size: 13px; font-weight: 900;">CENTRO MEDICO Y DENTAL DIGNIDAD SPA</h2>
            <p style="margin: 2px 0; font-size: 11px;">${autor?.nombre_completo || '---'}, ${autor?.especialidad || 'Especialista'}, RUT ${autor?.rut || ''}</p>
            <p style="margin: 2px 0; font-size: 10px; color: #444;">Fecha emisión: ${new Date().toLocaleDateString()}</p>
          </div>
          <img src="https://yqdpmaopnvrgdqbfaiok.supabase.co/storage/v1/object/public/documentos_imagenes/440749454_122171956712064634_7168698893214813270_n.jpg" style="width: 60px; height: 60px; border-radius: 50%;" />
        </div>

        <h1 style="text-align: center; text-transform: uppercase; font-size: 18px; font-weight: 900; margin: 20px 0;">${tituloEdicion}</h1>
        
        <div style="background-color: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 11px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border: 1px solid #eee;">
          <div><strong>PACIENTE:</strong> ${pacienteData?.nombre || ''} ${pacienteData?.apellido || ''}</div>
          <div><strong>RUT:</strong> ${pacienteData?.rut || '---'}</div>
          <div><strong>NACIMIENTO:</strong> ${pacienteData?.fecha_nacimiento || '---'}</div>
          <div><strong>EDAD:</strong> ${calcularEdad(pacienteData?.fecha_nacimiento)}</div>
        </div>

        ${bloquesEdicion.map(b => {
            if (b.tipo === 'titulo') return `<div style="page-break-inside: avoid; margin-top: 15px;"><h3 style="text-transform: uppercase; border-bottom: 1px solid #000; font-size: 14px; padding-bottom: 4px; margin: 0;">${b.contenido}</h3></div>`;
            if (b.tipo === 'texto') return `<div style="margin-bottom: 12px;"><p style="white-space: pre-wrap; font-size: 13px; line-height: 1.6; text-align: justify; margin: 0; widows: 2; orphans: 2;">${b.contenido}</p></div>`;
            if (b.tipo === 'separador') return `<hr style="border: 0; border-top: 1px solid #000; margin: 15px 0;" />`;
            if (b.tipo === 'input' || b.tipo === 'textarea') return `<div style="page-break-inside: avoid; margin-bottom: 10px; font-size: 13px;"><strong>${b.label}:</strong> ${b.valor_llenado || '---'}</div>`;
            return '';
        }).join('')}
        
        <div style="margin-top: 80px; display: flex; justify-content: space-between; text-align: center; page-break-inside: avoid;">
          <div style="width: 200px;">
            <div style="height: 60px;"></div>
            <div style="border-top: 1.5px solid #000; padding-top: 10px; font-size: 10px; font-weight: bold;">FIRMA PACIENTE</div>
          </div>
          <div style="width: 220px;">
            <div style="height: 60px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 2px;">
                ${autor?.firma_base64 ? `<img src="${autor.firma_base64}" style="max-height: 75px; mix-blend-mode: multiply;" />` : ''}
            </div>
            <div style="border-top: 1.5px solid #000; padding-top: 10px; font-size: 10px;">
                <strong>${autor?.nombre_completo?.toUpperCase() || ''}</strong><br/>
                ${autor?.especialidad?.toUpperCase() || ''}<br/>
                RUT: ${autor?.rut || ''}
            </div>
          </div>
        </div>

        <div style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 10px; text-align: center; font-size: 9px; color: #777;">
          Venancia Leiva 1871, La Pintana, Región Metropolitana | +56966467641 / +56994464662
        </div>
      `;

      const opt: any = { 
        margin: 12, 
        filename: `${tituloEdicion}.pdf`, 
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, 
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: 'legacy' } 
      };

      const pdf = await html2pdf().set(opt).from(container).toPdf().get('pdf');
      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text(`Página ${i} de ${totalPages}`, pdf.internal.pageSize.getWidth() - 25, pdf.internal.pageSize.getHeight() - 8);
      }

      if (modo === 'imprimir') window.open(pdf.output('bloburl'), '_blank'); else pdf.save(opt.filename);
      toast.success("Documento generado", { id: 'pdf-toast' });
    } catch (error) { toast.error("Error al generar PDF", { id: 'pdf-toast' }); } finally { setGenerandoPdf(false); }
  };

  // --- LÓGICA DE GUARDAR NUEVO O ACTUALIZAR ENCARGADO ---
  const guardarDocumentoFinal = async () => {
    if (guardando) return;
    if (!tituloEdicion || !especialistaSeleccionadoId) return toast.error("Faltan datos", { id: 'datos-faltantes' });
    
    setGuardando(true);
    try {
      const especialistaFull = profesionalesFull.find(p => p.user_id === especialistaSeleccionadoId);
      const nombreLlenado = especialistaFull?.nombre_completo;

      if (docSeleccionado === 'NUEVO') {
        const nuevoDoc = {
          paciente_id, 
          especialista_id: especialistaSeleccionadoId, 
          titulo_documento: tituloEdicion, 
          contenido: bloquesEdicion,
          llenado_por: nombreLlenado
        };

        const { data, error } = await supabase.from('documentos_clinicos').insert([nuevoDoc]).select().single();
        if (error) throw error;
        
        // AUDITORÍA SEREMI
        await registrarAuditoria(
          'INSERT / CREAR DOCUMENTO CLÍNICO', 
          `Creó nuevo documento clínico "${tituloEdicion}"`, 
          null, 
          nuevoDoc
        );

        toast.success("Documento Guardado", { id: 'guardado-exito' }); 
        setDocSeleccionado(data); // Cambiamos de 'NUEVO' al documento creado para reflejar que ya existe ID
        setMostrandoCategorias(false); 
      } else {
        // ACTUALIZACIÓN DE ENCARGADO O CONTENIDO EXISTENTE
        const datosAnteriores = { especialista_id: docSeleccionado.especialista_id, llenado_por: docSeleccionado.llenado_por };
        const datosNuevos = { especialista_id: especialistaSeleccionadoId, llenado_por: nombreLlenado };

        const { error } = await supabase.from('documentos_clinicos')
          .update({ especialista_id: especialistaSeleccionadoId, llenado_por: nombreLlenado })
          .eq('id', docSeleccionado.id);
        
        if (error) throw error;

        // AUDITORÍA SEREMI
        await registrarAuditoria(
          'UPDATE / ACTUALIZAR ENCARGADO DOCUMENTO CLÍNICO', 
          `Actualizó el especialista a cargo del documento "${tituloEdicion}" a ${nombreLlenado}`, 
          datosAnteriores, 
          datosNuevos
        );

        toast.success("Encargado actualizado exitosamente");
        setDocSeleccionado({ ...docSeleccionado, especialista_id: especialistaSeleccionadoId, llenado_por: nombreLlenado });
      }
      
      fetchDocumentos();
    } catch (e) { 
      toast.error("Error al guardar", { id: 'error-guardar' }); 
    } finally { 
      setGuardando(false); 
    }
  }

  // --- LÓGICA DE ELIMINAR DOCUMENTO ---
  const eliminarDocumento = async () => {
    if (!docSeleccionado || docSeleccionado === 'NUEVO') return;
    const confirmacion = window.confirm("¿Está seguro de que desea eliminar este documento clínico? Esta acción no se puede deshacer.");
    if (!confirmacion) return;

    try {
      const docAEliminar = docSeleccionado;
      const { error } = await supabase.from('documentos_clinicos').delete().eq('id', docSeleccionado.id);
      if (error) throw error;

      // AUDITORÍA SEREMI
      await registrarAuditoria(
        'DELETE / ELIMINAR DOCUMENTO CLÍNICO', 
        `Eliminó el documento clínico "${docAEliminar.titulo_documento}"`, 
        docAEliminar, 
        null
      );

      toast.success("Documento eliminado correctamente");
      setDocSeleccionado(null);
      fetchDocumentos();
    } catch (e) {
      toast.error("Ocurrió un error al intentar eliminar el documento");
    }
  }

  const agregarBloqueManual = (tipo: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setBloquesEdicion(prev => [...prev, { id, tipo, label: 'ETIQUETA', contenido: '', valor_llenado: '' }]);
  }

  const seleccionarPlantilla = (plantilla: any) => {
    setTituloEdicion((plantilla.nombre_display || "DOCUMENTO CLÍNICO").toUpperCase());
    setBloquesEdicion(typeof plantilla.contenido === 'string' ? JSON.parse(plantilla.contenido) : plantilla.contenido);
    setDocSeleccionado('NUEVO'); setMostrandoCategorias(false);
  }

  const seleccionarDocumentoGuardado = async (doc: any) => {
    if (docSeleccionado?.id === doc.id) { setDocSeleccionado(null); return; }
    setDocSeleccionado(doc); setTituloEdicion(doc.titulo_documento);
    setBloquesEdicion(typeof doc.contenido === 'string' ? JSON.parse(doc.contenido) : doc.contenido);
    setEspecialistaSeleccionadoId(doc.especialista_id); setMostrandoCategorias(false);

    // AUDITORÍA SEREMI: Registrar visualización de documento existente
    if (sessionUserId && perfil) {
      try {
        await supabase.from('auditoria_clinica').insert([{
          usuario_id: sessionUserId,
          rut_usuario: perfil.rut,
          nombre_usuario: perfil.nombre_completo,
          rol_al_momento: perfil.rol,
          paciente_id: paciente_id as string,
          registro_afectado_id: doc.id,
          accion: 'SELECT / VER DOCUMENTO CLÍNICO',
          tabla: 'documentos_clinicos',
          detalles: `Visualizó el documento clínico "${doc.titulo_documento}"`,
          user_agent: navigator.userAgent
        }]);
      } catch (err) {
        console.error("Error al registrar auditoría de lectura", err);
      }
    }
  }

  if (cargando) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600" size={40} /></div>

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-10 pb-20 space-y-8 min-h-screen text-left relative font-sans text-slate-900" style={{ backgroundImage: "url('/fondo-pacientes.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      
      {/* HEADER PRINCIPAL */}
      <header className="bg-white/90 backdrop-blur-xl p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-white/60 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-4 rounded-[1.5rem] text-white shadow-xl shadow-blue-600/20">
            <FileText size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-2xl font-black uppercase italic leading-none text-slate-800">Documentos Clínicos</h3>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Certificados y Registros Médicos</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {docSeleccionado && (
            <>
              <button onClick={() => handlePrint('imprimir')} disabled={generandoPdf} className="px-5 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-black text-[10px] uppercase shadow-sm hover:bg-slate-50 flex items-center gap-2 transition-all">
                {generandoPdf ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} 
                {generandoPdf ? 'Preparando...' : 'Imprimir'}
              </button>
              <button onClick={() => handlePrint('descargar')} disabled={generandoPdf} className="px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 flex items-center gap-2 transition-all border border-blue-500">
                {generandoPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} 
                {generandoPdf ? 'Generando...' : 'Descargar PDF'}
              </button>
              
              {/* Botón de Guardar Inicial */}
              {docSeleccionado === 'NUEVO' && (
                <button onClick={guardarDocumentoFinal} disabled={guardando} className="px-5 py-3 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg hover:bg-emerald-600 flex items-center gap-2 transition-all">
                  {guardando ? <Loader2 size={14} className="animate-spin"/> : <Save size={14} />} Guardar
                </button>
              )}

              {/* Botón de Actualizar Encargado */}
              {docSeleccionado !== 'NUEVO' && docSeleccionado?.especialista_id !== especialistaSeleccionadoId && (
                <button onClick={guardarDocumentoFinal} disabled={guardando} className="px-5 py-3 bg-amber-500 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg hover:bg-amber-600 flex items-center gap-2 transition-all">
                  {guardando ? <Loader2 size={14} className="animate-spin"/> : <Save size={14} />} Actualizar Encargado
                </button>
              )}

              {/* Botón de Eliminar */}
              {docSeleccionado !== 'NUEVO' && (
                <button onClick={eliminarDocumento} className="px-5 py-3 bg-red-50 text-red-600 border border-red-200 rounded-2xl font-black text-[10px] uppercase shadow-sm hover:bg-red-100 flex items-center gap-2 transition-all">
                  <Trash2 size={14} /> Eliminar
                </button>
              )}
            </>
          )}

          {(mostrandoCategorias || docSeleccionado) && (
            <button onClick={() => {setMostrandoCategorias(false); setDocSeleccionado(null); setIsOpenLista(false);}} className="bg-slate-100 text-slate-600 px-5 py-3 rounded-2xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all">
              Volver
            </button>
          )}
          {!docSeleccionado && !mostrandoCategorias && (
            <button onClick={handleNuevoDocumento} className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-95 transition-all border border-blue-500">
              <Plus size={14} strokeWidth={3}/> Nuevo Documento
            </button>
          )}
        </div>
      </header>

      {/* MODAL SELECCIÓN ESPECIALISTA */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showModalEspecialista && (
            <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 999999 }}>
              <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => {setShowModalEspecialista(false); setIsOpenLista(false);}} className="absolute inset-0 bg-slate-950/40 backdrop-blur-md" />
              <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:0.95}} className="bg-white/95 backdrop-blur-2xl w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-[510] flex flex-col overflow-visible text-slate-900 border border-white/80 p-6">
                  <div className="flex justify-between items-center mb-6">
                      <div>
                        <h2 className="text-sm font-black uppercase italic text-slate-800">Especialista Responsable</h2>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Asignar profesional a cargo</p>
                      </div>
                      <button onClick={() => {setShowModalEspecialista(false); setIsOpenLista(false);}} className="p-2.5 bg-slate-100 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all text-slate-400"><X size={16}/></button>
                  </div>
                  <div className="space-y-6">
                      <div className="relative">
                          <button onClick={() => setIsOpenLista(!isOpenLista)} className={`w-full p-4 rounded-2xl border transition-all text-left flex items-center justify-between z-10 relative ${isOpenLista ? 'border-blue-500 bg-white shadow-lg' : 'border-slate-200/60 bg-slate-50/80'}`}>
                              <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-xl ${especialistaSeleccionadoId ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}><UserCheck size={18}/></div>
                                  <p className="font-black uppercase text-[10px] leading-none text-slate-700">{especialistaSeleccionadoId ? profesionalesFull.find(p => p.user_id === especialistaSeleccionadoId)?.nombre_completo : 'Seleccionar...'}</p>
                              </div>
                              <ChevronDown size={16} className={`text-slate-400 transition-transform duration-300 ${isOpenLista ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                              {isOpenLista && (
                                  <motion.div initial={{opacity:0, y: 0}} animate={{opacity:1, y: 8}} exit={{opacity:0, y: 0}} className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-[1.5rem] shadow-2xl z-[600] overflow-hidden">
                                      <div className="p-2 bg-slate-50 border-b border-slate-100"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12}/><input type="text" placeholder="BUSCAR..." className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-[9px] font-black uppercase outline-none focus:border-blue-500" value={busquedaEspecialista} onChange={(e)=>setBusquedaEspecialista(e.target.value)} onClick={(e) => e.stopPropagation()}/></div></div>
                                      <div className="max-h-[180px] overflow-y-auto p-1.5">
                                          {profesionalesFull.filter(p => p.nombre_completo.toLowerCase().includes(busquedaEspecialista.toLowerCase())).map(p => (
                                              <button key={p.user_id} onClick={() => { setEspecialistaSeleccionadoId(p.user_id); setIsOpenLista(false); }} className={`w-full p-3 rounded-xl text-left flex items-center gap-3 transition-all mb-1 ${especialistaSeleccionadoId === p.user_id ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-blue-50 text-slate-700'}`}><div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${especialistaSeleccionadoId === p.user_id ? 'bg-white/20 text-white' : 'bg-slate-900 text-white'}`}>{p.iniciales}</div><span className="font-black uppercase text-[10px] truncate">{p.nombre_completo}</span></button>
                                          ))}
                                      </div>
                                  </motion.div>
                              )}
                          </AnimatePresence>
                      </div>
                      <button 
                        disabled={!especialistaSeleccionadoId || isOpenLista} 
                        onClick={() => { 
                          setShowModalEspecialista(false); 
                          if (!docSeleccionado) {
                            setMostrandoCategorias(true); 
                          }
                        }} 
                        className={`w-full py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all ${especialistaSeleccionadoId && !isOpenLista ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:shadow-lg active:scale-95' : 'bg-slate-100 text-slate-300 cursor-not-allowed opacity-50'}`}
                      >
                        Continuar
                      </button>
                  </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* CONTENIDO PRINCIPAL */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
        
        {/* HISTORIAL LATERAL */}
        <aside className="lg:col-span-1 space-y-4">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Historial de Ficha</h4>
          <div className="space-y-3">
            {documentos.map(doc => (
              <button key={doc.id} onClick={() => seleccionarDocumentoGuardado(doc)} className={`w-full text-left p-4 rounded-[1.5rem] border transition-all shadow-sm ${docSeleccionado?.id === doc.id ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-500/20' : 'bg-white/90 backdrop-blur-xl border-white/60 text-slate-800 hover:border-blue-200'}`}>
                <p className="text-[10px] font-black uppercase italic leading-tight">{doc.titulo_documento}</p>
                <p className="text-[8px] font-bold opacity-60 mt-1">{new Date(doc.fecha_creacion).toLocaleDateString()}</p>
              </button>
            ))}
            {documentos.length === 0 && (
              <div className="p-6 bg-white/50 backdrop-blur-md rounded-[1.5rem] text-center border border-white/40">
                <p className="text-[9px] font-black uppercase text-slate-400">Sin documentos previos</p>
              </div>
            )}
          </div>
        </aside>

        {/* ÁREA DE TRABAJO */}
        <main className="lg:col-span-4 min-h-[800px]">
          <AnimatePresence mode="wait">
            {mostrandoCategorias ? (
              <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                <button onClick={() => seleccionarPlantilla({nombre: 'CERTIFICADO LIBRE', contenido: []})} className="bg-slate-900 text-white p-8 rounded-[2rem] text-left group hover:bg-black transition-all border-4 border-transparent shadow-xl flex justify-between items-start">
                  <div>
                    <span className="text-lg font-black uppercase italic block mb-1">En Blanco</span>
                    <span className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">Crear estructura libre</span>
                  </div>
                  <PenTool className="text-blue-500" size={24} />
                </button>
                {categorias.map(cat => (
                  <button key={cat.id} onClick={() => seleccionarPlantilla(cat)} className="bg-white/90 backdrop-blur-xl p-8 rounded-[2rem] shadow-xl border border-white/60 hover:border-blue-500 transition-all font-black uppercase text-[11px] flex justify-between items-center group text-left text-slate-800">
                    {cat.nombre_display} 
                    <ChevronRight className="text-blue-600 group-hover:translate-x-2 transition-all" size={18} />
                  </button>
                ))}
              </motion.div>
            ) : docSeleccionado ? (
              <div className="flex flex-col md:flex-row gap-6">
                {docSeleccionado === 'NUEVO' && (
                  <div className="flex flex-row md:flex-col gap-2 sticky top-8 z-20 overflow-x-auto pb-4 md:pb-0">
                    <ToolBtn icon={<Type size={16}/>} label="Título" onClick={() => agregarBloqueManual('titulo')} />
                    <ToolBtn icon={<AlignLeft size={16}/>} label="Texto" onClick={() => agregarBloqueManual('texto')} />
                    <ToolBtn icon={<Minus size={16}/>} label="Línea" onClick={() => agregarBloqueManual('separador')} />
                    <ToolBtn icon={<AlignJustify size={16}/>} label="Campo" onClick={() => agregarBloqueManual('input')} />
                  </div>
                )}
                <div className="flex-1 space-y-6">
                  
                  {/* BARRA RESPONSABLE */}
                  <div className="bg-white/90 backdrop-blur-xl p-5 rounded-[1.5rem] flex items-center justify-between shadow-xl border border-white/60">
                      <div className="flex items-center gap-3 text-left">
                          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-black text-[10px] text-white shadow-sm">{profesionalesFull.find(p => p.user_id === especialistaSeleccionadoId)?.iniciales}</div>
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-blue-600 leading-none mb-1 text-left">Responsable</p>
                            <p className="text-[10px] font-black uppercase text-slate-800 text-left">{profesionalesFull.find(p => p.user_id === especialistaSeleccionadoId)?.nombre_completo}</p>
                          </div>
                      </div>
                      <button onClick={() => setShowModalEspecialista(true)} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all text-slate-600"><Users size={14} /></button>
                  </div>

                  {/* HOJA DE IMPRESIÓN / VISTA PREVIA */}
                  <div className="bg-white shadow-2xl border border-slate-200/80 rounded-[2.5rem] overflow-hidden text-slate-900" id="hoja-impresion">
                    <div className="p-8 md:p-12 flex flex-col h-full text-left">
                        <header className="flex justify-between items-start border-b border-slate-900 pb-6 mb-8">
                            <img src="https://yqdpmaopnvrgdqbfaiok.supabase.co/storage/v1/object/public/documentos_imagenes/440749454_122171956712064634_7168698893214813270_n.jpg" className="w-16 h-16 rounded-full" />
                            <div className="text-right">
                                <h2 className="text-[11px] font-black uppercase leading-tight">Clínica Dignidad</h2>
                                <p className="text-[9px] text-slate-400 mt-1 uppercase">Certificado Clínico Digital</p>
                            </div>
                        </header>

                        <input className="text-2xl font-black uppercase italic w-full border-none mb-8 focus:ring-0 placeholder:text-slate-200 text-left text-slate-900 bg-transparent" placeholder="TÍTULO..." value={tituloEdicion} onChange={(e) => setTituloEdicion(e.target.value.toUpperCase())} readOnly={docSeleccionado !== 'NUEVO'} />
                        
                        <div className="flex-1 space-y-6">
                            {bloquesEdicion.map((bloque, idx) => (
                                <div key={bloque.id} className="relative group text-left">
                                    {docSeleccionado === 'NUEVO' && <button onClick={() => setBloquesEdicion(prev => prev.filter(b => b.id !== bloque.id))} className="absolute -left-10 top-0 p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14}/></button>}
                                    <RenderDinamico bloque={bloque} isReadOnly={docSeleccionado !== 'NUEVO'} onUpdate={(k: string, v: any) => { const n = [...bloquesEdicion]; n[idx][k] = v; setBloquesEdicion(n); }}/>
                                </div>
                            ))}
                        </div>
                        
                        <div className="mt-20 pt-8 flex justify-between gap-10">
                            <div className="flex-1">
                                <div className="h-16"></div>
                                <div className="border-t-2 border-slate-900 pt-3 text-center">
                                    <p className="text-[10px] font-black uppercase">Firma Paciente</p>
                                </div>
                            </div>
                            <div className="flex-1">
                                <div className="h-16 flex items-end justify-center">
                                    {profesionalesFull.find(p => p.user_id === especialistaSeleccionadoId)?.firma_base64 && (
                                        <img src={profesionalesFull.find(p => p.user_id === especialistaSeleccionadoId)?.firma_base64} className="max-h-full mix-blend-multiply" />
                                    )}
                                </div>
                                <div className="border-t-2 border-slate-900 pt-3 text-center">
                                    <p className="text-[10px] font-black uppercase leading-tight">
                                        {profesionalesFull.find(p => p.user_id === especialistaSeleccionadoId)?.nombre_completo}
                                    </p>
                                    <p className="text-[8px] font-black uppercase opacity-70">
                                        {profesionalesFull.find(p => p.user_id === especialistaSeleccionadoId)?.especialidad}
                                    </p>
                                    <p className="text-[8px] font-black uppercase opacity-70">
                                        RUT: {profesionalesFull.find(p => p.user_id === especialistaSeleccionadoId)?.rut}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                  </div>

                </div>
              </div>
            ) : (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} className="h-[500px] flex flex-col items-center justify-center bg-white/60 backdrop-blur-md rounded-[2.5rem] border-2 border-dashed border-slate-200 shadow-sm">
                <FileText size={48} className="text-slate-300 mb-4" />
                <p className="text-slate-400 font-black uppercase text-xs tracking-widest">Seleccione o cree un documento clínico</p>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

function RenderDinamico({ bloque, isReadOnly, onUpdate }: any) {
  const inputStyle = "w-full p-4 bg-slate-50/80 rounded-2xl text-[11px] font-black border border-slate-200/60 outline-none focus:border-blue-500 focus:bg-white transition-all text-left text-slate-900 shadow-sm";
  switch (bloque.tipo) {
    case 'titulo': return <input className="text-lg font-black uppercase italic w-full bg-transparent border-none focus:ring-0 text-left text-slate-800" placeholder="SUBTÍTULO..." value={bloque.contenido} onChange={(e) => onUpdate('contenido', e.target.value.toUpperCase())} readOnly={isReadOnly}/>
    case 'texto': return isReadOnly ? <div className="text-[11px] text-slate-700 w-full min-h-[100px] leading-relaxed text-left" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bloque.contenido) }} /> : <textarea className="text-[11px] text-slate-700 w-full bg-slate-50/80 p-4 rounded-2xl border border-slate-200/60 focus:border-blue-500 focus:bg-white focus:ring-0 min-h-[100px] resize-none leading-relaxed text-left outline-none shadow-sm" placeholder="CONTENIDO..." value={bloque.contenido} onChange={(e) => onUpdate('contenido', e.target.value)} readOnly={isReadOnly} />
    case 'separador': return <hr className="border-slate-300 border-t my-4" />
    case 'input': return (<div className="space-y-1.5 text-left"><input className="text-[9px] font-black text-blue-600 uppercase bg-transparent border-none p-0 focus:ring-0 text-left" value={bloque.label} onChange={(e) => onUpdate('label', e.target.value.toUpperCase())} readOnly={isReadOnly} /><input className={inputStyle} value={bloque.valor_llenado} onChange={(e) => onUpdate('valor_llenado', e.target.value)} disabled={isReadOnly} /></div>)
    default: return null;
  }
}

function ToolBtn({ icon, label, onClick }: any) {
  return (<button onClick={onClick} className="flex flex-col items-center justify-center p-3 bg-white/90 backdrop-blur-xl border border-white/80 rounded-2xl hover:bg-blue-600 hover:text-white transition-all w-16 h-20 shadow-lg active:scale-95 group shrink-0 text-slate-700"><div className="mb-1">{icon}</div><span className="text-[7px] font-black uppercase tracking-widest">{label}</span></button>)
}

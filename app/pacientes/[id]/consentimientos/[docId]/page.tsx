'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, Printer, Loader2, Download, FileText, UserCheck, ShieldCheck } from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

export default function DetalleConsentimientoPage() {
  const params = useParams()
  const docId = params.docId
  const pacienteId = params.id

  // --- ESTADOS PARA AUDITORÍA SEREMI ---
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [vistoRegistrado, setVistoRegistrado] = useState(false)

  const [documento, setDocumento] = useState<any>(null)
  const [paciente, setPaciente] = useState<any>(null)
  const [especialista, setEspecialista] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  // Obtener sesión y perfil para auditoría
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setSessionUserId(session.user.id);
        const { data: pData } = await supabase
          .from('perfiles')
          .select('rut, nombre_completo, rol')
          .eq('id', session.user.id)
          .maybeSingle();
        setPerfil(pData);
      }
    });
  }, [])

  useEffect(() => { if (docId) fetchTodo() }, [docId])

  // --- FUNCIÓN DE AUDITORÍA ENRIQUECIDA (SEREMI) ---
  const registrarAuditoria = async (accion: string, detalles: string) => {
    if (!sessionUserId || !perfil) return;
    try {
      await supabase.from('auditoria_clinica').insert([{
        usuario_id: sessionUserId,
        rut_usuario: perfil.rut,
        nombre_usuario: perfil.nombre_completo,
        rol_al_momento: perfil.rol,
        paciente_id: pacienteId,
        registro_afectado_id: docId as string,
        accion,
        tabla: 'paciente_consentimientos',
        detalles,
        user_agent: navigator.userAgent
      }]);
    } catch (e) {
      console.error("Error al registrar auditoría", e);
    }
  }

  // Registrar cuando el usuario visualiza el documento (Exigencia SEREMI)
  useEffect(() => {
    if (documento && perfil && !vistoRegistrado) {
      registrarAuditoria('SELECT / VER CONSENTIMIENTO', `Visualizó el documento legal "${documento.nombre_consentimiento}"`);
      setVistoRegistrado(true);
    }
  }, [documento, perfil, vistoRegistrado]);

  async function fetchTodo() {
    setCargando(true)
    try {
      const { data: doc } = await supabase.from('paciente_consentimientos').select('*').eq('id', docId).maybeSingle()
      const { data: pac } = await supabase.from('pacientes').select('*').eq('id', pacienteId).maybeSingle()

      if (doc?.especialista_id) {
        const [profRes, perfRes] = await Promise.all([
          supabase.from('profesionales').select('nombre, apellido, firma_base64, especialidades(nombre)').eq('user_id', doc.especialista_id).maybeSingle(),
          supabase.from('perfiles').select('rut').eq('id', doc.especialista_id).maybeSingle()
        ])
        if (profRes.data) {
          setEspecialista({
            nombre: `Dr/a. ${profRes.data.nombre} ${profRes.data.apellido}`,
            especialidad: (profRes.data as any).especialidades?.nombre || 'Especialista',
            rut: perfRes.data?.rut || '---',
            firma_base64: profRes.data.firma_base64
          })
        }
      } else if (doc?.creado_por) {
        setEspecialista({ nombre: doc.creado_por, especialidad: 'Especialista', rut: '---', firma_base64: null })
      }

      setDocumento(doc)
      setPaciente(pac)
    } catch (e) { console.error(e) } finally { setCargando(false) }
  }

  const handlePrint = async () => {
    setGenerandoPdf(true);
    const toastId = toast.loading("Preparando documento numerado para imprimir...");

    try {
      // REGISTRAR AUDITORÍA DE EXPORTACIÓN (SEREMI)
      await registrarAuditoria('EXPORT / IMPRIMIR CONSENTIMIENTO', `Generó una vista de impresión del consentimiento "${documento?.nombre_consentimiento}"`);

      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById('documento-pdf');
      
      if (!element) {
        toast.error("No se encontró el documento para generar el PDF", { id: toastId });
        setGenerandoPdf(false);
        return;
      }
      
      const opt = {
        margin: [15, 15, 20, 15] as [number, number, number, number],
        filename: `Consentimiento_${paciente?.rut || 'Clinica'}.pdf`,
        image: { type: 'jpeg', quality: 1 } as const,
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff', scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' } as const,
        pagebreak: { mode: ['css', 'legacy'] as const }
      };

      await html2pdf().set(opt).from(element).toPdf().get('pdf').then((pdf: any) => {
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          pdf.setPage(i);
          pdf.setFontSize(9);
          pdf.setTextColor(120, 120, 120);
          pdf.text(`Página ${i} de ${totalPages}`, pdf.internal.pageSize.getWidth() - 35, pdf.internal.pageSize.getHeight() - 8);
        }
        window.open(pdf.output('bloburl'), '_blank');
      });

      toast.success("Documento listo para imprimir", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Error al preparar la impresión", { id: toastId });
    } finally {
      setGenerandoPdf(false);
    }
  };

  const handleDownloadPDF = async () => {
    setGenerandoPdf(true);
    const toastId = toast.loading("Procesando y numerando PDF...");

    try {
      // REGISTRAR AUDITORÍA DE EXPORTACIÓN (SEREMI)
      await registrarAuditoria('EXPORT / DESCARGAR CONSENTIMIENTO', `Descargó el PDF del consentimiento "${documento?.nombre_consentimiento}"`);

      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById('documento-pdf');

      if (!element) {
        toast.error("No se encontró el documento para imprimir", { id: toastId });
        setGenerandoPdf(false);
      return;
      }
      
      const opt = {
        margin: [15, 15, 20, 15] as [number, number, number, number],
        filename: `Consentimiento_${paciente?.rut || 'Clinica'}.pdf`,
        image: { type: 'jpeg', quality: 1 } as const,
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff', scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' } as const,
        pagebreak: { mode: ['css', 'legacy'] as const }
      };

      await (html2pdf().set(opt).from(element).toPdf().get('pdf').then((pdf: any) => {
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          pdf.setPage(i);
          pdf.setFontSize(9);
          pdf.setTextColor(120, 120, 120);
          pdf.text(`Página ${i} de ${totalPages}`, pdf.internal.pageSize.getWidth() - 35, pdf.internal.pageSize.getHeight() - 8);
        }
      }) as any).save();

      toast.success("PDF descargado con éxito", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Error al generar el PDF", { id: toastId });
    } finally {
      setGenerandoPdf(false);
    }
  };

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
      <Loader2 className="animate-spin text-blue-600" size={45} />
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando documento legal...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-left pb-24" style={{ backgroundImage: "url('/fondo-pacientes.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      
      {/* Barra de navegación superior (Glassmorphism) */}
      <nav className="sticky top-0 bg-white/90 backdrop-blur-xl border-b border-white/60 px-6 md:px-10 py-4 flex justify-between items-center z-[100] shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => window.history.back()} 
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all shadow-sm active:scale-95"
            title="Volver"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
          <div className="text-left">
            <span className="text-[9px] font-black uppercase text-blue-600 tracking-widest leading-none block mb-1">AureoDent Compliance</span>
            <p className="text-xs md:text-sm font-black text-slate-800 uppercase italic leading-none">{documento?.nombre_consentimiento}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handlePrint} 
            disabled={generandoPdf} 
            className="px-5 py-3 bg-white border border-slate-200/80 text-slate-700 rounded-2xl font-black text-[10px] uppercase tracking-wider shadow-sm hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {generandoPdf ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} strokeWidth={2.5} />} 
            <span>{generandoPdf ? 'Preparando...' : 'Imprimir'}</span>
          </button>
          <button 
            onClick={handleDownloadPDF} 
            disabled={generandoPdf} 
            className="px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-wider shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-slate-900 hover:to-slate-900 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 border border-blue-500"
          >
            {generandoPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} strokeWidth={2.5} />} 
            <span>{generandoPdf ? 'Generando...' : 'Descargar PDF'}</span>
          </button>
        </div>
      </nav>

      {/* Contenedor Principal del Documento */}
      <main className="w-full flex flex-col items-center p-6 md:p-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[850px] shadow-2xl mx-auto bg-white rounded-[2.5rem] overflow-hidden border border-white/80"
        >
          
          <div id="documento-pdf" style={{ backgroundColor: '#ffffff', color: '#000000', padding: '50px', fontFamily: 'Arial, sans-serif' }}>
            
            <style>{`
              #documento-pdf p, #documento-pdf li { page-break-inside: avoid; }
            `}</style>
            
            {/* Cabecera del Documento Impreso */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #0f172a', paddingBottom: '20px', marginBottom: '30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <img src="https://yqdpmaopnvrgdqbfaiok.supabase.co/storage/v1/object/public/documentos_imagenes/440749454_122171956712064634_7168698893214813270_n.jpg" alt="Logo" style={{ height: '75px', width: 'auto', borderRadius: '8px' }} crossOrigin="anonymous" />
                <div style={{ textAlign: 'left' }}>
                  <h1 style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', color: '#0f172a', margin: 0, lineHeight: '1.2' }}>Centro Médico y Dental<br/>Dignidad</h1>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h2 style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#2563eb', letterSpacing: '1px', margin: '0 0 4px 0' }}>Consentimiento Informado</h2>
                <p style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', color: '#0f172a', fontStyle: 'italic', margin: 0 }}>{documento?.nombre_consentimiento}</p>
                <p style={{ fontSize: '10px', color: '#64748b', margin: '5px 0 0 0' }}>
                  Generado: {documento?.fecha_creacion ? new Date(documento.fecha_creacion).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                </p>
              </div>
            </div>

            {/* Datos Resumen (Paciente, Tratamiento, Especialista) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 20px', marginBottom: '40px', pageBreakInside: 'avoid' }}>
              
              <div style={{ width: '33%', textAlign: 'left' }}>
                <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '4px' }}>Paciente</span>
                <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase', margin: '0 0 3px 0' }}>{paciente?.nombre} {paciente?.apellido}</p>
                <p style={{ fontSize: '11px', color: '#334155', margin: 0 }}>RUT: {paciente?.rut}</p>
              </div>
              
              <div style={{ width: '33%', textAlign: 'center', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: '0 10px' }}>
                <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '4px' }}>Tratamiento</span>
                <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase', margin: '0 0 3px 0' }}>{documento?.nombre_consentimiento}</p>
                <p style={{ fontSize: '11px', color: '#334155', margin: 0 }}>
                  ID: {documento?.presupuesto_id ? String(documento.presupuesto_id).split('-')[0].toUpperCase() : 'NO ASOCIADO'}
                </p>
              </div>

              <div style={{ width: '33%', textAlign: 'right' }}>
                <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '4px' }}>Especialista Tratante</span>
                <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase', margin: '0 0 3px 0' }}>{especialista?.nombre}</p>
                <p style={{ fontSize: '11px', color: '#334155', margin: 0 }}>{especialista?.especialidad} {especialista?.rut !== '---' && `• RUT: ${especialista?.rut}`}</p>
              </div>

            </div>

            {/* Contenido Legal */}
            <div 
              style={{ fontSize: '13.5px', lineHeight: '1.7', color: '#1e293b', textAlign: 'justify', marginBottom: '60px', overflowWrap: 'break-word', wordBreak: 'normal', whiteSpace: 'pre-wrap' }} 
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(documento?.contenido_legal ?? '') }}
            />

            {/* Firmas */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '30px', pageBreakInside: 'avoid' }}>
              <div style={{ width: '45%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', height: '80px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderBottom: '1px solid #0f172a', paddingBottom: '10px', marginBottom: '10px' }}>
                  {(especialista?.firma_base64 || documento?.img_firma_especialista) && (
                    <img 
                      src={especialista?.firma_base64 || documento?.img_firma_especialista} 
                      style={{ maxHeight: '70px', objectFit: 'contain', mixBlendMode: 'multiply' }} 
                      crossOrigin="anonymous" 
                    />
                  )}
                </div>
                <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase', margin: '0 0 2px 0' }}>{especialista?.nombre}</p>
                <p style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Firma Especialista</p>
              </div>
              
              <div style={{ width: '45%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', height: '80px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderBottom: '1px solid #0f172a', paddingBottom: '10px', marginBottom: '10px' }}>
                  {documento?.img_firma_paciente && <img src={documento.img_firma_paciente} style={{ maxHeight: '70px', objectFit: 'contain', mixBlendMode: 'multiply' }} crossOrigin="anonymous" />}
                </div>
                <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase', margin: '0 0 2px 0' }}>{paciente?.nombre} {paciente?.apellido}</p>
                <p style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Aceptación Paciente</p>
              </div>
            </div>

          </div>
        </motion.div>
      </main>
    </div>
  )
}

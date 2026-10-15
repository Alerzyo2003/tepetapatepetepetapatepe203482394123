'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, Printer, Loader2, Download, FileText, UserCheck, ShieldCheck } from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

const escapar = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Divide el texto legal en párrafos para que el PDF salte de página entre párrafos (y no a la mitad de una línea)
function dividirEnParrafos(contenido: string): string[] {
  // Quita guiones invisibles (vienen al copiar desde Word/PDF) y espacios de ancho cero:
  // son los que hacen que una palabra aparezca cortada con "-" al final de la línea
  // Los espacios "duros" (&nbsp;) también vienen de Word: unen todas las palabras en una sola
  // y el navegador no puede bajar de línea, así que se cambian por espacios normales
  const raw = String(contenido || '')
    .replace(/\u00AD|&shy;|\u200B/gi, '')
    .replace(/&nbsp;|&#160;|\u00A0/gi, ' ')
  if (!raw.trim()) return []
  if (!/<[a-z][\s\S]*>/i.test(raw)) {
    return raw.split('\n').map(l => (l.trim() ? `<p style="margin: 0 0 6px;">${escapar(l)}</p>` : '')).filter(Boolean)
  }
  const limpio = DOMPurify.sanitize(raw)
  if (typeof window === 'undefined') return [limpio]
  const cont = new DOMParser().parseFromString(`<div>${limpio}</div>`, 'text/html').body.firstElementChild
  if (!cont) return [limpio]
  const estaVacio = (el: Element) => !(el.textContent || '').trim() && !el.querySelector('img')

  const bloques: { html: string; titulo: boolean }[] = []
  for (const n of Array.from(cont.childNodes)) {
    if (n.nodeType === 1) {
      const el = n as Element
      // Se descartan los párrafos vacíos (<p><br></p> del editor)
      if (estaVacio(el)) continue
      // Las listas se separan ítem por ítem: así una lista larga puede seguir en la hoja siguiente
      // en vez de saltar completa y dejar media hoja en blanco
      if (el.tagName === 'OL' || el.tagName === 'UL') {
        Array.from(el.children).forEach((li, i) => {
          if (estaVacio(li)) return
          const lista = el.cloneNode(false) as Element
          if (el.tagName === 'OL') lista.setAttribute('start', String((Number(el.getAttribute('start')) || 1) + i))
          lista.appendChild(li.cloneNode(true))
          bloques.push({ html: lista.outerHTML, titulo: esTitulo(li) })
        })
        continue
      }
      bloques.push({ html: el.outerHTML, titulo: esTitulo(el) })
    } else if ((n.textContent || '').trim()) {
      bloques.push({ html: `<p>${escapar(n.textContent)}</p>`, titulo: false })
    }
  }

  // Cada título se pega al bloque que le sigue, para que nunca quede solo al final de una hoja
  const resultado: string[] = []
  let pendiente = ''
  for (const b of bloques) {
    if (b.titulo) { pendiente += b.html; continue }
    resultado.push(pendiente + b.html)
    pendiente = ''
  }
  if (pendiente) resultado.push(pendiente)
  return resultado
}

// Un "título" es un encabezado (h1–h6) o una línea corta escrita entera en negrita
function esTitulo(el: Element): boolean {
  if (/^H[1-6]$/.test(el.tagName)) return true
  const texto = (el.textContent || '').replace(/\s+/g, '')
  if (!texto || texto.length > 120) return false
  const negrita = Array.from(el.querySelectorAll('strong, b, h1, h2, h3, h4, h5, h6'))
    .map(e => e.textContent || '').join('').replace(/\s+/g, '')
  return negrita.length >= texto.length
}

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
  const [nombreTratamiento, setNombreTratamiento] = useState<string | null>(null)
  // Qué firmas pide la plantilla (se configura en Administración → Consentimientos)
  const [firmas, setFirmas] = useState({ paciente: true, profesional: true })
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
      const [{ data: doc }, { data: pac }] = await Promise.all([
        supabase.from('paciente_consentimientos').select('*').eq('id', docId).maybeSingle(),
        supabase.from('pacientes').select('*').eq('id', pacienteId).maybeSingle(),
      ])

      if (doc?.especialista_id) {
        // La lista de consentimientos guarda el id de la ficha del profesional (no su usuario):
        // se busca por ambos para que siempre aparezcan su nombre, RUT y firma
        const camposProf = 'id, user_id, nombre, apellido, firma_base64, especialidades(nombre)'
        const porId = await supabase.from('profesionales').select(camposProf).eq('id', doc.especialista_id).maybeSingle()
        const prof: any = porId.data
          || (await supabase.from('profesionales').select(camposProf).eq('user_id', doc.especialista_id).maybeSingle()).data
        if (prof) {
          const { data: perf } = prof.user_id
            ? await supabase.from('perfiles').select('rut').eq('id', prof.user_id).maybeSingle()
            : { data: null }
          setEspecialista({
            nombre: `Dr/a. ${prof.nombre} ${prof.apellido}`,
            especialidad: (prof as any).especialidades?.nombre || 'Especialista',
            rut: perf?.rut || '---',
            firma_base64: prof.firma_base64
          })
        } else if (doc.creado_por) {
          setEspecialista({ nombre: doc.creado_por, especialidad: 'Especialista', rut: '---', firma_base64: null })
        }
      } else if (doc?.creado_por) {
        setEspecialista({ nombre: doc.creado_por, especialidad: 'Especialista', rut: '---', firma_base64: null })
      }

      if (doc?.consentimiento_id) {
        const { data: plantilla } = await supabase.from('consentimientos').select('firma_paciente, firma_profesional').eq('id', doc.consentimiento_id).maybeSingle()
        if (plantilla) setFirmas({ paciente: plantilla.firma_paciente !== false, profesional: plantilla.firma_profesional !== false })
      }
      if (doc?.presupuesto_id) {
        const { data: pres } = await supabase.from('presupuestos').select('nombre_tratamiento').eq('id', doc.presupuesto_id).maybeSingle()
        setNombreTratamiento(pres?.nombre_tratamiento || null)
      }

      setDocumento(doc)
      setPaciente(pac)
    } catch (e) { console.error(e) } finally { setCargando(false) }
  }

  const parrafos = useMemo(() => dividirEnParrafos(documento?.contenido_legal ?? ''), [documento])
  // Los últimos párrafos viajan junto con las firmas: si no caben, pasan todos juntos a la hoja
  // siguiente, así la firma nunca queda sola en una hoja
  const PARRAFOS_CON_FIRMA = 2
  const parrafosFinales = parrafos.slice(-PARRAFOS_CON_FIRMA)
  const parrafosPrevios = parrafos.slice(0, Math.max(0, parrafos.length - PARRAFOS_CON_FIRMA))

  // Imprimir y descargar usan el mismo PDF
  const generarPdf = async (modo: 'imprimir' | 'descargar') => {
    // La pestaña se abre al instante (si se abre después de generar, el navegador la bloquea)
    const ventana = modo === 'imprimir' ? window.open('', '_blank') : null
    if (ventana) ventana.document.write('<p style="font-family: sans-serif; padding: 24px; color: #475569;">Preparando documento...</p>')

    setGenerandoPdf(true);
    const toastId = toast.loading(modo === 'imprimir' ? "Preparando documento para imprimir..." : "Generando PDF...");

    try {
      await registrarAuditoria(
        modo === 'imprimir' ? 'EXPORT / IMPRIMIR CONSENTIMIENTO' : 'EXPORT / DESCARGAR CONSENTIMIENTO',
        modo === 'imprimir' ? `Generó una vista de impresión del consentimiento "${documento?.nombre_consentimiento}"` : `Descargó el PDF del consentimiento "${documento?.nombre_consentimiento}"`
      );

      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById('documento-pdf');
      if (!element) throw new Error('No se encontró el documento');

      const opt: any = {
        margin: [12, 14, 16, 14],
        filename: `Consentimiento_${paciente?.rut || 'Clinica'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        // Sin letterRendering (mide letra por letra y descuadra las líneas) y con ancho fijo
        // para que el PDF salga igual desde el celular que desde el computador
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0, windowWidth: 1000 },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
        // Los párrafos y el bloque final (último párrafo + firmas) nunca se cortan entre páginas
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.bloque-final', '.parrafo-legal', '.no-cortar', 'img'] }
      };

      const pdf = await html2pdf().set(opt).from(element).toPdf().get('pdf');
      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`Página ${i} de ${totalPages}`, pdf.internal.pageSize.getWidth() - 35, pdf.internal.pageSize.getHeight() - 8);
      }

      if (modo === 'imprimir') {
        const url = pdf.output('bloburl');
        if (ventana) ventana.location.href = url; else window.open(url, '_blank');
        toast.success("Documento listo para imprimir", { id: toastId });
      } else {
        pdf.save(opt.filename);
        toast.success("PDF descargado con éxito", { id: toastId });
      }
    } catch (error) {
      console.error(error);
      if (ventana) ventana.close();
      toast.error("Error al generar el documento", { id: toastId });
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
            onClick={() => generarPdf('imprimir')} 
            disabled={generandoPdf} 
            className="px-5 py-3 bg-white border border-slate-200/80 text-slate-700 rounded-2xl font-black text-[10px] uppercase tracking-wider shadow-sm hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {generandoPdf ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} strokeWidth={2.5} />} 
            <span>{generandoPdf ? 'Preparando...' : 'Imprimir'}</span>
          </button>
          <button 
            onClick={() => generarPdf('descargar')} 
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
          
          <div id="documento-pdf" style={{ backgroundColor: '#ffffff', color: '#000000', padding: '40px', fontFamily: 'Arial, sans-serif' }}>
            
            <style>{`
              #documento-pdf, #documento-pdf * { hyphens: none !important; -webkit-hyphens: none !important; word-break: normal !important; overflow-wrap: break-word !important; white-space: normal !important; max-width: 100%; }
              #documento-pdf p, #documento-pdf li, #documento-pdf .parrafo-legal, #documento-pdf .bloque-final, #documento-pdf .no-cortar { page-break-inside: avoid; break-inside: avoid; }
              #documento-pdf .texto-legal p { margin: 0 0 8px; }
              #documento-pdf .texto-legal ol, #documento-pdf .texto-legal ul { margin: 0 0 2px; padding-left: 22px; }
              #documento-pdf .ql-align-center { text-align: center; }
              #documento-pdf .ql-align-right { text-align: right; }
              #documento-pdf .ql-align-justify { text-align: justify; }
            `}</style>
            
            {/* Cabecera del Documento Impreso */}
            <div className="no-cortar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <img src="/logo.png" alt="Logo" style={{ height: '75px', width: 'auto', borderRadius: '8px' }} crossOrigin="anonymous" />
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
            <div className="no-cortar" style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', marginBottom: '26px', pageBreakInside: 'avoid' }}>
              
              <div style={{ width: '33%', textAlign: 'left' }}>
                <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '4px' }}>Paciente</span>
                <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase', margin: '0 0 3px 0' }}>{paciente?.nombre} {paciente?.apellido}</p>
                <p style={{ fontSize: '11px', color: '#334155', margin: 0 }}>RUT: {paciente?.rut}</p>
              </div>
              
              <div style={{ width: '33%', textAlign: 'center', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: '0 10px' }}>
                <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '4px' }}>Tratamiento</span>
                <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase', margin: '0 0 3px 0' }}>{nombreTratamiento || documento?.nombre_consentimiento}</p>
                <p style={{ fontSize: '11px', color: '#334155', margin: 0 }}>
                  {documento?.presupuesto_id ? `Presupuesto ${String(documento.presupuesto_id).split('-')[0].toUpperCase()}` : 'Sin presupuesto asociado'}
                </p>
              </div>

              <div style={{ width: '33%', textAlign: 'right' }}>
                <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '4px' }}>Especialista Tratante</span>
                <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase', margin: '0 0 3px 0' }}>{especialista?.nombre}</p>
                <p style={{ fontSize: '11px', color: '#334155', margin: 0 }}>{especialista?.especialidad} {especialista?.rut !== '---' && `• RUT: ${especialista?.rut}`}</p>
              </div>

            </div>

            {/* Contenido Legal: un bloque por párrafo para que el PDF no corte líneas */}
            <div className="texto-legal" style={{ fontSize: '13px', lineHeight: '1.65', color: '#1e293b', textAlign: 'justify' }}>
              {parrafosPrevios.map((html, i) => (
                <div key={i} className="parrafo-legal" dangerouslySetInnerHTML={{ __html: html }} />
              ))}
            </div>

            {/* Bloque final: últimos párrafos + firmas juntos, para que la firma nunca quede sola ni cortada en otra página */}
            <div className="bloque-final" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
              {parrafosFinales.length > 0 && (
                <div className="texto-legal" style={{ fontSize: '13px', lineHeight: '1.65', color: '#1e293b', textAlign: 'justify' }}>
                  {parrafosFinales.map((html, i) => (
                    <div key={i} dangerouslySetInnerHTML={{ __html: html }} />
                  ))}
                </div>
              )}

              {(firmas.profesional || firmas.paciente) && (
                <div style={{ display: 'flex', justifyContent: firmas.profesional && firmas.paciente ? 'space-between' : 'center', paddingTop: '45px' }}>
                  {firmas.profesional && (
                    <div style={{ width: '45%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '100%', height: '80px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderBottom: '1px solid #0f172a', paddingBottom: '6px', marginBottom: '8px' }}>
                        {(especialista?.firma_base64 || documento?.img_firma_especialista) && (
                          <img
                            src={especialista?.firma_base64 || documento?.img_firma_especialista}
                            style={{ maxHeight: '72px', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }}
                            crossOrigin="anonymous"
                          />
                        )}
                      </div>
                      <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase', margin: '0 0 2px 0' }}>{especialista?.nombre}</p>
                      {especialista?.rut && especialista.rut !== '---' && <p style={{ fontSize: '10px', color: '#334155', margin: '0 0 2px 0' }}>RUT: {especialista.rut}</p>}
                      <p style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Firma Especialista</p>
                    </div>
                  )}

                  {firmas.paciente && (
                    <div style={{ width: '45%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '100%', height: '80px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderBottom: '1px solid #0f172a', paddingBottom: '6px', marginBottom: '8px' }}>
                        {documento?.img_firma_paciente && <img src={documento.img_firma_paciente} style={{ maxHeight: '72px', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} crossOrigin="anonymous" />}
                      </div>
                      <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f172a', textTransform: 'uppercase', margin: '0 0 2px 0' }}>{paciente?.nombre} {paciente?.apellido}</p>
                      {paciente?.rut && <p style={{ fontSize: '10px', color: '#334155', margin: '0 0 2px 0' }}>RUT: {paciente.rut}</p>}
                      <p style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Aceptación Paciente</p>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </motion.div>
      </main>
    </div>
  )
}

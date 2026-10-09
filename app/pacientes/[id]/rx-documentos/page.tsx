'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  FileText, Upload, Trash2, Loader2,
  X, Save, Calendar, FileType, Maximize2,
  ZoomIn, ZoomOut, RefreshCcw, Download,
  ListChecks, Check, Edit3
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { procesarImagen, ES_IMAGEN, formatoPeso } from '@/lib/imagenes'

export default function DocumentosPage() {
  const { id: paciente_id } = useParams()
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [documentos, setDocumentos] = useState<any[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  // Si se marca, las imágenes se suben sin comprimir (igual se crea la miniatura)
  const [calidadOriginal, setCalidadOriginal] = useState(false)
  
  // ESTADOS DEL VISOR INDIVIDUAL
  const [visorAbierto, setVisorAbierto] = useState(false)
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [editando, setEditando] = useState({ titulo: '', descripcion: '' })
  const [zoom, setZoom] = useState(1)

  // ESTADOS: SELECCIÓN MÚLTIPLE, RENOMBRADO Y DESCARGA EN BLOQUE
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [seleccionMultiples, setSeleccionMultiples] = useState<string[]>([])
  const [modalRenombrarAbierto, setModalRenombrarAbierto] = useState(false)
  const [datosRenombrar, setDatosRenombrar] = useState<{id: string, titulo: string, url: string, tipo: string}[]>([])

  useEffect(() => {
    setIsMounted(true)
    
    // Obtener usuario actual para la auditoría
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setSessionUserId(user.id);
    });

    if (paciente_id) fetchDocumentos()
  }, [paciente_id])

  // --- FUNCIÓN DE AUDITORÍA ---
  const registrarAuditoria = async (accion: string, detalles: string) => {
    if (!sessionUserId) return;
    try {
      await supabase.from('auditoria_clinica').insert([{
        usuario_id: sessionUserId,
        accion,
        tabla: 'documentos_pacientes',
        detalles
      }]);
    } catch (e) {
      console.error("Error al registrar auditoría", e);
    }
  }

  // Firma en una sola llamada las URLs del archivo y de su miniatura
  async function conUrlsFirmadas(docs: any[]) {
    const rutas = Array.from(new Set(docs.flatMap(d => [d.url_archivo, d.url_miniatura])
      .filter((r: any) => r && !String(r).startsWith('http'))))
    const firmadas: Record<string, string> = {}
    if (rutas.length) {
      const { data: urls } = await supabase.storage.from('pacientes_docs').createSignedUrls(rutas as string[], 3600)
      ;(urls || []).forEach((u: any) => { if (u.path && u.signedUrl) firmadas[u.path] = u.signedUrl })
    }
    const url = (r: any) => (!r ? null : String(r).startsWith('http') ? r : firmadas[r] || null)
    return docs.map(d => ({ ...d, signedUrl: url(d.url_archivo), miniUrl: url(d.url_miniatura) }))
  }

  // Nombre de descarga con su extensión (ej. "RX panorámica.webp")
  const nombreDescarga = (doc: any) => {
    const nombre = doc.titulo || doc.nombre_archivo || 'documento_clinico'
    const ext = String(doc.url_archivo || '').split('?')[0].split('.').pop()
    return ext && ext.length <= 5 && !nombre.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? `${nombre}.${ext}` : nombre
  }

  // Borra del almacenamiento los archivos de documentos eliminados (si falla, no bloquea)
  async function borrarDelStorage(docs: any[]) {
    const rutas = docs.flatMap(d => [d.url_archivo, d.url_miniatura]).filter((r: any) => r && !String(r).startsWith('http'))
    if (!rutas.length) return
    const { error } = await supabase.storage.from('pacientes_docs').remove(rutas)
    if (error) console.warn('No se pudieron borrar los archivos del almacenamiento:', error.message)
  }

  async function fetchDocumentos() {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('documentos_pacientes')
        .select('*')
        .eq('paciente_id', paciente_id)
        .order('fecha_subida', { ascending: false })
      
      if (error) throw error
      if (data) setDocumentos(await conUrlsFirmadas(data));
    } catch (err) {
      console.error(err)
    } finally {
      setCargando(false)
    }
  }

  const handleUploadMulti = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setSubiendo(true);
    
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error("No hay sesión activa")

      let nuevosDocs: any[] = [];
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      const MAX_IMAGEN = 30 * 1024 * 1024; // las imágenes se comprimen antes de subir
      const MAX_FINAL = 10 * 1024 * 1024;  // límite del archivo que se guarda
      let pesoAntes = 0, pesoDespues = 0;
      const toastId = files.length > 1 ? toast.loading(`Procesando 0 de ${files.length}...`) : undefined;

      for (const [i, file] of files.entries()) {
        if (toastId) toast.loading(`Procesando ${i + 1} de ${files.length}: ${file.name}`, { id: toastId });
        if (!allowedTypes.includes(file.type)) {
          toast.error(`El archivo "${file.name}" tiene un tipo no permitido.`);
          continue;
        }
        if (file.size > (ES_IMAGEN(file.type) ? MAX_IMAGEN : MAX_FINAL)) {
          toast.error(`El archivo "${file.name}" es demasiado grande.`);
          continue;
        }

        // Imágenes: WebP de alta calidad + miniatura. PDF: se sube tal cual.
        const img = await procesarImagen(file, { calidadOriginal });
        if (img.pesoFinal > MAX_FINAL) {
          toast.error(`El archivo "${file.name}" supera el límite de 10MB.`);
          continue;
        }

        const base = `${paciente_id}/${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
        const fileName = `${base}.${img.extension}`
        const { error: storageError } = await supabase.storage.from('pacientes_docs')
          .upload(fileName, img.archivo, { contentType: img.tipo, cacheControl: '31536000' })
        if (storageError) {
          toast.error(`Error al subir "${file.name}".`);
          continue;
        }

        let miniName: string | null = null
        if (img.miniatura) {
          const { error: miniError } = await supabase.storage.from('pacientes_docs')
            .upload(`${base}_mini.webp`, img.miniatura, { contentType: img.miniatura.type || 'image/webp', cacheControl: '31536000' })
          if (!miniError) miniName = `${base}_mini.webp`
        }

        const { data, error: dbError } = await supabase.from('documentos_pacientes').insert([{
          paciente_id,
          nombre_archivo: file.name,
          url_archivo: fileName,
          url_miniatura: miniName,
          tipo_archivo: img.tipo,
          titulo: file.name.replace(/\.[^.]+$/, ''),
          profesional_id: user.id
        }]).select().single()

        if (data && !dbError) {
          nuevosDocs.push(data);
          pesoAntes += img.pesoOriginal;
          pesoDespues += img.pesoFinal;
        } else {
          // Si no se pudo registrar, no dejar archivos huérfanos
          await supabase.storage.from('pacientes_docs').remove([fileName, ...(miniName ? [miniName] : [])])
          toast.error(`No se pudo registrar "${file.name}".`);
        }
      }
      if (toastId) toast.dismiss(toastId);

      if (nuevosDocs.length > 0) {
        const nuevosDocsConUrl = await conUrlsFirmadas(nuevosDocs);
        setDocumentos(prev => [...nuevosDocsConUrl, ...prev])

        // Auditoría Upload
        await registrarAuditoria('CREAR', `Subió ${nuevosDocs.length} archivo(s) digital(es)`);

        const ahorro = pesoAntes - pesoDespues
        toast.success(`Se subieron ${nuevosDocs.length} de ${files.length} archivo(s)`, {
          description: ahorro > 50 * 1024 ? `${formatoPeso(pesoAntes)} → ${formatoPeso(pesoDespues)} (ahorro de ${Math.round((ahorro / pesoAntes) * 100)}%)` : undefined,
        })
      }
    } catch (error: any) {
      toast.error('Ocurrió un error durante la subida.');
    } finally {
      setSubiendo(false)
      e.target.value = ''
    }
  }

  const abrirVisor = (doc: any) => {
    setSeleccionado(doc)
    setEditando({ titulo: doc.titulo || doc.nombre_archivo, descripcion: doc.descripcion || '' })
    setZoom(1)
    setVisorAbierto(true)
  }

  const aumentarZoom = () => setZoom(prev => Math.min(prev + 0.5, 4))
  const disminuirZoom = () => setZoom(prev => Math.max(prev - 0.5, 1))
  const resetearZoom = () => setZoom(1)

  const guardarCambios = async () => {
    try {
      const { error } = await supabase
        .from('documentos_pacientes')
        .update({ titulo: editando.titulo, descripcion: editando.descripcion })
        .eq('id', seleccionado.id)
      
      if (error) throw error
      
      // Auditoría Update
      await registrarAuditoria('EDITAR', `Editó los datos del documento: ${editando.titulo || seleccionado.nombre_archivo}`);

      await fetchDocumentos()
      setVisorAbierto(false)
      toast.success("Información actualizada")
    } catch (err: any) {
      toast.error("Error al actualizar")
    }
  }

  const eliminarArchivo = async () => {
    if (window.confirm("¿Eliminar archivo permanentemente?")) {
      try {
        const { error } = await supabase.from('documentos_pacientes').delete().eq('id', seleccionado.id)
        if (error) throw error
        await borrarDelStorage([seleccionado])
        
        // Auditoría Delete Individual
        await registrarAuditoria('ELIMINAR', `Eliminó el documento: ${seleccionado.titulo || seleccionado.nombre_archivo}`);

        setDocumentos(documentos.filter(d => d.id !== seleccionado.id))
        setVisorAbierto(false)
        toast.error("Archivo eliminado")
      } catch (err) {
        toast.error("Error al eliminar")
      }
    }
  }

  const descargarMultiples = async () => {
    const toastId = toast.loading(`Preparando ${seleccionMultiples.length} descargas...`);
    const docsADescargar = seleccionMultiples
      .map(id => documentos.find(d => d.id === id))
      .filter(Boolean);

    let descargasExitosas = 0;
    let descargasFallidas = 0;

    for (const doc of docsADescargar) {
      if (!doc) continue;
      try {
        const response = await fetch(doc.signedUrl);
        if (!response.ok) throw new Error('La respuesta de la red no fue correcta.');
        const blob = await response.blob();

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nombreDescarga(doc);
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        descargasExitosas++;
        toast.loading(`Descargado ${descargasExitosas} de ${docsADescargar.length}: ${doc.titulo || doc.nombre_archivo}`, { id: toastId });

        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error al descargar ${doc.nombre_archivo}:`, error);
        descargasFallidas++;
      }
    }

    if (descargasFallidas > 0) {
      toast.error(`${descargasFallidas} archivo(s) no se pudieron descargar.`, { id: toastId, duration: 5000 });
    } else {
      toast.success(`Se iniciaron ${descargasExitosas} descargas con éxito.`, { id: toastId, duration: 5000 });
    }

    setSeleccionMultiples([]);
    setModoSeleccion(false);
  }

  const eliminarMultiples = async () => {
    if (window.confirm(`¿Eliminar ${seleccionMultiples.length} archivos permanentemente?`)) {
       try {
          const { error } = await supabase.from('documentos_pacientes').delete().in('id', seleccionMultiples);
          if (error) throw error;
          await borrarDelStorage(documentos.filter(d => seleccionMultiples.includes(d.id)));
          
          // Auditoría Delete Múltiple
          await registrarAuditoria('ELIMINAR', `Eliminó ${seleccionMultiples.length} documentos en bloque`);

          setDocumentos(prev => prev.filter(d => !seleccionMultiples.includes(d.id)));
          setSeleccionMultiples([]);
          setModoSeleccion(false);
          toast.success("Archivos eliminados correctamente");
       } catch (err) {
          toast.error("Error al eliminar los archivos");
       }
    }
  }

  const guardarNombresMultiples = async () => {
    try {
       const toastId = toast.loading("Guardando nombres...", {id: 'renombrar-toast'});
       const promises = datosRenombrar.map(d => supabase.from('documentos_pacientes').update({titulo: d.titulo}).eq('id', d.id));
       await Promise.all(promises);
       
       // Auditoría Update Múltiple
       await registrarAuditoria('EDITAR', `Renombró ${datosRenombrar.length} documentos en bloque`);

       await fetchDocumentos();
       setModalRenombrarAbierto(false);
       setSeleccionMultiples([]);
       setModoSeleccion(false);
       toast.success("Títulos actualizados con éxito", { id: 'renombrar-toast' });
    } catch (err) {
       toast.error("Error al renombrar los archivos", { id: 'renombrar-toast' });
    }
  }

  if (cargando) return (
    <div className="flex flex-col items-center justify-center p-40 gap-4">
      <Loader2 className="animate-spin text-blue-600" size={40} />
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Accediendo al archivo...</p>
    </div>
  )

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-10 font-sans text-left pb-24" style={{ backgroundImage: "url('/fondo-pacientes.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        
        {/* HEADER PRINCIPAL */}
        <div className="bg-white/90 backdrop-blur-xl p-5 md:p-6 lg:p-8 rounded-[2rem] lg:rounded-[2.5rem] shadow-xl border border-white/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-5 md:gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-3 md:p-4 rounded-xl md:rounded-[1.5rem] text-white shadow-xl shadow-blue-600/20">
              <FileText size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter text-slate-800 leading-none">RX y Documentos</h3>
              <p className="text-slate-400 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mt-1">Expediente digital del paciente</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row w-full md:w-auto items-stretch sm:items-center gap-3">
            <button 
              onClick={() => {
                setModoSeleccion(!modoSeleccion);
                if (modoSeleccion) setSeleccionMultiples([]);
              }} 
              className={`w-full sm:w-auto px-6 py-3.5 rounded-[1rem] md:rounded-2xl font-black text-[10px] uppercase transition-all flex justify-center items-center gap-2 shadow-sm ${modoSeleccion ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-white/90 backdrop-blur-xl border border-white/80 text-slate-700 hover:bg-white'}`}
            >
              {modoSeleccion ? <X size={16} strokeWidth={2.5} /> : <ListChecks size={16} strokeWidth={2.5}/>}
              {modoSeleccion ? 'Cancelar Selección' : 'Selección Múltiple'}
            </button>

            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-[1rem] md:rounded-2xl bg-white/90 border border-white/80 text-[10px] font-black uppercase text-slate-600 cursor-pointer select-none shadow-sm" title="Sin marcar: las imágenes se guardan en WebP de alta calidad (pesan mucho menos). Marcar solo si necesitas el archivo exacto.">
              <input type="checkbox" className="accent-blue-600 w-4 h-4" checked={calidadOriginal} onChange={(e) => setCalidadOriginal(e.target.checked)} disabled={subiendo} />
              Calidad original
            </label>

            <label className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-blue-700 text-white px-7 py-3.5 rounded-[1rem] md:rounded-2xl font-black text-[10px] uppercase cursor-pointer shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-slate-900 hover:to-slate-900 transition-all flex justify-center items-center gap-2 border border-blue-500">
              {subiendo ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} strokeWidth={2.5}/>}
              {subiendo ? 'Subiendo...' : 'Subir Documento(s)'}
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleUploadMulti} disabled={subiendo} />
            </label>
          </div>
        </div>

        {/* GRILLA DE DOCUMENTOS */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {documentos.length === 0 ? (
            <div className="col-span-full py-16 md:py-24 text-center bg-white/50 backdrop-blur-md rounded-[2rem] md:rounded-[3rem] border-2 border-dashed border-slate-200 shadow-sm">
               <FileText size={48} className="text-slate-300 mx-auto mb-4" />
               <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic text-center">Sin registros digitalizados</p>
            </div>
          ) : (
            documentos.map((doc) => (
              <motion.div 
                key={doc.id} 
                whileHover={{ y: -5 }} 
                onClick={() => {
                  if (modoSeleccion) {
                    setSeleccionMultiples(prev => prev.includes(doc.id) ? prev.filter(x => x !== doc.id) : [...prev, doc.id]);
                  } else {
                    abrirVisor(doc);
                  }
                }} 
                className={`group cursor-pointer bg-white/90 backdrop-blur-xl p-3 md:p-5 rounded-2xl md:rounded-[2.5rem] border shadow-xl transition-all text-left relative ${modoSeleccion && seleccionMultiples.includes(doc.id) ? 'border-blue-500 ring-4 ring-blue-50' : 'border-white/80 hover:border-blue-300'}`}
              >
                
                {/* CHECKBOX SELECCIÓN */}
                <AnimatePresence>
                  {modoSeleccion && (
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="absolute top-2 left-2 md:top-4 md:left-4 z-10">
                      <div className={`w-6 h-6 md:w-7 md:h-7 rounded-lg md:rounded-xl flex items-center justify-center transition-all ${seleccionMultiples.includes(doc.id) ? 'bg-blue-600 shadow-md border-transparent' : 'bg-white/90 backdrop-blur border-2 border-slate-300 shadow-sm'}`}>
                         {seleccionMultiples.includes(doc.id) && <Check size={14} className="text-white md:w-[16px]" strokeWidth={3} />}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className={`aspect-square bg-slate-100/80 rounded-xl md:rounded-[2rem] mb-3 md:mb-4 overflow-hidden flex items-center justify-center relative transition-opacity ${modoSeleccion && seleccionMultiples.includes(doc.id) ? 'opacity-70' : ''}`}>
                  {(doc.tipo_archivo || '').includes('image') ? (
                    <img src={doc.miniUrl || doc.signedUrl} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  ) : (
                    <FileText className="text-slate-300 w-10 md:w-16 h-10 md:h-16" />
                  )}
                  {!modoSeleccion && (
                    <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/10 transition-colors flex items-center justify-center">
                         <Maximize2 className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" size={20} />
                    </div>
                  )}
                </div>
                <div className="px-1 text-center">
                  <p className="text-[9px] md:text-[10px] font-black text-slate-800 uppercase truncate leading-tight">{doc.titulo || doc.nombre_archivo}</p>
                  <p className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase mt-1 md:mt-1.5 tracking-tight">
                    {doc.fecha_subida ? new Date(doc.fecha_subida).toLocaleDateString('es-CL') : 'S/F'}
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* BARRA FLOTANTE DE ACCIONES MÚLTIPLES */}
        <AnimatePresence>
          {modoSeleccion && seleccionMultiples.length > 0 && (
              <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-4 md:bottom-10 w-[95%] md:w-auto left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-2xl p-3 md:p-4 rounded-[1.5rem] md:rounded-[2rem] shadow-2xl z-[99999] flex flex-col md:flex-row items-center gap-3 md:gap-4 border border-white/10 overflow-x-auto custom-scrollbar">
                  <div className="w-full md:w-auto px-2 md:px-5 text-white md:border-r border-white/10 md:pr-6 text-center md:text-left flex md:block justify-between items-center">
                    <p className="text-[9px] font-black uppercase tracking-widest text-blue-400">Seleccionados</p>
                    <p className="font-bold text-xs">{seleccionMultiples.length} archivos</p>
                  </div>
                  <div className="flex flex-wrap md:flex-nowrap items-center justify-center gap-2 w-full md:w-auto">
                      <button onClick={descargarMultiples} className="flex-1 md:flex-none px-4 md:px-5 py-2.5 md:py-3 bg-emerald-600 text-white hover:bg-emerald-500 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md">
                          <Download size={14} strokeWidth={2.5}/> <span className="hidden sm:inline">Descargar</span>
                      </button>
                      <button onClick={() => {
                          setDatosRenombrar(documentos.filter(d => seleccionMultiples.includes(d.id)).map(d => ({id: d.id, titulo: d.titulo || d.nombre_archivo, url: d.miniUrl || d.signedUrl, tipo: d.tipo_archivo})))
                          setModalRenombrarAbierto(true)
                      }} className="flex-1 md:flex-none px-4 md:px-5 py-2.5 md:py-3 bg-blue-600 text-white hover:bg-blue-500 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md">
                          <Edit3 size={14} strokeWidth={2.5}/> <span className="hidden sm:inline">Renombrar</span>
                      </button>
                      <button onClick={eliminarMultiples} className="flex-1 md:flex-none px-4 md:px-5 py-2.5 md:py-3 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                          <Trash2 size={14} strokeWidth={2.5}/> <span className="hidden sm:inline">Eliminar</span>
                      </button>
                      <button onClick={() => { setSeleccionMultiples([]); setModoSeleccion(false); }} className="p-2.5 bg-white/10 md:bg-transparent text-white md:text-slate-400 hover:text-white hover:bg-white/20 rounded-xl md:rounded-full transition-colors ml-0 md:ml-1 shrink-0">
                          <X size={16}/>
                      </button>
                  </div>
              </motion.div>
          )}
        </AnimatePresence>

        {/* MODAL PARA RENOMBRAR EN BLOQUE */}
        <AnimatePresence>
          {modalRenombrarAbierto && (
            <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/50 backdrop-blur-md p-4 text-left">
              <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white/95 backdrop-blur-2xl w-full max-w-2xl rounded-3xl md:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden max-h-[90vh] md:max-h-[85vh] border border-white/80">
                <div className="p-5 md:p-8 border-b border-slate-100 bg-blue-50/80 flex justify-between items-center shrink-0">
                   <div className="flex items-center gap-3 md:gap-4">
                      <div className="p-2.5 md:p-3.5 bg-blue-600 text-white rounded-[1rem] md:rounded-2xl shadow-sm"><Edit3 size={18} className="md:w-[20px] md:h-[20px]" strokeWidth={2.5}/></div>
                      <div>
                        <h2 className="font-black text-lg md:text-xl uppercase tracking-tighter text-blue-950 leading-none">Renombrar</h2>
                        <p className="text-[9px] md:text-[10px] text-blue-600 font-bold uppercase tracking-widest mt-1">Editando {datosRenombrar.length} elementos</p>
                      </div>
                   </div>
                   <button onClick={() => setModalRenombrarAbierto(false)} className="p-2 text-blue-500 hover:bg-blue-100 rounded-xl transition-colors"><X size={20}/></button>
                </div>
                
                <div className="flex-1 p-4 md:p-8 overflow-y-auto space-y-3 md:space-y-4 bg-slate-50/50 custom-scrollbar">
                   {datosRenombrar.map((doc, idx) => (
                      <div key={doc.id} className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 md:gap-5">
                         <div className="w-full sm:w-16 h-24 sm:h-16 rounded-xl md:rounded-2xl bg-slate-100 overflow-hidden flex items-center justify-center shrink-0 border border-slate-200/60">
                           {(doc.tipo || '').includes('image') ? <img src={doc.url} className="w-full h-full object-cover" /> : <FileText size={24} className="text-slate-400"/>}
                         </div>
                         <div className="flex-1 space-y-1 md:space-y-1.5 w-full">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Nuevo Título</label>
                            <input type="text" className="w-full bg-slate-50 border border-slate-200/80 p-3 md:p-3.5 rounded-xl md:rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 ring-blue-500/10 transition-all shadow-sm" value={doc.titulo} onChange={(e) => {
                               const updated = [...datosRenombrar];
                               updated[idx].titulo = e.target.value;
                               setDatosRenombrar(updated);
                            }} />
                         </div>
                      </div>
                   ))}
                </div>

                <div className="p-4 md:p-8 bg-white border-t border-slate-100 shrink-0">
                   <button onClick={guardarNombresMultiples} className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 md:py-5 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-2 border border-blue-500">
                     <Save size={16} className="md:w-[18px] md:h-[18px]" strokeWidth={2.5} /> Guardar Títulos
                   </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* VISOR MODAL (PORTAL INDIVIDUAL) */}
        {isMounted && createPortal(
          <AnimatePresence>
            {visorAbierto && seleccionado && (
              <motion.div
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl z-[99999] flex flex-col lg:flex-row overflow-hidden text-left"
              >
                {/* ÁREA DE LA IMAGEN O ARCHIVO */}
                <div className="w-full lg:w-[75%] h-[55vh] lg:h-full relative flex items-center justify-center p-2 sm:p-4 lg:p-12 overflow-hidden text-left border-b lg:border-b-0 lg:border-r border-white/10 shrink-0 lg:shrink">
                    
                    {/* BARRA DE ZOOM (Oculta en móviles, se asume pellizcar, o se ajusta) */}
                    <div className="hidden lg:flex absolute bottom-10 left-1/2 -translate-x-1/2 items-center gap-2 bg-slate-900/90 backdrop-blur-xl border border-white/10 p-2 rounded-3xl z-20 shadow-2xl">
                      <button onClick={disminuirZoom} className="p-3 text-white hover:bg-white/10 rounded-2xl transition-all"><ZoomOut size={18}/></button>
                      <div className="px-4 flex flex-col items-center">
                        <span className="text-[11px] font-black text-blue-400 uppercase tracking-widest">{zoom.toFixed(1)}x</span>
                      </div>
                      <button onClick={aumentarZoom} className="p-3 text-white hover:bg-white/10 rounded-2xl transition-all"><ZoomIn size={18}/></button>
                      <div className="w-[1px] h-6 bg-white/10 mx-2"></div>
                      <button onClick={resetearZoom} className="p-3 text-white hover:bg-white/10 rounded-2xl transition-all"><RefreshCcw size={16}/></button>
                    </div>

                    <button onClick={() => setVisorAbierto(false)} className="absolute top-4 left-4 lg:top-8 lg:left-8 bg-slate-900/50 p-2 lg:p-0 lg:bg-transparent rounded-full text-white/80 hover:text-white flex items-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all z-30">
                      <X size={18} strokeWidth={2.5} /> <span className="hidden lg:inline">Salir del Visor</span>
                    </button>

                    {/* BOTÓN DESCARGA INDIVIDUAL */}
                    <div className="absolute top-4 right-4 lg:top-8 lg:right-8 flex gap-3 z-30">
                      <button 
                        onClick={() => {
                          const link = document.createElement('a'); link.href = seleccionado.signedUrl;
                          link.download = nombreDescarga(seleccionado);
                          link.target = '_blank'; link.rel = 'noopener noreferrer';
                          document.body.appendChild(link); link.click();
                          document.body.removeChild(link); toast.success("Descarga iniciada");
                        }}
                        className="bg-slate-900/50 lg:bg-slate-900 text-white p-2.5 lg:p-3 rounded-full lg:rounded-2xl hover:bg-blue-600 transition-all shadow-lg border border-white/10"
                        title="Descargar archivo original"
                      >
                        <Download size={16} className="lg:w-[18px] lg:h-[18px]" strokeWidth={2.5} />
                      </button>
                    </div>

                    <div className="w-full h-full flex items-center justify-center overflow-hidden">
                      {(seleccionado.tipo_archivo || '').includes('image') ? (
                        <motion.div
                          drag={zoom > 1}
                          dragMomentum={false}
                          animate={{ scale: zoom, x: zoom === 1 ? 0 : undefined, y: zoom === 1 ? 0 : undefined }}
                          className={zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                        >
                          <img src={seleccionado.signedUrl} referrerPolicy="no-referrer" className="max-w-full max-h-[50vh] lg:max-h-[85vh] object-contain rounded-sm select-none pointer-events-none shadow-2xl" draggable={false} />
                        </motion.div>
                      ) : (
                        <div className="flex flex-col items-center gap-4 lg:gap-6">
                           <FileText size={80} className="text-white/10 lg:w-[120px] lg:h-[120px]" />
                           <a href={seleccionado.signedUrl} target="_blank" rel="noopener noreferrer" className="bg-white text-slate-900 px-6 py-4 lg:px-10 lg:py-5 rounded-2xl lg:rounded-3xl font-black text-[10px] lg:text-xs uppercase shadow-2xl hover:scale-105 transition-transform text-center">Abrir PDF</a>
                        </div>
                      )}
                    </div>
                </div>

                {/* BARRA LATERAL (INFO) */}
                <div className="w-full lg:w-[25%] bg-white h-[45vh] lg:h-full p-6 lg:p-10 flex flex-col shadow-2xl z-30 text-left overflow-y-auto">
                  <div className="flex-1 space-y-6 lg:space-y-8 overflow-y-auto pr-2 text-left custom-scrollbar">
                    <div className="space-y-2 text-left">
                      <p className="text-[9px] lg:text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 text-left"><FileType size={12}/> {seleccionado.tipo_archivo?.split('/')[1] || 'FILE'}</p>
                      <h4 className="text-lg lg:text-xl font-black text-slate-800 leading-tight uppercase italic break-words text-left">{seleccionado.nombre_archivo}</h4>
                    </div>
                    <div className="pt-4 lg:pt-6 border-t border-slate-100 text-left">
                       <p className="text-[9px] lg:text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2 text-left"><Calendar size={14} /> {seleccionado.fecha_subida ? new Date(seleccionado.fecha_subida).toLocaleDateString() : 'S/F'}</p>
                    </div>
                    <div className="space-y-5 lg:space-y-6 pt-6 lg:pt-10 text-left pb-4">
                      <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 italic text-left">Título Visual</label>
                        <input type="text" className="w-full bg-slate-50 border border-slate-200/80 p-3 lg:p-4 rounded-xl lg:rounded-2xl text-xs font-bold outline-none text-slate-900 focus:ring-4 ring-blue-500/10" value={editando.titulo} onChange={(e) => setEditando({...editando, titulo: e.target.value})} />
                      </div>
                      <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 italic text-left">Descripción / Hallazgos</label>
                        <textarea className="w-full bg-slate-50 border border-slate-200/80 p-3 lg:p-4 rounded-xl lg:rounded-2xl text-xs font-bold outline-none text-slate-900 focus:ring-4 ring-blue-500/10 min-h-[100px] lg:min-h-[160px] resize-none" value={editando.descripcion} onChange={(e) => setEditando({...editando, descripcion: e.target.value})}></textarea>
                      </div>
                    </div>
                  </div>
                  
                  {/* BOTONES DE GUARDAR / ELIMINAR */}
                  <div className="pt-4 lg:pt-8 space-y-2.5 lg:space-y-3 text-left shrink-0 bg-white">
                    
                    {/* NUEVO BOTÓN DE DESCARGA */}
                    <button 
                      onClick={async () => {
                        const toastId = toast.loading("Preparando descarga...");
                        try {
                          // 1. Obtenemos el archivo mediante fetch
                          const response = await fetch(seleccionado.signedUrl);
                          if (!response.ok) throw new Error('Error en la red');
                          
                          // 2. Lo convertimos a blob (archivo binario)
                          const blob = await response.blob();
                          
                          // 3. Creamos una URL local temporal
                          const url = window.URL.createObjectURL(blob);
                          
                          // 4. Forzamos la descarga
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = nombreDescarga(seleccionado);
                          document.body.appendChild(link);
                          link.click();
                          
                          // 5. Limpiamos
                          document.body.removeChild(link);
                          window.URL.revokeObjectURL(url);
                          
                          toast.success("Descarga completada", { id: toastId });
                        } catch (error) {
                          console.error("Error al descargar:", error);
                          toast.error("Error al descargar el archivo", { id: toastId });
                        }
                      }} 
                      className="w-full bg-emerald-50 text-emerald-600 py-3 lg:py-4 rounded-xl lg:rounded-2xl font-black text-[9px] lg:text-[10px] uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Download size={16} strokeWidth={2.5}/> Descargar Archivo
                    </button>

                    <button onClick={guardarCambios} className="w-full bg-blue-600 text-white py-3.5 lg:py-5 rounded-xl lg:rounded-2xl font-black text-[10px] lg:text-xs uppercase tracking-widest shadow-xl hover:bg-slate-900 transition-all flex items-center justify-center gap-2">
                      <Save size={16} strokeWidth={2.5}/> Guardar Cambios
                    </button>
                    
                    <button onClick={eliminarArchivo} className="w-full bg-red-50 text-red-500 py-3 lg:py-4 rounded-xl lg:rounded-2xl font-black text-[9px] lg:text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2">
                      <Trash2 size={16} strokeWidth={2.5}/> Eliminar
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

        <style dangerouslySetInnerHTML={{ __html: `
          .custom-scrollbar::-webkit-scrollbar { width: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        `}}></style>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { 
  UploadCloud, ImageIcon, FileText, Trash2, 
  ExternalLink, Loader2, Plus, X, Search,
  Filter, Eye, Download, ZoomIn, ZoomOut, RotateCcw,
  Pencil, Save 
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch"

export default function PacienteArchivosPage() {
  const { id } = useParams()
  
  // --- ESTADOS PARA AUDITORÍA SEREMI ---
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [perfil, setPerfil] = useState<any>(null)
  
  const [archivos, setArchivos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [modalImagen, setModalImagen] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  // --- ESTADOS PARA EDICIÓN ---
  const [modalEditar, setModalEditar] = useState<any>(null)
  const [editTitulo, setEditTitulo] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    // Obtener sesión y perfil para la auditoría SEREMI
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

    if (id) fetchArchivos()
  }, [id])

  // --- FUNCIÓN DE AUDITORÍA ENRIQUECIDA (SEREMI) ---
  const registrarAuditoria = async (accion: string, detalles: string, datos_anteriores: any = null, datos_nuevos: any = null) => {
    if (!sessionUserId || !perfil) return;
    try {
      await supabase.from('auditoria_clinica').insert([{
        usuario_id: sessionUserId,
        rut_usuario: perfil.rut,
        nombre_usuario: perfil.nombre_completo,
        rol_al_momento: perfil.rol,
        paciente_id: id,
        accion,
        tabla: 'documentos_pacientes',
        detalles,
        datos_anteriores,
        datos_nuevos,
        user_agent: navigator.userAgent
      }]);
    } catch (e) {
      console.error("Error al registrar auditoría", e);
    }
  }

  async function fetchArchivos() {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('documentos_pacientes')
        .select('*')
        .eq('paciente_id', id)
        .order('fecha_subida', { ascending: false })
      
      if (error) throw error
      setArchivos(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setCargando(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Tipo de archivo no permitido');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo no puede superar 10MB');
      return;
    }

    setSubiendo(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${id}/${Date.now()}.${fileExt}`
      const { error: storageError } = await supabase.storage
        .from('documentos_pacientes')
        .upload(fileName, file)

      if (storageError) throw storageError

      const { data: { publicUrl } } = supabase.storage
        .from('documentos_pacientes')
        .getPublicUrl(fileName)

      const nuevoArchivoData = {
        paciente_id: id,
        nombre_archivo: file.name,
        url_archivo: publicUrl,
        tipo_archivo: file.type,
        titulo: file.name.split('.')[0].toUpperCase(),
        descripcion: ''
      };

      const { error: dbError } = await supabase
        .from('documentos_pacientes')
        .insert([nuevoArchivoData])

      if (dbError) throw dbError

      // REGISTRAR AUDITORÍA AL SUBIR
      await registrarAuditoria(
        'INSERT / SUBIR ARCHIVO', 
        `Subió el archivo multimedia "${nuevoArchivoData.titulo}"`, 
        null, 
        nuevoArchivoData
      );

      toast.success("Archivo subido correctamente")
      fetchArchivos()
    } catch (error: any) {
      toast.error("Error al subir: " + error.message)
    } finally {
      setSubiendo(false)
    }
  }

  const eliminarArchivo = async (archivo: any) => {
    if (typeof window !== 'undefined') {
      if (!window.confirm("¿Deseas eliminar este archivo permanentemente?")) return
    }

    try {
      const path = archivo.url_archivo.split('documentos_pacientes/').pop()
      if (path) {
        await supabase.storage.from('documentos_pacientes').remove([path])
      }
      await supabase.from('documentos_pacientes').delete().eq('id', archivo.id)
      
      // REGISTRAR AUDITORÍA AL ELIMINAR
      await registrarAuditoria(
        'DELETE / ELIMINAR ARCHIVO', 
        `Eliminó el archivo multimedia "${archivo.titulo || archivo.nombre_archivo}"`, 
        archivo, 
        null
      );
      
      setArchivos(archivos.filter(a => a.id !== archivo.id))
      toast.success("Archivo eliminado")
    } catch (error) {
      toast.error("Error al eliminar")
    }
  }

  const abrirModalEdicion = (archivo: any) => {
    setModalEditar(archivo)
    setEditTitulo(archivo.titulo || '')
    setEditDescripcion(archivo.descripcion || '')
  }

  const guardarEdicion = async () => {
    if (!editTitulo.trim()) {
      toast.error("El título no puede estar vacío")
      return
    }

    setGuardandoEdicion(true)
    try {
      const { error } = await supabase
        .from('documentos_pacientes')
        .update({ 
          titulo: editTitulo.toUpperCase(), 
          descripcion: editDescripcion 
        })
        .eq('id', modalEditar.id)

      if (error) throw error

      // REGISTRAR AUDITORÍA AL EDITAR
      await registrarAuditoria(
        'UPDATE / EDITAR ARCHIVO', 
        `Editó los detalles del archivo multimedia "${editTitulo.toUpperCase()}"`, 
        { titulo: modalEditar.titulo, descripcion: modalEditar.descripcion }, 
        { titulo: editTitulo.toUpperCase(), descripcion: editDescripcion }
      );

      setArchivos(archivos.map(a => a.id === modalEditar.id ? { 
        ...a, 
        titulo: editTitulo.toUpperCase(), 
        descripcion: editDescripcion 
      } : a))
      
      toast.success("Información actualizada")
      setModalEditar(null)
    } catch (error) {
      toast.error("Error al guardar los cambios")
    } finally {
      setGuardandoEdicion(false)
    }
  }

  const archivosFiltrados = archivos.filter(a => 
    (a.titulo || '').toLowerCase().includes(filtro.toLowerCase()) ||
    (a.nombre_archivo || '').toLowerCase().includes(filtro.toLowerCase()) ||
    (a.descripcion || '').toLowerCase().includes(filtro.toLowerCase())
  )

  if (cargando) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <Loader2 className="animate-spin text-blue-600" size={40} />
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando galería...</p>
    </div>
  )

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500 text-left">
      {/* HEADER DE SECCIÓN */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-left">
        <div className="text-left">
          <h2 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter text-left">Galería Multimedia</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1 text-left">Gestión de Radiografías y Documentos</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64 text-left">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Buscar archivo..."
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-2 ring-blue-500/20 transition-all text-slate-900 shadow-inner border-none"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
          </div>
          
          <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-blue-100 transition-all flex items-center gap-2 shrink-0">
            {subiendo ? <Loader2 className="animate-spin" size={16}/> : <UploadCloud size={16}/>}
            {subiendo ? 'Subiendo...' : 'Subir Archivo'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={subiendo} accept="image/*,application/pdf" />
          </label>
        </div>
      </div>

      {/* GRID DE ARCHIVOS */}
      {archivosFiltrados.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 text-left">
          <AnimatePresence>
            {archivosFiltrados.map((arc) => (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                key={arc.id}
                className="group bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl hover:border-blue-200 transition-all text-left flex flex-col"
              >
                {/* PREVIEW */}
                <div className="aspect-video bg-slate-50 relative overflow-hidden flex items-center justify-center shrink-0">
                  {(arc.tipo_archivo || '').includes('image') ? (
                    <img 
                      src={arc.url_archivo} 
                      alt={arc.titulo} 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 cursor-pointer"
                      onClick={() => setModalImagen(arc.url_archivo)}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <FileText size={48} className="text-slate-200" />
                      <span className="text-[8px] font-black text-slate-300 uppercase">Documento PDF</span>
                    </div>
                  )}
                  
                  {/* OVERLAY ACTIONS */}
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm px-2">
                    {(arc.tipo_archivo || '').includes('image') && (
                      <button onClick={() => setModalImagen(arc.url_archivo)} className="p-2.5 bg-white rounded-xl text-slate-900 hover:bg-blue-600 hover:text-white transition-all" title="Ver imagen">
                        <Eye size={16} />
                      </button>
                    )}
                    <a href={arc.url_archivo} target="_blank" rel="noopener noreferrer" className="p-2.5 bg-white rounded-xl text-slate-900 hover:bg-blue-600 hover:text-white transition-all" title="Descargar">
                      <Download size={16} />
                    </a>
                    
                    {/* BOTÓN EDITAR */}
                    <button onClick={() => abrirModalEdicion(arc)} className="p-2.5 bg-white rounded-xl text-slate-900 hover:bg-amber-500 hover:text-white transition-all" title="Editar detalles">
                      <Pencil size={16} />
                    </button>

                    <button onClick={() => eliminarArchivo(arc)} className="p-2.5 bg-white rounded-xl text-red-500 hover:bg-red-500 hover:text-white transition-all" title="Eliminar">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* INFO */}
                <div className="p-5 flex-1 flex flex-col justify-between text-left">
                  <div>
                    <h3 className="text-xs font-black text-slate-800 uppercase truncate mb-1 text-left">{arc.titulo || 'Sin título'}</h3>
                    {/* Mostrar descripción si existe */}
                    {arc.descripcion && (
                      <p className="text-[10px] text-slate-500 line-clamp-2 leading-snug mb-3">{arc.descripcion}</p>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-left mt-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-left">
                      {arc.fecha_subida ? new Date(arc.fecha_subida).toLocaleDateString('es-CL') : 'S/F'}
                    </span>
                    <span className="text-[8px] px-2 py-0.5 bg-slate-100 rounded-md font-black text-slate-500 uppercase">
                      {arc.tipo_archivo?.split('/')[1] || 'FILE'}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-100">
          <div className="bg-white p-6 rounded-full shadow-sm mb-4 text-slate-200">
            <ImageIcon size={40} />
          </div>
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest text-center">No hay archivos registrados</h3>
          <p className="text-xs text-slate-300 mt-2 text-center">Sube radiografías, fotos o exámenes del paciente.</p>
        </div>
      )}

      {/* LIGHTBOX DE IMAGEN A PANTALLA COMPLETA */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {modalImagen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 999999 }}
              className="flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4 md:p-8"
              onClick={() => setModalImagen(null)}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
                className="relative max-w-6xl w-full max-h-[85vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <button 
                  onClick={() => setModalImagen(null)}
                  className="absolute -top-14 right-0 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-3 rounded-2xl backdrop-blur-md transition-all z-50 shadow-lg cursor-pointer"
                >
                  <X size={24} strokeWidth={2.5} />
                </button>
                
                <TransformWrapper initialScale={1} minScale={0.5} maxScale={5} centerOnInit={true}>
                  {({ zoomIn, zoomOut, resetTransform }) => (
                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                      <div className="absolute bottom-4 z-50 flex gap-2 bg-slate-900/60 backdrop-blur-md p-2 rounded-2xl border border-white/10 shadow-xl">
                        <button onClick={() => zoomIn()} className="p-2 text-white hover:bg-blue-600 rounded-xl transition-colors"><ZoomIn size={20} /></button>
                        <button onClick={() => zoomOut()} className="p-2 text-white hover:bg-blue-600 rounded-xl transition-colors"><ZoomOut size={20} /></button>
                        <button onClick={() => resetTransform()} className="p-2 text-white hover:bg-blue-600 rounded-xl transition-colors"><RotateCcw size={20} /></button>
                      </div>
                      <TransformComponent wrapperStyle={{ width: "100%", height: "100%", maxHeight: "85vh" }} contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyItems: "center" }}>
                        <img 
                          src={modalImagen} 
                          referrerPolicy="no-referrer"
                          className="rounded-3xl shadow-2xl max-h-[85vh] object-contain border border-white/10 relative z-40 cursor-grab active:cursor-grabbing" 
                          alt="Vista completa"
                        />
                      </TransformComponent>
                    </div>
                  )}
                </TransformWrapper>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* MODAL PARA EDITAR INFORMACIÓN (TÍTULO Y DESCRIPCIÓN) */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {modalEditar && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 999999 }}
              className="flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
              onClick={() => !guardandoEdicion && setModalEditar(null)}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden text-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h3 className="font-black uppercase italic text-sm text-slate-800">Editar Archivo</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Actualiza los detalles</p>
                  </div>
                  <button 
                    onClick={() => setModalEditar(null)}
                    disabled={guardandoEdicion}
                    className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-slate-800 rounded-xl transition-all"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Título del archivo</label>
                    <input 
                      type="text" 
                      value={editTitulo}
                      onChange={(e) => setEditTitulo(e.target.value)}
                      placeholder="Ej: RADIOGRAFÍA PANORÁMICA"
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all uppercase"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Descripción (Opcional)</label>
                    <textarea 
                      value={editDescripcion}
                      onChange={(e) => setEditDescripcion(e.target.value)}
                      placeholder="Agrega notas o detalles sobre este documento..."
                      rows={4}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                  <button 
                    onClick={() => setModalEditar(null)}
                    disabled={guardandoEdicion}
                    className="flex-1 py-3 bg-white border-2 border-slate-200 text-slate-500 rounded-xl font-black text-[10px] uppercase hover:bg-slate-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={guardarEdicion}
                    disabled={guardandoEdicion}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                  >
                    {guardandoEdicion ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {guardandoEdicion ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

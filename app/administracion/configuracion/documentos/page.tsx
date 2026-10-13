'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import { 
  FileText, Plus, Search, Trash2, Loader2, X, Save, 
  CheckCircle2, XCircle, Edit2, ChevronRight, AlertCircle 
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { toast } from 'sonner' // Opcional, asumiendo que usas sonner por los componentes anteriores

export default function DocumentosConfigPage() {
  const [categorias, setCategorias] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  
  // Estados Modal
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombreCat, setNombreCat] = useState('')

  // Estado para los Portals
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    fetchCategorias()
  }, [])

  async function fetchCategorias() {
    setCargando(true)
    const { data } = await supabase
      .from('documentos_categorias')
      .select('*')
      .order('nombre', { ascending: true })
    if (data) setCategorias(data)
    setCargando(false)
  }

  const handleGuardar = async () => {
    if (!nombreCat.trim()) return
    setGuardando(true)
    try {
      if (editandoId) {
        await supabase.from('documentos_categorias').update({ nombre: nombreCat.toUpperCase() }).eq('id', editandoId)
      } else {
        await supabase.from('documentos_categorias').insert([{ nombre: nombreCat.toUpperCase(), estado: 'Habilitado' }])
      }
      setModalAbierto(false)
      setNombreCat('')
      setEditandoId(null)
      fetchCategorias()
    } catch (err) { 
      alert("Error al guardar la categoría") 
    } finally { 
      setGuardando(false) 
    }
  }

  const toggleEstado = async (id: string, estadoActual: string) => {
    const nuevo = estadoActual === 'Habilitado' ? 'Deshabilitado' : 'Habilitado'
    await supabase.from('documentos_categorias').update({ estado: nuevo }).eq('id', id)
    setCategorias(categorias.map(c => c.id === id ? { ...c, estado: nuevo } : c))
  }

  const eliminarCat = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta sección?")) return
    await supabase.from('documentos_categorias').delete().eq('id', id)
    setCategorias(categorias.filter(c => c.id !== id))
  }

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#FBF8F2] gap-4">
      <Loader2 className="animate-spin text-[#C9A24B]" size={40} />
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando documentos...</p>
    </div>
  )

  return (
    <main className="min-h-screen bg-[#FBF8F2] p-6 md:p-10 font-sans text-slate-900 relative overflow-hidden z-0">
      
      {/* IMAGEN DE FONDO GLOBAL */}
      <div 
        className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"
      ></div>

      <div className="max-w-6xl mx-auto space-y-8 relative z-10 text-left">
        
        {/* HEADER */}
        <header className="bg-white/90 backdrop-blur-md p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 text-left">
          <div className="flex items-center gap-5 text-left w-full md:w-auto">
            <div className="bg-[#0A111F] w-16 h-16 rounded-full flex items-center justify-center text-[#C9A24B] shadow-lg shrink-0">
              <FileText size={28} />
            </div>
            <div className="text-left">
              <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight text-left">Documentos Clínicos</h1>
              <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1.5 text-left">Configuración de formatos y plantillas</p>
            </div>
          </div>
          
          <button 
            onClick={() => { setEditandoId(null); setNombreCat(''); setModalAbierto(true); }}
            className="bg-[#0A111F] text-white px-6 py-4 rounded-full font-bold text-[11px] uppercase tracking-wider hover:bg-[#1a2538] transition-all shadow-md flex items-center justify-center gap-2 shrink-0 w-full md:w-auto text-left"
          >
            <Plus size={16} /> Nuevo documento clínico
          </button>
        </header>

        {/* TABLA DE CATEGORÍAS */}
        <div className="bg-white/95 backdrop-blur-sm rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden text-left">
          <div className="overflow-x-auto text-left">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em]">
                  <th className="px-8 py-5">Nombre de la Sección</th>
                  <th className="px-6 py-5 text-center">Estado</th>
                  <th className="px-8 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60 text-left">
                {categorias.map((cat) => (
                  <tr key={cat.id} className="group hover:bg-slate-50/50 transition-all text-left">
                    <td className="px-8 py-5">
                      <Link href={`/administracion/configuracion/documentos/${cat.id}`} className="flex items-center gap-4 w-fit">
                        <div className="w-12 h-12 bg-[#C9A24B]/10 rounded-2xl flex items-center justify-center text-[#C9A24B] shrink-0 group-hover:bg-[#0A111F] group-hover:text-[#C9A24B] transition-colors">
                          <FileText size={20} />
                        </div>
                        <span className="text-sm font-black text-[#0A111F] uppercase italic leading-tight group-hover:text-[#C9A24B] transition-colors">
                          {cat.nombre}
                        </span>
                      </Link>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <button 
                        onClick={() => toggleEstado(cat.id, cat.estado)}
                        className={`
                          relative inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-sm
                          ${cat.estado === 'Habilitado' 
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100' 
                            : 'bg-red-50 text-red-500 border border-red-100 hover:bg-red-100'
                          }
                          cursor-pointer active:scale-95
                        `}
                      >
                        {cat.estado === 'Habilitado' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {cat.estado}
                      </button>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex justify-center gap-1.5">
                        <button 
                          onClick={() => { setEditandoId(cat.id); setNombreCat(cat.nombre); setModalAbierto(true); }}
                          className="p-2.5 bg-slate-50 text-slate-400 rounded-full hover:bg-[#0A111F] hover:text-white transition-all shadow-sm border border-slate-200 hover:border-[#0A111F]"
                          title="Editar Sección"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => eliminarCat(cat.id)}
                          className="p-2.5 bg-slate-50 text-slate-400 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm border border-slate-200 hover:border-red-500"
                          title="Eliminar Sección"
                        >
                          <Trash2 size={14} />
                        </button>
                        <Link 
                          href={`/administracion/configuracion/documentos/${cat.id}`}
                          className="p-2.5 bg-slate-50 text-slate-400 rounded-full hover:bg-[#C9A24B] hover:text-white transition-all shadow-sm border border-slate-200 hover:border-[#C9A24B]"
                          title="Ver Documentos"
                        >
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {categorias.length === 0 && (
            <div className="p-20 text-center flex flex-col items-center gap-4 bg-white/95">
              <AlertCircle size={48} className="text-slate-300 opacity-60" />
              <p className="font-black text-[#0A111F] uppercase text-sm tracking-tight">No hay documentos clínicos</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Crea una nueva sección para comenzar</p>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL CREAR/EDITAR ENVOLVIDO EN CREATEPORTAL */}
      {/* ========================================================================= */}
      {isMounted && typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
          {modalAbierto && (
            <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4 text-left">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                className="bg-white w-full max-w-sm rounded-[3rem] p-8 md:p-10 shadow-2xl relative border border-slate-100 text-left"
              >
                <button onClick={() => setModalAbierto(false)} className="absolute top-8 right-8 p-2 bg-slate-50 rounded-full text-slate-400 hover:text-red-500 transition-colors shadow-sm">
                  <X size={20}/>
                </button>
                
                <h2 className="text-xl font-black text-[#0A111F] tracking-tight uppercase italic leading-none mb-6">
                  {editandoId ? 'Editar Nombre' : 'Nueva Sección'}
                </h2>
                
                <div className="space-y-6 text-left">
                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 block">Nombre del Documento</label>
                    <input 
                      autoFocus
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] text-slate-900 shadow-sm placeholder:text-slate-400"
                      placeholder="Ej: CONSENTIMIENTOS"
                      value={nombreCat}
                      onChange={(e) => setNombreCat(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={handleGuardar}
                    disabled={guardando || !nombreCat}
                    className="w-full bg-[#0A111F] text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 disabled:bg-slate-300 mt-4"
                  >
                    {guardando ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} 
                    Guardar Cambios
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

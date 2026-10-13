'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import { 
  Stethoscope, Plus, Search, Trash2, 
  Edit3, X, Save, Loader2, Tag, ChevronRight, Users,
  Activity, Syringe, Smile, ShieldPlus, Award,
  HeartPulse, Bone, Sparkles, Droplets
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// Colección de iconos disponibles para elegir en el modal
const ICONOS_DISPONIBLES = [
  { id: 'Stethoscope', icon: <Stethoscope /> },
  { id: 'Activity', icon: <Activity /> },
  { id: 'Syringe', icon: <Syringe /> },
  { id: 'Smile', icon: <Smile /> },
  { id: 'ShieldPlus', icon: <ShieldPlus /> },
  { id: 'Award', icon: <Award /> },
  { id: 'Bone', icon: <Bone /> },
  { id: 'HeartPulse', icon: <HeartPulse /> },
  { id: 'Sparkles', icon: <Sparkles /> },
  { id: 'Droplets', icon: <Droplets /> },
]

export default function EspecialidadesPage() {
  const [especialidades, setEspecialidades] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  
  // Estados del Formulario
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [iconoSeleccionado, setIconoSeleccionado] = useState('Stethoscope')

  // Estado para los Portals
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    fetchEspecialidades()
  }, [])

  async function fetchEspecialidades() {
    setCargando(true)
    const { data } = await supabase
      .from('especialidades')
      .select(`*, profesionales:profesionales(count)`)
      .order('nombre')
    
    if (data) setEspecialidades(data)
    setCargando(false)
  }

  const handleGuardar = async () => {
    if (!nombre.trim()) return alert("El nombre es obligatorio")
    setGuardando(true)

    const payload = { 
      nombre: nombre.trim(),
      icono: iconoSeleccionado // Se envía a la base de datos
    }

    try {
      if (editandoId) {
        const { error } = await supabase.from('especialidades').update(payload).eq('id', editandoId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('especialidades').insert([payload])
        if (error) throw error
      }

      setModalAbierto(false)
      resetForm()
      fetchEspecialidades()
    } catch (error: any) {
      alert("Error: " + (error.message.includes('unique') ? 'Esa especialidad ya existe' : error.message))
    } finally {
      setGuardando(false)
    }
  }

  const eliminarEspecialidad = async (id: string, count: number) => {
    if (count > 0) return alert("No puedes eliminar una especialidad que tiene profesionales asignados.")
    if (!confirm("¿Seguro que deseas eliminar esta especialidad?")) return

    await supabase.from('especialidades').delete().eq('id', id)
    fetchEspecialidades()
  }

  const resetForm = () => {
    setEditandoId(null)
    setNombre('')
    setIconoSeleccionado('Stethoscope')
  }

  const abrirModalEditar = (esp: any) => {
    setEditandoId(esp.id)
    setNombre(esp.nombre)
    setIconoSeleccionado(esp.icono || 'Stethoscope') // Recupera el icono o usa por defecto
    setModalAbierto(true)
  }

  // Renderiza el icono correcto dinámicamente y mantiene la paleta de colores según el nombre
  const getEspecialidadVisuals = (nombre: string, iconoName: string) => {
    const n = nombre.toLowerCase()
    
    // Asignación de colores
    let bg = 'bg-slate-50'
    let text = 'text-slate-500'
    let desc = 'Área de tratamiento clínico y dental'

    if (n.includes('endodoncia')) { bg = 'bg-blue-50'; text = 'text-blue-500'; desc = 'Tratamientos de conductos y tejidos pulpares' }
    else if (n.includes('general')) { bg = 'bg-emerald-50'; text = 'text-emerald-500'; desc = 'Odontología general y tratamientos básicos' }
    else if (n.includes('implante') || n.includes('implantolog')) { bg = 'bg-purple-50'; text = 'text-purple-500'; desc = 'Colocación de implantes y rehabilitación' }
    else if (n.includes('pediatr') || n.includes('niño')) { bg = 'bg-pink-50'; text = 'text-pink-500'; desc = 'Atención dental especializada para niños' }
    else if (n.includes('ortodoncia')) { bg = 'bg-orange-50'; text = 'text-orange-500'; desc = 'Corrección de la posición dental y maxilar' }
    else if (n.includes('periodoncia')) { bg = 'bg-teal-50'; text = 'text-teal-500'; desc = 'Diagnóstico y tratamiento de encías' }
    
    // Obtener el componente del icono guardado en DB
    const iconObj = ICONOS_DISPONIBLES.find(i => i.id === iconoName)
    
    // Clonamos el icono para darle el tamaño correcto en la tabla
    const IconRenderizado = iconObj ? (
       <iconObj.icon.type size={20} />
    ) : <Tag size={20} />

    return { bg, text, icon: IconRenderizado, desc }
  }

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
            <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-600/30 shrink-0">
              <Tag size={28} />
            </div>
            <div className="text-left">
              <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight text-left">
                ESPECIALIDADES
              </h1>
              <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1.5 text-left">
                Categorización del staff clínico
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => { resetForm(); setModalAbierto(true); }}
            className="bg-[#0A111F] text-white px-6 py-4 rounded-full font-bold text-[11px] uppercase tracking-wider hover:bg-[#1a2538] transition-all shadow-md flex items-center justify-center gap-2 shrink-0 w-full md:w-auto text-left"
          >
            <Plus size={16} /> Nueva Especialidad
          </button>
        </header>

        {/* LISTADO TIPO TARJETA BLANCA */}
        <div className="bg-white/95 backdrop-blur-sm rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre Especialidad</th>
                  <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Profesionales Asignados</th>
                  <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60">
                {cargando ? (
                  <tr>
                    <td colSpan={3} className="py-20 text-center">
                      <Loader2 className="animate-spin mx-auto text-[#C9A24B]" size={30} />
                    </td>
                  </tr>
                ) : especialidades.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-20 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">
                      No hay especialidades creadas
                    </td>
                  </tr>
                ) : especialidades.map((esp) => {
                  const visuals = getEspecialidadVisuals(esp.nombre, esp.icono);
                  
                  return (
                    <tr key={esp.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-10 py-5">
                        <div className="flex items-center gap-5">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${visuals.bg} ${visuals.text}`}>
                            {visuals.icon}
                          </div>
                          <div>
                            <p className="text-[13px] font-black text-[#0A111F] uppercase tracking-wide">{esp.nombre}</p>
                            <p className="text-[11px] font-semibold text-slate-500 mt-1">{visuals.desc}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-5 text-center">
                        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black text-blue-600 bg-blue-50 border border-blue-100 uppercase tracking-wide">
                          <Users size={12}/> {esp.profesionales[0]?.count || 0} asignados
                        </span>
                      </td>
                      <td className="px-10 py-5">
                        <div className="flex justify-end gap-3">
                          <button 
                            onClick={() => abrirModalEditar(esp)}
                            className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-blue-500 hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm"
                            title="Editar"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button 
                            onClick={() => eliminarEspecialidad(esp.id, esp.profesionales[0]?.count)}
                            className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-red-500 hover:bg-red-50 hover:border-red-200 transition-all shadow-sm"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL ENVOLVIDO EN CREATEPORTAL */}
      {isMounted && typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
          {modalAbierto && (
            <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden text-left"
              >
                <div className="p-8 flex justify-between items-center border-b border-slate-100 bg-[#FBF8F2]">
                  <h3 className="text-xl font-black text-[#0A111F] uppercase italic tracking-tight">
                    {editandoId ? 'Editar Especialidad' : 'Nueva Especialidad'}
                  </h3>
                  <button onClick={() => setModalAbierto(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500 transition-colors shadow-sm">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-8 space-y-6">
                  {/* INPUT NOMBRE */}
                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                      <Tag size={12} className="text-[#C9A24B]"/> Nombre de la Especialidad
                    </label>
                    <input 
                      type="text" 
                      placeholder="Ej: Ortodoncia, Endodoncia..."
                      className="w-full bg-slate-50 p-5 rounded-2xl text-xs font-bold border border-slate-200 shadow-sm outline-none focus:border-[#C9A24B] transition-colors text-slate-900 placeholder:text-slate-400"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {/* SELECTOR DE LOGOS/ICONOS */}
                  <div className="space-y-3 pt-2 text-left border-t border-slate-100">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                      <Sparkles size={12} className="text-[#C9A24B]"/> Seleccionar Logo / Icono
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {ICONOS_DISPONIBLES.map((ico) => {
                        const isSelected = iconoSeleccionado === ico.id;
                        return (
                          <button
                            key={ico.id}
                            onClick={() => setIconoSeleccionado(ico.id)}
                            className={`flex items-center justify-center p-4 rounded-2xl transition-all border ${
                              isSelected 
                                ? 'bg-[#C9A24B] border-[#C9A24B] text-white shadow-md shadow-[#C9A24B]/30' 
                                : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                            }`}
                            title={ico.id}
                          >
                            <ico.icon.type size={20} />
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* BOTÓN GUARDAR */}
                  <button 
                    onClick={handleGuardar}
                    disabled={guardando}
                    className="w-full bg-[#0A111F] text-white py-5 rounded-2xl font-black text-[11px] uppercase shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 active:scale-95 disabled:bg-slate-300 tracking-widest mt-4"
                  >
                    {guardando ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                    {editandoId ? 'Actualizar Especialidad' : 'Guardar Especialidad'}
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

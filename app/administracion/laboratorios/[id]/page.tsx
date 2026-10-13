'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import { 
  Beaker, MapPin, Phone, Edit3, Save, 
  CheckCircle2, XCircle, ChevronLeft, X, Loader2,
  FileText, Plus, FlaskConical
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import Link from 'next/link'

export default function DetalleLaboratorio() {
  const { id } = useParams()
  const [laboratorio, setLaboratorio] = useState<any>(null)
  const [prestaciones, setPrestaciones] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  // ESTADOS PARA NUEVA PRESTACIÓN
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [nuevaPres, setNuevaPres] = useState({
    nombre_prestacion: '',
    costo_clinica: 0,
    precio_paciente: 0,
    abastecida: true
  })

  // ESTADOS PARA EDITAR LABORATORIO
  const [modalEditarLabAbierto, setModalEditarLabAbierto] = useState(false)
  const [guardandoLab, setGuardandoLab] = useState(false)
  const [labForm, setLabForm] = useState({
    nombre: '',
    direccion: '',
    telefono: '',
    detalle: ''
  })

  // ESTADO PARA LOS PORTALS (Asegurar que carga en el cliente)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    if (id) fetchDetalle()
  }, [id])

  async function fetchDetalle() {
    setCargando(true)
    try {
      const { data: lab } = await supabase.from('laboratorios').select('*').eq('id', id).single()
      const { data: pres } = await supabase.from('laboratorio_prestaciones').select('*').eq('laboratorio_id', id).order('nombre_prestacion')
      setLaboratorio(lab)
      setPrestaciones(pres || [])
    } catch (error) {
      console.error("Error al cargar detalle:", error)
    } finally {
      setCargando(false)
    }
  }

  // --- FUNCIONES PRESTACIONES ---
  const handleGuardarPrestacion = async () => {
    if (!nuevaPres.nombre_prestacion) return toast.error("El nombre es obligatorio")
    setGuardando(true)
    try {
      const { error } = await supabase.from('laboratorio_prestaciones').insert([{
        ...nuevaPres,
        laboratorio_id: id
      }])
      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('auditoria_clinica').insert([{
          usuario_id: user?.id,
          accion: 'CREATE / PRESTACION LABORATORIO',
          tabla: 'laboratorio_prestaciones',
          detalles: `Agregó la prestación de lab "${nuevaPres.nombre_prestacion}" para ${laboratorio?.nombre}. Costo: $${nuevaPres.costo_clinica}, Venta: $${nuevaPres.precio_paciente}.`
      }])
      
      toast.success('Prestación de laboratorio creada.')
      setModalAbierto(false)
      setNuevaPres({ nombre_prestacion: '', costo_clinica: 0, precio_paciente: 0, abastecida: true })
      fetchDetalle()
    } catch (error: any) {
      toast.error("Error al guardar la prestación: " + error.message)
    } finally {
      setGuardando(false)
    }
  }

  // --- FUNCIONES LABORATORIO ---
  const abrirEditorLab = () => {
    if (laboratorio) {
      setLabForm({
        nombre: laboratorio.nombre || '',
        direccion: laboratorio.direccion || '',
        telefono: laboratorio.telefono || '',
        detalle: laboratorio.detalle || ''
      })
      setModalEditarLabAbierto(true)
    }
  }

  const handleGuardarLab = async () => {
    if (!labForm.nombre.trim()) return toast.error("El nombre comercial es obligatorio")
    setGuardandoLab(true)
    try {
      const { error } = await supabase.from('laboratorios').update({
        nombre: labForm.nombre,
        direccion: labForm.direccion,
        telefono: labForm.telefono,
        detalle: labForm.detalle
      }).eq('id', id)
      
      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('auditoria_clinica').insert([{
          usuario_id: user?.id,
          accion: 'UPDATE / LABORATORIO',
          tabla: 'laboratorios',
          detalles: `Actualizó el perfil del laboratorio "${labForm.nombre}".`
      }])
      
      toast.success('Información del proveedor actualizada.')
      setModalEditarLabAbierto(false)
      fetchDetalle()
    } catch (error: any) {
      toast.error("Error al actualizar el proveedor: " + error.message)
    } finally {
      setGuardandoLab(false)
    }
  }

  if (cargando && !laboratorio) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-40 gap-4 bg-[#FBF8F2]">
      <Loader2 className="animate-spin text-[#C9A24B]" size={40} />
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando catálogo...</p>
    </div>
  )

  return (
    <main className="min-h-screen bg-[#FBF8F2] p-6 md:p-10 font-sans text-slate-900 relative overflow-hidden z-0">
      
      {/* IMAGEN DE FONDO GLOBAL */}
      <div 
        className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"
      ></div>

      <div className="max-w-7xl mx-auto space-y-6 relative z-10 text-left">
        
        <Link href="/administracion/laboratorios" className="flex items-center gap-2 text-slate-400 hover:text-[#0A111F] transition-colors font-black text-[10px] uppercase tracking-widest active:scale-95 w-fit">
          <ChevronLeft size={16}/> Volver a laboratorios
        </Link>

        {/* HEADER */}
        <div className="flex items-center gap-4 pt-2">
          <div className="bg-[#0A111F] text-[#C9A24B] px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md flex items-center gap-2">
            <FlaskConical size={14} /> Catálogo de Prestaciones
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
          
          {/* PANEL DE INFORMACIÓN */}
          <div className="lg:col-span-1">
            <div className="bg-white/95 backdrop-blur-sm p-8 rounded-[2.5rem] shadow-sm border border-slate-100 sticky top-8 text-left">
              <div className="flex justify-between items-start mb-8">
                <h3 className="text-[10px] font-black text-[#C9A24B] uppercase tracking-widest italic">Ficha del Proveedor</h3>
                <button onClick={abrirEditorLab} className="text-slate-300 hover:text-[#0A111F] transition-colors"><Edit3 size={16}/></button>
              </div>
              
              <div className="space-y-8">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Nombre Comercial</label>
                  <p className="text-xl font-black text-[#0A111F] uppercase leading-tight mt-2">{laboratorio?.nombre}</p>
                </div>
                
                <div className="flex gap-4 items-start">
                  <div className="bg-[#C9A24B]/10 p-3 rounded-2xl text-[#C9A24B]"><MapPin size={18}/></div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Dirección</label>
                    <p className="text-xs font-bold text-slate-600 uppercase mt-1">{laboratorio?.direccion || 'No registrada'}</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="bg-[#C9A24B]/10 p-3 rounded-2xl text-[#C9A24B]"><Phone size={18}/></div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Teléfono</label>
                    <p className="text-xs font-bold text-slate-600 mt-1">{laboratorio?.telefono || 'Sin registro'}</p>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={12} className="text-[#C9A24B]" /> Especialidad
                  </label>
                  <p className="text-[11px] font-bold text-slate-600 italic mt-3 leading-relaxed">
                    "{laboratorio?.detalle || 'Sin detalles especificados'}"
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* LISTA DE PRESTACIONES */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white/95 backdrop-blur-sm rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden text-left">
              <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#FBF8F2]/50">
                <h3 className="text-[11px] font-black text-[#0A111F] uppercase tracking-widest flex items-center gap-2">
                  <Beaker size={14} className="text-[#C9A24B]" /> Servicios Disponibles
                </h3>
                <button 
                  onClick={() => setModalAbierto(true)}
                  className="bg-[#0A111F] text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase shadow-md hover:bg-[#1a2538] transition-all flex items-center gap-2 active:scale-95"
                >
                  <Plus size={14}/> Agregar Prestación
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                      <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Servicio</th>
                      <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Costo Lab.</th>
                      <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Venta Paciente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {prestaciones.length === 0 ? (
                      <tr><td colSpan={4} className="p-20 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">No hay prestaciones registradas</td></tr>
                    ) : prestaciones.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-all group">
                        <td className="px-8 py-5">
                          {p.abastecida ? <CheckCircle2 size={16} className="text-emerald-500"/> : <XCircle size={16} className="text-slate-300"/>}
                        </td>
                        <td className="px-8 py-5 text-xs font-black text-[#0A111F] uppercase tracking-wide">{p.nombre_prestacion}</td>
                        <td className="px-8 py-5 text-xs font-bold text-slate-500 text-center">${p.costo_clinica?.toLocaleString()}</td>
                        <td className="px-8 py-5 text-xs font-black text-[#C9A24B] text-center">${p.precio_paciente?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODALES ENVOLVIDOS EN CREATEPORTAL */}
      {isMounted && typeof document !== 'undefined' ? createPortal(
        <>
          {/* MODAL AGREGAR PRESTACIÓN */}
          <AnimatePresence>
            {modalAbierto && (
              <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden text-left"
                >
                  <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-[#FBF8F2]">
                    <h3 className="text-xl font-black text-[#0A111F] uppercase italic tracking-tight">Nueva Prestación</h3>
                    <button onClick={() => setModalAbierto(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500 transition-colors shadow-sm">
                      <X size={20}/>
                    </button>
                  </div>

                  <div className="p-8 space-y-6">
                    <Input 
                      label="Nombre del Servicio" 
                      value={nuevaPres.nombre_prestacion} 
                      onChange={(v: string) => setNuevaPres({...nuevaPres, nombre_prestacion: v})}
                      icon={<Beaker size={12}/>}
                      placeholder="Ej: Corona Zirconio"
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <Input 
                        type="number"
                        label="Costo Clínica ($)" 
                        value={nuevaPres.costo_clinica} 
                        onChange={(v: string) => setNuevaPres({...nuevaPres, costo_clinica: parseInt(v) || 0})}
                      />
                      <Input 
                        type="number"
                        label="Precio Venta ($)" 
                        value={nuevaPres.precio_paciente} 
                        onChange={(v: string) => setNuevaPres({...nuevaPres, precio_paciente: parseInt(v) || 0})}
                      />
                    </div>

                    <button 
                      onClick={handleGuardarPrestacion}
                      disabled={guardando}
                      className="w-full bg-[#0A111F] text-white py-5 rounded-2xl font-black text-[11px] uppercase shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 active:scale-95 disabled:bg-slate-300 tracking-widest mt-4"
                    >
                      {guardando ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                      Guardar Servicio
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* MODAL EDITAR PROVEEDOR */}
          <AnimatePresence>
            {modalEditarLabAbierto && (
              <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden text-left"
                >
                  <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-[#FBF8F2]">
                    <h3 className="text-xl font-black text-[#0A111F] uppercase italic tracking-tight">Editar Proveedor</h3>
                    <button onClick={() => setModalEditarLabAbierto(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500 transition-colors shadow-sm">
                      <X size={20}/>
                    </button>
                  </div>

                  <div className="p-8 space-y-6">
                    <Input 
                      label="Nombre Comercial" 
                      value={labForm.nombre} 
                      onChange={(v: string) => setLabForm({...labForm, nombre: v})} 
                      icon={<FlaskConical size={12}/>}
                    />
                    <Input 
                      label="Dirección Comercial" 
                      value={labForm.direccion} 
                      onChange={(v: string) => setLabForm({...labForm, direccion: v})} 
                      icon={<MapPin size={12}/>}
                    />
                    <Input 
                      label="Teléfono de Contacto" 
                      value={labForm.telefono} 
                      onChange={(v: string) => setLabForm({...labForm, telefono: v})} 
                      icon={<Phone size={12}/>}
                    />
                    <Input 
                      label="Especialidad / Detalles" 
                      value={labForm.detalle} 
                      onChange={(v: string) => setLabForm({...labForm, detalle: v})} 
                      icon={<FileText size={12}/>}
                    />

                    <button 
                      onClick={handleGuardarLab}
                      disabled={guardandoLab}
                      className="w-full bg-[#0A111F] text-white py-5 rounded-2xl font-black text-[11px] uppercase shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 active:scale-95 disabled:bg-slate-300 tracking-widest mt-4"
                    >
                      {guardandoLab ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                      Actualizar Ficha
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>,
        document.body
      ) : null}
    </main>
  )
}

function Input({ label, value, onChange, icon, type="text", placeholder="" }: any) {
  return (
    <div className="space-y-2 text-left">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2 text-left">
        {icon && <span className="text-[#C9A24B]">{icon}</span>}
        {label}
      </label>
      <input 
        type={type} 
        value={value} 
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold border border-slate-200 outline-none focus:border-[#C9A24B] focus:bg-white transition-colors shadow-sm text-slate-900 placeholder:text-slate-300"
      />
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { crearCuentaProfesional, actualizarCuentaProfesional, eliminarCuentaProfesional } from './actions' 
import { 
  Plus, Search, Mail, Lock, Trash2, Stethoscope, X, Save, 
  Loader2, UserCircle, ChevronRight, KeyRound, CheckCircle2 
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function GestionProfesionalesPage() {
  const [profesionales, setProfesionales] = useState<any[]>([])
  const [especialidades, setEspecialidades] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false) // Este estado es clave
  const [editandoProf, setEditandoProf] = useState<any>(null)
  const [busqueda, setBusqueda] = useState('')
  const [notificacion, setNotificacion] = useState<string | null>(null)

  const initialState = { nombre: '', apellido: '', correo: '', password: '', especialidad_id: '' }
  const [form, setForm] = useState(initialState)

  useEffect(() => { fetchData() }, [])

  const mostrarAviso = (mensaje: string) => {
    setNotificacion(mensaje)
    setTimeout(() => setNotificacion(null), 3000)
  }

  async function fetchData() {
    setCargando(true)
    const { data: profs } = await supabase.from('profesionales').select('*, especialidades(nombre)').order('apellido')
    const { data: esps } = await supabase.from('especialidades').select('*').order('nombre')
    if (profs) setProfesionales(profs)
    if (esps) setEspecialidades(esps)
    setCargando(false)
  }

  const handleGuardar = async () => {
    // 1. Evitar doble ejecución si ya está guardando
    if (guardando) return;
    
    // 2. Validaciones básicas
    if (!form.nombre.trim() || (!editandoProf && (!form.correo.trim() || !form.password.trim()))) {
        return alert("Por favor, completa los campos obligatorios.");
    }

    setGuardando(true)
    try {
      const res = editandoProf 
        ? await actualizarCuentaProfesional(editandoProf.id, editandoProf.user_id, form)
        : await crearCuentaProfesional(form)
      
      if (res.error) {
          // Si el error es de duplicado, damos un mensaje amigable
          if (res.error.includes("duplicate key")) {
              throw new Error("Este profesional ya tiene un perfil activo o el ID está duplicado.");
          }
          throw new Error(res.error);
      }

      setModalAbierto(false); 
      fetchData(); 
      resetForm();
      mostrarAviso(editandoProf ? "Cambios guardados" : "Cuenta creada con éxito")

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('auditoria_clinica').insert([{
        usuario_id: user?.id,
        accion: editandoProf ? 'UPDATE / PROFESIONAL' : 'CREATE / PROFESIONAL',
        tabla: 'profesionales, perfiles, auth.users',
        detalles: editandoProf 
          ? `Editó el perfil de ${form.nombre} ${form.apellido}.`
          : `Creó una nueva cuenta para ${form.nombre} ${form.apellido} con el correo ${form.correo}.`
      }])
    } catch (error: any) {
      alert("Ocurrió un error al guardar el profesional.")
    } finally { 
      setGuardando(false) 
    }
  }

  const handleEliminar = async () => {
    if (guardando || !editandoProf || !confirm(`¿Eliminar definitivamente a ${editandoProf.nombre}?`)) return
    setGuardando(true)
    try {
      const res = await eliminarCuentaProfesional(editandoProf.id, editandoProf.user_id)
      if (res.error) throw new Error(res.error)
      setModalAbierto(false); 
      fetchData(); 
      resetForm();
      mostrarAviso("Profesional eliminado")

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('auditoria_clinica').insert([{
          usuario_id: user?.id,
          accion: 'DELETE / PROFESIONAL',
          tabla: 'profesionales, perfiles, auth.users',
          detalles: `Eliminó la cuenta del profesional ${editandoProf.nombre} ${editandoProf.apellido} (User ID: ${editandoProf.user_id}).`
      }])
    } catch (error: any) {
        alert("Ocurrió un error al eliminar el profesional.")
    } finally { 
        setGuardando(false) 
    }
  }

  const abrirEditor = (prof: any) => {
    setEditandoProf(prof)
    setForm({ 
        ...initialState, 
        nombre: prof.nombre, 
        apellido: prof.apellido, 
        especialidad_id: prof.especialidad_id || '' 
    })
    setModalAbierto(true)
  }

  const resetForm = () => { 
    setEditandoProf(null); 
    setForm(initialState);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 pb-20 font-sans relative">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-6">
            <div className="bg-blue-600 p-5 rounded-[2rem] text-white shadow-xl shadow-blue-100">
              <Stethoscope size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800 uppercase italic leading-none">Gestión de Staff</h1>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-2">Administración de accesos</p>
            </div>
          </div>
          <button 
            disabled={cargando}
            onClick={() => { resetForm(); setModalAbierto(true); }} 
            className="bg-slate-900 text-white px-10 py-5 rounded-3xl font-black text-xs uppercase hover:bg-blue-600 transition-all shadow-xl active:scale-95 disabled:opacity-50"
          >
            <Plus size={18}/> Nuevo Profesional
          </button>
        </header>

        {/* LISTADO */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cargando ? (
            <div className="col-span-full py-20 text-center">
                <Loader2 className="animate-spin mx-auto text-blue-600" size={40} />
            </div>
          ) : (
            profesionales
                .filter(p => `${p.nombre} ${p.apellido}`.toLowerCase().includes(busqueda.toLowerCase()))
                .map(prof => (
                    <motion.div 
                        key={prof.id} 
                        whileHover={{ y: -5 }} 
                        onClick={() => abrirEditor(prof)} 
                        className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm cursor-pointer group"
                    >
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all mb-6">
                            <UserCircle size={32} />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 uppercase">{prof.nombre} {prof.apellido}</h3>
                        <p className="text-blue-500 text-[10px] font-bold uppercase mt-1">{prof.especialidades?.nombre || 'General'}</p>
                        <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between text-slate-300 group-hover:text-blue-400">
                            <span className="text-[9px] font-black uppercase italic">Editar / Borrar</span>
                            <ChevronRight size={18} />
                        </div>
                    </motion.div>
                ))
          )}
        </div>
      </div>

      {/* MODAL */}
      <AnimatePresence>
        {modalAbierto && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[999999] flex justify-end items-end md:items-start p-4">
            <div className="absolute inset-0" onClick={() => !guardando && setModalAbierto(false)} />

            <motion.div 
              initial={{ x: '100%', opacity: 0 }} 
              animate={{ x: 0, opacity: 1 }} 
              exit={{ x: '100%', opacity: 0 }} 
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white w-full max-w-lg h-[calc(100vh-120px)] mt-24 rounded-[3rem] shadow-2xl flex flex-col relative z-10 overflow-hidden border border-slate-100"
            >
              <div className="p-10 flex justify-between items-center border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-2xl font-black text-slate-800 uppercase italic leading-none">
                   {editandoProf ? 'Editar Perfil' : 'Nuevo Acceso'}
                </h2>
                <button 
                  disabled={guardando}
                  onClick={() => setModalAbierto(false)} 
                  className="p-4 bg-white shadow-lg border border-slate-100 rounded-2xl text-slate-400 hover:text-red-500 transition-all disabled:opacity-50"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 p-10 space-y-8 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Nombre" value={form.nombre} onChange={(v:any) => setForm({...form, nombre: v})} />
                  <Input label="Apellido" value={form.apellido} onChange={(v:any) => setForm({...form, apellido: v})} />
                </div>

                {!editandoProf && (
                  <div className="space-y-4 bg-blue-50/50 p-6 rounded-[2.5rem] border border-blue-100">
                    <p className="text-[10px] font-black text-blue-600 uppercase italic flex items-center gap-2"><KeyRound size={12}/> Credenciales</p>
                    <Input label="Email" value={form.correo} icon={<Mail size={14}/>} onChange={(v:any) => setForm({...form, correo: v})} />
                    <Input label="Contraseña" value={form.password} type="password" icon={<Lock size={14}/>} onChange={(v:any) => setForm({...form, password: v})} />
                  </div>
                )}

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase italic ml-3">Especialidad</label>
                  <select 
                    disabled={guardando}
                    className="w-full bg-slate-50 p-5 rounded-2xl text-xs font-bold outline-none focus:ring-2 ring-blue-500/20 border-none shadow-inner" 
                    value={form.especialidad_id} 
                    onChange={(e) => setForm({...form, especialidad_id: e.target.value})}
                  >
                    <option value="">Seleccionar...</option>
                    {especialidades.map(esp => <option key={esp.id} value={esp.id}>{esp.nombre}</option>)}
                  </select>
                </div>

                {editandoProf && (
                  <div className="pt-10">
                    <button 
                      disabled={guardando}
                      onClick={handleEliminar} 
                      className="w-full p-5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-2xl font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 border border-red-100"
                    >
                      {guardando ? <Loader2 className="animate-spin" size={16}/> : <Trash2 size={16}/>} 
                      Eliminar cuenta
                    </button>
                  </div>
                )}
              </div>

              <div className="p-10 border-t border-slate-100 bg-slate-50/30">
                <button 
                  onClick={handleGuardar} 
                  disabled={guardando} 
                  className="w-full bg-blue-600 text-white py-6 rounded-3xl font-black text-xs uppercase flex items-center justify-center gap-3 shadow-xl hover:bg-slate-900 transition-all disabled:bg-slate-300"
                >
                  {guardando ? <Loader2 className="animate-spin" /> : <Save size={18}/>}
                  {editandoProf ? 'Guardar Cambios' : 'Crear Acceso'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Input({ label, value, onChange, icon, type = "text" }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase italic ml-3 flex items-center gap-2">{icon} {label}</label>
      <input 
        type={type} 
        value={value || ''} 
        onChange={(e) => onChange(e.target.value)} 
        className="w-full bg-slate-50 p-5 rounded-2xl text-xs font-bold outline-none focus:ring-2 ring-blue-500/20 shadow-inner border-none" 
      />
    </div>
  )
}
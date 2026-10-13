'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
// 1. IMPORTAMOS CREATEPORTAL
import { createPortal } from 'react-dom'
import {
  Building2, Plus, Search, FileText, Trash2, 
  ChevronRight, Save, X, Info, CheckCircle2, 
  Loader2, Settings2, Edit3, MapPin, Phone, Mail, User, ShieldCheck
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

export default function ConveniosPage() {
  const [convenios, setConvenios] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  // 2. ESTADO PARA LOS PORTALS
  const [isMounted, setIsMounted] = useState(false)

  const initialState = {
    nombre_empresa: '',
    nombre_convenio: '',
    rut: '',
    telefono_1: '',
    telefono_2: '',
    ciudad: '',
    comuna: '',
    direccion: '',
    email: '',
    persona_contacto: '',
    observacion: '',
    estado: 'Habilitado',
    visibilidad: 'Público',
    descuento_planilla: false,
    arancel_id: 'Arancel base',
    porcentaje_descuento: 0,
    descuento_laboratorios: false,
    descuento_otras_categorias: false
  }

  const [form, setForm] = useState(initialState)

  useEffect(() => {
    setIsMounted(true) // Indicamos que ya cargó en el navegador
    fetchConvenios()
  }, [])

  async function fetchConvenios() {
    setCargando(true)
    const { data } = await supabase.from('convenios').select('*').order('nombre_empresa')
    if (data) setConvenios(data)
    setCargando(false)
  }

  const abrirEditor = (conv: any) => {
    setEditandoId(conv.id)
    setForm({ ...conv })
    setModalAbierto(true)
  }

  const handleGuardar = async () => {
    if (!form.nombre_empresa || !form.nombre_convenio) {
      return toast.error("Nombre de empresa y convenio son obligatorios.")
    }
    setGuardando(true)
    try {
      if (editandoId) {
        const { error } = await supabase.from('convenios').update(form).eq('id', editandoId)
        if (error) throw error
        toast.success('Convenio actualizado correctamente')
      } else {
        const { error } = await supabase.from('convenios').insert([form])
        if (error) throw error
        toast.success('Convenio creado con éxito')
      }

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('auditoria_clinica').insert([{
          usuario_id: user?.id,
          accion: editandoId ? 'UPDATE / CONVENIO' : 'CREATE / CONVENIO',
          tabla: 'convenios',
          detalles: editandoId
              ? `Actualizó el convenio "${form.nombre_convenio}" para la empresa ${form.nombre_empresa}.`
              : `Creó el convenio "${form.nombre_convenio}" para la empresa ${form.nombre_empresa}.`
      }])

      setModalAbierto(false)
      fetchConvenios()
      resetForm()
    } catch (error: any) {
      toast.error('Ocurrió un error al guardar el convenio.')
    } finally {
      setGuardando(false)
    }
  }

  const eliminarConvenio = async () => {
    if (!window.confirm("¿Eliminar este convenio permanentemente?")) return
    if (!editandoId) return;

    const { error } = await supabase.from('convenios').delete().eq('id', editandoId)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('auditoria_clinica').insert([{
          usuario_id: user?.id,
          accion: 'DELETE / CONVENIO',
          tabla: 'convenios',
          detalles: `Eliminó el convenio "${form.nombre_convenio}" (ID: ${editandoId}).`
      }])
      toast.success('Convenio eliminado')
      setModalAbierto(false)
      fetchConvenios()
      resetForm()
    } else { toast.error('Error al eliminar el convenio.') }
  }

  const resetForm = () => {
    setEditandoId(null)
    setForm(initialState)
  }

  return (
    <main className="min-h-screen bg-[#FBF8F2] p-6 md:p-10 font-sans text-slate-900 relative overflow-hidden z-0">
      
      {/* IMAGEN DE FONDO GLOBAL */}
      <div 
        className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"
      ></div>

      <div className="max-w-7xl mx-auto space-y-8 relative z-10 text-left">
        
        {/* HEADER TIPO TARJETA BLANCA */}
        <header className="bg-white/90 backdrop-blur-md p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 text-left">
          <div className="flex items-center gap-5 text-left w-full md:w-auto">
            <div className="bg-[#0A111F] w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg shrink-0">
              <Building2 size={28} />
            </div>
            <div className="text-left">
              <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight text-left">
                CONVENIOS
              </h1>
              <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1.5 text-left">
                Gestión de alianzas y beneficios
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => { resetForm(); setModalAbierto(true); }}
            className="bg-[#0A111F] text-white px-6 py-4 rounded-full font-bold text-[11px] uppercase tracking-wider hover:bg-[#1a2538] transition-all shadow-md flex items-center justify-center gap-2 shrink-0 w-full md:w-auto text-left"
          >
            <Plus size={16} /> Crear Convenio
          </button>
        </header>

        {/* LISTADO */}
        {cargando ? (
           <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#C9A24B]" size={40}/></div>
        ) : convenios.length === 0 ? (
          <div className="bg-white/95 backdrop-blur-sm p-12 rounded-[2.5rem] shadow-sm border border-slate-100 text-center">
             <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">No hay convenios creados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {convenios.map(conv => (
              <motion.div 
                key={conv.id} 
                whileHover={{ y: -4 }} 
                onClick={() => abrirEditor(conv)}
                className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group cursor-pointer text-left flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div className="bg-[#C9A24B]/10 p-3.5 rounded-2xl text-[#C9A24B] group-hover:bg-[#C9A24B] group-hover:text-white transition-all">
                      <Building2 size={24}/>
                    </div>
                    <span className={`text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest shadow-sm ${conv.estado === 'Habilitado' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                      {conv.estado}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-[#0A111F] uppercase leading-tight text-left">{conv.nombre_empresa}</h3>
                  <p className="text-[#C9A24B] text-[11px] font-bold uppercase tracking-widest mt-1 text-left">{conv.nombre_convenio}</p>
                </div>
                
                <div className="mt-6 pt-6 border-t border-slate-50 space-y-3">
                  <p className="text-xs text-slate-500 flex items-center gap-2 font-medium tracking-tight text-left truncate">
                    <MapPin size={14} className="text-slate-400 shrink-0"/> {conv.comuna || 'Sin comuna'}, {conv.ciudad || 'Sin ciudad'}
                  </p>
                  <div className="flex justify-between items-center bg-[#FBF8F2] p-3 rounded-xl">
                    <p className="text-[10px] font-black text-[#0A111F] uppercase tracking-widest">Descuento</p>
                    <p className="text-sm font-black text-[#C9A24B]">{conv.porcentaje_descuento}%</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL INTEGRAL ENVOLVIDO EN CREATEPORTAL */}
      {isMounted && typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
          {modalAbierto && (
            <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                className="bg-white w-full max-w-5xl max-h-[90vh] rounded-[3rem] overflow-hidden shadow-2xl flex flex-col text-left"
              >
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-[#FBF8F2]">
                  <h2 className="text-xl font-black text-[#0A111F] uppercase italic text-left tracking-tight">
                    {editandoId ? 'Editar Parámetros de Convenio' : 'Nuevo Convenio Corporativo'}
                  </h2>
                  <button onClick={() => setModalAbierto(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500 transition-colors shadow-sm">
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 md:p-10 space-y-10 custom-scrollbar text-left">
                  
                  {/* 1. DATOS DE CONTACTO */}
                  <section className="space-y-6">
                    <h4 className="text-[11px] font-black text-[#0A111F] uppercase tracking-[0.2em] flex items-center gap-2 text-left">
                      <User size={14} className="text-[#C9A24B]"/> Ficha de Contacto y Ubicación
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Input label="Nombre Empresa" value={form.nombre_empresa} onChange={(v: any) => setForm({...form, nombre_empresa: v})} />
                      <Input label="Nombre Convenio" value={form.nombre_convenio} onChange={(v: any) => setForm({...form, nombre_convenio: v})} />
                      <Input label="RUT" value={form.rut} onChange={(v: any) => setForm({...form, rut: v})} />
                      <Input label="E-Mail" value={form.email} icon={<Mail size={12}/>} onChange={(v: any) => setForm({...form, email: v})} />
                      <Input label="Teléfono 1" value={form.telefono_1} icon={<Phone size={12}/>} onChange={(v: any) => setForm({...form, telefono_1: v})} />
                      <Input label="Teléfono 2" value={form.telefono_2} icon={<Phone size={12}/>} onChange={(v: any) => setForm({...form, telefono_2: v})} />
                      <Input label="Ciudad" value={form.ciudad} onChange={(v: any) => setForm({...form, ciudad: v})} />
                      <Input label="Comuna" value={form.comuna} onChange={(v: any) => setForm({...form, comuna: v})} />
                      <Input label="Dirección" value={form.direccion} icon={<MapPin size={12}/>} onChange={(v: any) => setForm({...form, direccion: v})} />
                      <Input label="Persona de Contacto" value={form.persona_contacto} onChange={(v: any) => setForm({...form, persona_contacto: v})} />
                      <div className="md:col-span-2 text-left">
                        <Input label="Observación" value={form.observacion} onChange={(v: any) => setForm({...form, observacion: v})} />
                      </div>
                    </div>
                  </section>

                  {/* 2. REGLAS COMERCIALES */}
                  <section className="space-y-6 bg-[#FBF8F2] p-8 rounded-[2.5rem] border border-[#C9A24B]/20 shadow-sm text-left">
                    <h4 className="text-[11px] font-black text-[#0A111F] uppercase tracking-[0.2em] flex items-center gap-2 text-left">
                      <Settings2 size={14} className="text-[#C9A24B]"/> Configuración de Arancel y Descuentos
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2 text-left">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 text-left">Arancel de Precios</label>
                        <select 
                          className="w-full bg-white p-4 rounded-2xl text-xs font-bold border border-slate-200 outline-none shadow-sm text-slate-900 focus:border-[#C9A24B] transition-colors"
                          value={form.arancel_id}
                          onChange={(e) => setForm({...form, arancel_id: e.target.value})}
                        >
                          <option>Arancel base</option>
                          <option>Biodentine recubrimiento</option>
                          <option>PROMOCION LIMPIEZAS JUNIO</option>
                          <option>ALL ON 6</option>
                        </select>
                      </div>

                      <div className="space-y-2 text-left">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 text-left">Descuento (%)</label>
                        <select 
                          className="w-full bg-white p-4 rounded-2xl text-xs font-bold border border-slate-200 outline-none shadow-sm text-slate-900 focus:border-[#C9A24B] transition-colors"
                          value={form.porcentaje_descuento}
                          onChange={(e) => setForm({...form, porcentaje_descuento: parseInt(e.target.value)})}
                        >
                          {[...Array(101)].map((_, i) => <option key={i} value={i}>{i}%</option>)}
                        </select>
                      </div>

                      <div className="space-y-2 text-left">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 text-left">Estado / Visibilidad</label>
                        <div className="grid grid-cols-2 gap-2 text-left">
                          <select 
                            className="bg-white p-4 rounded-xl text-[10px] font-black uppercase outline-none border border-slate-200 shadow-sm text-slate-900 focus:border-[#C9A24B] transition-colors"
                            value={form.estado} onChange={(e) => setForm({...form, estado: e.target.value})}
                          >
                            <option value="Habilitado">Habilitado</option>
                            <option value="Deshabilitado">Deshabilitado</option>
                          </select>
                          <select 
                            className="bg-white p-4 rounded-xl text-[10px] font-black uppercase outline-none border border-slate-200 shadow-sm text-slate-900 focus:border-[#C9A24B] transition-colors"
                            value={form.visibilidad} onChange={(e) => setForm({...form, visibilidad: e.target.value})}
                          >
                            <option value="Público">Público</option>
                            <option value="Privado">Privado</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                      <Toggle label="Descuento planilla" active={form.descuento_planilla} onClick={() => setForm({...form, descuento_planilla: !form.descuento_planilla})} />
                      <Toggle label="Dto. Laboratorio" active={form.descuento_laboratorios} onClick={() => setForm({...form, descuento_laboratorios: !form.descuento_laboratorios})} />
                      <Toggle label="Dto. Categorías Otros" active={form.descuento_otras_categorias} onClick={() => setForm({...form, descuento_otras_categorias: !form.descuento_otras_categorias})} />
                    </div>
                  </section>
                </div>

                {/* ACCIONES */}
                <div className="p-8 bg-white border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 text-left">
                  {editandoId ? (
                    <button onClick={eliminarConvenio} className="w-full md:w-auto px-6 py-4 bg-red-50 text-red-500 rounded-2xl font-black text-[10px] uppercase hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 border border-red-100">
                      <Trash2 size={16}/> Eliminar Convenio
                    </button>
                  ) : <div></div>}
                  
                  <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto text-left">
                    <button onClick={() => setModalAbierto(false)} className="w-full md:w-auto px-8 py-4 text-slate-400 font-black text-[10px] uppercase hover:text-[#0A111F] transition-colors text-center">
                      Cancelar
                    </button>
                    <button onClick={handleGuardar} disabled={guardando} className="w-full md:w-auto bg-[#0A111F] text-white px-10 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 active:scale-95 disabled:bg-slate-300">
                      {guardando ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                      {editandoId ? 'Actualizar Registro' : 'Crear Nuevo Convenio'}
                    </button>
                  </div>
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

function Input({ label, value, onChange, icon }: any) {
  return (
    <div className="space-y-2 text-left">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2 text-left">
        {icon && <span className="text-[#C9A24B]">{icon}</span>}
        {label}
      </label>
      <input 
        type="text" value={value || ''} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold border border-slate-200 outline-none focus:border-[#C9A24B] focus:bg-white transition-all shadow-sm text-slate-900"
      />
    </div>
  )
}

function Toggle({ label, active, onClick }: any) {
  return (
    <div className="flex items-center justify-between bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-200">
      <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight">{label}</span>
      <button type="button" onClick={onClick} className={`w-11 h-6 rounded-full transition-all relative shadow-inner ${active ? 'bg-[#C9A24B]' : 'bg-slate-200'}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${active ? 'right-1' : 'left-1'}`} />
      </button>
    </div>
  )
}

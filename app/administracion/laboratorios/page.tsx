'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
// 1. IMPORTAMOS CREATEPORTAL
import { createPortal } from 'react-dom'
import { 
  Beaker, Plus, Search, Ban, Loader2, X, Save, 
  MapPin, Phone, FileText, FlaskConical, ChevronRight
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'

export default function LaboratoriosPage() {
  const [laboratorios, setLaboratorios] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  
  // ESTADOS PARA CREACIÓN
  const [modalCrear, setModalCrear] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [nuevoLab, setNuevoLab] = useState({
    nombre: '',
    direccion: '',
    telefono: '',
    detalle: ''
  })

  // 2. ESTADO PARA LOS PORTALS (Asegurar que carga en el cliente)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true) // Indicamos que ya cargó en el navegador
    fetchLaboratorios()
  }, [])

  async function fetchLaboratorios() {
    setCargando(true)
    const { data } = await supabase.from('laboratorios').select('*').order('nombre')
    if (data) setLaboratorios(data)
    setCargando(false)
  }

  const handleCrear = async () => {
    if (!nuevoLab.nombre) return alert("El nombre es obligatorio")
    setGuardando(true)
    try {
      const { error } = await supabase.from('laboratorios').insert([nuevoLab])
      if (error) throw error
      
      setModalCrear(false)
      setNuevoLab({ nombre: '', direccion: '', telefono: '', detalle: '' })
      fetchLaboratorios()
    } catch (error: any) {
      alert("Error al crear: " + error.message)
    } finally {
      setGuardando(false)
    }
  }

  const laboratoriosFiltrados = laboratorios.filter(lab => 
    lab.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

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
            <div className="bg-[#0A111F] w-16 h-16 rounded-full flex items-center justify-center text-[#C9A24B] shadow-lg shrink-0">
              <FlaskConical size={28} />
            </div>
            <div className="text-left">
              <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight text-left">
                LABORATORIOS
              </h1>
              <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1.5 text-left">
                Gestión de proveedores externos
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto text-left">
            <div className="relative flex-1 md:w-64 text-left">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Buscar laboratorio..." 
                className="pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-full text-xs font-bold w-full outline-none shadow-inner text-slate-900 focus:border-[#C9A24B]/50 transition-colors"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <button 
              onClick={() => setModalCrear(true)}
              className="bg-[#0A111F] text-white px-6 py-3 rounded-full font-bold text-[11px] uppercase tracking-wider hover:bg-[#1a2538] transition-all shadow-md flex items-center gap-2 shrink-0 text-left"
            >
              <Plus size={16} /> Nuevo Laboratorio
            </button>
          </div>
        </header>

        {/* TABLA PRINCIPAL ESTILIZADA */}
        <div className="bg-white/95 backdrop-blur-sm rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden text-left">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Laboratorio</th>
                  <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Detalle / Servicios</th>
                  <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Estado de Pagos</th>
                  <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60">
                {cargando ? (
                  <tr>
                    <td colSpan={4} className="py-20 text-center">
                      <Loader2 className="animate-spin mx-auto text-[#C9A24B]" size={30} />
                    </td>
                  </tr>
                ) : laboratoriosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-20 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">
                      No hay laboratorios registrados
                    </td>
                  </tr>
                ) : laboratoriosFiltrados.map((lab) => (
                  <tr key={lab.id} className="group hover:bg-slate-50/50 transition-all text-left cursor-pointer">
                    <td className="px-10 py-5">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-[#C9A24B]/10 text-[#C9A24B]">
                          <Beaker size={20} />
                        </div>
                        <div>
                          <Link href={`/administracion/laboratorios/${lab.id}`} className="text-[13px] font-black text-[#0A111F] uppercase tracking-wide hover:text-[#C9A24B] transition-colors flex items-center gap-2">
                            {lab.nombre}
                          </Link>
                          <div className="flex items-center gap-3 mt-1.5">
                            {lab.telefono && (
                              <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest">
                                <Phone size={10} className="text-[#C9A24B]"/> {lab.telefono}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-5">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">
                        {lab.detalle || 'Servicios generales'}
                      </span>
                    </td>
                    <td className="px-10 py-5">
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-black text-emerald-500 uppercase tracking-widest">Al Día</span>
                        <span className="text-[10px] font-bold text-slate-400 mt-0.5 tracking-wider">Deuda: $0</span>
                      </div>
                    </td>
                    <td className="px-10 py-5 text-right">
                      <button className="text-[10px] font-black uppercase text-red-400 hover:text-red-600 hover:bg-red-50 px-4 py-2 rounded-xl flex items-center gap-2 ml-auto text-left transition-all border border-transparent hover:border-red-100">
                        <Ban size={14}/> Deshabilitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL PARA CREAR LABORATORIO ENVOLVIDO EN CREATEPORTAL */}
      {isMounted && typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
          {modalCrear && (
            <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden text-left"
              >
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-[#FBF8F2] text-left">
                  <h3 className="text-xl font-black text-[#0A111F] uppercase italic text-left tracking-tight">
                    Nuevo Laboratorio
                  </h3>
                  <button onClick={() => setModalCrear(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500 transition-colors shadow-sm text-left">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-8 space-y-6 text-left">
                  <Input label="Nombre del Laboratorio" value={nuevoLab.nombre} onChange={(v: any) => setNuevoLab({...nuevoLab, nombre: v})} />
                  <Input label="Dirección Comercial" value={nuevoLab.direccion} icon={<MapPin size={14}/>} onChange={(v: any) => setNuevoLab({...nuevoLab, direccion: v})} />
                  <Input label="Teléfono de Contacto" value={nuevoLab.telefono} icon={<Phone size={14}/>} onChange={(v: any) => setNuevoLab({...nuevoLab, telefono: v})} />
                  <Input label="Detalle (Ej: Prótesis, Carillas, Cerámicas...)" value={nuevoLab.detalle} icon={<FileText size={14}/>} onChange={(v: any) => setNuevoLab({...nuevoLab, detalle: v})} />

                  <button 
                    onClick={handleCrear}
                    disabled={guardando}
                    className="w-full bg-[#0A111F] text-white py-5 rounded-2xl font-black text-[11px] uppercase shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 active:scale-95 disabled:bg-slate-300 text-left tracking-widest mt-4"
                  >
                    {guardando ? <Loader2 className="animate-spin" size={18}/> : <Save size={18} />}
                    Registrar Laboratorio
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

function Input({ label, value, onChange, icon }: any) {
  return (
    <div className="space-y-2 text-left">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2 text-left">
        {icon && <span className="text-[#C9A24B]">{icon}</span>}
        {label}
      </label>
      <input 
        type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold border border-slate-200 outline-none focus:border-[#C9A24B] focus:bg-white transition-colors shadow-sm text-slate-900 placeholder:text-slate-300"
      />
    </div>
  )
}

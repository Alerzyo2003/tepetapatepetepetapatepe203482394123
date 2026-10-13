'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  FileCheck, Plus, Search, Trash2, Loader2, X, Save, 
  Edit2, ChevronRight, AlertCircle 
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'

export default function ConsentimientosConfigPage() {
  const [items, setItems] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombreCons, setNombreCons] = useState('')

  useEffect(() => {
    fetchConsentimientos()
  }, [])

  async function fetchConsentimientos() {
    setCargando(true)
    const { data } = await supabase
      .from('consentimientos')
      .select('*')
      .order('nombre', { ascending: true })
    if (data) setItems(data)
    setCargando(false)
  }

  const handleGuardar = async () => {
    if (!nombreCons.trim()) return
    setGuardando(true)
    try {
      const nombreUpper = nombreCons.toUpperCase().trim()
      if (editandoId) {
        await supabase.from('consentimientos').update({ nombre: nombreUpper }).eq('id', editandoId)
      } else {
        await supabase.from('consentimientos').insert([{ nombre: nombreUpper, estado: 'Sí' }])
      }
      setModalAbierto(false)
      setNombreCons('')
      setEditandoId(null)
      fetchConsentimientos()
    } catch (err) { alert("Error al guardar") } finally { setGuardando(false) }
  }

  const toggleEstado = async (id: string, estadoActual: string) => {
    const nuevo = estadoActual === 'Sí' ? 'No' : 'Sí'
    await supabase.from('consentimientos').update({ estado: nuevo }).eq('id', id)
    setItems(items.map(i => i.id === id ? { ...i, estado: nuevo } : i))
  }

  const eliminarConsentimiento = async (id: string) => {
    if (!confirm("¿Eliminar este consentimiento?")) return
    await supabase.from('consentimientos').delete().eq('id', id)
    fetchConsentimientos()
  }

  const normalizar = (t: string) => String(t || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filtrados = items.filter(i => normalizar(i.nombre).includes(normalizar(busqueda)))

  if (cargando) return <div className="h-screen flex items-center justify-center bg-[#F8FAFC]"><Loader2 className="animate-spin text-blue-600" size={30} /></div>

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* HEADER COMPACTO */}
        <header className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 p-3.5 rounded-2xl text-white shadow-lg">
              <FileCheck size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 uppercase italic leading-none">Consentimientos</h1>
              <p className="text-slate-400 text-[8px] font-bold uppercase tracking-widest mt-1.5">Gestión de Documentación Legal</p>
            </div>
          </div>
          <button 
            onClick={() => { setEditandoId(null); setNombreCons(''); setModalAbierto(true); }}
            className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase shadow-md hover:bg-slate-900 transition-all flex items-center gap-2 active:scale-95"
          >
            <Plus size={14} /> Nuevo Consentimiento
          </button>
        </header>

        {/* BUSCADOR PEQUEÑO */}
        <div className="relative group max-w-xs">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text"
            placeholder="Buscar..."
            className="w-full bg-white p-3 pl-10 rounded-xl border border-slate-100 shadow-sm outline-none focus:ring-2 ring-blue-500/10 font-bold text-[10px] transition-all uppercase"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {/* TABLA REFINADA */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[8px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Documento</th>
                <th className="px-8 py-4 text-center">Estado</th>
                <th className="px-8 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtrados.map((item) => {
                const esSi = normalizar(item.estado) === 'si';
                return (
                  <tr key={item.id} className="group hover:bg-slate-50/30 transition-all">
                    <td className="px-8 py-3">
                      <Link href={`/administracion/configuracion/consentimientos/${item.id}`} className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${esSi ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                          <FileCheck size={16} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-700 uppercase italic group-hover:text-blue-600 transition-colors">
                          {item.nombre}
                        </span>
                      </Link>
                    </td>
                    <td className="px-8 py-3 text-center">
                      <button 
                        onClick={() => toggleEstado(item.id, item.estado)}
                        className={`px-4 py-1.5 rounded-xl font-black text-[8px] uppercase transition-all border
                          ${esSi 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white' 
                            : 'bg-red-50 text-red-500 border-red-100 hover:bg-red-500 hover:text-white'}`}
                      >
                        {item.estado === 'Sí' ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-8 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button 
                          onClick={() => { setEditandoId(item.id); setNombreCons(item.nombre); setModalAbierto(true); }}
                          className="p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-all"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => eliminarConsentimiento(item.id)}
                          className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                        <Link 
                          href={`/administracion/configuracion/consentimientos/${item.id}`}
                          className="p-2 bg-slate-100 text-slate-600 hover:bg-slate-900 hover:text-white rounded-lg transition-all"
                        >
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filtrados.length === 0 && (
            <div className="p-12 text-center flex flex-col items-center gap-2">
              <AlertCircle size={30} className="text-slate-200" />
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Sin resultados</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL MÁS PEQUEÑO */}
      <AnimatePresence>
        {modalAbierto && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-[320px] rounded-[2rem] p-8 shadow-2xl relative border border-slate-100">
              <button onClick={() => setModalAbierto(false)} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 transition-colors"><X size={20}/></button>
              <h2 className="text-lg font-black text-slate-900 uppercase italic mb-6">
                {editandoId ? 'Editar' : 'Nuevo'}
              </h2>
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Nombre</label>
                  <input 
                    autoFocus
                    className="w-full p-4 bg-slate-50 rounded-xl font-bold border-none outline-none focus:ring-2 ring-blue-500/10 text-[10px] uppercase"
                    placeholder="Ej: CIRUGÍA"
                    value={nombreCons}
                    onChange={(e) => setNombreCons(e.target.value)}
                  />
                </div>
                <button 
                  onClick={handleGuardar}
                  disabled={guardando || !nombreCons}
                  className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-[9px] uppercase shadow-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-2 disabled:bg-slate-200"
                >
                  {guardando ? <Loader2 className="animate-spin" size={12}/> : <Save size={14} />} 
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
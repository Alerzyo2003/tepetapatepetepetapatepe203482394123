'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Building2, Plus, Search, Trash2, 
  Loader2, X, Save, CheckCircle2, AlertCircle,
  MoreVertical, Edit2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function BancosPage() {
  const [bancos, setBancos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  
  // Estados Modal
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombreBanco, setNombreBanco] = useState('')

  useEffect(() => {
    fetchBancos()
  }, [])

  async function fetchBancos() {
    setCargando(true)
    const { data, error } = await supabase
      .from('bancos')
      .select('*')
      .order('nombre', { ascending: true })
    
    if (data) setBancos(data)
    setCargando(false)
  }

  const handleGuardar = async () => {
    if (!nombreBanco.trim()) return
    setGuardando(true)

    try {
      if (editandoId) {
        const { error } = await supabase
          .from('bancos')
          .update({ nombre: nombreBanco.trim().toUpperCase() })
          .eq('id', editandoId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('bancos')
          .insert([{ nombre: nombreBanco.trim().toUpperCase(), activo: true }])
        if (error) throw error
      }

      setModalAbierto(false)
      setNombreBanco('')
      setEditandoId(null)
      fetchBancos()
    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const eliminarBanco = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar el banco "${nombre}"?`)) return
    
    const { error } = await supabase.from('bancos').delete().eq('id', id)
    if (!error) {
      setBancos(bancos.filter(b => b.id !== id))
    } else {
      alert("No se pudo eliminar. Es posible que esté siendo usado en registros de pagos.")
    }
  }

  const bancosFiltrados = bancos.filter(b => 
    b.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  if (cargando) return (
    <div className="h-screen flex items-center justify-center bg-[#F8FAFC]">
      <Loader2 className="animate-spin text-blue-600" size={40} />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 pb-20 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-6">
            <div className="bg-slate-900 p-5 rounded-[2rem] text-white shadow-xl">
              <Building2 size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800 uppercase italic leading-none">Entidades Bancarias</h1>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em] mt-3">Configuración de bancos para pagos</p>
            </div>
          </div>
          <button 
            onClick={() => { setEditandoId(null); setNombreBanco(''); setModalAbierto(true); }}
            className="bg-blue-600 text-white px-10 py-5 rounded-3xl font-black text-xs uppercase shadow-xl hover:bg-slate-900 transition-all flex items-center gap-2 active:scale-95"
          >
            <Plus size={18} /> Agregar Banco
          </button>
        </header>

        {/* BUSCADOR */}
        <div className="relative group max-w-md">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
          <input 
            type="text"
            placeholder="Buscar banco..."
            className="w-full bg-white p-5 pl-14 rounded-2xl border border-slate-100 shadow-sm outline-none focus:ring-2 ring-blue-500/20 font-bold text-xs transition-all"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {/* TABLA */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                <th className="p-8">Nombre de la Institución</th>
                <th className="p-8 text-center">Estado</th>
                <th className="p-8 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {bancosFiltrados.map((banco) => (
                <tr key={banco.id} className="group hover:bg-blue-50/30 transition-all">
                  <td className="p-8">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-blue-600 transition-all shadow-sm">
                        <Building2 size={18} />
                      </div>
                      <span className="text-sm font-black text-slate-700 uppercase italic">{banco.nombre}</span>
                    </div>
                  </td>
                  <td className="p-8 text-center">
                    <span className="bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest">
                      Activo
                    </span>
                  </td>
                  <td className="p-8 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => { setEditandoId(banco.id); setNombreBanco(banco.nombre); setModalAbierto(true); }}
                        className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => eliminarBanco(banco.id, banco.nombre)}
                        className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {bancosFiltrados.length === 0 && (
            <div className="p-20 text-center flex flex-col items-center gap-4">
              <AlertCircle size={40} className="text-slate-200" />
              <p className="text-slate-400 font-black text-xs uppercase italic tracking-widest">No se encontraron bancos</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL CREAR/EDITAR */}
      <AnimatePresence>
        {modalAbierto && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl relative border border-white/20"
            >
              <button onClick={() => setModalAbierto(false)} className="absolute top-8 right-8 text-slate-400 hover:text-red-500 transition-colors">
                <X size={24}/>
              </button>
              
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic leading-none mb-6">
                {editandoId ? 'Editar Banco' : 'Nuevo Banco'}
              </h2>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 block">Nombre de la Entidad</label>
                  <input 
                    autoFocus
                    className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 ring-blue-500/20 shadow-inner uppercase"
                    placeholder="Ej: BANCO ESTADO"
                    value={nombreBanco}
                    onChange={(e) => setNombreBanco(e.target.value)}
                  />
                </div>
                <button 
                  onClick={handleGuardar}
                  disabled={guardando || !nombreBanco}
                  className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black text-sm uppercase shadow-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-3 disabled:bg-slate-200"
                >
                  {guardando ? <Loader2 className="animate-spin" /> : <Save size={18} />} 
                  {editandoId ? 'Actualizar' : 'Guardar Banco'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
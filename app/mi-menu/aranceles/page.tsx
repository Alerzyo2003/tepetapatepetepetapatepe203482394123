'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, Loader2, BadgeDollarSign, FileText } from 'lucide-react'
import { motion } from 'framer-motion'

export default function ArancelesPage() {
  const [prestaciones, setPrestaciones] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [buscando, setBuscando] = useState(false)

  const GOLD = '#C9A24B'

  useEffect(() => {
    const fetchPrestaciones = async (term: string) => {
      if (prestaciones.length > 0) setBuscando(true)
      
      // Agregamos el filtro .in() para traer SOLO las que están habilitadas
      let query = supabase
        .from('prestaciones')
        .select('*')
        .in('Habilitado', ['si', 'sí', 'Si', 'Sí', 'SI', 'SÍ']) 
      
      if (term.trim()) {
        const cleanTerm = term.trim()
        query = query.or(`"Nombre Accion".ilike.%${cleanTerm}%,"Nombre".ilike.%${cleanTerm}%,"Nombre Categoria".ilike.%${cleanTerm}%,"Codigo Accion".ilike.%${cleanTerm}%`)
        query = query.limit(30)
      } else {
        query = query.limit(20)
      }

      const { data, error } = await query.order('Nombre Accion', { ascending: true })

      if (error) {
        console.error("Error cargando aranceles:", error)
      } else if (data) {
        setPrestaciones(data)
      }
      
      setCargando(false)
      setBuscando(false)
    }

    // Debounce: Espera 300ms después de que el usuario deja de escribir para hacer la consulta
    const delayDebounceFn = setTimeout(() => {
      fetchPrestaciones(busqueda)
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [busqueda]) // Se ejecuta cada vez que cambia "busqueda"

  if (cargando) {
    return (
      <div className="h-[calc(100vh-100px)] flex flex-col items-center justify-center bg-[#FBF8F2]">
        <Loader2 className="animate-spin text-[#C9A24B] mb-4" size={40} />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando aranceles...</p>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[#FBF8F2] font-sans text-slate-800 pb-24 text-left p-4 sm:p-6 md:p-10">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0A111F]">
            Aranceles <span className="italic font-serif" style={{ color: GOLD }}>Clínica</span>
          </h1>
          <p className="text-sm font-bold text-slate-500 mt-2 uppercase tracking-widest">
            Consulta rápida de Precios
          </p>
        </div>
        
        <div className="bg-white text-slate-700 px-6 py-3.5 rounded-full border border-slate-200 shadow-sm flex items-center gap-2">
          <BadgeDollarSign className="text-[#C9A24B]" size={18} />
          <span className="font-black text-sm uppercase tracking-widest">
            {busqueda.trim() ? `${prestaciones.length} Coincidencias` : 'Top 20 Frecuentes'}
          </span>
        </div>
      </div>

      {/* BUSCADOR */}
      <div className="relative w-full max-w-2xl mb-8 group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          {buscando ? <Loader2 className="animate-spin text-[#C9A24B]" size={20} /> : <Search size={20} />}
        </div>
        <input 
          type="text" 
          placeholder="Buscar por nombre, categoría o código (Ej: Endodoncia, Limpieza)..." 
          className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-sm outline-none shadow-sm focus:border-[#C9A24B] focus:ring-4 focus:ring-[#C9A24B]/10 transition-all font-medium"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {/* TABLA DE PRECIOS */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-5 text-xs font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Código</th>
                <th className="p-5 text-xs font-black uppercase tracking-widest text-slate-400">Prestación</th>
                <th className="p-5 text-xs font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Categoría</th>
                <th className="p-5 text-xs font-black uppercase tracking-widest text-slate-400 text-right whitespace-nowrap">Valor Clínica</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prestaciones.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-slate-400">
                    <FileText className="mx-auto mb-3 opacity-30" size={48} />
                    <p className="text-sm font-bold uppercase tracking-widest">No se encontraron prestaciones</p>
                  </td>
                </tr>
              ) : (
                prestaciones.map((p, idx) => (
                  <tr key={p.id || idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-5 text-sm font-bold text-slate-500">
                      {p['Codigo Accion'] || '-'}
                    </td>
                    <td className="p-5 text-sm font-black text-slate-800">
                      {p['Nombre Accion'] || p['Nombre'] || 'Sin nombre'}
                    </td>
                    <td className="p-5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      <span className="bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                        {p['Nombre Categoria'] || 'General'}
                      </span>
                    </td>
                    <td className="p-5 text-lg font-black text-emerald-600 text-right whitespace-nowrap">
                      ${Number(p.Precio || 0).toLocaleString('es-CL')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  )
}

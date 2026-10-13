'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  History, Search, ShieldAlert, Loader2, 
  ChevronLeft, Trash2, Edit3, PlusCircle, 
  AlertTriangle, Eye, Database, ShieldCheck
} from 'lucide-react'
import Link from 'next/link'

export default function AuditoriaGlobalPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTabla, setFiltroTabla] = useState('TODAS')

  useEffect(() => {
    fetchAuditoria()
  }, [])

  async function fetchAuditoria() {
    setCargando(true)
    try {
      // Cruzamos la auditoría con los perfiles para saber QUIÉN hizo la acción
      const { data, error } = await supabase
        .from('auditoria_clinica')
        .select(`
          id,
          fecha,
          accion,
          tabla,
          detalles,
          perfiles!auditoria_clinica_usuario_id_fkey (
            nombre_completo,
            rol,
            rut
          )
        `)
        .order('fecha', { ascending: false })
        .limit(500) // Traemos los últimos 500 registros por rendimiento
        
      if (error) throw error
      if (data) setLogs(data)
    } catch (error) {
      console.error("Error al cargar auditoría:", error)
    } finally {
      setCargando(false)
    }
  }

  // Filtrado en tiempo real
  const tablasUnicas = ['TODAS', ...Array.from(new Set(logs.map(l => l.tabla?.toUpperCase() || 'SISTEMA')))];

  const filtrados = logs.filter(log => {
    const usuario = (log.perfiles?.nombre_completo || 'Sistema').toLowerCase();
    const detalles = (log.detalles || '').toLowerCase();
    const accion = (log.accion || '').toLowerCase();
    const term = busqueda.toLowerCase();
    
    const cumpleBusqueda = usuario.includes(term) || detalles.includes(term) || accion.includes(term);
    const cumpleTabla = filtroTabla === 'TODAS' || (log.tabla?.toUpperCase() || 'SISTEMA') === filtroTabla;

    return cumpleBusqueda && cumpleTabla;
  });

  // Función para darle un estilo visual dependiendo de la acción
  const obtenerEstiloAccion = (accionStr: string) => {
    const acc = (accionStr || '').toUpperCase();
    if (acc.includes('DELETE') || acc.includes('ELIMINAR') || acc.includes('BORRAR') || acc.includes('CANCELAR')) {
      return { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', icon: <Trash2 size={14}/>, label: 'ELIMINACIÓN' }
    }
    if (acc.includes('UPDATE') || acc.includes('EDITAR') || acc.includes('MODIFICAR')) {
      return { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', icon: <Edit3 size={14}/>, label: 'MODIFICACIÓN' }
    }
    if (acc.includes('INSERT') || acc.includes('CREAR') || acc.includes('AGREGAR')) {
      return { color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', icon: <PlusCircle size={14}/>, label: 'CREACIÓN' }
    }
    if (acc.includes('BLOQUEO') || acc.includes('INASISTENCIA')) {
      return { color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', icon: <AlertTriangle size={14}/>, label: 'RESTRICCIÓN' }
    }
    return { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', icon: <Eye size={14}/>, label: 'SISTEMA' }
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] p-6 md:p-12 font-sans text-slate-900 text-left relative">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <Link href="/administracion" className="flex items-center gap-2 text-slate-400 hover:text-blue-600 font-black text-[10px] uppercase tracking-widest transition-all">
          <ChevronLeft size={16}/> Volver a Administración
        </Link>

        {/* HEADER DE AUDITORÍA */}
        <header className="bg-slate-900 p-10 md:p-12 rounded-[3.5rem] shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative overflow-hidden">
          <div className="flex items-center gap-6 relative z-10">
            <div className="bg-blue-500/20 border border-blue-500/30 p-5 rounded-[2.5rem] text-blue-400 shadow-inner">
              <ShieldCheck size={35} strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter uppercase italic leading-none">Auditoría Global</h1>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em] mt-3 flex items-center gap-2">
                <Database size={12} className="text-blue-400"/> Registro de Eventos del Sistema
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 relative z-10 w-full md:w-auto">
            <select 
               className="w-full sm:w-48 px-6 py-4 bg-white/10 border border-slate-700 rounded-2xl text-[10px] font-black uppercase text-white outline-none focus:border-blue-500 focus:bg-white/20 transition-all cursor-pointer backdrop-blur-sm tracking-widest appearance-none"
               value={filtroTabla}
               onChange={(e) => setFiltroTabla(e.target.value)}
            >
              {tablasUnicas.map(t => <option key={t} value={t} className="text-slate-900">{t}</option>)}
            </select>

            <div className="relative group w-full sm:w-72">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Buscar usuario o detalle..." 
                className="w-full pl-12 pr-6 py-4 bg-white/10 border border-slate-700 rounded-2xl text-xs font-bold text-white outline-none focus:border-blue-500 focus:bg-white/20 transition-all placeholder:text-slate-500 backdrop-blur-sm"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          </div>

          <div className="absolute -right-10 -bottom-10 opacity-[0.03] pointer-events-none">
            <ShieldAlert size={300} />
          </div>
        </header>

        {/* TABLA DE EVENTOS */}
        <div className="bg-white rounded-[3.5rem] shadow-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-slate-400 w-48">Fecha y Hora</th>
                  <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Usuario Responsable</th>
                  <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Módulo / Tabla</th>
                  <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest text-center text-slate-400">Tipo de Acción</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Detalles del Evento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {cargando ? (
                  <tr>
                    <td colSpan={5} className="py-32 text-center">
                      <Loader2 className="animate-spin mx-auto text-blue-600 mb-4" size={40} />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extrayendo registros de seguridad...</p>
                    </td>
                  </tr>
                ) : filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-32 text-center">
                      <ShieldCheck className="mx-auto text-slate-300 mb-4" size={48} />
                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Sin Resultados</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">No se encontraron eventos con esos filtros</p>
                    </td>
                  </tr>
                ) : (
                  filtrados.map((log) => {
                    const estilo = obtenerEstiloAccion(log.accion);
                    const fecha = new Date(log.fecha);
                    
                    return (
                      <tr key={log.id} className="transition-all hover:bg-slate-50/50 group">
                        
                        <td className="px-8 py-6">
                           <p className="text-[11px] font-black text-slate-700 uppercase tracking-widest">
                             {fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                           </p>
                           <p className="text-[10px] font-bold text-slate-400 mt-1 flex items-center gap-1">
                             <History size={10}/> {fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                           </p>
                        </td>

                        <td className="px-6 py-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-[10px] text-slate-500 border border-slate-200">
                              {log.perfiles?.nombre_completo?.charAt(0) || 'S'}
                            </div>
                            <div>
                              <p className="text-xs font-black uppercase text-slate-800">
                                {log.perfiles?.nombre_completo || 'SISTEMA AUTOMÁTICO'}
                              </p>
                              {log.perfiles?.rol && (
                                <p className="text-[8px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-widest mt-1 w-max">
                                  {log.perfiles.rol}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-6">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            {log.tabla || 'Global'}
                          </p>
                        </td>

                        <td className="px-6 py-6">
                          <div className="flex justify-center">
                            <span className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border flex items-center gap-1.5 w-max ${estilo.bg} ${estilo.color} ${estilo.border}`}>
                              {estilo.icon} {estilo.label}
                            </span>
                          </div>
                        </td>

                        <td className="px-8 py-6">
                          <p className="text-[11px] font-bold text-slate-600 leading-relaxed max-w-md">
                            {log.detalles}
                          </p>
                        </td>

                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
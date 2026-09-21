'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { X, History, CalendarDays, Clock, User, CheckCircle2 } from 'lucide-react'

// Aseguramos que reciba isOpen y onClose
export default function DropdownHistorial({ isOpen, onClose, citas }: { isOpen: boolean, onClose: () => void, citas: any[] }) {
  
  const formatearFecha = (iso: string) => {
    return new Date(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  const formatearHora = (iso: string) => {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          
          {/* Fondo oscuro (Overlay) - Al hacerle clic también se cierra */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm cursor-pointer"
          />

          {/* Contenedor principal del Modal */}
          <motion.div 
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="relative bg-white w-full sm:max-w-md max-h-[85vh] sm:max-h-[80vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header del Modal */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-200/50 rounded-xl text-slate-600">
                  <History size={20} />
                </div>
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Historial de Citas</h2>
              </div>
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors z-10">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* Cuerpo del Modal con Scroll */}
            <div className="p-6 overflow-y-auto flex-1">
              {citas && citas.length > 0 ? (
                <div className="space-y-3">
                  {citas.map((cita) => (
                    <div key={cita.id} className="p-4 border border-slate-100 rounded-2xl bg-white shadow-sm hover:border-slate-300 transition-colors">
                      
                      {/* Fecha y Estado */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2 text-slate-700">
                          <CalendarDays size={14} className="text-slate-400" />
                          <span className="text-[11px] font-black uppercase tracking-wide capitalize">{formatearFecha(cita.inicio)}</span>
                        </div>
                        {cita.estado === 'completada' ? (
                           <span className="flex items-center gap-1 text-[9px] font-black uppercase bg-green-50 text-green-600 px-2 py-1 rounded-md tracking-wider"><CheckCircle2 size={12}/> Completada</span>
                        ) : (
                           <span className="flex items-center gap-1 text-[9px] font-black uppercase bg-slate-100 text-slate-500 px-2 py-1 rounded-md tracking-wider">{cita.estado}</span>
                        )}
                      </div>

                      {/* Detalles */}
                      <div className="space-y-1.5 pl-5 border-l-2 border-slate-100 ml-1.5">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Clock size={12} />
                          <span className="text-xs font-semibold">{formatearHora(cita.inicio)} - {formatearHora(cita.fin)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500">
                          <User size={12} />
                          <span className="text-xs font-semibold">{cita.profesional_nombre}</span>
                        </div>
                        <div className="flex items-start gap-2 text-slate-600 mt-2 pt-2 border-t border-slate-50">
                          <span className="text-xs font-bold">Motivo:</span>
                          <span className="text-xs">{cita.motivo || 'Sin registro'}</span>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 flex flex-col items-center">
                  <History size={48} className="text-slate-200 mb-4" strokeWidth={1.5} />
                  <p className="text-slate-500 font-bold text-sm">No hay citas anteriores registradas.</p>
                </div>
              )}
            </div>
          </motion.div>

        </div>
      )}
    </AnimatePresence>
  )
}

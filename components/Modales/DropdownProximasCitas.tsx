'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CalendarClock, CalendarDays, Clock, User, Edit2, Check } from 'lucide-react'

export default function ModalProximasCitas({ isOpen, onClose, citas, onUpdateMotivo }: { isOpen: boolean, onClose: () => void, citas: any[], onUpdateMotivo?: (id: string, motivo: string) => void }) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [motivoTemporal, setMotivoTemporal] = useState("");

  if (!isOpen) return null;

  const formatearFecha = (iso: string) => {
    return new Date(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  const formatearHora = (iso: string) => {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  }

  const iniciarEdicion = (cita: any) => {
    setEditandoId(cita.id);
    setMotivoTemporal(cita.motivo || "");
  };

  const guardarEdicion = (citaId: string) => {
    if (onUpdateMotivo) {
      onUpdateMotivo(citaId, motivoTemporal);
    }
    setEditandoId(null);
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setMotivoTemporal("");
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm">
        <motion.div 
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="bg-white w-full sm:max-w-md max-h-[85vh] sm:max-h-[80vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header del Modal */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                <CalendarClock size={20} />
              </div>
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Próximas Citas</h2>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>

          {/* Cuerpo del Modal */}
          <div className="p-6 overflow-y-auto flex-1">
            {citas && citas.length > 0 ? (
              <div className="space-y-3">
                {citas.map((cita) => (
                  <div key={cita.id} className="p-4 border border-slate-100 rounded-2xl bg-white shadow-sm hover:border-slate-300 transition-colors">
                    
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2 text-slate-700">
                        <CalendarDays size={14} className="text-slate-400" />
                        <span className="text-[11px] font-black uppercase tracking-wide capitalize">{formatearFecha(cita.inicio)}</span>
                      </div>
                      <span className="flex items-center gap-1 text-[9px] font-black uppercase bg-blue-50 text-blue-600 px-2 py-1 rounded-md tracking-wider">{cita.estado}</span>
                    </div>

                    <div className="space-y-1.5 pl-5 border-l-2 border-slate-100 ml-1.5">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Clock size={12} />
                        <span className="text-xs font-semibold">{formatearHora(cita.inicio)} - {formatearHora(cita.fin)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <User size={12} />
                        <span className="text-xs font-semibold">{cita.profesional_nombre}</span>
                      </div>
                    </div>

                    {/* SECCIÓN DE MOTIVO EDITABLE */}
                    <div className="mt-3 pt-3 border-t border-slate-50">
                      {editandoId === cita.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={motivoTemporal}
                            onChange={(e) => setMotivoTemporal(e.target.value)}
                            className="flex-1 text-xs px-2 py-1.5 border border-blue-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-blue-50/30"
                            placeholder="Ingresar motivo..."
                            onKeyDown={(e) => e.key === 'Enter' && guardarEdicion(cita.id)}
                          />
                          <button onClick={() => guardarEdicion(cita.id)} className="text-green-600 hover:bg-green-100 p-1.5 rounded transition-colors">
                            <Check size={14} strokeWidth={2.5} />
                          </button>
                          <button onClick={cancelarEdicion} className="text-red-500 hover:bg-red-100 p-1.5 rounded transition-colors">
                            <X size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between group gap-2">
                          <p className="text-xs text-slate-600">
                            <span className="font-bold text-slate-700">Motivo: </span> 
                            {cita.motivo || 'Sin registro'}
                          </p>
                          <button 
                            onClick={() => iniciarEdicion(cita)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-600 p-1 bg-slate-50 hover:bg-blue-50 rounded shrink-0"
                            title="Editar motivo"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 flex flex-col items-center">
                <CalendarClock size={48} className="text-slate-200 mb-4" strokeWidth={1.5} />
                <p className="text-slate-500 font-bold text-sm">No hay próximas citas agendadas.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

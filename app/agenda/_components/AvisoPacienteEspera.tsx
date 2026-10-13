'use client'
// Banner amarillo "Paciente en sala de espera" que le llega al doctor.
import { motion, AnimatePresence } from 'framer-motion'
import { Timer, X } from 'lucide-react'

export default function AvisoPacienteEspera({ nombre, onClose }: { nombre: string | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {nombre && (
        <div className="fixed inset-x-0 top-4 z-[1000001] flex justify-center px-4 pointer-events-none">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="pointer-events-auto w-full max-w-md bg-amber-400 text-amber-950 rounded-2xl shadow-2xl border border-amber-500 p-4 flex items-center gap-3">
            <Timer size={22} className="shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Paciente en sala de espera</p>
              <p className="font-black uppercase text-sm truncate">{nombre}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-amber-500/40 transition-colors" aria-label="Cerrar aviso"><X size={18} /></button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

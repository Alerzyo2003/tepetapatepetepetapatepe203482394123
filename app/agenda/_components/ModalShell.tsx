'use client'
// Contenedor común para todos los modales de la agenda:
// fondo oscuro, animación, encabezado azul con ícono, botón cerrar y tecla Escape.
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { GOLD, NAVY } from './utils'

interface Props {
  abierto: boolean;
  onClose: () => void;
  children: ReactNode;
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  icono?: ReactNode;
  colorIcono?: { bg: string; border: string };
  colorSubtitulo?: string;
  ancho?: string;                 // clase Tailwind, ej: 'max-w-2xl'
  posicion?: 'centro' | 'arriba';
  zIndex?: number;
  cerrarConEscape?: boolean;
  sinEncabezado?: boolean;        // para tarjetas propias (ej: ticket de cita lista)
}

export default function ModalShell({
  abierto, onClose, children, titulo, subtitulo, icono,
  colorIcono = { bg: 'rgba(201,162,75,0.15)', border: GOLD },
  colorSubtitulo = GOLD,
  ancho = 'max-w-2xl', posicion = 'centro', zIndex = 99999,
  cerrarConEscape = true, sinEncabezado = false,
}: Props) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!abierto || !cerrarConEscape) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto, cerrarConEscape, onClose]);

  if (!montado) return null;

  return createPortal(
    <AnimatePresence>
      {abierto && (
        <div
          className={`fixed inset-0 flex justify-center bg-slate-900/60 backdrop-blur-sm text-slate-900 text-left ${posicion === 'arriba' ? 'items-start px-4 pb-4 pt-12 md:pt-20' : 'items-center p-4'}`}
          style={{ zIndex }}
        >
          {sinEncabezado ? (
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className={`relative w-full ${ancho}`}>
              {children}
            </motion.div>
          ) : (
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className={`bg-white w-full ${ancho} max-h-[88vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden text-left`}
            >
              <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center gap-4 shrink-0" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                <div className="flex items-center gap-4 min-w-0">
                  {icono && (
                    <div className="p-3 rounded-2xl shadow-sm shrink-0" style={{ backgroundColor: colorIcono.bg, border: `1px solid ${colorIcono.border}` }}>
                      {icono}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="font-display text-lg md:text-xl tracking-tight text-white leading-none">{titulo}</h2>
                    {subtitulo && <p className="text-[11px] md:text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: colorSubtitulo }}>{subtitulo}</p>}
                  </div>
                </div>
                <button onClick={onClose} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-colors shrink-0" aria-label="Cerrar"><X size={24} /></button>
              </div>
              {children}
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

'use client'
// Citas anuladas del día (o de la semana) con acceso rápido a WhatsApp y a la ficha.
import Link from 'next/link'
import { MessageSquareText, Trash2, User } from 'lucide-react'
import ModalShell from './ModalShell'
import { abrirWhatsApp, buscarDoctor, fechaISODeStr, fechaLarga, horaDeStr, nombrePaciente } from './utils'
import type { Profesional } from './types'

interface Props {
  abierto: boolean;
  onClose: () => void;
  citas: any[];
  profesionales: Profesional[];
  usuariosMap: Record<string, string>;
  mostrarFecha: boolean;   // en vista semana se muestra el día
}

export default function ModalAnuladas({ abierto, onClose, citas, profesionales, usuariosMap, mostrarFecha }: Props) {
  return (
    <ModalShell
      abierto={abierto}
      onClose={onClose}
      posicion="arriba"
      icono={<Trash2 className="text-red-400" size={24} />}
      colorIcono={{ bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.6)' }}
      colorSubtitulo="#fca5a5"
      titulo="Citas Anuladas"
      subtitulo="Pacientes que cancelaron"
    >
      <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-4">
        {citas.length === 0 && <p className="text-center text-sm font-bold text-slate-400 py-10">No hay citas anuladas.</p>}
        {citas.map(cita => {
          const doctor = buscarDoctor(profesionales, cita.profesional_id);
          const canceladoPor = cita.cancelado_por ? usuariosMap[cita.cancelado_por] : null;
          return (
            <div key={cita.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 opacity-75 hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-4">
                <div className="w-14 h-12 rounded-xl bg-red-50 text-red-500 flex flex-col items-center justify-center font-black shrink-0 border border-red-100 text-sm leading-tight">
                  {mostrarFecha && <span className="text-[9px] uppercase">{fechaLarga(fechaISODeStr(cita.inicio), { weekday: 'short', day: 'numeric' })}</span>}
                  {horaDeStr(cita.inicio)}
                </div>
                <div>
                  <h4 className="font-black text-sm text-slate-800 uppercase leading-none">{nombrePaciente(cita.pacientes)}</h4>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <span>RUT: {cita.pacientes?.rut || 'S/N'}</span>
                    <span>•</span>
                    <span>Tel: {cita.pacientes?.telefono || 'N/A'}</span>
                  </div>
                  <div className="mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <span>Dr(a). {doctor?.apellido || 'S/A'}</span>
                    {canceladoPor && <span className="ml-2 text-red-400">· Anulada por {canceladoPor.split(' ')[0]}</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                {cita.pacientes?.telefono && (
                  <button onClick={() => abrirWhatsApp(cita.pacientes?.telefono)} className="flex-1 sm:flex-none p-3 sm:p-2 bg-slate-50 text-slate-600 hover:text-emerald-500 rounded-xl border border-slate-200 transition-colors flex justify-center items-center" title="Contactar por WhatsApp">
                    <MessageSquareText size={18} />
                  </button>
                )}
                <Link prefetch={false} href={`/pacientes/${cita.paciente_id}`} onClick={onClose} className="flex-1 sm:flex-none p-3 sm:p-2 bg-slate-50 text-slate-600 hover:text-blue-500 rounded-xl border border-slate-200 transition-colors flex justify-center items-center" title="Ver ficha del paciente">
                  <User size={18} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}

'use client'
// Pacientes del día con tratamiento pendiente (o presupuesto por decidir) que no tienen otra hora agendada.
// La idea es agendarles antes de que se vayan; los que ya se fueron se pueden llamar.
import Link from 'next/link'
import { CalendarPlus, Phone, User } from 'lucide-react'
import ModalShell from './ModalShell'
import { buscarDoctor, ESTADOS_CITA, ESTADOS_EN_CLINICA, fechaISODeStr, fechaLarga, formatNombreDoctor, horaDeStr, nombrePaciente } from './utils'
import type { Profesional } from './types'

interface Props {
  abierto: boolean;
  onClose: () => void;
  citas: any[];                      // citas con sinProximaHora
  profesionales: Profesional[];
  onAgendar: (cita: any) => void;
  mostrarFecha: boolean;             // en vista semana se muestra el día
}

export default function ModalSinProximaHora({ abierto, onClose, citas, profesionales, onAgendar, mostrarFecha }: Props) {
  const enClinica = citas.filter(c => ESTADOS_EN_CLINICA.includes(c.estado));
  const otras = citas.filter(c => !ESTADOS_EN_CLINICA.includes(c.estado));

  const fila = (c: any) => {
    const doctor = buscarDoctor(profesionales, c.profesional_id);
    const estado = ESTADOS_CITA[c.estado] || ESTADOS_CITA.programada;
    return (
      <div key={c.id} className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-12 rounded-xl bg-amber-50 text-amber-700 flex flex-col items-center justify-center font-black shrink-0 border border-amber-200 text-sm leading-tight">
            {mostrarFecha && <span className="text-[9px] uppercase">{fechaLarga(fechaISODeStr(c.inicio), { weekday: 'short', day: 'numeric' })}</span>}
            {horaDeStr(c.inicio)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-black text-sm text-slate-800 uppercase leading-none">{nombrePaciente(c.pacientes)}</h4>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${estado.bg} ${estado.border} ${estado.text}`}>{estado.label}</span>
            </div>
            <p className="text-[11px] font-bold text-amber-700 mt-1.5">{c.sinProximaHora?.texto}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <span>Dr(a). {formatNombreDoctor(doctor?.nombre, doctor?.apellido)}</span>
              {c.pacientes?.telefono && (<><span>•</span><span>Tel: {c.pacientes.telefono}</span></>)}
            </div>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <button onClick={() => onAgendar(c)} className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-[#C9A24B] text-[#0A111F] hover:bg-[#B38D3A] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm">
            <CalendarPlus size={15} /> Agendar
          </button>
          {c.pacientes?.telefono && (
            <a href={`tel:${String(c.pacientes.telefono).replace(/[^\d+]/g, '')}`} className="p-3 sm:p-2.5 bg-slate-50 text-slate-600 hover:text-emerald-600 rounded-xl border border-slate-200 transition-colors flex justify-center items-center" title="Llamar">
              <Phone size={17} />
            </a>
          )}
          <Link prefetch={false} href={`/pacientes/${c.paciente_id}/tratamientos`} onClick={onClose} className="p-3 sm:p-2.5 bg-slate-50 text-slate-600 hover:text-blue-500 rounded-xl border border-slate-200 transition-colors flex justify-center items-center" title="Ver tratamientos del paciente">
            <User size={17} />
          </Link>
        </div>
      </div>
    );
  };

  return (
    <ModalShell
      abierto={abierto}
      onClose={onClose}
      posicion="arriba"
      icono={<CalendarPlus className="text-amber-300" size={24} />}
      colorIcono={{ bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.6)' }}
      colorSubtitulo="#fcd34d"
      titulo="Sin próxima hora"
      subtitulo="Tienen tratamiento pendiente y ninguna hora agendada"
    >
      <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-6">
        {citas.length === 0 && (
          <p className="text-center text-sm font-bold text-slate-400 py-10">Todos los pacientes con tratamiento pendiente ya tienen su próxima hora. 🎉</p>
        )}
        {enClinica.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">En la clínica o ya atendidos ({enClinica.length})</h3>
            {enClinica.map(fila)}
          </section>
        )}
        {otras.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Aún no llegan o sin marcar ({otras.length}) · agéndales cuando vengan</h3>
            {otras.map(fila)}
          </section>
        )}
      </div>
    </ModalShell>
  );
}

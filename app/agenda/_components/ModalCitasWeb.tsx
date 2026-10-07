'use client'
// Solicitudes de hora hechas desde la web, pendientes de validar por recepción.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Ban, CheckCircle2, Globe, Loader2, MessageCircle, Phone, Stethoscope } from 'lucide-react'
import ModalShell from './ModalShell'
import { abrirWhatsApp, buscarDoctor, fechaISODeStr, fechaLarga, horaDeStr, nombrePaciente, URL_CONFIRMAR } from './utils'
import type { Profesional } from './types'

interface Props {
  abierto: boolean;
  onClose: () => void;
  onCambio: () => void;
  citas: any[];
  profesionales: Profesional[];
  usuarioLogueado: string | null;
}

export default function ModalCitasWeb({ abierto, onClose, onCambio, citas, profesionales, usuarioLogueado }: Props) {
  const [procesando, setProcesando] = useState<string | null>(null);

  const validar = async (cita: any) => {
    setProcesando(cita.id);
    try {
      const { error } = await supabase.from('citas').update({ estado_confirmacion: 'enviado', estado: 'programada' }).eq('id', cita.id);
      if (error) throw error;
      toast.success('Cita web aprobada');
      if (cita.pacientes?.telefono) {
        const mensaje = `Hola ${nombrePaciente(cita.pacientes)}, tu solicitud de hora para el día ${fechaLarga(fechaISODeStr(cita.inicio))} a las ${horaDeStr(cita.inicio)} hrs ha sido validada y agendada con éxito.\n\nPor favor confirma tu asistencia haciendo clic en el siguiente enlace:\n${URL_CONFIRMAR}/${cita.id}\n\n¡Te esperamos en Clínica Dignidad!`;
        abrirWhatsApp(cita.pacientes.telefono, mensaje);
      } else {
        toast.warning('La cita fue aprobada, pero el paciente no tiene teléfono registrado.');
      }
      onCambio();
    } catch {
      toast.error('Error al aprobar cita web');
    } finally {
      setProcesando(null);
    }
  };

  const rechazar = async (citaId: string) => {
    if (!confirm('¿Estás seguro de RECHAZAR y ELIMINAR esta solicitud de hora online?')) return;
    setProcesando(citaId);
    try {
      const { error } = await supabase.from('citas').update({ estado: 'cancelada', cancelado_por: usuarioLogueado }).eq('id', citaId);
      if (error) throw error;
      toast.success('Solicitud web eliminada');
      onCambio();
    } catch {
      toast.error('Error al rechazar cita');
    } finally {
      setProcesando(null);
    }
  };

  return (
    <ModalShell
      abierto={abierto}
      onClose={onClose}
      posicion="arriba"
      ancho="max-w-3xl"
      icono={<Globe className="text-blue-400" size={24} />}
      colorIcono={{ bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.6)' }}
      colorSubtitulo="#93c5fd"
      titulo="Citas Web Pendientes"
      subtitulo="Todas las solicitudes futuras · aprobar y notificar"
    >
      <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-4">
        {citas.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-4 opacity-60">
            <CheckCircle2 className="text-emerald-500" size={60} />
            <p className="text-base md:text-sm font-black uppercase tracking-widest text-slate-600">Al día</p>
            <p className="text-sm md:text-xs mt-1">No hay citas web pendientes de validación.</p>
          </div>
        ) : citas.map(cita => {
          const doctor = buscarDoctor(profesionales, cita.profesional_id);
          const ocupado = procesando === cita.id;
          return (
            <div key={cita.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:border-blue-300 hover:shadow-md">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex flex-col items-center justify-center font-black shrink-0 border border-blue-100">
                  <span className="text-sm">{horaDeStr(cita.inicio)}</span>
                </div>
                <div>
                  <h4 className="font-black text-sm text-slate-800 uppercase leading-none">{nombrePaciente(cita.pacientes)}</h4>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <span className="text-slate-700">{fechaLarga(fechaISODeStr(cita.inicio), { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1"><Phone size={12} /> {cita.pacientes?.telefono || 'Sin teléfono'}</span>
                  </div>
                  <div className="mt-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <Stethoscope size={12} /> Dr(a). {doctor?.apellido || 'S/A'}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                <button onClick={() => rechazar(cita.id)} disabled={!!procesando} className="flex-1 md:flex-none p-3 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white rounded-xl border border-red-100 transition-all font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                  <Ban size={16} /> Rechazar
                </button>
                <button onClick={() => validar(cita)} disabled={!!procesando} className="flex-1 md:flex-none p-3 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 shadow-md">
                  {ocupado ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />} Validar y Avisar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}

'use client'
// Genera el enlace para que el paciente elija su nueva hora y lo deja listo para enviar por WhatsApp.
// El paciente mantiene profesional, motivo y duración. La página del enlace está en confirmar-cita-dignidad.
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CalendarSync, Check, Copy, Loader2, MessageCircle, RefreshCw } from 'lucide-react'
import ModalShell from './ModalShell'
import { generarEnlaceReagendar, obtenerEnlaceActivo } from './data'
import {
  abrirWhatsApp, capitalizar, construirMensajeReagendar, duracionMinutos, fechaISODeStr, fechaLarga, GOLD_LIGHT,
  horaDeStr, nombrePaciente, URL_REAGENDAR,
} from './utils'
import type { Profesional } from './types'

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'ya_activo'; desde: string }
  | { tipo: 'listo'; url: string; reemplazo: boolean }
  | { tipo: 'error'; mensaje: string };

const ERRORES: Record<string, string> = {
  cita_en_atencion: 'El paciente ya está en la clínica o fue atendido: esta cita no se puede reagendar por enlace.',
  cita_incompleta: 'La cita no tiene paciente o profesional asignado.',
  cita_no_encontrada: 'Esta cita ya no existe.',
  no_autenticado: 'Tu sesión venció. Vuelve a ingresar.',
};

interface Props {
  cita: any;
  onClose: () => void;
  profesionales: Profesional[];
}

export default function ModalEnlaceReagendar({ cita, onClose, profesionales }: Props) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [copiado, setCopiado] = useState(false);
  const iniciado = useRef(false);

  const generar = async () => {
    setEstado({ tipo: 'cargando' });
    const r = await generarEnlaceReagendar(cita.id);
    if (r.ok) setEstado({ tipo: 'listo', url: `${URL_REAGENDAR}/${r.token}`, reemplazo: r.reemplazo_anterior });
    else setEstado({ tipo: 'error', mensaje: ERRORES[r.codigo] || 'No se pudo generar el enlace. Intenta de nuevo.' });
  };

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    (async () => {
      // Generar otro invalida el anterior: si ya hay uno activo, puede que el paciente lo tenga en su WhatsApp
      const activo = await obtenerEnlaceActivo(cita.id);
      if (activo) setEstado({ tipo: 'ya_activo', desde: activo.created_at });
      else await generar();
    })();
  }, []);

  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      toast.success('Enlace copiado');
      setTimeout(() => setCopiado(false), 2000);
    } catch { toast.error('No se pudo copiar'); }
  };

  const fecha = fechaISODeStr(cita.inicio);

  return (
    <ModalShell
      abierto
      onClose={onClose}
      ancho="max-w-lg"
      icono={<CalendarSync size={24} style={{ color: GOLD_LIGHT }} />}
      titulo="Enlace para reagendar"
      subtitulo={nombrePaciente(cita.pacientes)}
    >
      <div className="p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-4">
        <p className="text-sm font-bold text-slate-700">
          Cita actual: {capitalizar(fechaLarga(fecha, { weekday: 'short', day: 'numeric', month: 'short' }))} a las {horaDeStr(cita.inicio)} · {duracionMinutos(cita)} min
        </p>

        {estado.tipo === 'cargando' && (
          <div className="py-8 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="animate-spin text-[#C9A24B]" size={28} />
            <p className="text-xs font-black uppercase tracking-widest">Generando enlace...</p>
          </div>
        )}

        {estado.tipo === 'error' && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold flex gap-2.5">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" /> {estado.mensaje}
          </div>
        )}

        {estado.tipo === 'ya_activo' && (
          <>
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-sm font-bold">
              Esta cita ya tiene un enlace activo, creado el {new Date(estado.desde).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.
              Por seguridad no se puede volver a mostrar. Si generas uno nuevo, el anterior dejará de funcionar.
            </div>
            <button onClick={generar} className="w-full py-3 bg-[#C9A24B] hover:bg-[#B38D3A] text-[#0A111F] rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors">
              <RefreshCw size={16} /> Generar enlace nuevo
            </button>
          </>
        )}

        {estado.tipo === 'listo' && (
          <>
            <input
              readOnly
              aria-label="Enlace para reagendar"
              value={estado.url}
              onFocus={(e) => e.target.select()}
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#C9A24B]"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button onClick={() => abrirWhatsApp(cita.pacientes?.telefono, construirMensajeReagendar(cita, estado.url, profesionales))} className="py-3 bg-[#C9A24B] hover:bg-[#B38D3A] text-[#0A111F] rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors">
                <MessageCircle size={16} /> Enviar por WhatsApp
              </button>
              <button onClick={() => copiar(estado.url)} className="py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors">
                {copiado ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />} {copiado ? 'Copiado' : 'Copiar enlace'}
              </button>
            </div>
            <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
              {estado.reemplazo && 'El enlace anterior quedó invalidado. '}
              Sirve una sola vez y dura 7 días. El paciente solo podrá elegir horas con el mismo profesional y la misma duración.
            </p>
          </>
        )}
      </div>
    </ModalShell>
  );
}

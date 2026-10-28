'use client'
// Pacientes que no asistieron: los que aún no tienen otra hora (para reagendar) y los que ya la tienen.
// Así no hay que revisar la ficha de cada paciente para saber si ya se reagendó.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CalendarCheck2, CalendarPlus, CalendarX, Loader2, MessageCircle, Phone, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ModalShell from './ModalShell'
import { obtenerInasistencias } from './data'
import {
  abrirWhatsApp, buscarDoctor, construirMensajeInasistencia, fechaISODeStr, fechaLarga, formatNombreDoctor,
  getLocalDateISO, horaDeStr, horaLocalAhoraISO, nombrePaciente,
} from './utils'
import type { Inasistencia, Profesional } from './types'

const PERIODOS = [7, 30, 60];
const DIAS_SIN_REPETIR_WHATSAPP = 5; // igual que "WhatsApp enviado" en el Panel de Seguimiento
const TEXTO_CONTACTO: Record<string, string> = {
  whatsapp: 'WhatsApp enviado', agendo: 'Agendó hora', lo_pensara: 'Lo va a pensar', no_contesta: 'No contesta',
  no_interesado: 'No le interesa', telefono_malo: 'Teléfono malo',
};

interface Props {
  abierto: boolean;
  onClose: () => void;
  profesionales: Profesional[];
  usuarioLogueado: string | null;
  filtroEspecialista: string;       // 'Todos' o el user_id del doctor
  onReagendar: (cita: any) => void;
}

const fechaCorta = (s: string) => fechaLarga(fechaISODeStr(s), { weekday: 'short', day: 'numeric', month: 'short' });

export default function ModalInasistencias({ abierto, onClose, profesionales, usuarioLogueado, filtroEspecialista, onReagendar }: Props) {
  const [dias, setDias] = useState(30);
  const [pestana, setPestana] = useState<'pendientes' | 'reagendados'>('pendientes');
  const [filas, setFilas] = useState<Inasistencia[]>([]);
  const [cargando, setCargando] = useState(false);
  const req = useRef(0);

  useEffect(() => {
    if (!abierto) return;
    const n = ++req.current;
    setCargando(true);
    obtenerInasistencias(dias, filtroEspecialista !== 'Todos' ? filtroEspecialista : null)
      .then(r => { if (n === req.current) setFilas(r); })
      .catch(e => { console.error(e); if (n === req.current) toast.error('No se pudieron cargar las inasistencias'); })
      .finally(() => { if (n === req.current) setCargando(false); });
  }, [abierto, dias, filtroEspecialista]);

  const pendientes = filas.filter(f => !f.siguiente);
  const reagendados = filas.filter(f => f.siguiente);
  const lista = pestana === 'pendientes' ? pendientes : reagendados;

  // WhatsApp: se abre con el mensaje listo y, si recepción confirma que salió, queda en el historial de contactos
  const enviarWhatsApp = (f: Inasistencia) => {
    const c = f.cita;
    if (!abrirWhatsApp(c.pacientes?.telefono, construirMensajeInasistencia(c, profesionales))) return;
    toast(`¿Se envió el WhatsApp a ${nombrePaciente(c.pacientes)}?`, {
      description: 'Confírmalo solo si el mensaje salió.', duration: 30000,
      action: { label: 'Sí, se envió', onClick: () => registrarWhatsApp(f) },
    });
  };

  async function registrarWhatsApp(f: Inasistencia) {
    const ahora = new Date().toISOString();
    setFilas(prev => prev.map(x => (x === f ? { ...x, contacto: { resultado: 'whatsapp', created_at: ahora } } : x)));
    const volver = new Date(); volver.setDate(volver.getDate() + DIAS_SIN_REPETIR_WHATSAPP);
    const { error } = await supabase.from('seguimiento_contactos').insert([{
      paciente_id: f.cita.paciente_id, lista: 'no_asistio', resultado: 'whatsapp',
      volver_a_contactar: getLocalDateISO(volver), usuario_id: usuarioLogueado,
    }]);
    if (error) console.error('No se pudo guardar el contacto en el historial', error);
  }

  const fila = (f: Inasistencia) => {
    const c = f.cita;
    const doctor = buscarDoctor(profesionales, c.profesional_id);
    const s = f.siguiente;
    const docSig = s ? buscarDoctor(profesionales, s.profesional_id) : null;
    const futura = !!s && s.inicio > horaLocalAhoraISO().slice(0, 19);
    return (
      <div key={c.id} className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className={`w-16 h-12 rounded-xl flex flex-col items-center justify-center font-black shrink-0 border text-sm leading-tight ${s ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
            <span className="text-[9px] uppercase">{fechaCorta(c.inicio)}</span>
            {horaDeStr(c.inicio)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-black text-sm text-slate-800 uppercase leading-none">{nombrePaciente(c.pacientes)}</h4>
              {f.veces > 1 && <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">Faltó {f.veces} veces</span>}
            </div>
            <p className="text-[11px] font-bold text-slate-500 mt-1.5">
              Faltó a: {c.motivo || 'Cita'} · Dr(a). {formatNombreDoctor(doctor?.nombre, doctor?.apellido)}
            </p>
            {s ? (
              <p className="text-[11px] font-bold text-emerald-700 mt-1 flex items-center gap-1">
                <CalendarCheck2 size={13} />
                {futura
                  ? <>Nueva hora: {fechaCorta(s.inicio)} {horaDeStr(s.inicio)} · Dr(a). {formatNombreDoctor(docSig?.nombre, docSig?.apellido)}</>
                  : <>{s.estado === 'atendido' ? 'Vino' : 'Tuvo hora'} el {fechaCorta(s.inicio)} {horaDeStr(s.inicio)}</>}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {c.pacientes?.telefono ? <span>Tel: {c.pacientes.telefono}</span> : <span className="text-rose-500">Sin teléfono</span>}
                {f.contacto && (
                  <span className="normal-case tracking-normal text-[11px] text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                    {TEXTO_CONTACTO[f.contacto.resultado] || f.contacto.resultado} el {new Date(f.contacto.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          {!s && (
            <button onClick={() => onReagendar(c)} className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-[#C9A24B] text-[#0A111F] hover:bg-[#B38D3A] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm">
              <CalendarPlus size={15} /> Reagendar
            </button>
          )}
          {!s && c.pacientes?.telefono && (
            <button onClick={() => enviarWhatsApp(f)} className="p-3 sm:p-2.5 bg-slate-50 text-slate-600 hover:text-emerald-600 rounded-xl border border-slate-200 transition-colors flex justify-center items-center" title="WhatsApp para reagendar">
              <MessageCircle size={17} />
            </button>
          )}
          {!s && c.pacientes?.telefono && (
            <a href={`tel:${String(c.pacientes.telefono).replace(/[^\d+]/g, '')}`} className="p-3 sm:p-2.5 bg-slate-50 text-slate-600 hover:text-emerald-600 rounded-xl border border-slate-200 transition-colors flex justify-center items-center" title="Llamar">
              <Phone size={17} />
            </a>
          )}
          <Link prefetch={false} href={`/pacientes/${c.paciente_id}`} onClick={onClose} className="p-3 sm:p-2.5 bg-slate-50 text-slate-600 hover:text-blue-500 rounded-xl border border-slate-200 transition-colors flex justify-center items-center" title="Ver ficha del paciente">
            <User size={17} />
          </Link>
        </div>
      </div>
    );
  };

  const chip = (activo: boolean) => `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${activo ? 'bg-[#0A111F] text-white border-[#0A111F]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`;

  return (
    <ModalShell
      abierto={abierto}
      onClose={onClose}
      posicion="arriba"
      icono={<CalendarX className="text-rose-300" size={24} />}
      colorIcono={{ bg: 'rgba(244,63,94,0.15)', border: 'rgba(244,63,94,0.6)' }}
      colorSubtitulo="#fda4af"
      titulo="No asistieron"
      subtitulo={filtroEspecialista !== 'Todos' ? `Dr. ${buscarDoctor(profesionales, filtroEspecialista)?.apellido || ''}` : 'Todos los especialistas'}
    >
      <div className="px-6 md:px-8 pt-5 pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setPestana('pendientes')} className={chip(pestana === 'pendientes')}>Por reagendar · {pendientes.length}</button>
          <button type="button" onClick={() => setPestana('reagendados')} className={chip(pestana === 'reagendados')}>Ya tienen hora · {reagendados.length}</button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Últimos</span>
          {PERIODOS.map(d => (
            <button key={d} type="button" onClick={() => setDias(d)} className={chip(dias === d)}>{d} días</button>
          ))}
        </div>
      </div>
      <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-3">
        {cargando ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <Loader2 className="animate-spin text-[#C9A24B]" size={28} />
            <p className="text-[11px] font-black uppercase tracking-widest">Revisando inasistencias...</p>
          </div>
        ) : lista.length === 0 ? (
          <p className="text-center text-sm font-bold text-slate-400 py-10">
            {pestana === 'pendientes' ? `Todos los que faltaron en los últimos ${dias} días ya tienen otra hora. 🎉` : 'Nadie se ha reagendado todavía en este período.'}
          </p>
        ) : lista.map(fila)}
      </div>
    </ModalShell>
  );
}

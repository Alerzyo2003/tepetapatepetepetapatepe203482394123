'use client'
// Bloquea la agenda de un especialista (todo el día o un rango de horas) en la fecha seleccionada.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Ban, Loader2, Lock } from 'lucide-react'
import ModalShell from './ModalShell'
import { registrarAuditoria } from './data'
import { getLocalDateISO } from './utils'
import type { Profesional } from './types'

export interface BloqueoInicial {
  profesionalUserId?: string;
  horaInicio?: string;
  horaFin?: string;
  motivo?: string;
}

interface Props {
  abierto: boolean;
  onClose: () => void;
  onGuardado: () => void;
  fecha: Date;
  profesionales: Profesional[];
  usuarioLogueado: string | null;
  inicial?: BloqueoInicial | null;   // ej: al bloquear desde la grilla de la Vista Diaria
}

export default function ModalBloqueo({ abierto, onClose, onGuardado, fecha, profesionales, usuarioLogueado, inicial }: Props) {
  const [profesional, setProfesional] = useState('');
  const [motivo, setMotivo] = useState('Imprevisto Médico');
  const [todoElDia, setTodoElDia] = useState(true);
  const [horaInicio, setHoraInicio] = useState('13:00');
  const [horaFin, setHoraFin] = useState('14:00');
  const [guardando, setGuardando] = useState(false);

  // Precarga valores al abrir desde la grilla
  useEffect(() => {
    if (!abierto || !inicial) return;
    if (inicial.profesionalUserId) setProfesional(inicial.profesionalUserId);
    if (inicial.motivo) setMotivo(inicial.motivo);
    if (inicial.horaInicio && inicial.horaFin) {
      setTodoElDia(false);
      setHoraInicio(inicial.horaInicio);
      setHoraFin(inicial.horaFin);
    }
  }, [abierto, inicial]);

  const guardar = async () => {
    if (!profesional) return toast.error('Debe seleccionar un profesional para bloquear su agenda.');
    if (!motivo.trim()) return toast.error('Debe ingresar un motivo para el bloqueo.');
    if (!todoElDia && (!horaInicio || !horaFin)) return toast.error('Debe especificar hora de inicio y fin.');
    if (!todoElDia && horaFin <= horaInicio) return toast.error('La hora de término debe ser posterior a la de inicio.');
    const profObj = profesionales.find(p => p.user_id === profesional);
    if (!profObj) return toast.error('No se encontró el profesional seleccionado.');

    const fechaISO = getLocalDateISO(fecha);
    setGuardando(true);
    try {
      // ¿Hay citas que quedarían "huérfanas"?
      const { data: afectadas } = await supabase.from('citas').select('id, inicio, fin')
        .eq('profesional_id', profesional)
        .gte('inicio', `${fechaISO}T00:00:00`).lte('inicio', `${fechaISO}T23:59:59`)
        .not('estado', 'in', '("cancelada","atendido","no_asiste")');

      let choques = 0;
      if (afectadas?.length) {
        if (todoElDia) choques = afectadas.length;
        else {
          const bIni = new Date(`${fechaISO}T${horaInicio}`).getTime();
          const bFin = new Date(`${fechaISO}T${horaFin}`).getTime();
          choques = afectadas.filter((c: any) => new Date(c.inicio.replace(' ', 'T')).getTime() < bFin && new Date(c.fin.replace(' ', 'T')).getTime() > bIni).length;
        }
      }
      if (choques > 0 && !window.confirm(`⚠️ ADVERTENCIA DE CHOQUE:\n\nHay ${choques} cita(s) agendada(s) que choca(n) con este bloqueo.\n\nSi continúas, esas citas quedarán "Huérfanas" y tendrás que reagendarlas manualmente.\n\n¿Estás seguro de bloquear la agenda?`)) {
        setGuardando(false);
        return;
      }

      const { error } = await supabase.from('bloqueos_agenda').insert([{
        profesional_id: profObj.id,
        fecha: fechaISO,
        motivo,
        hora_inicio: todoElDia ? null : horaInicio,
        hora_fin: todoElDia ? null : horaFin,
      }]);
      if (error) throw error;

      await registrarAuditoria(usuarioLogueado, 'INSERT / BLOQUEO AGENDA', 'bloqueos_agenda', `Bloqueó agenda para Dr/a. ${profObj.nombre} ${profObj.apellido} el día ${fechaISO}. Motivo: ${motivo}.`);
      toast.success('Agenda bloqueada exitosamente');
      onClose();
      onGuardado();
    } catch {
      toast.error('Error al bloquear el horario.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalShell
      abierto={abierto}
      onClose={onClose}
      ancho="max-w-sm"
      icono={<Lock size={20} className="text-red-300" />}
      colorIcono={{ bg: 'rgba(220,80,70,0.15)', border: 'rgba(220,80,70,0.6)' }}
      titulo="Bloquear Agenda"
      subtitulo="Bloquea turnos a pacientes"
    >
      <div className="p-6 md:p-8 space-y-6 overflow-y-auto">
        <p className="text-sm md:text-xs font-bold text-slate-600 leading-relaxed">
          Se bloqueará la agenda para el <span className="font-black text-red-500">{fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</span>. Para otro día, cambia la fecha en la agenda antes de abrir este panel.
        </p>

        <div className="space-y-2">
          <label className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Doctor a bloquear</label>
          <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-base md:text-xs outline-none focus:border-red-500 transition-all shadow-sm cursor-pointer" value={profesional} onChange={(e) => setProfesional(e.target.value)}>
            <option value="">Seleccione especialista...</option>
            {profesionales.map(p => <option key={p.id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Motivo del bloqueo</label>
          <input type="text" placeholder="Ej: Licencia Médica, Colación..." className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-base md:text-xs outline-none focus:border-red-500 transition-all shadow-sm" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>

        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">¿Bloquear todo el día?</span>
            <input type="checkbox" checked={todoElDia} onChange={(e) => setTodoElDia(e.target.checked)} className="w-6 h-6 md:w-5 md:h-5 accent-red-500 cursor-pointer" />
          </div>
          {!todoElDia && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Desde las</label>
                <input type="time" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-base md:text-sm outline-none focus:border-red-500" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Hasta las</label>
                <input type="time" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-base md:text-sm outline-none focus:border-red-500" value={horaFin} onChange={e => setHoraFin(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="p-6 md:p-8 border-t border-slate-100 bg-white shrink-0">
        <button onClick={guardar} disabled={guardando || !motivo.trim() || !profesional || (!todoElDia && (!horaInicio || !horaFin))} className="w-full py-4 bg-red-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-md hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {guardando ? <Loader2 className="animate-spin" size={16} /> : <Ban size={18} />} Confirmar Bloqueo
        </button>
      </div>
    </ModalShell>
  );
}

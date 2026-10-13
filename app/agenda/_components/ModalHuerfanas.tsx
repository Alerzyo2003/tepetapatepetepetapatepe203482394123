'use client'
// Citas futuras (90 días) que quedaron dentro de un bloqueo de agenda y hay que reagendar.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle, Ban, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  Loader2, MessageCircle, Save, UserCheck,
} from 'lucide-react'
import ModalShell from './ModalShell'
import { registrarAuditoria } from './data'
import {
  abrirWhatsApp, buscarDoctor, duracionMinutos, esWebPendiente, fechaISODeStr, fechaLarga, formatNombreDoctor,
  getLocalDateISO, getLunes, getMinsFromDateStr, GOLD, horaDeStr, minsToT, nombrePaciente, tToMins,
} from './utils'
import type { Profesional } from './types'

interface Props {
  abierto: boolean;
  onClose: () => void;
  onCambio: () => void;
  filtroEspecialista: string;
  profesionales: Profesional[];
  usuarioLogueado: string | null;
  puedeVerAgendaCompleta: boolean;
}

export default function ModalHuerfanas({ abierto, onClose, onCambio, filtroEspecialista, profesionales, usuarioLogueado, puedeVerAgendaCompleta }: Props) {
  const [citas, setCitas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);

  // Edición (reagendar) de una cita
  const [citaEnEdicion, setCitaEnEdicion] = useState<string | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [nuevaHora, setNuevaHora] = useState('');
  const [nuevoEspecialista, setNuevoEspecialista] = useState('');
  const [duracion, setDuracion] = useState(45);
  const [semanaInicio, setSemanaInicio] = useState<Date>(getLunes(new Date()));
  const [dispoSemana, setDispoSemana] = useState<any[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const hoyISO = getLocalDateISO(new Date());

  useEffect(() => {
    if (abierto) { setCitaEnEdicion(null); buscarHuerfanas(); }
  }, [abierto]);

  useEffect(() => {
    if (nuevoEspecialista && citaEnEdicion) calcularDisponibilidad();
  }, [semanaInicio, nuevoEspecialista, citaEnEdicion, duracion]);

  async function buscarHuerfanas() {
    setCargando(true);
    try {
      const limite = new Date(); limite.setDate(limite.getDate() + 90);
      const limiteStr = getLocalDateISO(limite);
      const filtrar = filtroEspecialista && filtroEspecialista !== 'Todos';

      let qCitas = supabase.from('citas').select('*, pacientes(*)')
        .gte('inicio', `${hoyISO}T00:00:00`).lte('inicio', `${limiteStr}T23:59:59`)
        .not('estado', 'in', '("cancelada","atendido","no_asiste")')
        .order('inicio', { ascending: true });
      if (filtrar) qCitas = qCitas.eq('profesional_id', filtroEspecialista);
      const { data: futuras, error } = await qCitas;
      if (error) throw error;
      if (!futuras?.length) { setCitas([]); return; }

      let qBloq = supabase.from('bloqueos_agenda').select('*').gte('fecha', hoyISO).lte('fecha', limiteStr);
      if (filtrar) {
        const prof = profesionales.find(p => p.user_id === filtroEspecialista);
        if (prof) qBloq = qBloq.eq('profesional_id', prof.id);
      }
      const { data: bloqueos } = await qBloq;

      setCitas(futuras.filter((cita: any) => {
        if (!cita.profesional_id) return true;
        const fecha = fechaISODeStr(cita.inicio);
        const prof = profesionales.find(p => p.user_id === cita.profesional_id);
        return bloqueos?.some((b: any) => {
          if (b.profesional_id !== prof?.id || b.fecha !== fecha) return false;
          if (!b.hora_inicio || !b.hora_fin) return true;
          const cIni = new Date(cita.inicio.replace(' ', 'T')).getTime();
          const cFin = new Date(cita.fin.replace(' ', 'T')).getTime();
          return cIni < new Date(`${fecha}T${b.hora_fin}`).getTime() && cFin > new Date(`${fecha}T${b.hora_inicio}`).getTime();
        });
      }));
    } catch {
      toast.error('Error al escanear la agenda global');
    } finally {
      setCargando(false);
    }
  }

  async function calcularDisponibilidad() {
    setCargandoSlots(true);
    try {
      const dias = Array.from({ length: 7 }).map((_, i) => { const d = new Date(semanaInicio); d.setDate(d.getDate() + i); return d; });
      const ini = getLocalDateISO(dias[0]); const fin = getLocalDateISO(dias[6]);
      const prof = profesionales.find(p => p.user_id === nuevoEspecialista);

      const [bloqRes, dispoRes, citasRes] = await Promise.all([
        prof ? supabase.from('bloqueos_agenda').select('fecha, hora_inicio, hora_fin').eq('profesional_id', prof.id).gte('fecha', ini).lte('fecha', fin) : Promise.resolve({ data: [] as any[] }),
        supabase.from('disponibilidad_profesional').select('*').eq('profesional_id', nuevoEspecialista),
        supabase.from('citas').select('inicio, fin, estado_confirmacion, motivo').eq('profesional_id', nuevoEspecialista).gte('inicio', `${ini}T00:00:00`).lte('inicio', `${fin}T23:59:59`).neq('estado', 'cancelada'),
      ]);

      setDispoSemana(dias.map(dateObj => {
        const dateStr = getLocalDateISO(dateObj);
        const bloqDia = (bloqRes.data || []).filter((b: any) => b.fecha === dateStr);
        if (bloqDia.some((b: any) => !b.hora_inicio || !b.hora_fin)) return { date: dateStr, dateObj, status: 'bloqueado', slots: [] };

        const especiales = (dispoRes.data || []).filter((d: any) => d.fecha_especifica === dateStr);
        const bloques = especiales.length > 0 ? especiales : (dispoRes.data || []).filter((d: any) => d.dia_semana === dateObj.getDay() && !d.fecha_especifica);
        if (bloques.length === 0) return { date: dateStr, dateObj, status: 'sin_horario', slots: [] };

        const ocupadas = (citasRes.data || [])
          .filter((c: any) => c.inicio.startsWith(dateStr) && !esWebPendiente(c))
          .map((c: any) => ({ i: getMinsFromDateStr(c.inicio), f: getMinsFromDateStr(c.fin) }));

        const vistos = new Set<string>();
        const slots: { time: string; ocupado: boolean }[] = [];
        bloques.forEach((b: any) => {
          for (let t = tToMins(b.hora_inicio); t + duracion <= tToMins(b.hora_fin); t += 15) {
            const tFin = t + duracion;
            const bloqueado = bloqDia.some((x: any) => t < tToMins(x.hora_fin) && tFin > tToMins(x.hora_inicio));
            const hora = minsToT(t);
            if (!bloqueado && !vistos.has(hora)) {
              vistos.add(hora);
              slots.push({ time: hora, ocupado: ocupadas.some(o => t < o.f && tFin > o.i) });
            }
          }
        });
        slots.sort((a, b) => a.time.localeCompare(b.time));
        return { date: dateStr, dateObj, status: slots.length > 0 ? 'limpio' : 'lleno', slots };
      }));
    } catch {
      toast.error('Error al calcular la agenda');
    } finally {
      setCargandoSlots(false);
    }
  }

  const empezarEdicion = (cita: any) => {
    const mins = duracionMinutos(cita);
    setDuracion(mins > 0 ? mins : 30);
    setCitaEnEdicion(cita.id);
    setNuevaFecha(''); setNuevaHora('');
    setNuevoEspecialista(cita.profesional_id || profesionales[0]?.user_id || '');
    setSemanaInicio(getLunes(new Date()));
  };

  const reagendar = async (cita: any) => {
    if (!nuevaFecha || !nuevaHora || !nuevoEspecialista) return toast.error('Selecciona un día y hora');
    setGuardando(true);
    try {
      const finDate = new Date(new Date(`${nuevaFecha}T${nuevaHora}:00`).getTime() + duracion * 60000);
      const finStr = `${String(finDate.getHours()).padStart(2, '0')}:${String(finDate.getMinutes()).padStart(2, '0')}:00`;
      const { error } = await supabase.from('citas').update({
        inicio: `${nuevaFecha}T${nuevaHora}:00`, fin: `${nuevaFecha}T${finStr}`,
        profesional_id: nuevoEspecialista, estado: 'reprogramada', modificado_por: usuarioLogueado,
      }).eq('id', cita.id);
      if (error) throw error;
      await registrarAuditoria(usuarioLogueado, 'UPDATE / REPROGRAMACIÓN HUÉRFANA', 'citas', `Reprogramó cita huérfana de ${nombrePaciente(cita.pacientes)} para el ${nuevaFecha} a las ${nuevaHora}.`);
      toast.success('Cita huérfana reagendada');
      setCitaEnEdicion(null);
      setCitas(prev => prev.filter(c => c.id !== cita.id));
      onCambio();
    } catch {
      toast.error('Error al reagendar');
    } finally {
      setGuardando(false);
    }
  };

  const anular = async (cita: any) => {
    if (!confirm('¿Estás seguro de anular la cita de este paciente?')) return;
    try {
      const { error } = await supabase.from('citas').update({ estado: 'cancelada', modificado_por: usuarioLogueado, cancelado_por: usuarioLogueado }).eq('id', cita.id);
      if (error) throw error;
      await registrarAuditoria(usuarioLogueado, 'UPDATE / ANULACIÓN CITA', 'citas', `Anuló la cita de ${nombrePaciente(cita.pacientes)} del día ${fechaISODeStr(cita.inicio)}.`);
      toast.success('Cita anulada correctamente');
      setCitas(prev => prev.filter(c => c.id !== cita.id));
      onCambio();
    } catch {
      toast.error('No se pudo anular la cita');
    }
  };

  const moverSemana = (dias: number) => { const d = new Date(semanaInicio); d.setDate(d.getDate() + dias); setSemanaInicio(d); };

  return (
    <ModalShell
      abierto={abierto}
      onClose={onClose}
      posicion="arriba"
      ancho="max-w-4xl"
      icono={<AlertTriangle className="text-amber-300" size={24} />}
      colorIcono={{ bg: 'rgba(245,180,60,0.15)', border: 'rgba(245,180,60,0.6)' }}
      titulo="Citas Huérfanas"
      subtitulo="Requieren Reagendamiento · próximos 90 días"
    >
      <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar">
        {cargando ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-4">
            <Loader2 className="animate-spin" size={40} />
            <p className="text-sm md:text-xs font-black uppercase tracking-widest">Analizando agenda global...</p>
          </div>
        ) : citas.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-4 opacity-60">
            <CheckCircle2 className="text-emerald-500" size={60} />
            <p className="text-base md:text-sm font-black uppercase tracking-widest text-slate-600">No hay citas huérfanas</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm md:text-xs font-bold text-slate-500 mb-6">Se encontraron <span className="font-black text-amber-600">{citas.length} citas</span> afectadas por bloqueos.</p>
            {citas.map(cita => {
              const editando = citaEnEdicion === cita.id;
              const doc = buscarDoctor(profesionales, cita.profesional_id);
              return (
                <div key={cita.id} className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col transition-all">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 md:gap-5 w-full md:w-auto">
                      <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex flex-col items-center justify-center border border-amber-100 shrink-0">
                        <span className="text-sm md:text-xs font-black">{horaDeStr(cita.inicio)}</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-black text-base md:text-sm text-slate-800 uppercase leading-none">{nombrePaciente(cita.pacientes)}</h4>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="text-[10px] md:text-[9px] font-bold text-slate-500 tracking-widest bg-slate-50 border border-slate-200 px-2 py-1 rounded-md capitalize">
                            <CalendarDays className="inline mr-1" size={12} /> {fechaLarga(fechaISODeStr(cita.inicio), { weekday: 'long', day: 'numeric', month: 'short' })}
                          </span>
                          {doc && (
                            <span className="text-[10px] md:text-[9px] font-bold text-slate-500 tracking-widest bg-slate-50 border border-slate-200 px-2 py-1 rounded-md uppercase">
                              Dr. {formatNombreDoctor(doc.nombre, doc.apellido)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {!editando && (
                      <div className="flex gap-2 self-start md:self-auto w-full md:w-auto">
                        {cita.pacientes?.telefono && (
                          <button onClick={() => abrirWhatsApp(cita.pacientes?.telefono)} className="p-3 md:p-2 bg-white border border-slate-200 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all shadow-sm" title="Contactar por WhatsApp">
                            <MessageCircle size={18} />
                          </button>
                        )}
                        <button onClick={() => empezarEdicion(cita)} className="flex-1 md:flex-none justify-center px-4 py-3 md:py-2 bg-amber-50 text-amber-600 text-xs md:text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-white rounded-xl transition-all flex items-center gap-2 shadow-sm">
                          <CalendarClock size={16} /> Reagendar
                        </button>
                        <button onClick={() => anular(cita)} className="p-3 md:p-2 bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all shadow-sm" title="Anular cita">
                          <Ban size={18} />
                        </button>
                      </div>
                    )}
                  </div>

                  <AnimatePresence>
                    {editando && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col gap-6">
                          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                            <div className="space-y-2 flex-1 w-full">
                              <label className="text-[11px] md:text-[9px] font-black uppercase ml-2 flex items-center gap-1" style={{ color: GOLD }}><UserCheck size={14} /> Especialista a derivar</label>
                              <select
                                className="w-full p-4 bg-white border border-[#C9A24B]/40 rounded-xl font-bold text-base md:text-xs outline-none text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-50"
                                value={nuevoEspecialista}
                                onChange={(e) => { setNuevoEspecialista(e.target.value); setNuevaFecha(''); setNuevaHora(''); }}
                                disabled={!puedeVerAgendaCompleta}
                              >
                                {profesionales.filter(p => puedeVerAgendaCompleta || p.user_id === usuarioLogueado).map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
                              </select>
                            </div>
                            <div className="bg-emerald-50 w-full md:w-auto px-4 py-3 rounded-xl border border-emerald-100 shrink-0 text-center">
                              <span className="text-[11px] md:text-[10px] font-black text-emerald-600 uppercase">Buscando huecos de {duracion} min</span>
                            </div>
                          </div>

                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col">
                            <div className="flex items-center justify-between mb-4 bg-white p-2 rounded-xl shadow-sm border border-slate-100">
                              <button onClick={() => moverSemana(-7)} className="p-3 md:p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all"><ChevronLeft size={20} /></button>
                              <span className="text-[11px] md:text-[10px] font-black text-slate-700 uppercase tracking-widest text-center px-2">
                                Semana del {semanaInicio.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                              </span>
                              <button onClick={() => moverSemana(7)} className="p-3 md:p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all"><ChevronRight size={20} /></button>
                            </div>

                            <div className="flex gap-3 md:gap-2 overflow-x-auto pb-4 custom-scrollbar snap-x">
                              {cargandoSlots ? (
                                <div className="w-full py-10 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" size={28} /></div>
                              ) : dispoSemana.map((dia, idx) => {
                                const esHoy = dia.date === hoyISO;
                                return (
                                  <div key={idx} className={`snap-center min-w-[130px] md:min-w-[110px] flex-1 bg-white border ${esHoy ? 'border-[#C9A24B] shadow-md' : 'border-slate-200'} rounded-2xl p-4 md:p-3 flex flex-col items-center`}>
                                    <div className="text-center mb-4 md:mb-3">
                                      <span className="block text-[11px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">{dia.dateObj.toLocaleDateString('es-CL', { weekday: 'short' })}</span>
                                      <span className={`block text-xl md:text-lg font-black ${esHoy ? '' : 'text-slate-800'}`} style={esHoy ? { color: '#8A6D2F' } : undefined}>{dia.dateObj.getDate()}</span>
                                    </div>
                                    <div className="w-full flex-1 flex flex-col gap-2.5 md:gap-2 overflow-y-auto max-h-56 md:max-h-48 pr-1 custom-scrollbar">
                                      {dia.status === 'bloqueado' && <span className="text-[10px] md:text-[9px] font-bold text-red-400 text-center py-4 italic">Bloqueado</span>}
                                      {dia.status === 'sin_horario' && <span className="text-[10px] md:text-[9px] font-bold text-slate-300 text-center py-4 italic">Sin Horario</span>}
                                      {dia.status === 'lleno' && <span className="text-[10px] md:text-[9px] font-bold text-amber-400 text-center py-4 italic">Agenda Llena</span>}
                                      {dia.status === 'limpio' && dia.slots.map((s: any) => {
                                        const sel = nuevaFecha === dia.date && nuevaHora === s.time;
                                        const clase = sel ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : s.ocupado ? 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100' : 'bg-slate-50 text-emerald-600 border-emerald-100 hover:bg-emerald-50';
                                        return (
                                          <button
                                            key={s.time}
                                            onClick={() => {
                                              if (s.ocupado && !window.confirm(`⚠️ El horario de las ${s.time} ya está ocupado. ¿Deseas agendar un SOBRECUPO?`)) return;
                                              setNuevaFecha(dia.date); setNuevaHora(s.time);
                                            }}
                                            className={`w-full py-3 md:py-2 rounded-lg text-xs md:text-[10px] font-black transition-all border ${clase}`}
                                          >
                                            {s.time}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="mt-2 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-200 pt-4 text-center md:text-left">
                            <div className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">
                              Seleccionado: <span className={nuevaHora ? 'text-emerald-600' : 'text-red-400'}>{nuevaHora ? `${nuevaFecha} a las ${nuevaHora}` : 'Ninguno'}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                              <button onClick={() => setCitaEnEdicion(null)} className="w-full sm:w-auto px-6 py-4 md:py-3 text-[11px] md:text-[10px] font-black text-slate-400 uppercase hover:text-slate-700 transition-all border border-slate-200 sm:border-transparent rounded-xl">Cancelar</button>
                              <button onClick={() => reagendar(cita)} disabled={guardando || !nuevaHora} className={`w-full sm:w-auto px-8 py-4 md:py-3 text-white text-[11px] md:text-[10px] font-black uppercase tracking-widest rounded-xl shadow-md flex items-center justify-center gap-2 transition-all ${nuevaHora ? 'bg-emerald-500 hover:bg-emerald-600 active:scale-95' : 'bg-slate-300 cursor-not-allowed'}`}>
                                {guardando ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Confirmar
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

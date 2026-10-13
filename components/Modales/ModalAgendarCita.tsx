import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { CalendarIcon, Clock, ClipboardList, ChevronLeft, ChevronRight, Save, X, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

// --- CONSTANTES Y HELPERS ---
const slotsHorarios = [
  "08:00", "08:15", "08:30", "08:45", "09:00", "09:15", "09:30", "09:45",
  "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30", "11:45",
  "12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45",
  "14:00", "14:15", "14:30", "14:45", "15:00", "15:15", "15:30", "15:45",
  "16:00", "16:15", "16:30", "16:45", "17:00", "17:15", "17:30", "17:45",
  "18:00", "18:15", "18:30", "18:45", "19:00", "19:15", "19:30", "19:45",
  "20:00", "20:15", "20:30", "20:45", "21:00"
];
const duracionesDisponibles = [15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300];

const getLunes = (d: Date) => { const date = new Date(d); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); date.setHours(0,0,0,0); return date; }
const getDiasLunesSabado = (d: Date) => { const curr = new Date(d); const day = curr.getDay(); const diff = curr.getDate() - day + (day === 0 ? -6 : 1); return Array.from({ length: 6 }, (_, i) => new Date(curr.getFullYear(), curr.getMonth(), diff + i)); }
const getLocalDateISO = (d: Date) => { const year = d.getFullYear(); const month = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${year}-${month}-${day}`; }

export default function ModalAgendarCita({ isOpen, onClose, paciente, creadoPor, onSuccess }: any) {
  const [semanaInicio, setSemanaInicio] = useState(getLunes(new Date()))
  const [profesionales, setProfesionales] = useState<any[]>([])
  const [filtroAgenda, setFiltroAgenda] = useState({ profesional_id: '', duracionDefault: 30 })
  const [horasSeleccionadas, setHorasSeleccionadas] = useState<{fecha: string, hora: string, duracion: number}[]>([])
  
  const [horariosConfigurados, setHorariosConfigurados] = useState<any[]>([])
  const [citasOcupadas, setCitasOcupadas] = useState<any[]>([])
  const [bloqueosSemana, setBloqueosSemana] = useState<any[]>([]) 
  
  const [tratamientosPaciente, setTratamientosPaciente] = useState<any[]>([])
  const [tratamientoSeleccionadoId, setTratamientoSeleccionadoId] = useState<string | null>('MANUAL')
  const [nuevoTratamientoNombre, setNuevoTratamientoNombre] = useState('')
  const [guardandoCita, setGuardandoCita] = useState(false)

  // Cargar datos iniciales al abrir el modal
  useEffect(() => {
    if (isOpen && paciente?.id) {
      setHorasSeleccionadas([]);
      setNuevoTratamientoNombre('');
      setTratamientoSeleccionadoId('MANUAL');
      
      const fetchInicial = async () => {
        // Reducido: Solo columnas necesarias
        const { data: profs } = await supabase.from('profesionales').select('id, user_id, nombre, apellido').eq('activo', true);
        setProfesionales(profs || []);
        if (profs && profs.length > 0 && !filtroAgenda.profesional_id) {
          setFiltroAgenda(prev => ({...prev, profesional_id: profs[0].user_id}));
        }

        const { data: presups } = await supabase.from('presupuestos').select('id, nombre_tratamiento').eq('paciente_id', paciente.id).neq('estado', 'finalizado').order('fecha_creacion', { ascending: false });
        setTratamientosPaciente(presups || []);
      };
      
      fetchInicial();
    }
  }, [isOpen, paciente]);

  // Cargar grilla cuando cambia la semana o el profesional
  useEffect(() => {
    if (isOpen && filtroAgenda.profesional_id) {
      fetchDisponibilidadGrid();
    }
  }, [semanaInicio, isOpen, filtroAgenda.profesional_id]);

  async function fetchDisponibilidadGrid() {
    const dias = getDiasLunesSabado(semanaInicio);
    const inicioSemana = getLocalDateISO(dias[0]);
    const finSemana = getLocalDateISO(dias[5]);
    
    const profObj = profesionales.find(p => p.user_id === filtroAgenda.profesional_id);

    // Optimizado: Selects específicos para reducir Egress
    const [citasRes, dispoRes, bloqueosRes] = await Promise.all([
      supabase.from('citas').select('id, inicio, fin').eq('profesional_id', filtroAgenda.profesional_id).gte('inicio', `${inicioSemana}T00:00:00`).lte('inicio', `${finSemana}T23:59:59`).neq('estado', 'cancelada'),
      supabase.from('disponibilidad_profesional').select('dia_semana, hora_inicio, hora_fin, fecha_especifica').eq('profesional_id', filtroAgenda.profesional_id),
      profObj ? supabase.from('bloqueos_agenda').select('fecha, hora_inicio, hora_fin').eq('profesional_id', profObj.id).gte('fecha', inicioSemana).lte('fecha', finSemana) : Promise.resolve({ data: [] })
    ]);

    setCitasOcupadas(citasRes.data || []);
    setHorariosConfigurados(dispoRes.data || []);
    setBloqueosSemana(bloqueosRes.data || []);
  }

  const esHorarioLaboral = (fecha: string, hora: string, duracionMinutos: number) => {
    const diaSemana = new Date(fecha + 'T00:00:00').getDay();
    const slotStart = new Date(`${fecha}T${hora}:00`).getTime();
    const slotEnd = slotStart + duracionMinutos * 60000;

    const especiales = horariosConfigurados.filter(h => h.fecha_especifica === fecha);
    const horariosAUsar = especiales.length > 0 ? especiales : horariosConfigurados.filter(h => h.dia_semana === diaSemana && !h.fecha_especifica);

    return horariosAUsar.some(h => {
      const inicioLab = new Date(`${fecha}T${h.hora_inicio.substring(0,5)}:00`).getTime();
      const finLab = new Date(`${fecha}T${h.hora_fin.substring(0,5)}:00`).getTime();
      return slotStart >= inicioLab && slotEnd <= finLab;
    });
  }

  const esCitaOcupada = (fecha: string, hora: string, duracionMinutos: number) => {
    const slotStart = new Date(`${fecha}T${hora}:00`).getTime();
    const slotEnd = slotStart + duracionMinutos * 60000;
    return citasOcupadas.some(cita => {
      const citaInicio = new Date(cita.inicio.replace(' ', 'T')).getTime();
      const citaFin = new Date(cita.fin.replace(' ', 'T')).getTime();
      return slotStart < citaFin && slotEnd > citaInicio;
    });
  };

  const esHorarioBloqueado = (fecha: string, hora: string, duracionMinutos: number) => {
    const slotStart = new Date(`${fecha}T${hora}:00`).getTime();
    const slotEnd = slotStart + duracionMinutos * 60000;
    return bloqueosSemana.some(b => {
      if (b.fecha !== fecha) return false;
      if (!b.hora_inicio || !b.hora_fin) return true; 
      const bStart = new Date(`${fecha}T${b.hora_inicio}`).getTime();
      const bEnd = new Date(`${fecha}T${b.hora_fin}`).getTime();
      return slotStart < bEnd && slotEnd > bStart;
    });
  };

  const handleSlotClick = (fecha: string, hora: string) => {
    const selIndex = horasSeleccionadas.findIndex(x => x.fecha === fecha && x.hora === hora);
    if (selIndex >= 0) {
      setHorasSeleccionadas(prev => prev.filter((_, i) => i !== selIndex));
      return;
    }

    const laboral = esHorarioLaboral(fecha, hora, filtroAgenda.duracionDefault);
    const ocupado = esCitaOcupada(fecha, hora, filtroAgenda.duracionDefault);
    const bloqueado = esHorarioBloqueado(fecha, hora, filtroAgenda.duracionDefault);

    if (bloqueado) return toast.error("Este horario está bloqueado.");
    if (!laboral) return toast.error("Fuera del horario laboral del especialista.");
    if (ocupado) {
      if (!window.confirm(`⚠️ Este bloque choca con otra cita. ¿Deseas forzar un SOBRECUPO?`)) return;
    }

    setHorasSeleccionadas(prev => [...prev, { fecha, hora, duracion: filtroAgenda.duracionDefault }]);
  };

  const handleGuardarCita = async () => {
    setGuardandoCita(true);
    try {
      const parsearAFechaLocal = (fechaStr: string, horaStr: string, duracionMin: number) => {
        const finDate = new Date(new Date(`${fechaStr}T${horaStr}:00`).getTime() + duracionMin * 60000);
        const finH = finDate.getHours().toString().padStart(2, '0');
        const finM = finDate.getMinutes().toString().padStart(2, '0');
        return { inicio: `${fechaStr}T${horaStr}:00`, fin: `${fechaStr}T${finH}:${finM}:00` };
      };

      const nuevasCitas = horasSeleccionadas.map(s => {
        const { inicio, fin } = parsearAFechaLocal(s.fecha, s.hora, s.duracion);
        return { 
          paciente_id: paciente.id, 
          profesional_id: filtroAgenda.profesional_id, 
          presupuesto_id: (tratamientoSeleccionadoId && tratamientoSeleccionadoId !== 'MANUAL') ? tratamientoSeleccionadoId : null, 
          inicio, 
          fin, 
          estado: 'programada', 
          motivo: nuevoTratamientoNombre.toUpperCase() || 'CONSULTA', 
          creado_por: creadoPor // <-- Pasado por props
        };
      });

      const { data: citasCreadas, error } = await supabase.from('citas').insert(nuevasCitas).select('id');
      if (error) throw error;
      
      // Enviamos la data al padre (Layout) para que levante el Ticket
      onSuccess({ 
        paciente: `${paciente.nombre} ${paciente.apellido}`.toUpperCase(), 
        citas: horasSeleccionadas, 
        telefono: paciente.telefono, 
        citaId: citasCreadas?.[0]?.id 
      });
      
    } catch (e) {
      toast.error("Error al guardar las citas");
      console.error(e);
    } finally {
      setGuardandoCita(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-left">
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden text-left">
         
         {/* CABECERA */}
         <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0" style={{ background: `linear-gradient(135deg, #0E1B2E, #081420)` }}>
            <div className="flex items-center gap-4">
               <div className="p-3 rounded-xl shadow-sm bg-white/10 border border-white/20"><CalendarIcon size={24} className="text-[#C9A24B]"/></div>
               <div>
                 <h2 className="font-display text-xl tracking-tight text-white leading-none">Agendar a {paciente?.nombre}</h2>
                 <p className="text-[10px] md:text-[9px] font-bold uppercase tracking-widest mt-1 text-[#C9A24B]">Selecciona el horario disponible</p>
               </div>
            </div>
            <button onClick={onClose} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
         </div>

         {/* CONTENIDO (GRILLA) */}
         <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-slate-50 flex flex-col gap-6">

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
               <h3 className="text-sm font-black uppercase text-slate-800 mb-4 flex items-center gap-2"><ClipboardList size={16} className="text-[#C9A24B]"/> 1. Motivo o Tratamiento</h3>
               <div className="space-y-3">
                  {tratamientosPaciente.length > 0 && (
                     <select className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-[#C9A24B]" value={tratamientoSeleccionadoId || 'MANUAL'} onChange={e => setTratamientoSeleccionadoId(e.target.value)}>
                        <option value="MANUAL">-- Ingresar motivo manualmente --</option>
                        {tratamientosPaciente.map(t => <option key={t.id} value={t.id}>{t.nombre_tratamiento}</option>)}
                     </select>
                  )}
                  <input type="text" placeholder="Ej: Evaluación, Limpieza, Control..." className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#C9A24B]" value={nuevoTratamientoNombre} onChange={e => setNuevoTratamientoNombre(e.target.value)} />
               </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
               <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
                   <h3 className="text-sm font-black uppercase text-slate-800 flex items-center gap-2"><Clock size={16} className="text-[#C9A24B]"/> 2. Fecha y Hora</h3>
                   <div className="flex items-center gap-2 w-full md:w-auto">
                      <select className="w-full md:w-auto p-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none" value={filtroAgenda.profesional_id} onChange={e => setFiltroAgenda({...filtroAgenda, profesional_id: e.target.value})}>
                         {profesionales.map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
                      </select>
                      <select className="w-full md:w-auto p-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none" value={filtroAgenda.duracionDefault} onChange={e => setFiltroAgenda({...filtroAgenda, duracionDefault: Number(e.target.value)})}>
                         {duracionesDisponibles.map(d => <option key={d} value={d}>{d} min</option>)}
                      </select>
                   </div>
               </div>
               
               <div className="mb-4 flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <button onClick={() => { const n = new Date(semanaInicio); n.setDate(n.getDate()-7); setSemanaInicio(n); }} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"><ChevronLeft size={18}/></button>
                  <span className="text-xs font-black uppercase tracking-widest text-slate-700">Semana del {semanaInicio.toLocaleDateString('es-CL', {day: 'numeric', month:'short'})}</span>
                  <button onClick={() => { const n = new Date(semanaInicio); n.setDate(n.getDate()+7); setSemanaInicio(n); }} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"><ChevronRight size={18}/></button>
               </div>

               <div className="grid grid-cols-6 gap-2">
                  {getDiasLunesSabado(semanaInicio).map((dia, dIdx) => {
                     const diaStr = getLocalDateISO(dia);
                     return (
                        <div key={dIdx} className="text-center">
                           <div className="mb-3">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{dia.toLocaleDateString('es-CL', {weekday: 'short'})}</p>
                              <p className="text-base font-black text-slate-800">{dia.getDate()}</p>
                           </div>
                           <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                              {slotsHorarios.map(hora => {
                                 if(!esHorarioLaboral(diaStr, hora, filtroAgenda.duracionDefault)) return null;
                                 const ocupado = esCitaOcupada(diaStr, hora, filtroAgenda.duracionDefault);
                                 const bloqueado = esHorarioBloqueado(diaStr, hora, filtroAgenda.duracionDefault); 
                                 const seleccionado = horasSeleccionadas.some(s => s.fecha === diaStr && s.hora === hora);

                                 let btnClass = "py-2 text-[11px] font-black rounded-lg border transition-all ";
                                 if(seleccionado) btnClass += "bg-emerald-500 text-white border-emerald-600 shadow-md";
                                 else if(ocupado || bloqueado) btnClass += "bg-red-50 text-red-500 border-red-200 opacity-60"; 
                                 else btnClass += "bg-white text-slate-600 border-slate-200 hover:border-[#C9A24B] hover:text-[#C9A24B] shadow-sm";

                                 return (
                                    <button key={hora} onClick={() => handleSlotClick(diaStr, hora)} className={btnClass}>
                                       {hora}
                                    </button>
                                 );
                              })}
                           </div>
                        </div>
                     )
                  })}
               </div>
            </div>
         </div>

         {/* FOOTER */}
         <div className="p-6 md:p-8 border-t border-slate-100 bg-white shrink-0 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
               {horasSeleccionadas.length > 0 ? (
                  <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={16}/> {horasSeleccionadas.length} bloque(s) seleccionado(s)</span>
               ) : "Selecciona un horario en el calendario"}
            </p>
            <button 
               onClick={handleGuardarCita} 
               disabled={guardandoCita || horasSeleccionadas.length === 0} 
               className="w-full md:w-auto px-8 py-4 bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg"
            >
               {guardandoCita ? <Loader2 className="animate-spin" size={18}/> : <Save size={18} />} 
               Confirmar y Agendar
            </button>
         </div>
      </motion.div>
    </div>
  )
}
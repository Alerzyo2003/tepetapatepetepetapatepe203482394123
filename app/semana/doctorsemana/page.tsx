'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { filtroPalabraPaciente } from '@/lib/busquedaPacientes'
import {
  X, Search, ChevronLeft, ChevronRight, Loader2, Clock,
  CalendarDays, Timer, Plus, Ban, RefreshCcw, User, CheckCircle2, 
  Briefcase, ChevronRight as ChevronRightIcon, Stethoscope, Users, Save, CalendarClock
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import Link from 'next/link'

const ESTADOS_CITA: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  programada:     { label: 'No confirmado', bg: 'bg-amber-50',  text: 'text-amber-700', dot: 'bg-amber-400' },
  confirmado_tel: { label: 'Confirmado',    bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  en_espera:      { label: 'En espera',     bg: 'bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-400' },
  atendiendose:   { label: 'En box',        bg: 'bg-sky-50',     text: 'text-sky-700',    dot: 'bg-sky-400' },
  atendido:       { label: 'Atendido',      bg: 'bg-teal-50',    text: 'text-teal-700',   dot: 'bg-teal-400' },
  no_asiste:      { label: 'No asistió',    bg: 'bg-rose-50',    text: 'text-rose-700',   dot: 'bg-rose-400' },
  cancelada:      { label: 'Anulada',       bg: 'bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-400' },
  reprogramada:   { label: 'Reprogramada',  bg: 'bg-violet-50',  text: 'text-violet-700', dot: 'bg-violet-400' }
};

const slotsHorarios = [
  "08:00","08:15","08:30","08:45","09:00","09:15","09:30","09:45",
  "10:00","10:15","10:30","10:45","11:00","11:15","11:30","11:45",
  "12:00","12:15","12:30","12:45","13:00","13:15","13:30","13:45",
  "14:00","14:15","14:30","14:45","15:00","15:15","15:30","15:45",
  "16:00","16:15","16:30","16:45","17:00","17:15","17:30","17:45",
  "18:00","18:15","18:30","18:45","19:00","19:15","19:30","19:45",
  "20:00","20:15","20:30","20:45","21:00"
];

const getDiasLunesSabado = (d: Date) => {
  const curr = new Date(d);
  const day = curr.getDay();
  const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
  return Array.from({ length: 6 }, (_, i) => new Date(curr.getFullYear(), curr.getMonth(), diff + i));
};

const getLocalDateISO = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
const getIniciales = (n: string, a: string) => `${n?.charAt(0) || ''}${a?.charAt(0) || ''}`.toUpperCase();
const tToMins = (t: string) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const minsToT = (m: number) => {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const min = (m % 60).toString().padStart(2, '0');
  return `${h}:${min}`;
}
const getMinsFromDateStr = (dtString: string) => {
  if (!dtString) return 0;
  const timePart = dtString.includes('T') ? dtString.split('T')[1] : dtString.split(' ')[1];
  if (!timePart) return 0;
  return tToMins(timePart.substring(0,5));
}
const getLunes = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  date.setHours(0,0,0,0);
  return date;
}

export default function DoctorSemanaPage() {
  const searchParams = useSearchParams();
  const doctorId = searchParams.get('doctorId') || '';

  const [doctor, setDoctor] = useState<any>(null);
  const [citas, setCitas] = useState<any[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<any[]>([]);
  const [bloqueos, setBloqueos] = useState<any[]>([]);
  const [semanaInicio, setSemanaInicio] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.getFullYear(), now.getMonth(), diff);
  });
  const [cargando, setCargando] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Efecto para actualizar la hora cada minuto
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Se actualiza cada 60 segundos
    return () => clearInterval(timer);
  }, []);
  // Modal
  const [modalAbierto, setModalAbierto] = useState(false);
  const [paso, setPaso] = useState(1);
  const [filtro, setFiltro] = useState({ profesional_id: '', duracionDefault: 30 });
  const [horasSeleccionadas, setHorasSeleccionadas] = useState<{ fecha: string; hora: string; duracion: number }[]>([]);
  const [citasOcupadas, setCitasOcupadas] = useState<any[]>([]);
  const [bloqueosSemana, setBloqueosSemana] = useState<any[]>([]);
  const [citaEnReprogramacion, setCitaEnReprogramacion] = useState<any>(null);
  const [horariosConfigurados, setHorariosConfigurados] = useState<any[]>([]);

  const [modoNuevoPaciente, setModoNuevoPaciente] = useState(false);
  const [nuevoPaciente, setNuevoPaciente] = useState({ nombre: '', apellido: '', rut: '', telefono: '', fecha_nacimiento: '', sexo: '' });
  const [busquedaPac, setBusquedaPac] = useState('');
  const [pacientesEncontrados, setPacientesEncontrados] = useState<any[]>([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<any>(null);
  const [cargandoAccion, setCargandoAccion] = useState(false);
  const [nuevoTratamientoNombre, setNuevoTratamientoNombre] = useState('');
  const [tratamientosPaciente, setTratamientosPaciente] = useState<any[]>([]);
  const [tratamientoSeleccionadoId, setTratamientoSeleccionadoId] = useState<string | null>(null);

  const [mostrarTicket, setMostrarTicket] = useState(false);
  const [citaConfirmadaData, setCitaConfirmadaData] = useState<any>(null);
  const [usuarioLogueado, setUsuarioLogueado] = useState<string | null>(null);
  const duracionesDisponibles = [15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300];

  // ESTADOS DEL MODAL DE CONFLICTOS
  const [citasConflictivas, setCitasConflictivas] = useState<any[]>([])
  const [mostrarModalConflictos, setMostrarModalConflictos] = useState(false)
  const [citaEnEdicionConflicto, setCitaEnEdicionConflicto] = useState<string | null>(null)
  const [semanaReagenda, setSemanaReagenda] = useState<Date>(getLunes(new Date()))
  const [dispoSemana, setDispoSemana] = useState<any[]>([])
  const [cargandoSlots, setCargandoSlots] = useState(false)
  const [reagendaProps, setReagendaProps] = useState({ fecha: '', hora: '', especialistaId: '', duracion: 30, box: 1 })
  const [guardandoConflicto, setGuardandoConflicto] = useState(false)

  const slotsOcupadosSet = useMemo(() => {
    const ocupados = new Set();
    horasSeleccionadas.forEach(({ fecha, hora, duracion }) => {
      const [hh, mm] = hora.split(':').map(Number);
      const inicioMin = hh * 60 + mm;
      const finMin = inicioMin + duracion;
      for (let m = inicioMin; m < finMin; m += 15) {
        const hSlot = Math.floor(m / 60).toString().padStart(2, '0');
        const mSlot = (m % 60).toString().padStart(2, '0');
        ocupados.add(`${fecha}-${hSlot}:${mSlot}`);
      }
    });
    return ocupados;
  }, [horasSeleccionadas]);

  useEffect(() => { fetchDatos(); }, [semanaInicio, doctorId]);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { if (data.session) setUsuarioLogueado(data.session.user.id); }); }, []);
  useEffect(() => { if (modalAbierto) { fetchCitasOcupadas(); fetchHorariosDoctor(); fetchBloqueosSemana(); } }, [modalAbierto, semanaInicio]);

  // Efecto para el modal de conflictos
  useEffect(() => {
    if (mostrarModalConflictos && citaEnEdicionConflicto) { calcularDisponibilidadSemanalConflicto() }
  }, [semanaReagenda, citaEnEdicionConflicto, reagendaProps.especialistaId, reagendaProps.duracion])

  async function fetchDatos() {
    if (!doctorId) return;
    setCargando(true);
    try {
      const dias = getDiasLunesSabado(semanaInicio);
      const inicioSemana = getLocalDateISO(dias[0]);
      const finSemana = getLocalDateISO(dias[5]);

      const { data: prof } = await supabase.from('profesionales').select('*, especialidades(nombre)').eq('user_id', doctorId).single();
      setDoctor(prof);

      const [citasRes, dispoRes, bloqueosRes] = await Promise.all([
        supabase.from('citas').select('id, inicio, fin, estado, pacientes(nombre, apellido), profesional_id, motivo').eq('profesional_id', doctorId).gte('inicio', `${inicioSemana}T00:00:00`).lte('inicio', `${finSemana}T23:59:59`).neq('estado', 'cancelada'),
        supabase.from('disponibilidad_profesional').select('*').eq('profesional_id', doctorId),
        supabase.from('bloqueos_agenda').select('*').eq('profesional_id', doctorId).gte('fecha', inicioSemana).lte('fecha', finSemana)
      ]);
      setCitas(citasRes.data || []);
      setDisponibilidades(dispoRes.data || []);
      setBloqueos(bloqueosRes.data || []);
    } catch (e) { toast.error("Error al cargar agenda del doctor"); } finally { setCargando(false); }
  }

  async function fetchCitasOcupadas() {
    const dias = getDiasLunesSabado(new Date(semanaInicio));
    const inicioSemana = getLocalDateISO(dias[0]);
    const finSemana = getLocalDateISO(dias[5]);
    const { data } = await supabase.from('citas').select('id, inicio, fin').eq('profesional_id', doctorId).gte('inicio', `${inicioSemana}T00:00:00`).lte('inicio', `${finSemana}T23:59:59`).neq('estado', 'cancelada');
    setCitasOcupadas(citaEnReprogramacion ? (data || []).filter((c:any) => c.id !== citaEnReprogramacion.id) : (data || []));
  }

  async function fetchHorariosDoctor() {
    const { data } = await supabase.from('disponibilidad_profesional').select('*').eq('profesional_id', doctorId);
    setHorariosConfigurados(data || []);
  }

  async function fetchBloqueosSemana() {
    const dias = getDiasLunesSabado(new Date(semanaInicio));
    const inicioSemana = dias[0].toLocaleDateString('sv-SE');
    const finSemana = dias[5].toLocaleDateString('sv-SE');
    const { data } = await supabase.from('bloqueos_agenda').select('*').eq('profesional_id', doctorId).gte('fecha', inicioSemana).lte('fecha', finSemana);
    setBloqueosSemana(data || []);
  }

  const esHorarioLaboral = (fecha: string, hora: string, duracionMinutos: number) => {
    const diaSemana = new Date(fecha + 'T00:00:00').getDay();
    const slotStart = new Date(`${fecha}T${hora}:00`).getTime();
    const slotEnd = slotStart + duracionMinutos * 60000;
    return horariosConfigurados.some(h => {
      if (h.dia_semana !== diaSemana) return false;
      const inicioLab = new Date(`${fecha}T${h.hora_inicio.substring(0, 5)}:00`).getTime();
      const finLab = new Date(`${fecha}T${h.hora_fin.substring(0, 5)}:00`).getTime();
      return slotStart >= inicioLab && slotEnd <= finLab;
    });
  };

  const esCitaOcupada = (fecha: string, hora: string, duracionMinutos: number) => {
    const slotStart = new Date(`${fecha}T${hora}:00`).getTime();
    const slotEnd = slotStart + duracionMinutos * 60000;
    if (citasOcupadas.some(cita => {
      const citaInicio = new Date(cita.inicio.replace(' ', 'T')).getTime();
      const citaFin = new Date(cita.fin.replace(' ', 'T')).getTime();
      return slotStart < citaFin && slotEnd > citaInicio;
    })) return true;
    return bloqueosSemana.some(b => {
      if (b.fecha !== fecha) return false;
      if (!b.hora_inicio || !b.hora_fin) return true;
      const bStart = new Date(`${fecha}T${b.hora_inicio}`).getTime();
      const bEnd = new Date(`${fecha}T${b.hora_fin}`).getTime();
      return slotStart < bEnd && slotEnd > bStart;
    });
  };

  const toggleHora = (fecha: string, hora: string) => {
    setHorasSeleccionadas(prev => {
      if (citaEnReprogramacion) return [{ fecha, hora, duracion: filtro.duracionDefault }];
      const existe = prev.find(h => h.fecha === fecha && h.hora === hora);
      if (existe) return prev.filter(h => !(h.fecha === fecha && h.hora === hora));
      return [...prev, { fecha, hora, duracion: filtro.duracionDefault }];
    });
  };

  const handleSlotClick = (fecha: string, hora: string) => {
    const sel = horasSeleccionadas.some(x => x.fecha === fecha && x.hora === hora);
    if (sel) {
      toggleHora(fecha, hora); // Permitir deselección
      return;
    }

    const laboral = esHorarioLaboral(fecha, hora, filtro.duracionDefault);
    const ocupado = esCitaOcupada(fecha, hora, filtro.duracionDefault);
    const estaOcupadoPorSeleccion = slotsOcupadosSet.has(`${fecha}-${hora}`);
    const diaCompletamenteBloqueado = bloqueosSemana.some(b => b.fecha === fecha && (!b.hora_inicio || !b.hora_fin));

    if (diaCompletamenteBloqueado) return toast.error("Este día está completamente bloqueado.");
if (!laboral) return toast.error(`Con la duración de ${filtro.duracionDefault} mins, el bloque excede el horario de salida del especialista.`);
if (ocupado) return toast.error(`Con la duración de ${filtro.duracionDefault} mins, el bloque topa con otra cita o bloqueo existente.`);
if (estaOcupadoPorSeleccion) return toast.warning("El horario choca con otra selección actual.");
    
    toggleHora(fecha, hora);
  };

  const handleRevisarPendientes = async (profId: string, fecha: string) => {
    const loadingToast = toast.loading("Buscando pacientes afectados...");
    try {
      const inicioDia = `${fecha}T00:00:00`;
      const finDia = `${fecha}T23:59:59`;

      const { data: citasAfectadas, error } = await supabase
        .from('citas')
        .select(`id, inicio, fin, pacientes (nombre, apellido, telefono, rut)`)
        .eq('profesional_id', profId)
        .gte('inicio', inicioDia)
        .lte('inicio', finDia)
        .neq('estado', 'cancelada')
        .order('inicio', { ascending: true });

      if (error) throw error;

      setReagendaProps(prev => ({ ...prev, fecha, especialistaId: profId }));
      setCitasConflictivas(citasAfectadas || []);
      setSemanaReagenda(getLunes(new Date(`${fecha}T12:00:00`)));
      setMostrarModalConflictos(true);
      toast.dismiss(loadingToast);
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error("Error al buscar pacientes afectados");
    }
  }

  async function calcularDisponibilidadSemanalConflicto() {
    setCargandoSlots(true);
    try {
      const dias = Array.from({length: 7}).map((_, i) => { const d = new Date(semanaReagenda); d.setDate(d.getDate() + i); return d; });
      const inicioSemanaStr = getLocalDateISO(dias[0]);
      const finSemanaStr = getLocalDateISO(dias[6]);

      const { data: b } = await supabase.from('bloqueos_agenda').select('fecha').eq('profesional_id', reagendaProps.especialistaId).gte('fecha', inicioSemanaStr).lte('fecha', finSemanaStr);
      const { data: d } = await supabase.from('disponibilidad_profesional').select('*').eq('profesional_id', reagendaProps.especialistaId);
      const { data: c } = await supabase.from('citas').select('inicio, fin').eq('profesional_id', reagendaProps.especialistaId).gte('inicio', `${inicioSemanaStr}T00:00:00`).lte('inicio', `${finSemanaStr}T23:59:59`).neq('estado', 'cancelada');

      const semanaProcesada = dias.map(dateObj => {
        const dateStr = getLocalDateISO(dateObj);
        const diaSemanaNum = dateObj.getDay();
        if (b?.some(bl => bl.fecha === dateStr)) return { date: dateStr, dateObj, status: 'bloqueado', slots: [] };
        const dispoDia = d?.filter(di => (di.dia_semana === diaSemanaNum && !di.fecha_especifica) || di.fecha_especifica === dateStr) || [];
        if (dispoDia.length === 0) return { date: dateStr, dateObj, status: 'sin_horario', slots: [] };
        const citasDia = c?.filter(ci => ci.inicio.startsWith(dateStr)).map(ci => ({ inicio: getMinsFromDateStr(ci.inicio), fin: getMinsFromDateStr(ci.fin) })) || [];
        let slotsLibres: string[] = [];
        dispoDia.forEach(bloque => {
          let currTime = tToMins(bloque.hora_inicio);
          const endTime = tToMins(bloque.hora_fin);
          while (currTime + reagendaProps.duracion <= endTime) {
            const slotEnd = currTime + reagendaProps.duracion;
            const choca = citasDia.some(cita => currTime < cita.fin && slotEnd > cita.inicio);
            if (!choca) slotsLibres.push(minsToT(currTime));
            currTime += 15;
          }
        });
        slotsLibres = [...new Set(slotsLibres)].sort();
        return { date: dateStr, dateObj, status: slotsLibres.length > 0 ? 'limpio' : 'lleno', slots: slotsLibres };
      });
      setDispoSemana(semanaProcesada);
    } catch (error) { toast.error("Error al calcular la agenda semanal"); } finally { setCargandoSlots(false); }
  }

  const anularCitaConflicto = async (citaId: string) => {
    if(!confirm("¿Estás seguro de anular la cita de este paciente?")) return;
    try {      
      await supabase.from('citas').update({ estado: 'cancelada', modificado_por: usuarioLogueado }).eq('id', citaId);
      
      const citaAnulada = citasConflictivas.find(c => c.id === citaId);
      if (citaAnulada) {
          const nombrePaciente = `${citaAnulada.pacientes?.nombre || ''} ${citaAnulada.pacientes?.apellido || ''}`.trim();
          await supabase.from('auditoria_clinica').insert([{
              usuario_id: usuarioLogueado,
              accion: 'UPDATE / ANULACIÓN CITA',
              tabla: 'citas',
              detalles: `Anuló la cita de ${nombrePaciente} del día ${citaAnulada.inicio.split('T')[0]} (desde Agenda Doctor).`
          }]);
      }
      toast.success("Cita anulada correctamente");
      setCitasConflictivas(prev => prev.filter(c => c.id !== citaId));
    } catch(e) { toast.error("No se pudo anular la cita"); }
  }

  const reagendarCitaConflicto = async (citaId: string) => {
    if(!reagendaProps.fecha || !reagendaProps.hora || !reagendaProps.especialistaId) return toast.error("Selecciona un día y hora del calendario");
    setGuardandoConflicto(true);
    try {
      const inicioDate = new Date(`${reagendaProps.fecha}T${reagendaProps.hora}:00`);
      const finDate = new Date(inicioDate.getTime() + reagendaProps.duracion * 60000);
      const finHoraStr = `${finDate.getHours().toString().padStart(2, '0')}:${finDate.getMinutes().toString().padStart(2, '0')}:00`;

      await supabase.from('citas').update({
        inicio: `${reagendaProps.fecha}T${reagendaProps.hora}:00`,
        fin: `${reagendaProps.fecha}T${finHoraStr}`,
        box_id: reagendaProps.box,
        profesional_id: reagendaProps.especialistaId,
        estado: 'reprogramada'
      }).eq('id', citaId);

      const citaConflicto = citasConflictivas.find(c => c.id === citaId);
      if (citaConflicto) {
          const nombrePaciente = `${citaConflicto.pacientes?.nombre || ''} ${citaConflicto.pacientes?.apellido || ''}`.trim();
          await supabase.from('auditoria_clinica').insert([{
              usuario_id: usuarioLogueado,
              accion: 'UPDATE / REPROGRAMACIÓN CONFLICTO',
              tabla: 'citas',
              detalles: `Reprogramó cita en conflicto de ${nombrePaciente} para el ${reagendaProps.fecha} a las ${reagendaProps.hora} (desde Agenda Doctor).`
          }]);
      }

      toast.success("Cita reagendada con éxito");
      setCitaEnEdicionConflicto(null);
      setCitasConflictivas(prev => prev.filter(c => c.id !== citaId));
    } catch(e) {
      toast.error("Error al reagendar");
    } finally {
      setGuardandoConflicto(false);
    }
  }

  const iniciarReprogramacion = (cita: any) => {
    resetEstados(); 
    setCitaEnReprogramacion(cita);
    setFiltro({ ...filtro, profesional_id: cita.profesional_id || '' });
    const tInicio = new Date(cita.inicio.replace(' ', 'T')).getTime();
    const tFin = new Date(cita.fin.replace(' ', 'T')).getTime();
    const duracionMinutos = Math.round((tFin - tInicio) / 60000);
    const duracionFinal = duracionesDisponibles.includes(duracionMinutos) ? duracionMinutos : 30;
    
    setFiltro(prev => ({ ...prev, duracionDefault: duracionFinal }));
    seleccionarPacienteExistente(cita.pacientes); 
    setNuevoTratamientoNombre(cita.motivo || '');
    setSemanaInicio(new Date(cita.inicio.replace(' ', 'T')));
    setModalAbierto(true); 
    setPaso(1);
  };

  const buscarPacientes = async (term: string) => {
    if (!term.trim()) { setPacientesEncontrados([]); return; }
    const palabras = term.trim().split(/\s+/);
    let query = supabase.from('pacientes').select('*');
    // Sin importar tildes, diéresis ni ñ; búsqueda aproximada y RUT con o sin puntos
    palabras.forEach(palabra => {
      const filtro = filtroPalabraPaciente(palabra, { subsecuencia: true });
      if (filtro) query = query.or(filtro);
    });
    const { data } = await query.limit(5); setPacientesEncontrados(data || []);
  };

  const seleccionarPacienteExistente = async (paciente: any) => {
    if (!paciente) return;
    if (!paciente.activo) {
        toast.error(`Paciente Inhabilitado: ${paciente.motivo_deshabilitado || 'No se pueden agendar citas.'}`);
        return;
    }
    setPacienteSeleccionado(paciente); setBusquedaPac(`${paciente.nombre} ${paciente.apellido}`); setPacientesEncontrados([]);
    const { data } = await supabase.from('presupuestos').select('id, nombre_tratamiento').eq('paciente_id', paciente.id).neq('estado', 'finalizado').order('fecha_creacion', { ascending: false });
    setTratamientosPaciente(data || []); setTratamientoSeleccionadoId('MANUAL'); setNuevoTratamientoNombre(citaEnReprogramacion ? citaEnReprogramacion.motivo : '');
  };

  const handleGuardar = async () => {
    if (cargandoAccion) return;
    if (modoNuevoPaciente && !citaEnReprogramacion && (!nuevoPaciente.nombre.trim() || !nuevoPaciente.apellido.trim())) {
      return toast.error("Faltan datos del nuevo paciente", { description: "Nombre y Apellido son obligatorios." });
    }
    if (!modoNuevoPaciente && !pacienteSeleccionado && !citaEnReprogramacion) return toast.error("Selecciona un paciente");
    setCargandoAccion(true);
    try {
      let pId = pacienteSeleccionado?.id;
      let pNombreFull = pacienteSeleccionado ? `${pacienteSeleccionado.nombre} ${pacienteSeleccionado.apellido}` : "";
      if (modoNuevoPaciente && !citaEnReprogramacion) {
        // Sin RUT: valor único para no chocar con otro paciente sin RUT
        const rutLimpio = nuevoPaciente.rut.replace(/[^0-9kK]/g, '').toUpperCase().trim() || `SIN-RUT-${Date.now()}`;
        const { data: pNew, error: pErr } = await supabase.from('pacientes').insert([{
          nombre: nuevoPaciente.nombre.toUpperCase().trim(),
          apellido: nuevoPaciente.apellido.toUpperCase().trim(),
          rut: rutLimpio,
          telefono: nuevoPaciente.telefono || null,
          // Este formulario no pide fecha ni sexo: se envían vacíos como null (un texto vacío hacía fallar el registro)
          fecha_nacimiento: nuevoPaciente.fecha_nacimiento || null,
          sexo: nuevoPaciente.sexo || null,
          activo: true,
        }]).select().single();
        if (pErr || !pNew) {
          // Antes el error se ignoraba y la cita se creaba SIN paciente (S/N, enlace /pacientes/null)
          if ((pErr as any)?.code === '23505') toast.error("Ya existe un paciente con ese RUT", { description: "Búscalo con el buscador en vez de crearlo de nuevo." });
          else toast.error("No se pudo crear el paciente", { description: pErr?.message });
          setCargandoAccion(false);
          return;
        }
        pId = pNew.id; pNombreFull = `${nuevoPaciente.nombre} ${nuevoPaciente.apellido}`;
      }
      if (!citaEnReprogramacion && !pId) {
        toast.error("Falta el paciente", { description: "No se creó la cita. Vuelve a seleccionar o crear el paciente." });
        setCargandoAccion(false);
        return;
      }
      const parsearAFechaLocal = (fechaStr: string, horaStr: string, duracionMin: number) => {
        const finDate = new Date(new Date(`${fechaStr}T${horaStr}:00`).getTime() + duracionMin * 60000);
        const finH = finDate.getHours().toString().padStart(2, '0');
        const finM = finDate.getMinutes().toString().padStart(2, '0');
        return { inicio: `${fechaStr}T${horaStr}:00`, fin: `${fechaStr}T${finH}:${finM}:00` };
      };
      if (citaEnReprogramacion) {
        const s = horasSeleccionadas[0]; const { inicio, fin } = parsearAFechaLocal(s.fecha, s.hora, s.duracion);
        await supabase.from('citas').update({ 
          inicio, fin, 
          profesional_id: filtro.profesional_id, 
          estado: 'reprogramada', 
          motivo: nuevoTratamientoNombre.toUpperCase() || citaEnReprogramacion.motivo, 
          modificado_por: usuarioLogueado 
        }).eq('id', citaEnReprogramacion.id);

        await supabase.from('auditoria_clinica').insert([{
            usuario_id: usuarioLogueado,
            accion: 'UPDATE / REPROGRAMACIÓN',
            tabla: 'citas',
            detalles: `Reprogramó la cita de ${pNombreFull} para el ${s.fecha} a las ${s.hora} (desde Agenda Doctor).`
        }]);

      } else {
        const nuevasCitas = horasSeleccionadas.map(s => {
          const { inicio, fin } = parsearAFechaLocal(s.fecha, s.hora, s.duracion);
          return { paciente_id: pId, profesional_id: filtro.profesional_id, presupuesto_id: (tratamientoSeleccionadoId && tratamientoSeleccionadoId !== 'MANUAL') ? tratamientoSeleccionadoId : null, inicio, fin, estado: 'programada', motivo: nuevoTratamientoNombre.toUpperCase() || 'CONSULTA', creado_por: usuarioLogueado };
        });
        const { error: errCitas } = await supabase.from('citas').insert(nuevasCitas);
        if (errCitas) throw errCitas;
        
        const detallesCitas = nuevasCitas.map(c => `Cita para ${pNombreFull} el ${c.inicio.split('T')[0]} a las ${c.inicio.split('T')[1].substring(0,5)}`).join('; ');
        await supabase.from('auditoria_clinica').insert([{
            usuario_id: usuarioLogueado,
            accion: 'INSERT / CITA',
            tabla: 'citas',
            detalles: `Agendó: ${detallesCitas} (desde Agenda Doctor).`
        }]);
      }
      setCitaConfirmadaData({ paciente: pNombreFull.toUpperCase(), citas: horasSeleccionadas });
      setMostrarTicket(true); 
      await fetchDatos();
    } catch (e) { 
      toast.error("Error al guardar"); 
      setCargandoAccion(false);
    }
  };

  const resetEstados = () => {
    setPaso(1); setHorasSeleccionadas([]); setPacienteSeleccionado(null); setBusquedaPac('');
    setCitasOcupadas([]); setCitaEnReprogramacion(null); setSemanaInicio(new Date(semanaInicio));
    setNuevoTratamientoNombre(''); setBloqueosSemana([]);
    setModoNuevoPaciente(false); setTratamientosPaciente([]); setTratamientoSeleccionadoId(null);
    setNuevoPaciente({ nombre: '', apellido: '', rut: '', telefono: '', fecha_nacimiento: '', sexo: '' }); setCargandoAccion(false);
  };

  const navegarSemana = (sentido: 'atras' | 'adelante') => {
    const nueva = new Date(semanaInicio);
    nueva.setDate(nueva.getDate() + (sentido === 'adelante' ? 7 : -7));
    setSemanaInicio(nueva);
  };

  if (!doctorId) return <div className="p-10 text-center">No se especificó doctor</div>;
  if (cargando) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

  const dias = getDiasLunesSabado(semanaInicio);

  return (
    <main className="min-h-screen bg-[#F8FAFC] font-sans p-2 md:p-4 pb-24">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* HEADER */}
        <header className="bg-white p-8 md:p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col xl:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-6">
            <div className="p-5 bg-blue-600 rounded-[2rem] text-white shadow-xl shadow-blue-200 shrink-0">
              <Stethoscope size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800 uppercase italic leading-none">Dr. {doctor?.apellido}</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">{doctor?.especialidades?.nombre || 'Medicina General'}</p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">
            <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-2 flex items-center gap-4 shadow-inner">
              <button onClick={() => navegarSemana('atras')} className="p-3 hover:bg-white hover:shadow-sm rounded-2xl transition-all text-slate-500"><ChevronLeft size={20} /></button>
              <h2 className="text-sm font-black uppercase text-slate-800 tracking-widest min-w-[240px] text-center">
                {dias[0].toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} - {dias[5].toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
              </h2>
              <button onClick={() => navegarSemana('adelante')} className="p-3 hover:bg-white hover:shadow-sm rounded-2xl transition-all text-slate-500"><ChevronRight size={20} /></button>
            </div>
            <Link href="/semana" className="bg-slate-900 text-white px-8 py-4 rounded-[2rem] text-xs font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all flex items-center gap-2 shrink-0">
              <CalendarDays size={18} /> Volver a Diario Global
            </Link>
          </div>
        </header>

        {/* GRILLA SEMANAL */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex overflow-x-auto custom-scrollbar">
            {dias.map(dia => {
              const fStr = getLocalDateISO(dia);
              const citasDelDia = citas.filter(c => c.inicio.startsWith(fStr));
              const getHoraLimpias = (fechaString: string) => fechaString.includes('T') ? fechaString.split('T')[1].substring(0,5) : fechaString.split(' ')[1].substring(0,5);
              const esBloqueoDiaCompleto = bloqueos.some(b => b.fecha === fStr && (!b.hora_inicio || !b.hora_fin));

              // 🔥 Cálculos para la línea de tiempo en esta columna
              const esHoy = fStr === getLocalDateISO(currentTime);
              const minutosDesdeLas8 = (currentTime.getHours() * 60 + currentTime.getMinutes()) - (8 * 60);
              const topLineaTiempo = (minutosDesdeLas8 / 15) * 3;
              
              // Al quitar 'esHoy' de aquí, permitimos que la línea se dibuje en todos los días
              const mostrarLineaTiempo = minutosDesdeLas8 >= 0 && minutosDesdeLas8 <= ((21 - 8) * 60);

              return (
                <div key={fStr} className="flex-shrink-0 border-r border-slate-100" style={{ width: '280px' }}>
                  <div className="p-6 text-sm font-black text-slate-700 uppercase border-b border-slate-100 sticky top-0 bg-white z-10 h-[105px] flex items-center justify-between text-center">
                    <div>
                      <p>{dia.toLocaleDateString('es-CL', { weekday: 'long' })}</p>
                      <p className="text-3xl font-black text-blue-600">{dia.getDate()}</p>
                      <p className="text-[9px] text-slate-400 tracking-widest">{dia.toLocaleDateString('es-CL', { month: 'long' })}</p>
                    </div>
                    {esBloqueoDiaCompleto && (
                        <button onClick={() => handleRevisarPendientes(doctorId, fStr)} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-all self-start" title="Gestionar citas afectadas">
                          <Users size={16} />
                        </button>
                    )}
                  </div>
                  <div className="relative">
                    
                    {/* 🔥 Renderizado de la línea de tiempo */}
                    {mostrarLineaTiempo && (
                      <div 
                        className="absolute left-0 w-full z-20 flex items-center pointer-events-none"
                        style={{ 
                          top: `${topLineaTiempo}rem`, 
                          transform: 'translateY(-50%)' 
                        }}
                      >
                        <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] z-10 -ml-1"></div>
                        <div className="flex-1 border-b-2 border-red-500 border-dashed opacity-60"></div>
                      </div>
                    )}

                    {slotsHorarios.map(hora => {
                      const slotInicioMins = parseInt(hora.split(':')[0]) * 60 + parseInt(hora.split(':')[1]);
                      const esBloqueado = bloqueos.some(b => b.fecha === fStr && (!b.hora_inicio || !b.hora_fin || (tToMins(b.hora_inicio) <= slotInicioMins && slotInicioMins < tToMins(b.hora_fin))));
                      const esDisponible = disponibilidades.some(d => {
                        const diaSem = new Date(fStr + 'T00:00:00').getDay();
                        const esDia = (d.fecha_especifica && d.fecha_especifica === fStr) || (!d.fecha_especifica && d.dia_semana === diaSem);
                        if (esDia) {
                          const dIni = tToMins(d.hora_inicio);
                          const dFin = tToMins(d.hora_fin);
                          return slotInicioMins >= dIni && slotInicioMins < dFin;
                        }
                        return false;
                      });

                      return (
                        <div key={hora} className="flex items-stretch h-12 border-b border-slate-100 group">
                          <div className="w-20 text-center p-2 text-[10px] font-black border-r border-slate-100 flex items-center justify-center bg-slate-50/50 text-slate-400 group-hover:bg-slate-100">
                            {hora}
                          </div>
                          <div className="flex-1 relative p-1">
                            {esBloqueado ? (
                              <div className="h-full w-full rounded-xl bg-rose-50/50 border border-rose-200 border-dashed flex items-center justify-center" title="Horario Bloqueado"><Ban size={16} className="text-rose-300" /></div>
                            ) : esDisponible ? (
                              <div onClick={() => { resetEstados(); setFiltro({ ...filtro, profesional_id: doctorId }); setHorasSeleccionadas([{ fecha: fStr, hora, duracion: 30 }]); setModalAbierto(true); }} className="h-full w-full rounded-xl bg-emerald-100 border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-200 cursor-pointer transition-all flex items-center justify-center" title="Agendar nueva cita"><Plus size={16} className="text-emerald-500" /></div>
                            ) : <div className="h-full w-full rounded-xl bg-slate-50/40" />}
                          </div>
                        </div>
                      );
                    })}
                    {citasDelDia.map(cita => {
                      const ini = getHoraLimpias(cita.inicio);
                      const fin = getHoraLimpias(cita.fin);
                      const iniMins = tToMins(ini);
                      const finMins = tToMins(fin);
                      const duracionMins = finMins - iniMins;
                      const top = (iniMins - (8 * 60)) / 15 * 3;
                      const height = duracionMins / 15 * 3;
                      const estadoStyle = ESTADOS_CITA[cita.estado] || ESTADOS_CITA.programada;
                      const iniciales = getIniciales(cita.pacientes?.nombre, cita.pacientes?.apellido);

                      return (
                        <motion.div
                          key={cita.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          onClick={() => iniciarReprogramacion(cita)}
                          className={`absolute z-10 w-[calc(100%-8px)] left-1 ${estadoStyle.bg} border ${estadoStyle.bg.replace('bg-', 'border-')} rounded-2xl p-3 cursor-pointer hover:shadow-lg transition-all duration-200 flex flex-col justify-center overflow-hidden`}
                          style={{ top: `${top}rem`, height: `${height}rem` }}
                          title={`${cita.pacientes?.nombre} ${cita.pacientes?.apellido} (${ini} - ${fin})`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-xs font-black text-slate-700 shadow-sm border border-slate-100/50 shrink-0">{iniciales}</div>
                              <span className="text-xs font-black text-slate-800 truncate uppercase">{cita.pacientes?.nombre?.split(' ')[0]} {cita.pacientes?.apellido?.split(' ')[0]}</span>
                            </div>
                            <span className="text-[10px] font-black tracking-widest text-slate-500 opacity-80">{ini}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`w-2 h-2 rounded-full ${estadoStyle.dot}`}></span>
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${estadoStyle.text}`}>{estadoStyle.label}</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MODAL DE CONFLICTOS DE AGENDA Y REAGENDAMIENTO SEMANAL */}
      <AnimatePresence>
        {mostrarModalConflictos && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-left">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#FDFDFD] w-full max-w-5xl max-h-[90vh] flex flex-col rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className={`bg-blue-500 p-8 flex items-center justify-between shrink-0 shadow-sm relative z-10 transition-colors`}>
                <div className="flex items-center gap-4 text-white">
                  <Users size={36} />
                  <div>
                    <h2 className="text-2xl font-black uppercase italic leading-none tracking-tighter">Pacientes Pendientes</h2>
                    <p className={`text-blue-200 text-[10px] font-black uppercase tracking-[0.3em] mt-1.5`}>
                      {citasConflictivas.length} citas detectadas el {reagendaProps.fecha}
                    </p>
                  </div>
                </div>
                <button onClick={() => setMostrarModalConflictos(false)} className={`p-3 text-white rounded-full transition-all bg-blue-600 hover:bg-blue-700`}>
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto bg-slate-50 flex-1 space-y-4">
                {citasConflictivas.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center opacity-70">
                    <CheckCircle2 size={48} className="text-emerald-500 mb-4" />
                    <p className="text-sm font-black text-slate-800 uppercase">Agenda Limpia</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">No hay pacientes afectados por este bloqueo.</p>
                  </div>
                ) : (
                  <>
                    {citasConflictivas.map((cita) => {
                      let horaFomateada = "Sin hora";
                      try { horaFomateada = new Date(cita.inicio).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }); } catch (e) {}
                      const isEditing = citaEnEdicionConflicto === cita.id;
                      let durationStr = "45 min";
                      try { const dMins = Math.round((new Date(cita.fin).getTime() - new Date(cita.inicio).getTime()) / 60000); if (dMins > 0) durationStr = `${dMins} min`; } catch (e) {}

                      return (
                        <div key={cita.id} className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col group transition-all">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-5">
                              <div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-600 flex flex-col items-center justify-center border border-slate-100 shrink-0">
                                <Clock size={14} className="mb-1 opacity-50" />
                                <span className="text-[10px] font-black">{horaFomateada}</span>
                              </div>
                              <div>
                                <h4 className="font-black text-sm text-slate-800 uppercase leading-none">{cita.pacientes?.nombre} {cita.pacientes?.apellido}</h4>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-[9px] font-bold text-slate-400 tracking-widest bg-slate-50 px-2 py-1 rounded-md border border-slate-100 flex items-center gap-1"><Clock size={10}/> {durationStr}</span>
                                  <span className="text-[9px] font-bold text-slate-400 tracking-widest bg-slate-50 px-2 py-1 rounded-md border border-slate-100">RUT: {cita.pacientes?.rut || 'S/R'}</span>
                                </div>
                              </div>
                            </div>

                            {!isEditing && (
                              <div className="flex gap-2 self-start md:self-auto">
                                <button onClick={() => {
                                  const dInicio = new Date(cita.inicio); const dFin = new Date(cita.fin);
                                  const calcMins = Math.round((dFin.getTime() - dInicio.getTime()) / 60000);
                                  setReagendaProps(prev => ({...prev, duracion: calcMins > 0 ? calcMins : 45, especialistaId: doctorId, fecha: '', hora: ''}));
                                  setCitaEnEdicionConflicto(cita.id);
                                }} className="px-4 py-2 bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-white rounded-xl transition-all flex items-center gap-2" title="Reagendar">
                                  <CalendarClock size={14} /> Reagendar
                                </button>
                                <button onClick={() => anularCitaConflicto(cita.id)} className="p-3 bg-red-50 text-red-500 hover:bg-red-600 hover:text-white rounded-xl transition-all" title="Cancelar Cita">
                                  <Ban size={16} />
                                </button>
                              </div>
                            )}
                          </div>

                          <AnimatePresence>
                            {isEditing && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col gap-6">
                                  <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                                    <div className="flex gap-4 w-full md:w-auto flex-1">
                                      <div className="space-y-2 flex-1">
                                        <label className="text-[9px] font-black text-blue-400 uppercase ml-2 flex items-center gap-1"><User size={12}/> Especialista</label>
                                        <select className="w-full p-4 bg-white border border-blue-200 rounded-xl font-bold text-xs outline-none text-slate-700" value={reagendaProps.especialistaId} onChange={(e) => setReagendaProps(prev => ({...prev, especialistaId: e.target.value}))}>
                                          <option value={doctorId}>Dr. {doctor.nombre} {doctor.apellido}</option>
                                        </select>
                                      </div>
                                    </div>
                                    <div className="bg-emerald-50 px-4 py-3 rounded-xl border border-emerald-100 self-end md:self-auto">
                                      <span className="text-[10px] font-black text-emerald-600 uppercase">Buscando huecos de {reagendaProps.duracion} min</span>
                                    </div>
                                  </div>

                                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col">
                                    <div className="flex items-center justify-between mb-4 bg-white p-2 rounded-xl shadow-sm border border-slate-100">
                                      <button onClick={() => setSemanaReagenda(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; })} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all"><ChevronLeft size={18}/></button>
                                      <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Semana del {semanaReagenda.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</span>
                                      <button onClick={() => setSemanaReagenda(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; })} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all"><ChevronRight size={18}/></button>
                                    </div>

                                    <div className="flex gap-2 overflow-x-auto pb-4 custom-scrollbar">
                                      {cargandoSlots ? (
                                        <div className="w-full py-10 flex flex-col items-center justify-center text-slate-400 gap-2"><Loader2 className="animate-spin" size={24} /><span className="text-[10px] font-black uppercase">Calculando...</span></div>
                                      ) : (
                                        dispoSemana.map((dia, idx) => {
                                          const nombreDia = dia.dateObj.toLocaleDateString('es-CL', { weekday: 'short' });
                                          const numDia = dia.dateObj.getDate();
                                          return (
                                            <div key={idx} className={`min-w-[110px] flex-1 bg-white border border-slate-200 rounded-2xl p-3 flex flex-col items-center`}>
                                              <div className="text-center mb-3"><span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">{nombreDia}</span><span className={`block text-lg font-black text-slate-800`}>{numDia}</span></div>
                                              <div className="w-full flex-1 flex flex-col gap-2 overflow-y-auto max-h-48 pr-1 custom-scrollbar">
                                                {dia.status === 'bloqueado' && <span className="text-[9px] font-bold text-red-400 text-center py-4 italic">Bloqueado</span>}
                                                {dia.status === 'sin_horario' && <span className="text-[9px] font-bold text-slate-300 text-center py-4 italic">Sin Horario</span>}
                                                {dia.status === 'lleno' && <span className="text-[9px] font-bold text-amber-400 text-center py-4 italic">Lleno</span>}
                                                {dia.status === 'limpio' && dia.slots.map((slot: string, sIdx: number) => {
                                                  const isSelected = reagendaProps.fecha === dia.date && reagendaProps.hora === slot;
                                                  return (
                                                    <button key={sIdx} onClick={() => setReagendaProps(prev => ({...prev, fecha: dia.date, hora: slot}))} className={`w-full py-2 rounded-lg text-[10px] font-black transition-all border ${isSelected ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : 'bg-slate-50 text-emerald-600 border-emerald-100 hover:bg-emerald-50'}`}>{slot}</button>
                                                  )
                                                })}
                                              </div>
                                            </div>
                                          )
                                        })
                                      )}
                                    </div>
                                    
                                    <div className="mt-2 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-200 pt-4">
                                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        Seleccionado: <span className={reagendaProps.hora ? "text-emerald-600" : "text-red-400"}>
                                          {reagendaProps.hora ? `${reagendaProps.fecha} a las ${reagendaProps.hora}` : "Ninguno"}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-3 w-full md:w-auto">
                                        <button onClick={() => setCitaEnEdicionConflicto(null)} className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase hover:text-slate-700 transition-all">Cancelar</button>
                                        <button onClick={() => reagendarCitaConflicto(cita.id)} disabled={guardandoConflicto || !reagendaProps.hora} className={`flex-1 md:flex-none px-8 py-3 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-md flex items-center justify-center gap-2 transition-all ${reagendaProps.hora ? 'bg-emerald-500 hover:bg-emerald-600 active:scale-95' : 'bg-slate-300 cursor-not-allowed'}`}>
                                          {guardandoConflicto ? <Loader2 className="animate-spin" size={14}/> : <Save size={14}/>} Confirmar
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>

              <div className="p-6 bg-white border-t border-slate-100 shrink-0">
                <button onClick={() => setMostrarModalConflictos(false)} className="w-full py-5 bg-blue-600 text-white font-black text-xs uppercase tracking-[0.2em] rounded-[2rem] shadow-xl hover:bg-blue-700 transition-all">
                  Finalizar Revisión y Cerrar Panel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

 {/* MODAL DE AGENDAMIENTO / REAGENDAMIENTO */}
      <AnimatePresence>
        {modalAbierto && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-7xl h-[85vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden text-left"
            >
              {/* Encabezado del modal */}
              <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white">
                <div className="flex items-center gap-5">
                  <div className={`p-4 rounded-2xl shadow-sm ${citaEnReprogramacion ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                    <CalendarDays size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-800 leading-none">
                      {citaEnReprogramacion ? 'Reagendar Cita' : 'Nueva Reserva'}
                    </h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Paso {paso} de 2</p>
                  </div>
                </div>
                <button
                  onClick={() => { setModalAbierto(false); setCitaEnReprogramacion(null); }}
                  className="p-3 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Contenido dinámico */}
              <div className="flex flex-1 overflow-hidden">
                {paso === 1 ? (
                  <>
                    <aside className="w-[320px] border-r border-slate-100 p-8 bg-slate-50/50 space-y-8 overflow-y-auto hidden md:block">
                      <div className="p-6 rounded-[2rem] bg-white border border-slate-100 shadow-sm text-center">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Seleccionado</p>
                        <p className="text-5xl font-black tracking-tighter text-blue-600">{horasSeleccionadas.length}</p>
                      </div>
                      <div className="space-y-6 text-left">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Especialista</label>
                          <select
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 cursor-pointer shadow-sm transition-all"
                            value={doctorId}
                            onChange={(e) => { setFiltro({ ...filtro, profesional_id: e.target.value }); setHorasSeleccionadas([]); }}
                          >
                            <option value={doctorId}>Dr. {doctor.nombre} {doctor.apellido}</option>
                          </select>
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Duración base</label>
                          <div className="grid grid-cols-3 gap-3">
                            {duracionesDisponibles.slice(0,6).map(m => (
                              <button
                                key={m}
                                onClick={() => {
                                  setFiltro({ ...filtro, duracionDefault: m });
                                  setHorasSeleccionadas(prev =>
                                    prev.filter(s => esHorarioLaboral(s.fecha, s.hora, m) && !esCitaOcupada(s.fecha, s.hora, m))
                                      .map(v => ({ ...v, duracion: m }))
                                  );
                                }}
                                className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all border ${filtro.duracionDefault === m ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 shadow-sm hover:scale-105'}`}
                              >
                                {m}m
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </aside>

                    <main className="flex-1 p-8 bg-white overflow-hidden flex flex-col">
                      <div className="flex justify-between items-center mb-6 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <button onClick={() => navegarSemana('atras')} className="flex items-center gap-2 px-4 py-2 hover:bg-white rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors shadow-sm border border-transparent hover:border-slate-200">
                          <ChevronLeft size={16} /> Anterior
                        </button>
                        <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-800">Calendario Semanal</span>
                        <button onClick={() => navegarSemana('adelante')} className="flex items-center gap-2 px-4 py-2 hover:bg-white rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-700 transition-colors shadow-sm border border-transparent hover:border-slate-200">
                          Siguiente <ChevronRight size={16} />
                        </button>
                      </div>
                      <div className="flex-1 grid grid-cols-6 gap-4 overflow-y-auto pr-2 custom-scrollbar">
                        {getDiasLunesSabado(semanaInicio).map(dia => {
                          const fStr = getLocalDateISO(dia);
                          const diaCompletamenteBloqueado = bloqueosSemana.filter(b => b.fecha === fStr).some(b => !b.hora_inicio || !b.hora_fin);
                          return (
                            <div key={fStr} className="space-y-3 text-center relative">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white py-3 rounded-2xl border border-slate-200 shadow-sm">
                                {dia.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' })}
                              </p>
                              {diaCompletamenteBloqueado && (
                                <div className="absolute top-12 inset-x-0 z-10 flex flex-col items-center justify-start pt-10 h-full bg-white/80 backdrop-blur-sm rounded-2xl">
                                  <Ban className="text-red-500 mb-2" size={24} />
                                </div>
                              )}
                              <div className="space-y-2">
                                {slotsHorarios.map(h => {
                                  const laboral = esHorarioLaboral(fStr, h, filtro.duracionDefault);
                                  const ocupado = esCitaOcupada(fStr, h, filtro.duracionDefault);
                                  const sel = horasSeleccionadas.some(x => x.fecha === fStr && x.hora === h);
                                  const estaOcupadoPorSeleccion = slotsOcupadosSet.has(`${fStr}-${h}`);
                                  const deshabilitado = diaCompletamenteBloqueado || !laboral || ocupado || (estaOcupadoPorSeleccion && !sel);

                                  let btnClass = "w-full py-3 text-[10px] font-black rounded-xl border transition-all ";
                                  if (sel) btnClass += "bg-blue-600 text-white border-blue-600 shadow-md scale-105";
                                  else if (estaOcupadoPorSeleccion) btnClass += "bg-blue-50 text-blue-300 border-blue-100 cursor-not-allowed";
                                  else if (deshabilitado) btnClass += "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed";
                                  else if (laboral) btnClass += "bg-white border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 shadow-sm";
                                  else btnClass += "bg-transparent text-slate-200 border-transparent cursor-not-allowed";

                                  return <button key={h} onClick={() => handleSlotClick(fStr, h)} className={btnClass}>{h}</button>;
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </main>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white">
                    <div className="w-full md:w-1/2 border-r border-slate-100 p-8 md:p-12 bg-slate-50 overflow-y-auto space-y-6 custom-scrollbar text-left">
                      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 flex items-center gap-3"><Timer size={18} /> Ajuste de Tiempos</h3>
                      {horasSeleccionadas.map((s, idx) => (
                        <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                          <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{s.fecha}</p>
                            <p className="text-2xl font-black text-slate-800 tracking-tighter mt-1">{s.hora} hrs</p>
                          </div>
                          <select
                            className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer text-slate-700"
                            value={s.duracion}
                            onChange={(e) => {
                              const newDur = Number(e.target.value);
                              if (!esHorarioLaboral(s.fecha, s.hora, newDur) || esCitaOcupada(s.fecha, s.hora, newDur)) return;
                              const choca = horasSeleccionadas.some((otra, i) => i !== idx &&
                                new Date(`${otra.fecha}T${otra.hora}:00`).getTime() < new Date(`${s.fecha}T${s.hora}:00`).getTime() + newDur * 60000 &&
                                new Date(`${otra.fecha}T${otra.hora}:00`).getTime() + otra.duracion * 60000 > new Date(`${s.fecha}T${s.hora}:00`).getTime()
                              );
                              if (choca) return toast.error("Choca con otra cita seleccionada");
                              const nuevas = [...horasSeleccionadas]; nuevas[idx].duracion = newDur; setHorasSeleccionadas(nuevas);
                            }}
                          >
                            {duracionesDisponibles.map(d => <option key={d} value={d}>{d} minutos</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div className="w-full md:w-1/2 p-8 md:p-12 overflow-y-auto space-y-10 custom-scrollbar text-left">
                      <div className="space-y-6">
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Paciente</h3>
                        {citaEnReprogramacion ? (
                          <div className="p-6 rounded-[2rem] bg-purple-50 border border-purple-200 flex items-center justify-between">
                            <div>
                              <p className="text-lg font-black uppercase text-purple-900 tracking-tighter">{citaEnReprogramacion.pacientes?.nombre} {citaEnReprogramacion.pacientes?.apellido}</p>
                              <p className="text-xs font-bold text-purple-500 tracking-widest mt-1">RUT: {citaEnReprogramacion.pacientes?.rut}</p>
                            </div>
                            <RefreshCcw className="text-purple-400" size={24} />
                          </div>
                        ) : (
                          <div className="space-y-5">
                            {modoNuevoPaciente ? (
                              <div className="grid grid-cols-1 gap-4 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                                <input placeholder="Nombre" className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" value={nuevoPaciente.nombre} onChange={e => setNuevoPaciente(prev => ({ ...prev, nombre: e.target.value }))} />
                                <input placeholder="Apellido" className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" value={nuevoPaciente.apellido} onChange={e => setNuevoPaciente(prev => ({ ...prev, apellido: e.target.value }))} />
                                <input placeholder="RUT" className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" value={nuevoPaciente.rut} onChange={e => setNuevoPaciente(prev => ({ ...prev, rut: e.target.value }))} />
                                <input placeholder="Teléfono" className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" value={nuevoPaciente.telefono} onChange={e => setNuevoPaciente(prev => ({ ...prev, telefono: e.target.value }))} />
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="relative group">
                                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500" size={18} />
                                  <input
                                    placeholder="Buscar por Nombre o RUT..."
                                    className="w-full pl-12 pr-5 py-4 bg-white border border-slate-200 rounded-[2rem] text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 shadow-sm transition-all placeholder:normal-case"
                                    value={busquedaPac || ''}
                                    onChange={e => { setBusquedaPac(e.target.value); buscarPacientes(e.target.value); }}
                                  />
                                </div>
                                {pacientesEncontrados.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => seleccionarPacienteExistente(p)}
                                    className="w-full p-5 rounded-[2rem] bg-white border border-slate-100 hover:border-blue-400 hover:shadow-md transition-all flex items-center justify-between group"
                                  >
                                    <div className="text-left">
                                      <p className="font-black text-sm uppercase text-slate-800 tracking-tighter">{p.nombre} {p.apellido}</p>
                                      <p className="text-[10px] font-bold text-slate-400 tracking-widest mt-1">{p.rut}</p>
                                    </div>
                                    <ChevronRightIcon size={20} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                                  </button>
                                ))}
                                {pacienteSeleccionado && pacientesEncontrados.length === 0 && (
                                  <div className="p-6 rounded-[2rem] border border-blue-200 bg-blue-50 flex items-center justify-between shadow-sm">
                                    <p className="font-black text-lg uppercase text-blue-900 tracking-tighter">{pacienteSeleccionado.nombre} {pacienteSeleccionado.apellido}</p>
                                    <CheckCircle2 size={24} className="text-blue-500" />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {(pacienteSeleccionado || modoNuevoPaciente) && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8 bg-slate-900 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none"><Briefcase size={80}/></div>
                          <h4 className="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-[0.2em] relative z-10">Motivo / Tratamiento</h4>
                          {!modoNuevoPaciente && tratamientosPaciente.length > 0 ? (
                            <div className="space-y-4 relative z-10">
                              <select
                                className="w-full p-4 bg-white/10 rounded-2xl text-xs font-bold uppercase outline-none border border-white/5 focus:border-blue-400 text-white cursor-pointer transition-all"
                                value={tratamientoSeleccionadoId || ''}
                                onChange={(e) => {
                                  const val = e.target.value; setTratamientoSeleccionadoId(val);
                                  if (val !== 'MANUAL') { const t = tratamientosPaciente.find(x => x.id === val); setNuevoTratamientoNombre(t?.nombre_tratamiento || ''); }
                                  else setNuevoTratamientoNombre('');
                                }}
                              >
                                {tratamientosPaciente.map(t => <option key={t.id} value={t.id} className="text-slate-900">{t.nombre_tratamiento.toUpperCase()}</option>)}
                                <option value="MANUAL" className="text-slate-900 italic">+ OTRO MOTIVO</option>
                              </select>
                              {(tratamientoSeleccionadoId === 'MANUAL' || !tratamientoSeleccionadoId) && (
                                <input
                                  placeholder="Especifique motivo..."
                                  className="w-full p-4 bg-white/10 rounded-2xl text-xs font-bold uppercase outline-none border border-white/5 focus:border-blue-400 text-white mt-2 transition-all placeholder:normal-case placeholder:text-slate-500"
                                  value={nuevoTratamientoNombre || ''}
                                  onChange={(e) => setNuevoTratamientoNombre(e.target.value)}
                                />
                              )}
                            </div>
                          ) : (
                            <input
                              placeholder="Ej: Evaluación General, Urgencia..."
                              className="w-full p-4 bg-white/10 rounded-2xl text-xs font-bold uppercase outline-none border border-white/5 focus:border-blue-400 text-white relative z-10 transition-all placeholder:normal-case placeholder:text-slate-500"
                              value={nuevoTratamientoNombre || ''}
                              onChange={(e) => setNuevoTratamientoNombre(e.target.value)}
                            />
                          )}
                        </motion.div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Pie del modal */}
              <div className="px-10 py-6 border-t border-slate-100 bg-white flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-700 font-black border border-slate-200 shadow-sm text-lg">{horasSeleccionadas.length}</div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Turnos<br/>Seleccionados</p>
                </div>
                <div className="flex gap-4 items-center w-full sm:w-auto">
                  <button
                    onClick={() => { setModoNuevoPaciente(!modoNuevoPaciente); setPacienteSeleccionado(null); setBusquedaPac!(''); }}
                    className="text-[10px] font-black text-blue-600 uppercase underline hover:text-blue-800 transition-colors mr-2 whitespace-nowrap"
                  >
                    {paso === 2 && !citaEnReprogramacion && (modoNuevoPaciente ? 'Buscar Existente' : '+ Registrar Nuevo Paciente')}
                  </button>
                  {paso === 2 && (
                    <button onClick={() => setPaso(1)} className="px-8 py-4 bg-slate-50 border border-slate-200 rounded-[2rem] text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 shadow-sm transition-all">
                      Volver
                    </button>
                  )}
                  <button
                    disabled={cargandoAccion || horasSeleccionadas.length === 0 || (paso === 2 && !modoNuevoPaciente && !pacienteSeleccionado)}
                    onClick={() => { if (paso === 1) setPaso(2); else handleGuardar(); }}
                    className={`px-10 py-4 rounded-[2rem] text-xs font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 whitespace-nowrap w-full sm:w-auto flex items-center justify-center gap-2 ${citaEnReprogramacion ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/30' : 'bg-slate-900 hover:bg-black shadow-slate-900/30'}`}
                  >
                    {cargandoAccion ? <Loader2 className="animate-spin" size={16} /> : (paso === 1 ? 'Continuar al Paso 2' : citaEnReprogramacion ? 'Confirmar Reprogramación' : 'Confirmar Reserva')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TICKET DE CONFIRMACIÓN */}
      <AnimatePresence>
        {mostrarTicket && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-sm">
              <div className="bg-white rounded-[3rem] shadow-2xl p-10 text-center space-y-8">
                <CheckCircle2 className="mx-auto text-emerald-500" size={64} />
                <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-800">¡Cita Lista!</h2>
                <div className="text-left bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Paciente</p>
                    <p className="font-black text-base text-slate-800 uppercase mt-1 leading-none">{citaConfirmadaData?.paciente}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Fecha y Hora</p>
                    <p className="font-black text-base text-slate-800 uppercase mt-1 leading-none">{citaConfirmadaData?.citas[0]?.fecha} • {citaConfirmadaData?.citas[0]?.hora} hrs</p>
                  </div>
                </div>
                <button
                  onClick={() => { setMostrarTicket(false); setModalAbierto(false); resetEstados(); fetchDatos(); }}
                  className="w-full py-5 bg-slate-900 hover:bg-black rounded-3xl text-xs font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95"
                >
                  Finalizar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </main>
  );
}

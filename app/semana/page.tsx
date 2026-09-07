'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  X, Search, ChevronLeft, ChevronRight, Loader2, Clock,
  CalendarDays, Timer, UserCheck, Trash2, Activity, ClipboardList,
  CheckCircle2, Plus, Calendar as CalendarIcon, Briefcase,
  AlertTriangle, Phone, Mail, MessageCircle, Ban, RefreshCcw, ChevronDown, CalendarClock,
  LayoutGrid, List, Lock, FileText, Send, User, Users, Save
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import Link from 'next/link'

// 🎨 PALETA DE ESTADOS MODERNA
const ESTADOS_CITA: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  programada: { label: 'No confirmado', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  confirmado_tel: { label: 'Confirmado', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  en_espera: { label: 'En espera', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  atendiendose: { label: 'En box', bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-400' },
  atendido: { label: 'Atendido', bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-400' },
  no_asiste: { label: 'No asistió', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-400' },
  cancelada: { label: 'Anulada', bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
  reprogramada: { label: 'Reprogramada', bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-400' }
};

const slotsHorarios = [
  "08:00", "08:15", "08:30", "08:45", "09:00", "09:15", "09:30", "09:45",
  "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30", "11:45",
  "12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45",
  "14:00", "14:15", "14:30", "14:45", "15:00", "15:15", "15:30", "15:45",
  "16:00", "16:15", "16:30", "16:45", "17:00", "17:15", "17:30", "17:45",
  "18:00", "18:15", "18:30", "18:45", "19:00", "19:15", "19:30", "19:45",
  "20:00", "20:15", "20:30", "20:45", "21:00"
];

// Utilidades para calcular tiempos
const tToMins = (t: string) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
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
const getLunes = (d: Date) => { const date = new Date(d); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); date.setHours(0,0,0,0); return date; }

interface NuevoPaciente {
  nombre: string; apellido: string; rut: string; telefono: string; fecha_nacimiento: string; sexo: string;
}

const getDiasLunesSabado = (d: Date) => {
  const curr = new Date(d);
  const day = curr.getDay();
  const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
  return Array.from({ length: 6 }, (_, i) => new Date(curr.getFullYear(), curr.getMonth(), diff + i));
};

const getLocalDateISO = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
const getIniciales = (n: string, a: string) => `${n?.charAt(0) || ''}${a?.charAt(0) || ''}`.toUpperCase();

export default function DiarioGlobalPage() {
  const [semanaInicio, setSemanaInicio] = useState(() => getLunes(new Date()));
  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [citas, setCitas] = useState<any[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<any[]>([]);
  const [bloqueos, setBloqueos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroDoctor, setFiltroDoctor] = useState('TODOS');

  const [modalAbierto, setModalAbierto] = useState(false);
  const [paso, setPaso] = useState(1);
  const [semanaAgendamiento, setSemanaAgendamiento] = useState(new Date());
  const [filtro, setFiltro] = useState({ profesional_id: '', duracionDefault: 15 });
  const [horasSeleccionadas, setHorasSeleccionadas] = useState<{ fecha: string; hora: string; duracion: number }[]>([]);
  const [horariosConfigurados, setHorariosConfigurados] = useState<any[]>([]);
  const [citasOcupadas, setCitasOcupadas] = useState<any[]>([]);
  const [bloqueosSemana, setBloqueosSemana] = useState<any[]>([]);
  const [citaEnReprogramacion, setCitaEnReprogramacion] = useState<any>(null);
  const [citaArrastrada, setCitaArrastrada] = useState<any>(null);  

  const [modoNuevoPaciente, setModoNuevoPaciente] = useState(false);
  const [nuevoPaciente, setNuevoPaciente] = useState<NuevoPaciente>({ nombre: '', apellido: '', rut: '', telefono: '', fecha_nacimiento: '', sexo: '' });
  const [busquedaPac, setBusquedaPac] = useState('');
  const [pacientesEncontrados, setPacientesEncontrados] = useState<any[]>([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<any>(null);
  const [cargandoAccion, setCargandoAccion] = useState(false);
  const [nuevoTratamientoNombre, setNuevoTratamientoNombre] = useState('');
  const [tratamientosPaciente, setTratamientosPaciente] = useState<any[]>([]);
  const [tratamientoSeleccionadoId, setTratamientoSeleccionadoId] = useState<string | null>(null);

  // ESTADOS DEL MODAL DE CONFLICTOS
  const [citasConflictivas, setCitasConflictivas] = useState<any[]>([])
  const [mostrarModalConflictos, setMostrarModalConflictos] = useState(false)
  const [citaEnEdicion, setCitaEnEdicion] = useState<string | null>(null)
  const [semanaReagenda, setSemanaReagenda] = useState<Date>(getLunes(new Date()))
  const [dispoSemana, setDispoSemana] = useState<any[]>([])
  const [cargandoSlots, setCargandoSlots] = useState(false)
  const [reagendaProps, setReagendaProps] = useState({ fecha: '', hora: '', especialistaId: '', duracion: 30, box: 1 })
  const [guardandoConflicto, setGuardandoConflicto] = useState(false)



  const [esOtroDocumento, setEsOtroDocumento] = useState(false);

  const [mostrarTicket, setMostrarTicket] = useState(false);
  const [citaConfirmadaData, setCitaConfirmadaData] = useState<any>(null);
  const [usuarioLogueado, setUsuarioLogueado] = useState<string | null>(null);
  const [userRol, setUserRol] = useState<string>('');
  const puedeVerAgendaCompleta = ['ADMIN', 'RECEPCIONISTA', 'ASISTENTE'].includes(userRol);
  const duracionesDisponibles = [15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300];
  const alertaRef = useRef(false);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); 
    return () => clearInterval(timer);
  }, []);

  const esSemanaActual = getLunes(semanaInicio).getTime() === getLunes(new Date()).getTime();

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

  useEffect(() => { fetchDatos(); }, [semanaInicio]);
useEffect(() => {
    const initAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        setUsuarioLogueado(data.session.user.id);
        // Buscamos el rol del usuario en la tabla perfiles
        const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', data.session.user.id).maybeSingle();
        if (perfil) setUserRol(perfil.rol);
      }
    };
    initAuth();
  }, []);
    useEffect(() => { if (modalAbierto && filtro.profesional_id) { fetchCitasOcupadas(); fetchHorariosDoctor(); fetchBloqueosSemana(); } }, [semanaAgendamiento, modalAbierto, filtro.profesional_id]);

  useEffect(() => {
    if (mostrarModalConflictos && citaEnEdicion) { calcularDisponibilidadSemanalConflicto() }
  }, [semanaReagenda, citaEnEdicion, reagendaProps.especialistaId, reagendaProps.duracion])

  async function fetchDatos() {
    setCargando(true);
    const dias = getDiasLunesSabado(semanaInicio);
    const inicioSemana = dias[0].toISOString().split('T')[0];
    const finSemana = dias[5].toISOString().split('T')[0];
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', userId).maybeSingle();
      const esAdmin = perfil?.rol === 'ADMIN' || perfil?.rol === 'RECEPCIONISTA';

      let queryProfs = supabase.from('profesionales').select('id, nombre, apellido, user_id').eq('activo', true);
      
      if (!esAdmin) queryProfs = queryProfs.eq('user_id', userId);

      const { data: profs, error: profsError } = await queryProfs;
      if (profsError) throw profsError;

      const dentistas = profs || [];
      const idsDentistasUserId = dentistas.map(p => p.user_id);
      const idsDentistasId = dentistas.map(p => p.id); // CORRECCIÓN: Para bloqueos_agenda

      if (dentistas.length > 0) {
        const [citasRes, dispoRes, bloqueosRes] = await Promise.all([
          supabase.from('citas').select('id, inicio, fin, estado, pacientes(nombre, apellido), profesional_id, motivo')
            .in('profesional_id', idsDentistasUserId)
            .gte('inicio', `${inicioSemana}T00:00:00`)
            .lte('inicio', `${finSemana}T23:59:59`)
            .neq('estado', 'cancelada'),
          supabase.from('disponibilidad_profesional').select('*').in('profesional_id', idsDentistasUserId),
          // CORRECCIÓN: Usamos idsDentistasId (UUID interno)
          supabase.from('bloqueos_agenda').select('*').in('profesional_id', idsDentistasId).gte('fecha', inicioSemana).lte('fecha', finSemana)
        ]);
        
        setCitas(citasRes.data || []);
        setDisponibilidades(dispoRes.data || []);
        setBloqueos(bloqueosRes.data || []);
        setProfesionales(dentistas);
        
        if (!esAdmin && dentistas.length > 0) {
          setFiltroDoctor(dentistas[0].user_id);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar la agenda");
    } finally {
      setCargando(false);
    }
  }
  
  const profesionalesFiltrados = useMemo(() => {
    const profsConActividad = profesionales.filter(p => {
        const tieneDispo = disponibilidades.some(d => d.profesional_id === p.user_id);
        const tieneCitas = citas.some(c => c.profesional_id === p.user_id);
        return tieneDispo || tieneCitas;
    });

    if (filtroDoctor === 'TODOS') return profsConActividad;
    const doctorSeleccionado = profsConActividad.find(p => p.user_id === filtroDoctor);
    return doctorSeleccionado ? [doctorSeleccionado] : [];
  }, [filtroDoctor, profesionales, disponibilidades, citas]);

  // VALIDADOR DE SLOT LIBRE (CORREGIDO PARA USAR ID DE PROFESIONAL EN BLOQUEOS)
  const esSlotLibre = (profId: string, fecha: string, hora: string, duracionMin: number) => {
    const slotStart = new Date(`${fecha}T${hora}:00`).getTime();
    const slotEnd = slotStart + duracionMin * 60000;

    const chocaCita = citas.some(c => {
      if (c.profesional_id !== profId) return false;
      const cInicio = new Date(c.inicio.replace(' ', 'T')).getTime();
      const cFin = new Date(c.fin.replace(' ', 'T')).getTime();
      return slotStart < cFin && slotEnd > cInicio;
    });
    if (chocaCita) return false;

    const profObj = profesionales.find(p => p.user_id === profId);
    const chocaBloqueo = bloqueos.some(b => {
      if (b.profesional_id !== profObj?.id || b.fecha !== fecha) return false;
      if (!b.hora_inicio || !b.hora_fin) return true;
      const bStart = new Date(`${fecha}T${b.hora_inicio}`).getTime();
      const bEnd = new Date(`${fecha}T${b.hora_fin}`).getTime();
      return slotStart < bEnd && slotEnd > bStart;
    });
    if (chocaBloqueo) return false;

    return true;
  };

  const resetEstados = () => {
    setPaso(1); setHorasSeleccionadas([]); setPacienteSeleccionado(null); setBusquedaPac('');
    setCitasOcupadas([]); setCitaEnReprogramacion(null); setSemanaAgendamiento(new Date(semanaInicio));
    setNuevoTratamientoNombre(''); setBloqueosSemana([]); setEsOtroDocumento(false);
    setModoNuevoPaciente(false); setTratamientosPaciente([]); setTratamientoSeleccionadoId(null);
    setNuevoPaciente({ nombre: '', apellido: '', rut: '', telefono: '', fecha_nacimiento: '', sexo: '' }); setCargandoAccion(false);
  };

  const agendarDesdeSlot = (profesional_id: string, hora: string, fecha: string) => {
    if (!esSlotLibre(profesional_id, fecha, hora, 15)) {
      toast.error("El horario seleccionado se solapa con otra cita o con un bloqueo.");
      return;
    }
    resetEstados();
    setFiltro(prev => ({ ...prev, profesional_id, duracionDefault: 15 }));
    setHorasSeleccionadas([{ fecha, hora, duracion: 15 }]);
    setSemanaAgendamiento(new Date(fecha + 'T12:00:00'));
    setModalAbierto(true);
    setPaso(1);
  };

  const iniciarReprogramacion = (cita: any) => {
    resetEstados(); setCitaEnReprogramacion(cita);
    setFiltro({ ...filtro, profesional_id: cita.profesional_id || '' });
    const tInicio = new Date(cita.inicio.replace(' ', 'T')).getTime();
    const tFin = new Date(cita.fin.replace(' ', 'T')).getTime();
    const duracionMinutos = Math.round((tFin - tInicio) / 60000);
    const duracionFinal = duracionesDisponibles.includes(duracionMinutos) ? duracionMinutos : 15;

    setFiltro(prev => ({ ...prev, duracionDefault: duracionFinal }));
    seleccionarPacienteExistente(cita.pacientes);
    setNuevoTratamientoNombre(cita.motivo || '');
    setSemanaAgendamiento(new Date(cita.inicio.replace(' ', 'T')));
    setModalAbierto(true); setPaso(1);
  };

  async function fetchCitasOcupadas() {
    const dias = getDiasLunesSabado(semanaAgendamiento);
    const inicioSemana = new Date(dias[0].getFullYear(), dias[0].getMonth(), dias[0].getDate(), 0, 0, 0).toISOString();
    const finSemana = new Date(dias[5].getFullYear(), dias[5].getMonth(), dias[5].getDate(), 23, 59, 59).toISOString();
    const { data } = await supabase.from('citas').select('id, inicio, fin').eq('profesional_id', filtro.profesional_id).gte('inicio', inicioSemana).lte('inicio', finSemana).neq('estado', 'cancelada');
    setCitasOcupadas(citaEnReprogramacion ? (data || []).filter(c => c.id !== citaEnReprogramacion.id) : (data || []));
  }
  const esDropValido = (profId: string, fecha: string, hora: string, citaObj: any) => {
  if (!citaObj) return false;
  const tInicio = new Date(citaObj.inicio.replace(' ', 'T')).getTime();
  const tFin = new Date(citaObj.fin.replace(' ', 'T')).getTime();
  const duracionMinutos = Math.round((tFin - tInicio) / 60000);

  const slotStart = new Date(`${fecha}T${hora}:00`).getTime();
  const slotEnd = slotStart + duracionMinutos * 60000;

  // Verifica choques con otras citas (ignorando la que se está arrastrando)
  const chocaCita = citas.some(c => {
    if (c.profesional_id !== profId || c.id === citaObj.id) return false;
    const cInicio = new Date(c.inicio.replace(' ', 'T')).getTime();
    const cFin = new Date(c.fin.replace(' ', 'T')).getTime();
    return slotStart < cFin && slotEnd > cInicio;
  });
  if (chocaCita) return false;

  // Verifica choques con bloqueos
  const profObj = profesionales.find(p => p.user_id === profId);
  const chocaBloqueo = bloqueos.some(b => {
    if (b.profesional_id !== profObj?.id || b.fecha !== fecha) return false;
    if (!b.hora_inicio || !b.hora_fin) return true;
    const bStart = new Date(`${fecha}T${b.hora_inicio}`).getTime();
    const bEnd = new Date(`${fecha}T${b.hora_fin}`).getTime();
    return slotStart < bEnd && slotEnd > bStart;
  });
  if (chocaBloqueo) return false;

  // Verifica que esté dentro del horario laboral
  const diaSemanaActual = new Date(`${fecha}T12:00:00`).getDay();
  const dispoProf = disponibilidades.filter(d => d.profesional_id === profId);
  const dispoEspeciales = dispoProf.filter(d => d.fecha_especifica === fecha);
  const dispoAUsar = dispoEspeciales.length > 0 ? dispoEspeciales : dispoProf.filter(d => d.dia_semana === diaSemanaActual && !d.fecha_especifica);

  const slotInicioMins = tToMins(hora);
  const slotFinMins = slotInicioMins + duracionMinutos;

  return dispoAUsar.some(d => slotInicioMins >= tToMins(d.hora_inicio) && slotFinMins <= tToMins(d.hora_fin));
};

const handleDragStart = (e: React.DragEvent, cita: any) => {
  setCitaArrastrada(cita);
  e.dataTransfer.setData("text/plain", cita.id);
  e.dataTransfer.effectAllowed = "move";
};

const handleDrop = async (e: React.DragEvent, profId: string, fecha: string, hora: string) => {
  e.preventDefault();
  if (!citaArrastrada) return;
  if (!confirm("¿Confirmas que deseas reprogramar esta cita al nuevo horario?")) {
    setCitaArrastrada(null);
    return;
  }

  const tInicio = new Date(citaArrastrada.inicio.replace(' ', 'T')).getTime();
  const tFin = new Date(citaArrastrada.fin.replace(' ', 'T')).getTime();
  const duracionMin = Math.round((tFin - tInicio) / 60000);

  const nuevoInicio = `${fecha}T${hora}:00`;
  const fechaFinObj = new Date(new Date(nuevoInicio).getTime() + duracionMin * 60000);
  const nuevoFin = `${fecha}T${fechaFinObj.getHours().toString().padStart(2, '0')}:${fechaFinObj.getMinutes().toString().padStart(2, '0')}:00`;

  try {
    toast.loading("Reprogramando cita...", { id: 'move-cita' });
    await supabase.from('citas').update({
      inicio: nuevoInicio,
      fin: nuevoFin,
      profesional_id: profId,
      estado: 'reprogramada',
      modificado_por: usuarioLogueado
    }).eq('id', citaArrastrada.id);
    
    toast.success("Cita movida exitosamente", { id: 'move-cita' });
    fetchDatos();
  } catch (error) {
    toast.error("Error al mover la cita", { id: 'move-cita' });
  } finally {
    setCitaArrastrada(null);
  }
};
  async function fetchHorariosDoctor() {
    const { data } = await supabase.from('disponibilidad_profesional').select('*').eq('profesional_id', filtro.profesional_id);
    setHorariosConfigurados(data || []);
  }

  async function fetchBloqueosSemana() {
    const dias = getDiasLunesSabado(semanaAgendamiento);
    const inicioSemana = dias[0].toLocaleDateString('sv-SE');
    const finSemana = dias[5].toLocaleDateString('sv-SE');
    
    // CORRECCIÓN: Buscamos usando el profObj.id
    const profObj = profesionales.find(p => p.user_id === filtro.profesional_id);
    if (!profObj) return;

    const { data } = await supabase.from('bloqueos_agenda').select('*').eq('profesional_id', profObj.id).gte('fecha', inicioSemana).lte('fecha', finSemana);
    setBloqueosSemana(data || []);
  }

  // ES HORARIO LABORAL PARA EL MODAL DE AGENDAMIENTO (CORREGIDO HORARIOS ESPECIALES)
  const esHorarioLaboral = (fecha: string, hora: string, duracionMinutos: number) => {
    const diaSemana = new Date(fecha + 'T00:00:00').getDay();
    const slotStart = new Date(`${fecha}T${hora}:00`).getTime();
    const slotEnd = slotStart + duracionMinutos * 60000;

    const horariosEspecialesDelDia = horariosConfigurados.filter(h => h.fecha_especifica === fecha);
    let horariosAUsar = horariosEspecialesDelDia.length > 0 
      ? horariosEspecialesDelDia 
      : horariosConfigurados.filter(h => h.dia_semana === diaSemana && !h.fecha_especifica);

    return horariosAUsar.some(h => {
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
    if (alertaRef.current) return;
    alertaRef.current = true;
    setTimeout(() => { alertaRef.current = false; }, 100);

    const sel = horasSeleccionadas.some(x => x.fecha === fecha && x.hora === hora);
    if (sel) {
      toggleHora(fecha, hora);
      return;
    }

    const laboral = esHorarioLaboral(fecha, hora, filtro.duracionDefault);
    const ocupado = esCitaOcupada(fecha, hora, filtro.duracionDefault);
    const estaOcupadoPorSeleccion = slotsOcupadosSet.has(`${fecha}-${hora}`);
    const diaCompletamenteBloqueado = bloqueosSemana.some(b => b.fecha === fecha && (!b.hora_inicio || !b.hora_fin));

    if (diaCompletamenteBloqueado) return toast.error("Este día está completamente bloqueado.");
    if (!laboral) return toast.error("Fuera del horario laboral del especialista.");
    if (ocupado) return toast.error("Horario ocupado por otra cita o bloqueo.");
    if (estaOcupadoPorSeleccion) return toast.warning("El horario choca con otra selección actual.");

    toggleHora(fecha, hora);
  };

  async function calcularDisponibilidadSemanalConflicto() {
    setCargandoSlots(true);
    try {
      const dias = Array.from({length: 7}).map((_, i) => { const d = new Date(semanaReagenda); d.setDate(d.getDate() + i); return d; });
      const inicioSemanaStr = dias[0].toISOString().split('T')[0];
      const finSemanaStr = dias[6].toISOString().split('T')[0];

      const profNuevo = profesionales.find(p => p.user_id === reagendaProps.especialistaId);

      const [bloqueosRes, dispoRes, citasRes] = await Promise.all([
        supabase.from('bloqueos_agenda').select('fecha, hora_inicio, hora_fin').eq('profesional_id', profNuevo?.id).gte('fecha', inicioSemanaStr).lte('fecha', finSemanaStr),
        supabase.from('disponibilidad_profesional').select('*').eq('profesional_id', reagendaProps.especialistaId),
        supabase.from('citas').select('inicio, fin').eq('profesional_id', reagendaProps.especialistaId).gte('inicio', `${inicioSemanaStr}T00:00:00`).lte('inicio', `${finSemanaStr}T23:59:59`).neq('estado', 'cancelada')
      ]);

      const semanaProcesada = dias.map(dateObj => {
        const dateStr = dateObj.toISOString().split('T')[0];
        const diaSemanaNum = dateObj.getDay();
        
        const bloqueosDia = bloqueosRes.data?.filter(bl => bl.fecha === dateStr) || [];
        if (bloqueosDia.some(bl => !bl.hora_inicio || !bl.hora_fin)) return { date: dateStr, dateObj, status: 'bloqueado', slots: [] };
        
        // CORRECCIÓN: Separar horarios especiales
        const dispoEspecialDia = dispoRes.data?.filter(di => di.fecha_especifica === dateStr) || [];
        const dispoDia = dispoEspecialDia.length > 0 ? dispoEspecialDia : (dispoRes.data?.filter(di => di.dia_semana === diaSemanaNum && !di.fecha_especifica) || []);

        if (dispoDia.length === 0) return { date: dateStr, dateObj, status: 'sin_horario', slots: [] };
        
        const citasDia = citasRes.data?.filter(ci => ci.inicio.startsWith(dateStr)).map(ci => ({ inicio: getMinsFromDateStr(ci.inicio), fin: getMinsFromDateStr(ci.fin) })) || [];
        
        let slotsLibres: string[] = [];
        dispoDia.forEach(bloque => {
          let currTime = tToMins(bloque.hora_inicio);
          const endTime = tToMins(bloque.hora_fin);
          while (currTime + reagendaProps.duracion <= endTime) {
            const slotEnd = currTime + reagendaProps.duracion;
            const chocaCita = citasDia.some(cita => currTime < cita.fin && slotEnd > cita.inicio);
            const chocaBloqueo = bloqueosDia.some(bl => {
              if(!bl.hora_inicio || !bl.hora_fin) return true;
              return currTime < tToMins(bl.hora_fin) && slotEnd > tToMins(bl.hora_inicio);
            });

            if (!chocaCita && !chocaBloqueo) slotsLibres.push(minsToT(currTime));
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
      await supabase.from('citas').update({ estado: 'cancelada' }).eq('id', citaId);
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

      toast.success("Cita reagendada con éxito");
      setCitaEnEdicion(null);
      setCitasConflictivas(prev => prev.filter(c => c.id !== citaId));
    } catch(e) {
      toast.error("Error al reagendar");
    } finally {
      setGuardandoConflicto(false);
    }
  }

  const buscarPacientes = async (term: string) => {
    if (!term.trim()) { setPacientesEncontrados([]); return; }
    const palabras = term.trim().split(/\s+/);
    let query = supabase.from('pacientes').select('*');
    palabras.forEach(palabra => {
      const fuzzy = `%${palabra.split('').join('%')}%`;
      const palabraRut = palabra.replace(/[^0-9kK]/gi, '').toUpperCase();
      if (palabraRut.length > 0) query = query.or(`nombre.ilike.${fuzzy},apellido.ilike.${fuzzy},rut.ilike.%${palabraRut}%`);
      else query = query.or(`nombre.ilike.${fuzzy},apellido.ilike.${fuzzy}`);
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
    if (modoNuevoPaciente && (!nuevoPaciente.nombre || !nuevoPaciente.apellido)) {
      return toast.error("Faltan datos del nuevo paciente", { description: "Nombre y Apellido son obligatorios." });
    }
    setCargandoAccion(true);
    try {
      let pId = pacienteSeleccionado?.id;
      let pNombreFull = pacienteSeleccionado ? `${pacienteSeleccionado.nombre} ${pacienteSeleccionado.apellido}` : "";
      let pTelefono = pacienteSeleccionado?.telefono;
      if (modoNuevoPaciente && !citaEnReprogramacion) {
        let rutFinal: string | null = nuevoPaciente.rut.toUpperCase().trim();
        if (esOtroDocumento) {
          if (!rutFinal) rutFinal = `OTRO-DOC-${Date.now()}`;
        } else {
            rutFinal = rutFinal.replace(/[^0-9kK-]/g, '');
        }

        const { data: pNew } = await supabase.from('pacientes').insert([{ 
            nombre: nuevoPaciente.nombre.toUpperCase().trim(), 
            apellido: nuevoPaciente.apellido.toUpperCase().trim(), 
            rut: rutFinal, 
            telefono: nuevoPaciente.telefono, 
            fecha_nacimiento: nuevoPaciente.fecha_nacimiento || null, 
            sexo: nuevoPaciente.sexo || null, 
            activo: true 
        }]).select().single();
        if (pNew) { pId = pNew.id; pNombreFull = `${nuevoPaciente.nombre} ${nuevoPaciente.apellido}`; pTelefono = nuevoPaciente.telefono; }
      }
      const parsearAFechaLocal = (fechaStr: string, horaStr: string, duracionMin: number) => {
        const finDate = new Date(new Date(`${fechaStr}T${horaStr}:00`).getTime() + duracionMin * 60000);
        const finH = finDate.getHours().toString().padStart(2, '0');
        const finM = finDate.getMinutes().toString().padStart(2, '0');
        return { inicio: `${fechaStr}T${horaStr}:00`, fin: `${fechaStr}T${finH}:${finM}:00` };
      };
      if (citaEnReprogramacion) {
        const s = horasSeleccionadas[0]; const { inicio, fin } = parsearAFechaLocal(s.fecha, s.hora, s.duracion);
        await supabase.from('citas').update({ inicio, fin, profesional_id: filtro.profesional_id, estado: 'reprogramada', motivo: nuevoTratamientoNombre.toUpperCase() || citaEnReprogramacion.motivo, modificado_por: usuarioLogueado }).eq('id', citaEnReprogramacion.id);
      } else {
        const nuevasCitas = horasSeleccionadas.map(s => {
          const { inicio, fin } = parsearAFechaLocal(s.fecha, s.hora, s.duracion);
          return { paciente_id: pId, profesional_id: filtro.profesional_id, presupuesto_id: (tratamientoSeleccionadoId && tratamientoSeleccionadoId !== 'MANUAL') ? tratamientoSeleccionadoId : null, inicio, fin, estado: 'programada', motivo: nuevoTratamientoNombre.toUpperCase() || 'CONSULTA', creado_por: usuarioLogueado };
        });
        await supabase.from('citas').insert(nuevasCitas);
      }
      setCitaConfirmadaData({ paciente: pNombreFull.toUpperCase(), citas: horasSeleccionadas, telefono: pTelefono });
      setMostrarTicket(true); await fetchDatos();
    } catch (e) { 
      toast.error("Error al guardar"); 
      setCargandoAccion(false);
    }
  };

  const navegarSemana = (sentido: 'atras' | 'adelante') => {
    const nueva = new Date(semanaInicio); nueva.setDate(nueva.getDate() + (sentido === 'adelante' ? 7 : -7)); setSemanaInicio(nueva);
  };

  return (
    <main 
      className="min-h-screen font-sans p-2 md:p-4 pb-24 text-left"
      style={{
        backgroundImage: "url('/fondo-agenda.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed'
      }}
    >
      <div className="max-w-[1600px] mx-auto space-y-4">

        {/* HEADER MODERNO */}
        <header className="bg-white/90 backdrop-blur-xl p-8 md:p-10 rounded-[3rem] shadow-sm border border-white/60 flex flex-col xl:flex-row justify-between items-center gap-6 text-left">
          <div className="flex items-center gap-6 text-left w-full xl:w-auto">
            <div className="p-5 bg-blue-600 rounded-[2rem] text-white shadow-xl shadow-blue-200/50 shrink-0">
              <LayoutGrid size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800 uppercase italic leading-none text-left">Diario Global</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-2 text-left">Disponibilidad de Especialistas</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto">
            {/* Control de Fechas */}
            <div className="bg-slate-50/80 border border-slate-200/60 rounded-[2rem] p-2 flex items-center gap-4 shadow-inner">
              <button onClick={() => navegarSemana('atras')} className="p-3 hover:bg-white hover:shadow-sm rounded-2xl transition-all text-slate-500">
                <ChevronLeft size={20} />
              </button>
              <h2 className="text-sm font-black uppercase text-slate-800 tracking-widest min-w-[200px] text-center">
                Semana del {semanaInicio.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
              </h2>
              <button onClick={() => navegarSemana('adelante')} className="p-3 hover:bg-white hover:shadow-sm rounded-2xl transition-all text-slate-500">
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="relative w-full md:w-72 group">
              <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16} />
              <select
                className="w-full pl-12 pr-10 py-4 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-[2rem] text-xs font-bold uppercase outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 shadow-sm transition-all appearance-none cursor-pointer"
                value={filtroDoctor}
                onChange={(e) => setFiltroDoctor(e.target.value)}
              >
                <option value="TODOS">Ver todos los especialistas</option>
                {profesionales.map(p => (
                  <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
            </div>

            <Link href="/agenda" className="bg-slate-900 text-white px-8 py-4 rounded-[2rem] text-xs font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all flex items-center gap-2 shrink-0">
              <CalendarDays size={18} /> Volver a Agenda
            </Link>
          </div>
        </header>

        {/* GRILLA PRINCIPAL */}
        {cargando ? (
          <div className="flex flex-col justify-center items-center py-32 gap-4">
            <Loader2 className="animate-spin text-blue-600" size={48} />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cargando disponibilidad...</p>
          </div>
        ) : (
          <div className="space-y-12">
            {profesionalesFiltrados.length === 0 ? (
              <div className="p-10 font-bold text-slate-400 text-center w-full bg-white/90 backdrop-blur-xl rounded-[3rem] shadow-sm border border-white/60">Ningún especialista programado para esta semana.</div>
            ) : profesionalesFiltrados.map(p => {
                const citasDelProfesional = citas.filter(c => c.profesional_id === p.user_id);
                const disponibilidadesDelProfesional = disponibilidades.filter(d => d.profesional_id === p.user_id);
                // CORRECCIÓN: Filtrar los bloqueos por p.id (UUID tabla) en vez de p.user_id
                const bloqueosDelProfesional = bloqueos.filter(b => b.profesional_id === p.id);
                const getHoraLimpias = (fechaString: string) => fechaString.includes('T') ? fechaString.split('T')[1].substring(0, 5) : fechaString.split(' ')[1].substring(0, 5);

                return (
                  <div key={p.user_id} className="bg-white/90 backdrop-blur-xl rounded-[3rem] shadow-sm border border-white/60 overflow-hidden">
                    <div className="p-6 text-sm font-black text-slate-700 uppercase border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur-md z-20 h-[90px] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center shadow-sm">
                          <User size={18} className="text-blue-600" />
                        </div>
                        <div className="text-left">
                          <Link href={`/semana/doctorsemana?doctorId=${p.user_id}`} className="leading-tight hover:text-blue-600 transition-colors underline decoration-blue-300">
                            Dr. {p.apellido}
                          </Link>
                          <p className="text-[9px] text-slate-400 tracking-widest mt-0.5">{p.nombre}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex overflow-x-auto custom-scrollbar">
                      {getDiasLunesSabado(semanaInicio).map(dia => {
                        const fStr = getLocalDateISO(dia);
                        const diaSemanaActual = dia.getDay();
                        const citasDelDia = citasDelProfesional.filter(c => c.inicio.startsWith(fStr));
                        const esBloqueoDiaCompleto = bloqueosDelProfesional.some(b => b.fecha === fStr && (!b.hora_inicio || !b.hora_fin));
                        
                        // CORRECCIÓN: Separar Especiales vs Semanales en la Grilla Principal
                        const dispoEspeciales = disponibilidadesDelProfesional.filter(d => d.fecha_especifica === fStr);
                        const dispoAUsar = dispoEspeciales.length > 0 
                          ? dispoEspeciales 
                          : disponibilidadesDelProfesional.filter(d => d.dia_semana === diaSemanaActual && !d.fecha_especifica);

                        const esHoy = getLocalDateISO(dia) === getLocalDateISO(currentTime);
                        const minutosDesdeLas8 = (currentTime.getHours() * 60 + currentTime.getMinutes()) - (8 * 60);
                        const topLineaTiempo = (minutosDesdeLas8 / 15) * 2.5;
                        const mostrarLineaTiempo = esSemanaActual && minutosDesdeLas8 >= 0 && minutosDesdeLas8 <= ((21 - 8) * 60) && esHoy;
                        
                        return (
                          <div key={fStr} className="flex-shrink-0 border-r border-slate-100" style={{ width: '180px' }}>
                            <div className="p-4 text-center border-b border-slate-100 h-[70px] flex flex-col justify-center">
                              <p className="text-xs font-black uppercase text-slate-500">{dia.toLocaleDateString('es-CL', { weekday: 'long' })}</p>
                              <p className="text-xl font-black text-slate-800">{dia.getDate()}</p>
                            </div>
                            <div className="relative min-h-[600px]">
                              {mostrarLineaTiempo && (
                                <div className="absolute left-0 w-full z-20 flex items-center pointer-events-none" style={{ top: `${topLineaTiempo}rem`, transform: 'translateY(-50%)' }}>
                                  <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] z-10 -ml-1"></div>
                                  <div className="flex-1 border-b-2 border-red-500 border-dashed opacity-60"></div>
                                </div>
                              )}
                              {slotsHorarios.map(h => {
                                const slotInicioMins = parseInt(h.split(':')[0]) * 60 + parseInt(h.split(':')[1]);
                                const slotStart = new Date(`${fStr}T${h}:00`).getTime();
                                const slotEnd = slotStart + 15 * 60000;

                                // Limpiado y aislado para este slot específico
                                const esBloqueado = bloqueosDelProfesional.some(b => {
                                  if (b.fecha !== fStr) return false;
                                  if (!b.hora_inicio || !b.hora_fin) return true;
                                  const bStart = new Date(`${fStr}T${b.hora_inicio}`).getTime();
                                  const bEnd = new Date(`${fStr}T${b.hora_fin}`).getTime();
                                  return slotStart < bEnd && slotEnd > bStart;
                                });

                                const ocupadoCita = citasDelProfesional.some(c => {
                                  const cInicio = new Date(c.inicio.replace(' ', 'T')).getTime();
                                  const cFin = new Date(c.fin.replace(' ', 'T')).getTime();
                                  return slotStart < cFin && slotEnd > cInicio;
                                });

                                const esLaboral = dispoAUsar.some(d => {
                                  const dIni = parseInt(d.hora_inicio.split(':')[0]) * 60 + parseInt(d.hora_inicio.split(':')[1]);
                                  const dFin = parseInt(d.hora_fin.split(':')[0]) * 60 + parseInt(d.hora_fin.split(':')[1]);
                                  return slotInicioMins >= dIni && (slotInicioMins + 15) <= dFin;
                                });

                                const deshabilitado = esBloqueoDiaCompleto || !esLaboral || ocupadoCita || esBloqueado;

                                return (
    <div 
      key={h} 
      className={`flex items-stretch h-10 border-b border-slate-100 group ${citaArrastrada && esDropValido(p.user_id, fStr, h, citaArrastrada) ? 'bg-blue-50 border-dashed border-blue-200' : ''}`}
      onDragOver={(e) => {
        if (esDropValido(p.user_id, fStr, h, citaArrastrada)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => handleDrop(e, p.user_id, fStr, h)}
    >
                                    <div className="w-16 text-center p-2 text-[9px] font-black border-r border-slate-100 flex items-center justify-center bg-slate-50/50 text-slate-400 group-hover:bg-slate-100">
                                      {h}
                                    </div>
                                    <div className="flex-1 relative p-1">
                                      {esBloqueado || esBloqueoDiaCompleto ? (
                                        <div className="h-full w-full rounded-xl bg-rose-50/50 border border-rose-200 border-dashed flex items-center justify-center" title="Horario Bloqueado">
                                          <Ban size={16} className="text-rose-300" />
                                        </div>
                                      ) : esLaboral && !ocupadoCita && !deshabilitado ? (
  <div onClick={() => agendarDesdeSlot(p.user_id, h, fStr)} className="h-full w-full rounded-xl bg-emerald-100 border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-200 cursor-pointer transition-all flex items-center justify-center" title="Agendar nueva cita">
    <Plus size={16} className="text-emerald-700" />
  </div>
) : <div className="h-full w-full rounded-xl bg-slate-50/40" />}
                                    </div>
                                  </div>
                                );
                              })}
                                {citasDelDia.map(cita => {
                                const ini = getHoraLimpias(cita.inicio);
                                const fin = getHoraLimpias(cita.fin);
                                const iniMins = parseInt(ini.split(':')[0]) * 60 + parseInt(ini.split(':')[1]);
                                const finMins = parseInt(fin.split(':')[0]) * 60 + parseInt(fin.split(':')[1]);
                                const duracionMins = finMins - iniMins;
                                const top = (iniMins - (8 * 60)) / 15 * 2.5; // 2.5rem (h-10) per 15 mins
                                const height = duracionMins / 15 * 2.5;
                                const estadoStyle = ESTADOS_CITA[cita.estado] || ESTADOS_CITA.programada;
                                const iniciales = getIniciales(cita.pacientes?.nombre, cita.pacientes?.apellido);

                                return (
    <motion.div
      key={cita.id}
      draggable // AGREGADO
      onDragStart={(e: any) => handleDragStart(e, cita)} // AGREGADO
      onDragEnd={() => setCitaArrastrada(null)} // AGREGADO
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: citaArrastrada?.id === cita.id ? 0.4 : 1, scale: 1 }} // ACTUALIZADO
      onClick={() => iniciarReprogramacion(cita)}
      className={`absolute z-10 w-[calc(100%-8px)] left-1 ${estadoStyle.bg} border ${estadoStyle.bg.replace('bg-', 'border-')} rounded-lg p-2 ${citaArrastrada ? 'cursor-grabbing' : 'cursor-pointer'} hover:shadow-lg transition-all duration-200 flex flex-col justify-center overflow-hidden`} // ACTUALIZADO EL CURSOR
                                    style={{ top: `${top}rem`, height: `${height}rem` }}
                                    title={`${cita.pacientes?.nombre} ${cita.pacientes?.apellido} (${ini} - ${fin})`}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-1.5 overflow-hidden">
                                        <div className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center text-[10px] font-black text-slate-700 shadow-sm border border-slate-100/50 shrink-0">
                                          {iniciales}
                                        </div>
                                        <span className="text-[11px] font-black text-slate-800 truncate uppercase">
                                          {cita.pacientes?.nombre?.split(' ')[0]} {cita.pacientes?.apellido?.split(' ')[0]}
                                        </span>
                                      </div>
                                      <span className="text-[9px] font-black tracking-widest text-slate-500 opacity-80">{ini}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <span className={`w-2 h-2 rounded-full ${estadoStyle.dot}`}></span>
                                      <span className={`text-[9px] font-bold uppercase tracking-widest ${estadoStyle.text}`}>{estadoStyle.label}</span>
                                    </div>
                                  </motion.div>
                                );
                                })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

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
                      const isEditing = citaEnEdicion === cita.id;
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
                                  setReagendaProps(prev => ({...prev, duracion: calcMins > 0 ? calcMins : 45, especialistaId: reagendaProps.especialistaId, fecha: '', hora: ''}));
                                  setCitaEnEdicion(cita.id);
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
                                          {profesionales.map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
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
                                        <button onClick={() => setCitaEnEdicion(null)} className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase hover:text-slate-700 transition-all">Cancelar</button>
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
                <button onClick={() => { setModalAbierto(false); setCitaEnReprogramacion(null); }} className="p-3 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

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
                            value={filtro.profesional_id || ""}
                            onChange={(e) => { setFiltro({ ...filtro, profesional_id: e.target.value }); setHorasSeleccionadas([]); }}
                          >
                            <option value="">Seleccionar...</option>
                            {profesionales.map(p => <option key={p.id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
                          </select>
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Duración base</label>
                          <div className="grid grid-cols-3 gap-3">
                            {duracionesDisponibles.slice(0, 6).map(m => (
                              <button
                                key={m}
                                onClick={() => {
                                  setFiltro({ ...filtro, duracionDefault: m });
                                  setHorasSeleccionadas(prev => {
                                    const validados = prev.filter(s => esHorarioLaboral(s.fecha, s.hora, m) && !esCitaOcupada(s.fecha, s.hora, m));
                                    if (validados.length < prev.length) {
                                      toast.error(`Algunas horas se deseleccionaron porque la nueva duración de ${m} mins topa con otra cita o fin de turno.`);
                                    }
                                    return validados.map(v => ({ ...v, duracion: m }));
                                  });
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
                        <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow group">
                          <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{s.fecha}</p>
                            <p className="text-2xl font-black text-slate-800 tracking-tighter mt-1">{s.hora} hrs</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer text-slate-700"
                              value={s.duracion}
                              onChange={(e) => {
                                const newDur = Number(e.target.value);
                                if (!esHorarioLaboral(s.fecha, s.hora, newDur)) return toast.error(`La duración de ${newDur} mins excede el horario de salida del especialista.`);
                                if (esCitaOcupada(s.fecha, s.hora, newDur)) return toast.error(`Al aumentar a ${newDur} mins, topa con otra cita ya agendada o bloqueada.`);
                                const choca = horasSeleccionadas.some((otra, i) => i !== idx &&
                                  new Date(`${otra.fecha}T${otra.hora}:00`).getTime() < new Date(`${s.fecha}T${s.hora}:00`).getTime() + newDur * 60000 &&
                                  new Date(`${otra.fecha}T${otra.hora}:00`).getTime() + otra.duracion * 60000 > new Date(`${s.fecha}T${s.hora}:00`).getTime()
                                );
                                if (choca) return toast.error("Esta duración choca con otra cita seleccionada en tu lista actual.");
                                const nuevas = [...horasSeleccionadas]; nuevas[idx].duracion = newDur; setHorasSeleccionadas(nuevas);
                              }}
                            >
                              {duracionesDisponibles.map(d => <option key={d} value={d}>{d} minutos</option>)}
                            </select>
                            <button onClick={() => toggleHora(s.fecha, s.hora)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100" title="Eliminar bloque">
                              <Trash2 size={16} />
                            </button>
                          </div>
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
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                                <input placeholder="Nombre" className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" value={nuevoPaciente.nombre} onChange={e => setNuevoPaciente(prev => ({ ...prev, nombre: e.target.value }))} />
                                <input placeholder="Apellido" className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" value={nuevoPaciente.apellido} onChange={e => setNuevoPaciente(prev => ({ ...prev, apellido: e.target.value }))} />
                                 
                                <div className="md:col-span-2 flex items-center gap-2 mt-2">
                                    <input 
                                        type="checkbox" 
                                        id="otro_documento_semana" 
                                        className="w-4 h-4 accent-blue-600"
                                        checked={esOtroDocumento}
                                        onChange={(e) => {
                                            setEsOtroDocumento(e.target.checked);
                                            setNuevoPaciente(prev => ({...prev, rut: ''}));
                                        }}
                                    />
                                    <label htmlFor="otro_documento_semana" className="text-xs font-bold text-slate-600 cursor-pointer">
                                        Paciente extranjero / Usar otro documento
                                    </label>
                                </div>

                                <div className="md:col-span-2">
                                    <input 
                                        placeholder={esOtroDocumento ? "N° de Pasaporte o Identificación (Opcional)" : "RUT (sin puntos, con guión)"} 
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" 
                                        value={nuevoPaciente.rut} 
                                        onChange={e => setNuevoPaciente(prev => ({...prev, rut: e.target.value}))}
                                    />
                                </div>

                                <input placeholder="Teléfono" className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" value={nuevoPaciente.telefono} onChange={e => setNuevoPaciente(prev => ({ ...prev, telefono: e.target.value }))} />
                                 
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Fecha de Nacimiento</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" 
                                        value={nuevoPaciente.fecha_nacimiento} 
                                        onChange={e => setNuevoPaciente(prev => ({...prev, fecha_nacimiento: e.target.value}))}
                                    />
                                </div>

                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Sexo</label>
                                    <select 
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                                        value={nuevoPaciente.sexo}
                                        onChange={e => setNuevoPaciente(prev => ({...prev, sexo: e.target.value}))}
                                    >
                                        <option value="">Seleccionar...</option>
                                        <option value="Masculino">Masculino</option>
                                        <option value="Femenino">Femenino</option>
                                        <option value="Otro">Otro</option>
                                    </select>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="relative group">
                                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500" size={18} />
                                  <input
                                    placeholder="Buscar por Nombre o RUT..."
                                    className="w-full pl-12 pr-5 py-4 bg-white border border-slate-200 rounded-[2rem] text-xs font-bold uppercase outline-none focus:ring-4 focus:ring-blue-500/10 shadow-sm transition-all placeholder:normal-case"
                                    value={busquedaPac}
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
                                    <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
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
                          <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none"><Briefcase size={80} /></div>
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
                                  value={nuevoTratamientoNombre}
                                  onChange={(e) => setNuevoTratamientoNombre(e.target.value)}
                                />
                              )}
                            </div>
                          ) : (
                            <input
                              placeholder="Ej: Evaluación General, Urgencia..."
                              className="w-full p-4 bg-white/10 rounded-2xl text-xs font-bold uppercase outline-none border border-white/5 focus:border-blue-400 text-white relative z-10 transition-all placeholder:normal-case placeholder:text-slate-500"
                              value={nuevoTratamientoNombre}
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
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Turnos<br />Seleccionados</p>
                </div>
                <div className="flex gap-4 items-center w-full sm:w-auto">
                  <button
                    onClick={() => { setModoNuevoPaciente(!modoNuevoPaciente); setPacienteSeleccionado(null); setBusquedaPac(''); setEsOtroDocumento(false); }}
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
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      if (!citaConfirmadaData) return;
                      const { paciente, citas, telefono } = citaConfirmadaData;
                      if (!telefono) {
                          toast.error("El paciente no tiene un número de teléfono registrado.");
                          return;
                      }
                      const fecha = new Date(citas[0].fecha + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
                      const hora = citas[0].hora;
                      const mensaje = `Hola ${paciente}, hemos agendado tu cita para el día ${fecha} a las ${hora} hrs. ¡Te esperamos en Clínica Dignidad!`;
                      const numLimpio = telefono.replace(/\D/g, '');
                      const numFinal = numLimpio.length === 9 ? `56${numLimpio}` : numLimpio;
                      window.open(`https://wa.me/${numFinal}?text=${encodeURIComponent(mensaje)}`, '_blank');
                      setMostrarTicket(false); setModalAbierto(false); resetEstados(); fetchDatos();
                    }}
                    className="w-full py-4 bg-emerald-500 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-md hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                  >
                    <MessageCircle size={14}/> Finalizar y Enviar WhatsApp
                  </button>
                  <button onClick={() => { setMostrarTicket(false); setModalAbierto(false); resetEstados(); fetchDatos(); }} className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">Finalizar</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}

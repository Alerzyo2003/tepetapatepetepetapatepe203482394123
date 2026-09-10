'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import {
  X, Search, ChevronLeft, ChevronRight, Loader2, Clock,
  CalendarDays, Timer, UserCheck, Trash2, Ban, RefreshCcw, 
  ChevronDown, CalendarClock, LayoutGrid, Plus, CheckCircle2, 
  User, Users, Save, Briefcase, MessageCircle, AlertCircle, Info,
  Phone, Activity
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import Link from 'next/link'

// 🎨 PALETA DE ESTADOS MODERNA
const ESTADOS_CITA: Record<string, { label: string, bg: string, text: string, dot: string, icon: any }> = {
  programada: { label: 'No Confirmado', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', icon: <Clock /> },
  confirmado_tel: { label: 'Confirmado', bg: 'bg-indigo-50', text: 'text-indigo-600', dot: 'bg-indigo-500', icon: <Phone /> },
  en_espera: { label: 'En Espera', bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-500', icon: <Timer /> },
  atendiendose: { label: 'En Box', bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500', icon: <Activity /> },
  atendido: { label: 'Atendido', bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500', icon: <CheckCircle2 /> },
  no_asiste: { label: 'No Asistió', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500', icon: <Ban /> },
  cancelada: { label: 'Anulada', bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400', icon: <Trash2 /> },
  reprogramada: { label: 'Reprogramada', bg: 'bg-purple-50', text: 'text-purple-600', dot: 'bg-purple-500', icon: <RefreshCcw /> }
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
const getLocalDateISO = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
const getIniciales = (n: string, a: string) => `${n?.charAt(0) || ''}${a?.charAt(0) || ''}`.toUpperCase();

interface NuevoPaciente {
  nombre: string; apellido: string; rut: string; telefono: string; fecha_nacimiento: string; sexo: string;
}

export default function VistaDiariaPage() {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [citas, setCitas] = useState<any[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<any[]>([]);
  const [bloqueos, setBloqueos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroDoctor, setFiltroDoctor] = useState('TODOS');
  
  // Estados para Agendamiento
  const [modalAbierto, setModalAbierto] = useState(false);
  const [paso, setPaso] = useState(1);
  const [filtro, setFiltro] = useState({ profesional_id: '', duracionDefault: 15 });
  const [horasSeleccionadas, setHorasSeleccionadas] = useState<{ fecha: string; hora: string; duracion: number }[]>([]);
  const [citaEnReprogramacion, setCitaEnReprogramacion] = useState<any>(null);
  
  // Estados Paciente
  const [modoNuevoPaciente, setModoNuevoPaciente] = useState(false);
  const [nuevoPaciente, setNuevoPaciente] = useState<NuevoPaciente>({ nombre: '', apellido: '', rut: '', telefono: '', fecha_nacimiento: '', sexo: '' });
  const [busquedaPac, setBusquedaPac] = useState('');
  const [pacientesEncontrados, setPacientesEncontrados] = useState<any[]>([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<any>(null);
  const [esOtroDocumento, setEsOtroDocumento] = useState(false);
  
  const [nuevoTratamientoNombre, setNuevoTratamientoNombre] = useState('');
  const [tratamientosPaciente, setTratamientosPaciente] = useState<any[]>([]);
  const [tratamientoSeleccionadoId, setTratamientoSeleccionadoId] = useState<string | null>(null);
  const [cargandoAccion, setCargandoAccion] = useState(false);
  const [mostrarTicket, setMostrarTicket] = useState(false);
  const [citaConfirmadaData, setCitaConfirmadaData] = useState<any>(null);
  const [usuarioLogueado, setUsuarioLogueado] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  
  // ESTADOS DEL MODAL DE CONFLICTOS Y REAGENDAMIENTO
  const [citasConflictivas, setCitasConflictivas] = useState<any[]>([]);
  const [mostrarModalConflictos, setMostrarModalConflictos] = useState(false);
  const [citaEnEdicion, setCitaEnEdicion] = useState<string | null>(null);
  const [semanaReagenda, setSemanaReagenda] = useState<Date>(new Date());
  const [dispoSemana, setDispoSemana] = useState<any[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [reagendaProps, setReagendaProps] = useState({ fecha: '', hora: '', especialistaId: '', duracion: 30, box: 1 });
  const [guardandoConflicto, setGuardandoConflicto] = useState(false);
  
  const duracionesDisponibles = [15, 30, 45, 60, 90, 120];
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const node = document.createElement('div');
      node.id = 'modal-root-diaria';
      node.style.position = 'relative';
      node.style.zIndex = '999999';
      document.body.appendChild(node);
      setPortalNode(node);

      return () => {
        if (document.body.contains(node)) {
          document.body.removeChild(node);
        }
      };
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); 
    return () => clearInterval(timer); 
  }, []);

const [userRol, setUserRol] = useState<string>('');
const puedeVerAgendaCompleta = ['ADMIN', 'RECEPCIONISTA', 'ASISTENTE'].includes(userRol);

useEffect(() => { 
  const initAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      setUsuarioLogueado(data.session.user.id);
      const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', data.session.user.id).maybeSingle();
      if (perfil) setUserRol(perfil.rol);
    }
  };
  initAuth();
}, []);
  useEffect(() => { fetchDatosDia(); }, [selectedDate]);

  useEffect(() => {
    if ((mostrarModalConflictos && citaEnEdicion) || citaEnReprogramacion) { 
      calcularDisponibilidadSemanalConflicto() 
    }
  }, [semanaReagenda, citaEnEdicion, citaEnReprogramacion, reagendaProps.especialistaId, reagendaProps.duracion]);

  async function fetchDatosDia() {
    setCargando(true);
    const fechaISO = getLocalDateISO(selectedDate);
    
    try {
      const { data: profs, error: profsError } = await supabase.from('profesionales').select('id, nombre, apellido, user_id').eq('activo', true);
      if (profsError) throw profsError;

      const dentistas = profs || [];
      const idsDentistasUserId = dentistas.map(p => p.user_id);
      const idsDentistasId = dentistas.map(p => p.id); // CORRECCIÓN UUID

      if (dentistas.length > 0) {
        const [citasRes, dispoRes, bloqueosRes] = await Promise.all([
supabase.from('citas').select('id, inicio, fin, estado, pacientes(id, nombre, apellido, rut, telefono, activo, motivo_deshabilitado), profesional_id, motivo, created_at')            .gte('inicio', `${fechaISO}T00:00:00`)
            .lte('inicio', `${fechaISO}T23:59:59`)
            .neq('estado', 'cancelada'),
          supabase.from('disponibilidad_profesional').select('*').in('profesional_id', idsDentistasUserId),
          // CORRECCIÓN UUID EN BLOQUEOS
          supabase.from('bloqueos_agenda').select('*').in('profesional_id', idsDentistasId).eq('fecha', fechaISO)
        ]);
        
        setCitas(citasRes.data || []);
        setDisponibilidades(dispoRes.data || []);
        setBloqueos(bloqueosRes.data || []);
        setProfesionales(dentistas);
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar la agenda del día");
    } finally {
      setCargando(false);
    }
  }

  const profesionalesDelDia = useMemo(() => {
  const diaSemanaActual = selectedDate.getDay();
  const fechaISO = getLocalDateISO(selectedDate);
  
  return profesionales.filter(p => {
      // 🔒 RESTRICCIÓN: Si es dentista, ocultar las columnas de los demás
      if (!puedeVerAgendaCompleta && p.user_id !== usuarioLogueado) return false;

      const tieneDispo = disponibilidades.some(d => d.profesional_id === p.user_id && ((d.fecha_especifica && d.fecha_especifica === fechaISO) || (!d.fecha_especifica && d.dia_semana === diaSemanaActual)));
      const tieneCitas = citas.some(c => c.profesional_id === p.user_id);
      const tieneBloqueos = bloqueos.some(b => b.profesional_id === p.id);
      return tieneDispo || tieneCitas || tieneBloqueos;
  });
}, [profesionales, disponibilidades, citas, bloqueos, selectedDate, puedeVerAgendaCompleta, usuarioLogueado]);

  // ES HORARIO LABORAL PARA LA VISTA PRINCIPAL (CORREGIDO HORARIOS ESPECIALES)
  const esHorarioLaboral = (profId: string, fecha: string, hora: string, duracionMinutos: number) => {
    const diaSemana = new Date(fecha + 'T00:00:00').getDay();
    const slotStart = new Date(`${fecha}T${hora}:00`).getTime();
    const slotEnd = slotStart + duracionMinutos * 60000;
    
    const dispoDoc = disponibilidades.filter(d => d.profesional_id === profId);
    const dispoEspeciales = dispoDoc.filter(d => d.fecha_especifica === fecha);
    
    const horariosAUsar = dispoEspeciales.length > 0 
      ? dispoEspeciales 
      : dispoDoc.filter(d => d.dia_semana === diaSemana && !d.fecha_especifica);

    return horariosAUsar.some(h => {
      const inicioLab = new Date(`${fecha}T${h.hora_inicio.substring(0, 5)}:00`).getTime();
      const finLab = new Date(`${fecha}T${h.hora_fin.substring(0, 5)}:00`).getTime();
      return slotStart >= inicioLab && slotEnd <= finLab;
    });
  };

  const esCitaOcupada = (profId: string, fecha: string, hora: string, duracionMinutos: number) => {
    const slotStart = new Date(`${fecha}T${hora}:00`).getTime();
    const slotEnd = slotStart + duracionMinutos * 60000;
    
    const chocaCita = citas.some(c => {
      if (c.profesional_id !== profId) return false;
      if (citaEnReprogramacion && c.id === citaEnReprogramacion.id) return false; 
      
      const cInicio = new Date(c.inicio.replace(' ', 'T')).getTime();
      const cFin = new Date(c.fin.replace(' ', 'T')).getTime();
      return slotStart < cFin && slotEnd > cInicio;
    });
    if (chocaCita) return true;

    const profObj = profesionales.find(p => p.user_id === profId);
    const chocaBloqueo = bloqueos.some(b => {
      if (b.profesional_id !== profObj?.id || b.fecha !== fecha) return false;
      if (!b.hora_inicio || !b.hora_fin) return true;
      const bStart = new Date(`${fecha}T${b.hora_inicio}`).getTime();
      const bEnd = new Date(`${fecha}T${b.hora_fin}`).getTime();
      return slotStart < bEnd && slotEnd > bStart;
    });
    return chocaBloqueo;
  };

  const agendarDesdeSlot = (profesional_id: string, hora: string) => {
    const fecha = getLocalDateISO(selectedDate);
    if (esCitaOcupada(profesional_id, fecha, hora, 15)) {
      toast.error("El horario seleccionado choca con otra cita.");
      return;
    }
    resetEstados();
    setFiltro({ profesional_id, duracionDefault: 15 });
    setHorasSeleccionadas([{ fecha, hora, duracion: 15 }]);
    setModalAbierto(true);
    setPaso(1);
  };

  const iniciarReprogramacion = (cita: any) => {
    resetEstados(); setCitaEnReprogramacion(cita);
    const fechaStr = cita.inicio.split('T')[0];
    const horaStr = cita.inicio.split('T')[1].substring(0,5);
    
    setFiltro({ profesional_id: cita.profesional_id || '', duracionDefault: 15 });
    const tInicio = new Date(cita.inicio.replace(' ', 'T')).getTime();
    const tFin = new Date(cita.fin.replace(' ', 'T')).getTime();
    const duracionMinutos = Math.round((tFin - tInicio) / 60000);
    const duracionFinal = duracionesDisponibles.includes(duracionMinutos) ? duracionMinutos : 15;

    setFiltro(prev => ({ ...prev, duracionDefault: duracionFinal }));
    setHorasSeleccionadas([{ fecha: fechaStr, hora: horaStr, duracion: duracionFinal }]);
    
    let dateObj = new Date(cita.inicio.replace(' ', 'T'));
    setSemanaReagenda(dateObj);
    setReagendaProps(prev => ({
        ...prev,
        especialistaId: cita.profesional_id,
        duracion: duracionFinal,
        fecha: fechaStr,
        hora: horaStr
    }));

    seleccionarPacienteExistente(cita.pacientes);
    setNuevoTratamientoNombre(cita.motivo || '');
    setModalAbierto(true); setPaso(1);
  };

  const resetEstados = () => {
    setPaso(1); setHorasSeleccionadas([]); setPacienteSeleccionado(null); setBusquedaPac('');
    setCitaEnReprogramacion(null); setNuevoTratamientoNombre(''); setEsOtroDocumento(false);
    setModoNuevoPaciente(false); setTratamientosPaciente([]); setTratamientoSeleccionadoId(null);
    setNuevoPaciente({ nombre: '', apellido: '', rut: '', telefono: '', fecha_nacimiento: '', sexo: '' }); setCargandoAccion(false);
  };

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
        await supabase.from('citas').update({ 
            inicio, 
            fin, 
            profesional_id: filtro.profesional_id, 
            estado: 'reprogramada', 
            motivo: nuevoTratamientoNombre.toUpperCase() || citaEnReprogramacion.motivo, 
            modificado_por: usuarioLogueado 
        }).eq('id', citaEnReprogramacion.id);
      } else {
        const nuevasCitas = horasSeleccionadas.map(s => {
          const { inicio, fin } = parsearAFechaLocal(s.fecha, s.hora, s.duracion);
          return { paciente_id: pId, profesional_id: filtro.profesional_id, presupuesto_id: (tratamientoSeleccionadoId && tratamientoSeleccionadoId !== 'MANUAL') ? tratamientoSeleccionadoId : null, inicio, fin, estado: 'programada', motivo: nuevoTratamientoNombre.toUpperCase() || 'CONSULTA', creado_por: usuarioLogueado };
        });
        await supabase.from('citas').insert(nuevasCitas);
      }
      setCitaConfirmadaData({ paciente: pNombreFull.toUpperCase(), citas: horasSeleccionadas, telefono: pTelefono });
      setMostrarTicket(true); await fetchDatosDia();
    } catch (e) { 
      toast.error("Error al guardar"); 
      setCargandoAccion(false);
    }
  };

  const navegarDia = (dias: number) => {
    const nueva = new Date(selectedDate);
    nueva.setDate(nueva.getDate() + dias);
    setSelectedDate(nueva);
  };

  async function calcularDisponibilidadSemanalConflicto() {
    setCargandoSlots(true);
    try {
      const dias = Array.from({length: 7}).map((_, i) => { const d = new Date(semanaReagenda); d.setDate(d.getDate() - (d.getDay()||7) + 1 + i); return d; });
      const inicioSemanaStr = dias[0].toISOString().split('T')[0];
      const finSemanaStr = dias[6].toISOString().split('T')[0];

      const profNuevo = profesionales.find(p => p.user_id === reagendaProps.especialistaId);

      const [bloqueosRes, dispoRes, citasRes] = await Promise.all([
        // CORRECCIÓN: Filtrar bloqueos por profNuevo?.id
        supabase.from('bloqueos_agenda').select('fecha, hora_inicio, hora_fin').eq('profesional_id', profNuevo?.id).gte('fecha', inicioSemanaStr).lte('fecha', finSemanaStr),
        supabase.from('disponibilidad_profesional').select('*').eq('profesional_id', reagendaProps.especialistaId),
        supabase.from('citas').select('id, inicio, fin').eq('profesional_id', reagendaProps.especialistaId).gte('inicio', `${inicioSemanaStr}T00:00:00`).lte('inicio', `${finSemanaStr}T23:59:59`).neq('estado', 'cancelada')
      ]);

      const semanaProcesada = dias.map(dateObj => {
        const dateStr = dateObj.toISOString().split('T')[0];
        const diaSemanaNum = dateObj.getDay();
        
        const bloqueosDia = bloqueosRes.data?.filter(bl => bl.fecha === dateStr) || [];
        if (bloqueosDia.some(bl => !bl.hora_inicio || !bl.hora_fin)) return { date: dateStr, dateObj, status: 'bloqueado', slots: [] };
        
        // CORRECCIÓN: Separar Especiales vs Semanales en Reagendamiento
        const dispoEspecialDia = dispoRes.data?.filter(di => di.fecha_especifica === dateStr) || [];
        const dispoDia = dispoEspecialDia.length > 0 ? dispoEspecialDia : (dispoRes.data?.filter(di => di.dia_semana === diaSemanaNum && !di.fecha_especifica) || []);

        if (dispoDia.length === 0) return { date: dateStr, dateObj, status: 'sin_horario', slots: [] };
        
        const citasDia = citasRes.data?.filter(ci => ci.inicio.startsWith(dateStr)).map(ci => ({ id: ci.id, inicio: getMinsFromDateStr(ci.inicio), fin: getMinsFromDateStr(ci.fin) })) || [];
        let slotsLibres: string[] = [];
        
        dispoDia.forEach(bloque => {
          let currTime = tToMins(bloque.hora_inicio);
          const endTime = tToMins(bloque.hora_fin);
          while (currTime + reagendaProps.duracion <= endTime) {
            const slotEnd = currTime + reagendaProps.duracion;
            const chocaCita = citasDia.some(cita => {
                if (citaEnReprogramacion && cita.id === citaEnReprogramacion.id) return false;
                return currTime < cita.fin && slotEnd > cita.inicio;
            });
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

  const esHoy = getLocalDateISO(selectedDate) === getLocalDateISO(currentTime);
  const minutosDesdeLas8 = (currentTime.getHours() * 60 + currentTime.getMinutes()) - (8 * 60);
  const mostrarLineaTiempo = esHoy && minutosDesdeLas8 >= 0 && minutosDesdeLas8 <= ((21 - 8) * 60);

  return (
    <main className="min-h-screen bg-[#FBF8F2] p-4 md:p-10 pb-24 md:pb-10 font-sans text-slate-900 relative overflow-hidden z-0">
      
      {/* IMAGEN DE FONDO GLOBAL */}
      <div 
        className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"
      ></div>

      <div className="max-w-[1600px] mx-auto space-y-6 md:space-y-8 relative z-10 text-left">
        
        {/* HEADER TIPO TARJETA BLANCA */}
        <header className="bg-white/90 backdrop-blur-md p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-5 md:gap-6 text-left">
          <div className="flex items-center gap-4 md:gap-5 text-left w-full md:w-auto">
            <div className="bg-[#0A111F] w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center text-[#C9A24B] shadow-lg shrink-0">
              <LayoutGrid className="md:w-[28px] md:h-[28px]" size={24} />
            </div>
            <div className="text-left">
              <h1 className="text-xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight text-left">
                AGENDA MÉDICOS
              </h1>
              <p className="text-slate-400 text-[9px] md:text-xs font-bold uppercase tracking-widest mt-1 md:mt-1.5 flex items-center gap-1.5 md:gap-2">
                <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-[#C9A24B] animate-pulse"></span> Vista Diaria Combinada
              </p>
            </div>
          </div>

          <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-3 md:gap-4 w-full xl:w-auto">
            {/* Control de Fechas */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl md:rounded-[2rem] p-1 md:p-2 flex items-center justify-between gap-4 shadow-inner">
              <button onClick={() => navegarDia(-1)} className="p-2 md:p-3 hover:bg-white hover:shadow-sm rounded-lg md:rounded-2xl transition-all text-slate-500">
                <ChevronLeft className="md:w-[20px] md:h-[20px]" size={18} />
              </button>
              
              <div className="relative flex items-center justify-center cursor-pointer group" onClick={() => dateInputRef.current?.showPicker()}>
                 <span className="text-[10px] md:text-sm font-black uppercase text-slate-800 tracking-widest min-w-[140px] md:min-w-[200px] text-center hover:text-[#C9A24B] transition-colors">
                   {selectedDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })}
                 </span>
                 <input ref={dateInputRef} type="date" className="sr-only" value={getLocalDateISO(selectedDate)} onChange={(e) => { if(e.target.value) { const [y, m, d] = e.target.value.split('-'); setSelectedDate(new Date(Number(y), Number(m)-1, Number(d))); } }} />
              </div>

              <button onClick={() => navegarDia(1)} className="p-2 md:p-3 hover:bg-white hover:shadow-sm rounded-lg md:rounded-2xl transition-all text-slate-500">
                <ChevronRight className="md:w-[20px] md:h-[20px]" size={18} />
              </button>
            </div>

            <div className="flex flex-row gap-2 w-full md:w-auto">
              <Link href="/semana" className="flex-1 md:flex-none justify-center bg-[#C9A24B] text-white px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-[2rem] text-[10px] md:text-xs font-black uppercase tracking-widest shadow-xl hover:bg-[#a7853b] transition-all flex items-center gap-2">
                <CalendarDays className="md:w-[18px] md:h-[18px]" size={16} /> <span className="hidden sm:inline">Vista</span> Semanal
              </Link>
              <Link href="/agenda" className="flex-1 md:flex-none justify-center bg-[#0A111F] text-white px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-[2rem] text-[10px] md:text-xs font-black uppercase tracking-widest shadow-xl hover:bg-[#1a2538] transition-all flex items-center gap-2">
                <LayoutGrid className="md:w-[18px] md:h-[18px]" size={16} /> Agenda
              </Link>
            </div>
          </div>
        </header>

        {/* GRILLA PRINCIPAL DIARIA */}
        {cargando ? (
          <div className="flex flex-col justify-center items-center py-32 gap-4 bg-white/95 backdrop-blur-sm rounded-[2rem] md:rounded-[3rem] shadow-sm border border-slate-100">
            <Loader2 className="animate-spin text-[#C9A24B]" size={48} />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando doctores...</p>
          </div>
        ) : (
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl md:rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[75vh]">
            {profesionalesDelDia.length === 0 ? (
              <div className="flex-1 flex flex-col justify-center items-center py-20 opacity-60">
                 <Users className="text-slate-300 mb-4" size={64} />
                 <h3 className="text-lg font-black uppercase tracking-widest text-[#0A111F]">Sin doctores hoy</h3>
                 <p className="text-xs font-bold text-slate-400 mt-2">Nadie atiende en la fecha seleccionada.</p>
              </div>
            ) : (
              <div className="flex flex-1 overflow-auto custom-scrollbar relative">
                
                {/* Columna Fija Izquierda (Horas) */}
                <div className="w-12 md:w-20 border-r border-slate-100 bg-slate-50/80 shrink-0 z-40 flex flex-col sticky left-0 shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
                  <div className="h-[50px] md:h-[80px] border-b border-slate-200 bg-white/90 backdrop-blur-md flex items-center justify-center shrink-0 sticky top-0 z-50">
                    <Clock className="text-slate-400 md:w-[20px] md:h-[20px]" size={16} />
                  </div>
                  <div className="relative [--slot-h:1.5rem] md:[--slot-h:2.5rem]">
                    {slotsHorarios.map(hora => (
                      <div key={hora} className="h-[var(--slot-h)] border-b border-slate-200/50 flex items-center justify-center text-[9px] md:text-[10px] font-black text-slate-400">
                        {hora}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contenedor Horizontal Scrolleable de Doctores */}
                <div className="flex-1 flex relative bg-slate-50/20">
                   {profesionalesDelDia.map(p => {
                      const citasDoc = citas.filter(c => c.profesional_id === p.user_id);
                      const fechaStr = getLocalDateISO(selectedDate);
                      const bloqueosDiaCompletos = bloqueos.some(b => b.profesional_id === p.id && b.fecha === fechaStr && (!b.hora_inicio || !b.hora_fin));

                      return (
                        <div key={p.user_id} className="min-w-[110px] md:min-w-[200px] border-r border-slate-100 flex flex-col relative">
                          
                          {/* Header Doctor Sticky Top */}
                          <div className="h-[50px] md:h-[80px] border-b border-slate-200 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center shrink-0 sticky top-0 z-30 p-1 md:p-2 text-center shadow-sm">
                             <div className="w-5 h-5 md:w-8 md:h-8 bg-[#C9A24B]/10 text-[#C9A24B] rounded-full flex items-center justify-center mb-0.5 md:mb-1">
                                <User className="md:w-[14px] md:h-[14px]" size={10} />
                             </div>
                             <p className="text-[9px] md:text-[11px] font-black uppercase tracking-tight text-[#0A111F] truncate w-full leading-none">
                               {p.nombre.split(' ')[0]} {p.apellido.split(' ')[0]}
                             </p>
                          </div>

                          {/* Grilla Slots */}
                          <div className="relative min-h-[400px] md:min-h-[600px] [--slot-h:1.5rem] md:[--slot-h:2.5rem] bg-white/50">
                              {mostrarLineaTiempo && (
                                <div className="absolute left-0 w-full z-20 flex items-center pointer-events-none" style={{ top: `calc(${(minutosDesdeLas8 / 15)} * var(--slot-h))`, transform: 'translateY(-50%)' }}>
                                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] z-10 -ml-0.5"></div>
                                  <div className="flex-1 border-b-2 border-red-500 border-dashed opacity-50"></div>
                                </div>
                              )}
                              
                              {slotsHorarios.map(hora => {
                                const laboral = esHorarioLaboral(p.user_id, fechaStr, hora, 15);
                                const ocupado = esCitaOcupada(p.user_id, fechaStr, hora, 15);
                                
                                const esBloqueado = bloqueos.some(b => {
                                    if (b.profesional_id !== p.id || b.fecha !== fechaStr) return false;
                                    if (!b.hora_inicio || !b.hora_fin) return true;
                                    const bIni = parseInt(b.hora_inicio.split(':')[0]) * 60 + parseInt(b.hora_inicio.split(':')[1]);
                                    const bFin = parseInt(b.hora_fin.split(':')[0]) * 60 + parseInt(b.hora_fin.split(':')[1]);
                                    const slotInicioMins = parseInt(hora.split(':')[0]) * 60 + parseInt(hora.split(':')[1]);
                                    return slotInicioMins >= bIni && slotInicioMins < bFin;
                                });

                                const esDisponible = laboral && !ocupado && !bloqueosDiaCompletos && !esBloqueado;

                                return (
                                  <div key={hora} className="w-full h-[var(--slot-h)] border-b border-r border-slate-100/50 p-0.5 md:p-1 relative">
                                    {bloqueosDiaCompletos || esBloqueado ? (
                                      <div className="h-full w-full rounded-[4px] md:rounded-lg bg-rose-50/50 border border-rose-200 border-dashed flex items-center justify-center" title="Horario Bloqueado">
                                        <Ban className="text-rose-300 w-[10px] h-[10px] md:w-[16px] md:h-[16px]" />
                                      </div>
                                    ) : esDisponible ? (
                                      <div 
                                        onClick={() => agendarDesdeSlot(p.user_id, hora)} 
                                        className="h-full w-full rounded-[4px] md:rounded-lg bg-emerald-100/80 border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-200 cursor-pointer transition-all flex items-center justify-center" 
                                        title="Agendar cita"
                                      >
                                        {/* 🔥 ICONO SIEMPRE VISIBLE 🔥 */}
                                        <Plus className="text-emerald-700 w-[10px] h-[10px] md:w-[16px] md:h-[16px]" />
                                      </div>
                                    ) : (
                                      <div className="h-full w-full rounded-[4px] md:rounded-lg bg-slate-50/40" />
                                    )}
                                  </div>
                                );
                              })}

                             {/* Renderizar Citas Absolutas */}
                              {citasDoc.map(cita => {
                                const ini = getMinsFromDateStr(cita.inicio);
                                const fin = getMinsFromDateStr(cita.fin);
                                const duracionMins = fin - ini;
                                const top = (ini - (8 * 60)) / 15; 
                                const height = duracionMins / 15;
                                const estadoStyle = ESTADOS_CITA[cita.estado] || ESTADOS_CITA.programada;
                                const iniciales = getIniciales(cita.pacientes?.nombre, cita.pacientes?.apellido);
                                const hFormat = new Date(cita.inicio).toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'});

                                // 🔥 DETECCIÓN AUTOMÁTICA DE SOBRECUPO POR CRUCE DE HORARIOS 🔥
                                const isSobrecupo = citasDoc.some(otra => {
                                    if (otra.id === cita.id) return false;
                                    const cIni = new Date(cita.inicio.replace(' ', 'T')).getTime();
                                    const cFin = new Date(cita.fin.replace(' ', 'T')).getTime();
                                    const oIni = new Date(otra.inicio.replace(' ', 'T')).getTime();
                                    const oFin = new Date(otra.fin.replace(' ', 'T')).getTime();
                                    
                                    if (cIni >= oFin || cFin <= oIni) return false; 
                                    
                                    const timeC = cita.created_at ? new Date(cita.created_at).getTime() : 0;
                                    const timeO = otra.created_at ? new Date(otra.created_at).getTime() : 0;
                                    if (timeC !== timeO && timeC > 0 && timeO > 0) return timeC > timeO;
                                    return String(cita.id) > String(otra.id);
                                }) || cita.es_sobrecupo === true || (cita.motivo && cita.motivo.toUpperCase().includes('SOBRECUPO'));

                                const boxBg = isSobrecupo ? 'bg-rose-100' : estadoStyle.bg;
                                const boxBorder = isSobrecupo ? 'border-rose-400 border-dashed border-2 shadow-[0_0_15px_rgba(244,63,94,0.4)]' : `border ${estadoStyle.bg.replace('bg-', 'border-').replace('50', '200')}`;
                                const textColor = isSobrecupo ? 'text-rose-900' : estadoStyle.text;

                                // Si es sobrecupo, le damos un z-index superior y la desplazamos a la derecha (efecto cascada)
                                const posicionEstilo = isSobrecupo 
                                  ? 'z-[20] left-[8px] md:left-[14px] w-[calc(100%-10px)] md:w-[calc(100%-18px)]' 
                                  : 'z-10 left-[2px] md:left-1 w-[calc(100%-4px)] md:w-[calc(100%-8px)]';

                                return (
                                  <motion.div
                                    key={cita.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    onClick={() => iniciarReprogramacion(cita)}
                                    className={`absolute ${posicionEstilo} ${boxBg} ${boxBorder} rounded-[4px] md:rounded-lg p-1 md:p-2 cursor-pointer hover:shadow-md hover:z-30 transition-all duration-200 flex flex-col justify-center overflow-hidden group`}
                                    style={{ 
                                      top: `calc(${top} * var(--slot-h))`, 
                                      height: `calc(${height} * var(--slot-h))` 
                                    }}
                                  >
                                    <div className="flex items-center justify-between mb-0.5 md:mb-1 w-full gap-1">
                                      <div className="flex items-center gap-1 md:gap-1.5 overflow-hidden flex-1">
                                        <div className={`w-3 h-3 md:w-5 md:h-5 rounded-full bg-white/90 flex items-center justify-center text-[7px] md:text-[9px] font-black shadow-sm border border-white/50 shrink-0 ${isSobrecupo ? 'text-rose-600' : estadoStyle.text}`}>
                                          {iniciales}
                                        </div>
                                        <span className={`text-[8px] md:text-[11px] font-black truncate uppercase transition-colors ${isSobrecupo ? 'text-rose-950' : `text-slate-900 group-hover:${estadoStyle.text}`}`}>
                                          {cita.pacientes?.nombre?.split(' ')[0]} {cita.pacientes?.apellido?.split(' ')[0]}
                                        </span>
                                      </div>
                                      
                                      {/* 🔥 SELLO DE SOBRECUPO 🔥 */}
                                      {isSobrecupo && (
                                        <div className="shrink-0 bg-rose-600 text-white px-1 md:px-1.5 py-0.5 rounded shadow-sm flex items-center justify-center -rotate-3 border border-rose-500">
                                          <span className="text-[6px] md:text-[7.5px] font-black uppercase tracking-widest leading-none">SOBRECUPO</span>
                                        </div>
                                      )}
                                    </div>
                                    
                                    <div className="flex items-center justify-between mt-0 md:mt-0.5 w-full">
                                      <div className="flex items-center gap-0.5 md:gap-1 truncate">
                                        <span className={`${isSobrecupo ? 'text-rose-600' : estadoStyle.text} shrink-0 [&>svg]:w-[8px] [&>svg]:h-[8px] md:[&>svg]:w-[11px] md:[&>svg]:h-[11px]`}>
                                          {estadoStyle.icon}
                                        </span>
                                        <span className={`text-[6px] md:text-[8.5px] font-black uppercase tracking-widest truncate ${textColor}`}>
                                          {estadoStyle.label}
                                        </span>
                                      </div>
                                      <span className={`text-[6.5px] md:text-[8px] font-bold uppercase tracking-widest shrink-0 opacity-80 ${textColor}`}>
                                        {hFormat}
                                      </span>
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
            )}
          </div>
        )}
      </div>

      {/* PORTALES GLOBALES PARA MODALES */}
      {portalNode ? createPortal(
        <>
          {/* MODAL DE CONFLICTOS DE AGENDA Y REAGENDAMIENTO SEMANAL */}
          <AnimatePresence>
            {mostrarModalConflictos && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0A111F]/60 backdrop-blur-sm p-4 text-left">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="bg-[#FBF8F2] w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl md:rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100"
                >
                  <div className={`bg-[#0A111F] p-6 md:p-8 flex items-center justify-between shrink-0 shadow-sm relative z-10 transition-colors`}>
                    <div className="flex items-center gap-4 text-white">
                      <Users className="md:w-[36px] md:h-[36px] text-[#C9A24B]" size={28} />
                      <div>
                        <h2 className="text-xl md:text-2xl font-black uppercase italic leading-none tracking-tighter text-[#C9A24B]">Pacientes Pendientes</h2>
                        <p className={`text-white/80 text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] mt-1.5`}>
                          {citasConflictivas.length} citas detectadas el {reagendaProps.fecha}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setMostrarModalConflictos(false)} className={`p-2 md:p-3 text-slate-400 rounded-full transition-all backdrop-blur-md bg-white/10 hover:bg-red-500 hover:text-white`}>
                      <X size={20} />
                    </button>
                  </div>

                  <div className="p-4 md:p-8 overflow-y-auto bg-[#FBF8F2] flex-1 space-y-4 custom-scrollbar">
                    {citasConflictivas.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-center opacity-70">
                        <CheckCircle2 className="text-emerald-500 mb-4" size={48} />
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
                            <div key={cita.id} className="bg-white p-4 md:p-5 rounded-2xl md:rounded-[2rem] border border-slate-200 shadow-sm flex flex-col group transition-all">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
                                <div className="flex items-center gap-3 md:gap-5">
                                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-slate-50 text-slate-600 flex flex-col items-center justify-center border border-slate-100 shrink-0">
                                    <Clock className="mb-0.5 md:mb-1 opacity-50 md:w-[14px] md:h-[14px] text-[#C9A24B]" size={12} />
                                    <span className="text-[9px] md:text-[10px] font-black">{horaFomateada}</span>
                                  </div>
                                  <div>
                                    <h4 className="font-black text-xs md:text-sm text-[#0A111F] uppercase leading-none">{cita.pacientes?.nombre} {cita.pacientes?.apellido}</h4>
                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                      <span className="text-[8px] md:text-[9px] font-bold text-slate-500 tracking-widest bg-slate-50 px-2 py-1 rounded-md border border-slate-100 flex items-center gap-1 uppercase"><Clock className="text-[#C9A24B]" size={10} /> {durationStr}</span>
                                      <span className="text-[8px] md:text-[9px] font-bold text-slate-500 tracking-widest bg-slate-50 px-2 py-1 rounded-md border border-slate-100 uppercase">RUT: {cita.pacientes?.rut || 'S/R'}</span>
                                    </div>
                                  </div>
                                </div>

                                {!isEditing && (
                                  <div className="flex gap-2 self-start md:self-auto w-full md:w-auto">
                                    <button onClick={() => {
                                      const dInicio = new Date(cita.inicio); const dFin = new Date(cita.fin);
                                      const calcMins = Math.round((dFin.getTime() - dInicio.getTime()) / 60000);
                                      setReagendaProps(prev => ({...prev, duracion: calcMins > 0 ? calcMins : 45, especialistaId: reagendaProps.especialistaId, fecha: '', hora: ''}));
                                      setCitaEnEdicion(cita.id);
                                    }} className="flex-1 md:flex-none justify-center px-4 py-2.5 md:py-2 bg-[#C9A24B]/10 text-[#C9A24B] border border-[#C9A24B]/30 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-[#C9A24B] hover:text-white rounded-xl transition-all flex items-center gap-2" title="Reagendar">
                                      <CalendarClock size={14} /> Reagendar
                                    </button>
                                    <button onClick={() => anularCitaConflicto(cita.id)} className="p-2.5 md:p-3 bg-red-50 text-red-500 border border-red-100 hover:bg-red-500 hover:text-white rounded-xl transition-all flex items-center justify-center" title="Cancelar Cita">
                                      <Ban size={16} />
                                    </button>
                                  </div>
                                )}
                              </div>

                              <AnimatePresence>
                                {isEditing && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                    <div className="mt-4 md:mt-5 pt-4 md:pt-5 border-t border-slate-100 flex flex-col gap-4 md:gap-6">
                                      <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-center justify-between">
                                        <div className="flex gap-4 w-full md:w-auto flex-1">
                                          <div className="space-y-1.5 md:space-y-2 flex-1">
                                            <label className="text-[8px] md:text-[9px] font-black text-[#C9A24B] uppercase ml-2 flex items-center gap-1"><User size={12}/> Especialista</label>
                                            <select 
  className="w-full py-3 px-3 md:p-4 bg-white border border-[#C9A24B]/30 rounded-xl font-bold text-base md:text-xs outline-none text-[#0A111F] focus:border-[#C9A24B] appearance-none disabled:cursor-not-allowed disabled:bg-slate-50" 
  value={reagendaProps.especialistaId} 
  onChange={(e) => setReagendaProps(prev => ({...prev, especialistaId: e.target.value}))}
  disabled={!puedeVerAgendaCompleta}
>
  {profesionales
    .filter(p => puedeVerAgendaCompleta || p.user_id === usuarioLogueado)
    .map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)
  }
</select>
                                          </div>
                                        </div>
                                        <div className="bg-emerald-50 px-3 py-2.5 md:px-4 md:py-3 rounded-xl border border-emerald-100 self-end md:self-auto w-full md:w-auto text-center">
                                          <span className="text-[9px] md:text-[10px] font-black text-emerald-600 uppercase tracking-widest">Buscando de {reagendaProps.duracion} min</span>
                                        </div>
                                      </div>

                                      <div className="bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-200 flex flex-col shadow-inner">
                                        <div className="flex items-center justify-between mb-3 md:mb-4 bg-white p-1.5 md:p-2 rounded-lg md:rounded-xl shadow-sm border border-slate-100">
                                          <button onClick={() => setSemanaReagenda(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; })} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-[#0A111F] transition-all border border-transparent hover:border-slate-200"><ChevronLeft className="md:w-[18px] md:h-[18px]" size={16} /></button>
                                          <span className="text-[9px] md:text-[10px] font-black text-[#0A111F] uppercase tracking-widest">Sem. {semanaReagenda.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</span>
                                          <button onClick={() => setSemanaReagenda(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; })} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-[#0A111F] transition-all border border-transparent hover:border-slate-200"><ChevronRight className="md:w-[18px] md:h-[18px]" size={16} /></button>
                                        </div>

                                        <div className="flex gap-2 overflow-x-auto pb-4 custom-scrollbar">
                                          {cargandoSlots ? (
                                            <div className="w-full py-10 flex flex-col items-center justify-center text-slate-400 gap-2"><Loader2 className="animate-spin text-[#C9A24B]" size={24} /><span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest">Calculando...</span></div>
                                          ) : (
                                            dispoSemana.map((dia, idx) => {
                                              const nombreDia = dia.dateObj.toLocaleDateString('es-CL', { weekday: 'short' });
                                              const numDia = dia.dateObj.getDate();
                                              return (
                                                <div key={idx} className={`min-w-[100px] md:min-w-[110px] flex-1 bg-white border border-slate-200 rounded-xl md:rounded-2xl p-2 md:p-3 flex flex-col items-center shadow-sm`}>
                                                  <div className="text-center mb-2 md:mb-3 border-b border-slate-50 w-full pb-2"><span className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{nombreDia}</span><span className={`block text-base md:text-lg font-black text-[#0A111F]`}>{numDia}</span></div>
                                                  <div className="w-full flex-1 flex flex-col gap-1.5 md:gap-2 overflow-y-auto max-h-40 md:max-h-48 pr-1 custom-scrollbar">
                                                    {dia.status === 'bloqueado' && <span className="text-[8px] md:text-[9px] font-bold text-red-400 text-center py-4 italic">Bloqueado</span>}
                                                    {dia.status === 'sin_horario' && <span className="text-[8px] md:text-[9px] font-bold text-slate-300 text-center py-4 italic">Sin Horario</span>}
                                                    {dia.status === 'lleno' && <span className="text-[8px] md:text-[9px] font-bold text-amber-500 text-center py-4 italic">Lleno</span>}
                                                    {dia.status === 'limpio' && dia.slots.map((slot: string, sIdx: number) => {
                                                      const isSelected = reagendaProps.fecha === dia.date && reagendaProps.hora === slot;
                                                      return (
                                                        <button key={sIdx} onClick={() => setReagendaProps(prev => ({...prev, fecha: dia.date, hora: slot}))} className={`w-full py-1.5 md:py-2 rounded-md md:rounded-lg text-[9px] md:text-[10px] font-black transition-all border tracking-widest ${isSelected ? 'bg-emerald-500 text-white border-emerald-600 shadow-md shadow-emerald-500/30' : 'bg-slate-50 text-emerald-600 border-emerald-100 hover:bg-emerald-50 hover:border-emerald-200'}`}>{slot}</button>
                                                      )
                                                    })}
                                                  </div>
                                                </div>
                                              )
                                            })
                                          )}
                                        </div>
                                        
                                        <div className="mt-2 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 border-t border-slate-200 pt-3 md:pt-4 text-center md:text-left">
                                          <div className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto">
                                            Seleccionado: <span className={reagendaProps.hora ? "text-emerald-600 ml-1" : "text-red-400 ml-1"}>
                                              {reagendaProps.hora ? `${reagendaProps.fecha} a las ${reagendaProps.hora}` : "Ninguno"}
                                            </span>
                                          </div>
                                          <div className="flex w-full md:w-auto gap-2 md:gap-3">
                                            <button onClick={() => setCitaEnEdicion(null)} className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-[#0A111F] bg-white border border-slate-200 rounded-xl transition-all shadow-sm">Cancelar</button>
                                            <button onClick={() => reagendarCitaConflicto(cita.id)} disabled={guardandoConflicto || !reagendaProps.hora} className={`flex-1 md:flex-none px-4 md:px-8 py-2.5 md:py-3 text-white text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-xl shadow-md flex items-center justify-center gap-1.5 md:gap-2 transition-all ${reagendaProps.hora ? 'bg-[#0A111F] hover:bg-[#1a2538] active:scale-95' : 'bg-slate-300 cursor-not-allowed'}`}>
                                              {guardandoConflicto ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Confirmar
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

                  <div className="p-4 md:p-6 bg-white border-t border-slate-100 shrink-0 flex flex-col md:flex-row gap-3 text-left sticky bottom-0 z-20">
                    <button onClick={() => setMostrarModalConflictos(false)} className="w-full py-4 md:py-5 bg-[#0A111F] text-[#C9A24B] font-black text-[10px] md:text-[11px] uppercase tracking-widest rounded-xl md:rounded-[2rem] shadow-xl hover:bg-[#1a2538] transition-all">
                      Finalizar Revisión y Cerrar Panel
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* MODAL DE AGENDAMIENTO (REUTILIZADO) */}
          <AnimatePresence>
            {modalAbierto && (
              <div className="fixed inset-0 z-[1000] flex items-center justify-center p-0 md:p-4 bg-[#0A111F]/60 backdrop-blur-sm pt-8 md:pt-4">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 20 }}
                  className="bg-white w-full max-w-7xl h-full md:h-[85vh] rounded-t-2xl md:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden text-left"
                >
                  <div className="px-4 md:px-10 py-4 md:py-8 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white">
                    <div className="flex items-center gap-3 md:gap-5">
                      <div className={`p-2.5 md:p-4 rounded-xl md:rounded-2xl shadow-sm ${citaEnReprogramacion ? 'bg-[#C9A24B]/10 text-[#C9A24B] border border-[#C9A24B]/30' : 'bg-[#0A111F] text-[#C9A24B] shadow-lg'}`}>
                        <CalendarDays className="w-[20px] h-[20px] md:w-[24px] md:h-[24px]" />
                      </div>
                      <div>
                        <h2 className="text-lg md:text-2xl font-black uppercase tracking-tighter text-[#0A111F] leading-none italic">
                          {citaEnReprogramacion ? 'Reagendar Cita' : 'Nueva Reserva'}
                        </h2>
                        <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-1 md:mt-2">Doctor/a seleccionado/a</p>
                      </div>
                    </div>
                    <button onClick={() => { setModalAbierto(false); setCitaEnReprogramacion(null); }} className="p-2 md:p-3 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-full transition-colors">
                      <X className="w-[20px] h-[20px] md:w-[24px] md:h-[24px]" />
                    </button>
                  </div>

                  <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
                    {paso === 1 ? (
                      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white text-slate-900 text-left">
                        <div className="w-full md:w-1/2 border-r border-slate-100 p-6 md:p-12 bg-slate-50 overflow-y-auto space-y-4 md:space-y-6 custom-scrollbar text-left flex-1">
                          <h3 className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-2 md:mb-6 flex items-center gap-2 md:gap-3"><Timer className="md:w-[18px] md:h-[18px] text-[#C9A24B]" size={16} /> Ajuste de Tiempos</h3>
                          
                          {/* 🔥 INICIO BLOQUE: Selector Avanzado vs Selector Simple 🔥 */}
                          {citaEnReprogramacion ? (
                              <div className="flex flex-col gap-4">
                                  {/* SELECTOR DE DOCTOR Y DURACION */}
                                  <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-center justify-between bg-white p-3 md:p-4 rounded-2xl border border-slate-100 shadow-sm">
                                      <div className="flex-1 w-full">
                                          <label className="text-[8px] md:text-[9px] font-black text-[#C9A24B] uppercase ml-2 flex items-center gap-1"><User size={12}/> Especialista</label>
                                          <select 
  className="w-full mt-1 py-3 px-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-base md:text-xs outline-none text-[#0A111F] focus:border-[#C9A24B] appearance-none disabled:cursor-not-allowed disabled:opacity-80" 
  value={reagendaProps.especialistaId} 
  onChange={(e) => {
      setReagendaProps(prev => ({...prev, especialistaId: e.target.value}));
      setFiltro(prev => ({...prev, profesional_id: e.target.value}));
      setHorasSeleccionadas([{ ...horasSeleccionadas[0], fecha: '', hora: '' }]); // Limpiar al cambiar doctor
  }}
  disabled={!puedeVerAgendaCompleta}
>
  {profesionales
    .filter(p => puedeVerAgendaCompleta || p.user_id === usuarioLogueado)
    .map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)
  }
</select>
                                      </div>
                                      <div className="w-full md:w-auto">
                                          <label className="text-[8px] md:text-[9px] font-black text-[#C9A24B] uppercase ml-2 flex items-center gap-1"><Timer size={12}/> Duración</label>
                                          <select
                                              className="w-full mt-1 py-3 px-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-base md:text-xs outline-none text-[#0A111F] focus:border-[#C9A24B] appearance-none"
                                              value={reagendaProps.duracion}
                                              onChange={(e) => {
                                                  const newDur = Number(e.target.value);
                                                  setReagendaProps(prev => ({...prev, duracion: newDur}));
                                                  setHorasSeleccionadas([{ ...horasSeleccionadas[0], duracion: newDur, fecha: '', hora: '' }]); // Limpiar selección de hora por si choca
                                              }}
                                          >
                                              {duracionesDisponibles.map(d => <option key={d} value={d}>{d} mins</option>)}
                                          </select>
                                      </div>
                                  </div>

                                  {/* CALENDARIO Y BLOQUES VISUALES */}
                                  <div className="bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-200 flex flex-col shadow-inner">
                                      <div className="flex items-center justify-between mb-3 md:mb-4 bg-white p-1.5 md:p-2 rounded-lg md:rounded-xl shadow-sm border border-slate-100">
                                          <button onClick={() => setSemanaReagenda(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; })} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-[#0A111F] transition-all border border-transparent hover:border-slate-200"><ChevronLeft size={16} /></button>
                                          <span className="text-[9px] md:text-[10px] font-black text-[#0A111F] uppercase tracking-widest">Sem. {semanaReagenda.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</span>
                                          <button onClick={() => setSemanaReagenda(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; })} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-[#0A111F] transition-all border border-transparent hover:border-slate-200"><ChevronRight size={16} /></button>
                                      </div>

                                      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                          {cargandoSlots ? (
                                              <div className="w-full py-10 flex flex-col items-center justify-center text-slate-400 gap-2"><Loader2 className="animate-spin text-[#C9A24B]" size={24} /><span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest">Calculando...</span></div>
                                          ) : (
                                              dispoSemana.map((dia, idx) => {
                                                  const nombreDia = dia.dateObj.toLocaleDateString('es-CL', { weekday: 'short' });
                                                  const numDia = dia.dateObj.getDate();
                                                  return (
                                                      <div key={idx} className={`min-w-[100px] md:min-w-[110px] flex-1 bg-white border border-slate-200 rounded-xl md:rounded-2xl p-2 md:p-3 flex flex-col items-center shadow-sm`}>
                                                          <div className="text-center mb-2 md:mb-3 border-b border-slate-50 w-full pb-2"><span className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{nombreDia}</span><span className={`block text-base md:text-lg font-black text-[#0A111F]`}>{numDia}</span></div>
                                                          <div className="w-full flex-1 flex flex-col gap-1.5 md:gap-2 overflow-y-auto max-h-40 md:max-h-48 pr-1 custom-scrollbar">
                                                              {dia.status === 'bloqueado' && <span className="text-[8px] md:text-[9px] font-bold text-red-400 text-center py-4 italic">Bloqueado</span>}
                                                              {dia.status === 'sin_horario' && <span className="text-[8px] md:text-[9px] font-bold text-slate-300 text-center py-4 italic">Sin Horario</span>}
                                                              {dia.status === 'lleno' && <span className="text-[8px] md:text-[9px] font-bold text-amber-500 text-center py-4 italic">Lleno</span>}
                                                              {dia.status === 'limpio' && dia.slots.map((slot: string, sIdx: number) => {
                                                                  const isSelected = horasSeleccionadas[0]?.fecha === dia.date && horasSeleccionadas[0]?.hora === slot;
                                                                  return (
                                                                      <button key={sIdx} onClick={() => {
                                                                          setHorasSeleccionadas([{ fecha: dia.date, hora: slot, duracion: reagendaProps.duracion }]);
                                                                      }} className={`w-full py-1.5 md:py-2 rounded-md md:rounded-lg text-[9px] md:text-[10px] font-black transition-all border tracking-widest ${isSelected ? 'bg-emerald-500 text-white border-emerald-600 shadow-md shadow-emerald-500/30' : 'bg-slate-50 text-emerald-600 border-emerald-100 hover:bg-emerald-50 hover:border-emerald-200'}`}>{slot}</button>
                                                                  )
                                                              })}
                                                          </div>
                                                      </div>
                                                  )
                                              })
                                          )}
                                      </div>
                                      
                                      <div className="mt-2 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 border-t border-slate-200 pt-3 md:pt-4 text-center md:text-left">
                                          <div className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm w-full">
                                              Seleccionado: <span className={horasSeleccionadas[0]?.hora ? "text-emerald-600 ml-1" : "text-red-400 ml-1"}>
                                                  {horasSeleccionadas[0]?.hora ? `${horasSeleccionadas[0].fecha} a las ${horasSeleccionadas[0].hora} hrs` : "Selecciona un horario libre arriba"}
                                              </span>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          ) : (
                              <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                                  <div>
                                    <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest">{horasSeleccionadas[0]?.fecha}</p>
                                    <p className="text-xl md:text-2xl font-black text-[#0A111F] tracking-tighter mt-0.5 md:mt-1 leading-none">{horasSeleccionadas[0]?.hora} <span className="text-[10px] text-slate-400 font-bold">hrs</span></p>
                                  </div>
                                  <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <select
                                      className="flex-1 sm:flex-none p-4 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl text-base md:text-xs font-bold uppercase outline-none focus:border-[#C9A24B] transition-all cursor-pointer text-slate-700 appearance-none shadow-sm"
                                      value={horasSeleccionadas[0]?.duracion || 15}
                                      onChange={(e) => {
                                        const newDur = Number(e.target.value);
                                        const fecha = horasSeleccionadas[0].fecha;
                                        const hora = horasSeleccionadas[0].hora;
                                        if (!esHorarioLaboral(filtro.profesional_id, fecha, hora, newDur)) return toast.error(`La duración excede el horario del médico.`);
                                        if (esCitaOcupada(filtro.profesional_id, fecha, hora, newDur)) return toast.error(`La nueva duración choca con otra cita.`);
                                        
                                        const nuevas = [{ fecha, hora, duracion: newDur }]; 
                                        setHorasSeleccionadas(nuevas);
                                        setFiltro(prev => ({...prev, duracionDefault: newDur}));
                                      }}
                                    >
                                      {duracionesDisponibles.map(d => <option key={d} value={d}>{d} mins</option>)}
                                    </select>
                                  </div>
                              </div>
                          )}
                          {/* 🔥 FIN BLOQUE 🔥 */}

                        </div>
                        
                        <div className="w-full md:w-1/2 p-6 md:p-12 overflow-y-auto bg-white flex flex-col items-center justify-center text-center opacity-50 hidden md:flex">
                           <CalendarClock className="text-slate-300 mb-4" size={64} />
                           <p className="font-black uppercase tracking-widest text-slate-400">Paso 1 Completado</p>
                           <p className="text-xs font-bold text-slate-400 mt-2 max-w-xs mx-auto">Haz clic en continuar para asignar el paciente y motivo de la cita en este horario.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white">
                        {/* LÓGICA DE PACIENTE */}
                        <div className="w-full md:w-1/2 border-r border-slate-100 p-5 md:p-12 overflow-y-auto space-y-6 md:space-y-10 custom-scrollbar text-left bg-slate-50/50">
                            <div className="space-y-4 md:space-y-6">
                              <h3 className="text-[11px] md:text-xs font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2"><User className="text-[#C9A24B]" size={16} /> Paciente</h3>
                              {citaEnReprogramacion ? (
                                <div className="p-5 md:p-6 rounded-2xl md:rounded-[2rem] bg-[#C9A24B]/10 border border-[#C9A24B]/30 flex items-center justify-between shadow-sm">
                                  <div>
                                    <p className="text-base md:text-lg font-black uppercase text-[#8A6D2F] tracking-tighter leading-tight">{citaEnReprogramacion.pacientes?.nombre} {citaEnReprogramacion.pacientes?.apellido}</p>
                                    <p className="text-[9px] md:text-xs font-bold text-[#C9A24B] tracking-widest mt-1">RUT: {citaEnReprogramacion.pacientes?.rut}</p>
                                  </div>
                                  <RefreshCcw className="text-[#C9A24B] shrink-0 md:w-[24px] md:h-[24px]" size={20} />
                                </div>
                              ) : (
                                <div className="space-y-4 md:space-y-5">
                                  {modoNuevoPaciente ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 bg-white p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm">
                                      <input placeholder="Nombre" className="p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl text-base md:text-xs font-bold uppercase outline-none focus:border-[#C9A24B] transition-all placeholder:text-slate-500 text-slate-800" value={nuevoPaciente.nombre} onChange={e => setNuevoPaciente(prev => ({ ...prev, nombre: e.target.value }))} />
                                      <input placeholder="Apellido" className="p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl text-base md:text-xs font-bold uppercase outline-none focus:border-[#C9A24B] transition-all placeholder:text-slate-500 text-slate-800" value={nuevoPaciente.apellido} onChange={e => setNuevoPaciente(prev => ({ ...prev, apellido: e.target.value }))} />
                                      
                                      <div className="md:col-span-2 flex items-center gap-2 mt-1 md:mt-2">
                                          <input 
                                              type="checkbox" 
                                              id="otro_documento_semana" 
                                              className="w-4 h-4 accent-[#C9A24B]"
                                              checked={esOtroDocumento}
                                              onChange={(e) => {
                                                  setEsOtroDocumento(e.target.checked);
                                                  setNuevoPaciente(prev => ({...prev, rut: ''}));
                                              }}
                                          />
                                          <label htmlFor="otro_documento_semana" className="text-xs font-bold text-slate-600 cursor-pointer pl-1">
                                              Paciente extranjero / Usar otro documento
                                          </label>
                                      </div>

                                      <div className="md:col-span-2">
                                          <input 
                                              placeholder={esOtroDocumento ? "N° de Pasaporte o Identificación (Opcional)" : "RUT (sin puntos, con guión)"} 
                                              className="w-full p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl text-base md:text-xs font-bold uppercase outline-none focus:border-[#C9A24B] transition-all placeholder:text-slate-500 text-slate-800" 
                                              value={nuevoPaciente.rut} 
                                              onChange={e => setNuevoPaciente(prev => ({...prev, rut: e.target.value}))}
                                          />
                                      </div>

                                      <input placeholder="Teléfono" className="p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl text-base md:text-xs font-bold uppercase outline-none focus:border-[#C9A24B] transition-all placeholder:text-slate-500 text-slate-800" value={nuevoPaciente.telefono} onChange={e => setNuevoPaciente(prev => ({ ...prev, telefono: e.target.value }))} />
                                      
                                      <div className="space-y-1">
                                          <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Fecha Nac.</label>
                                          <input 
                                              type="date" 
                                              className="w-full p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl text-base md:text-xs font-bold uppercase outline-none focus:border-[#C9A24B] transition-all" 
                                              value={nuevoPaciente.fecha_nacimiento} 
                                              onChange={e => setNuevoPaciente(prev => ({...prev, fecha_nacimiento: e.target.value}))}
                                          />
                                      </div>

                                      <div className="space-y-1 md:col-span-2">
                                          <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Sexo</label>
                                          <select 
                                              className="w-full p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl text-base md:text-xs font-bold uppercase outline-none focus:border-[#C9A24B] transition-all appearance-none"
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
                                    <div className="space-y-3 md:space-y-4">
                                      <div className="relative group">
                                        <Search className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#C9A24B] md:w-[20px] md:h-[20px]" size={18} />
                                        <input
                                          placeholder="Buscar Nombre o RUT..."
                                          className="w-full pl-10 md:pl-12 pr-4 md:pr-5 py-3 md:py-4 bg-white border border-slate-200 rounded-xl md:rounded-[2rem] text-base md:text-xs font-bold uppercase outline-none focus:border-[#C9A24B] shadow-sm transition-all placeholder:normal-case placeholder:text-slate-500 text-slate-800"
                                          value={busquedaPac}
                                          onChange={e => { setBusquedaPac(e.target.value); buscarPacientes(e.target.value); }}
                                        />
                                      </div>
                                      {pacientesEncontrados.map(p => (
                                        <button
                                          key={p.id}
                                          onClick={() => seleccionarPacienteExistente(p)}
                                          className="w-full p-4 md:p-5 rounded-xl md:rounded-[2rem] bg-white border border-slate-100 hover:border-[#C9A24B] hover:shadow-md transition-all flex items-center justify-between group"
                                        >
                                          <div className="text-left">
                                            <p className="font-black text-xs md:text-sm uppercase text-[#0A111F] tracking-tighter">{p.nombre} {p.apellido}</p>
                                            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 tracking-widest mt-1">{p.rut}</p>
                                          </div>
                                          <ChevronRight className="text-slate-300 group-hover:text-[#C9A24B] group-hover:translate-x-1 transition-all w-[16px] h-[16px] md:w-[20px] md:h-[20px]" />
                                        </button>
                                      ))}
                                      {pacienteSeleccionado && pacientesEncontrados.length === 0 && (
                                        <div className="p-4 md:p-6 rounded-xl md:rounded-[2rem] border border-[#C9A24B]/30 bg-[#C9A24B]/10 flex items-center justify-between shadow-sm">
                                          <p className="font-black text-sm md:text-lg uppercase text-[#8A6D2F] tracking-tighter leading-tight">{pacienteSeleccionado.nombre} {pacienteSeleccionado.apellido}</p>
                                          <CheckCircle2 className="text-[#C9A24B] shrink-0 md:w-[24px] md:h-[24px]" size={20} />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                        </div>
                        
                        <div className="w-full md:w-1/2 p-5 md:p-12 overflow-y-auto bg-white flex flex-col justify-center">
                            {(pacienteSeleccionado || modoNuevoPaciente) ? (
                              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 md:p-8 bg-[#0A111F] rounded-2xl md:rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden mt-4 md:mt-0">
                                <div className="absolute top-0 right-0 p-4 md:p-6 opacity-[0.03] pointer-events-none"><Briefcase className="md:w-[120px] md:h-[120px]" size={80} /></div>
                                <h4 className="text-[9px] md:text-[10px] font-black uppercase text-[#C9A24B] mb-4 md:mb-6 tracking-[0.2em] relative z-10 flex items-center gap-2"><Briefcase size={14}/> Motivo / Tratamiento</h4>
                                {!modoNuevoPaciente && tratamientosPaciente.length > 0 ? (
                                  <div className="space-y-3 md:space-y-4 relative z-10">
                                    <select
                                      className="w-full p-3 md:p-4 bg-white/10 rounded-xl md:rounded-2xl text-base md:text-xs font-bold uppercase outline-none border border-white/10 focus:border-[#C9A24B] text-white cursor-pointer transition-all appearance-none"
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
                                        className="w-full p-3 md:p-4 bg-white/10 rounded-xl md:rounded-2xl text-base md:text-xs font-bold uppercase outline-none border border-white/10 focus:border-[#C9A24B] text-white mt-2 transition-all placeholder:normal-case placeholder:text-white/40"
                                        value={nuevoTratamientoNombre}
                                        onChange={(e) => setNuevoTratamientoNombre(e.target.value)}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <input
                                    placeholder="Ej: Urgencia..."
                                    className="w-full p-3 md:p-4 bg-white/10 rounded-xl md:rounded-2xl text-base md:text-xs font-bold uppercase outline-none border border-white/10 focus:border-[#C9A24B] text-white relative z-10 transition-all placeholder:normal-case placeholder:text-white/40"
                                    value={nuevoTratamientoNombre}
                                    onChange={(e) => setNuevoTratamientoNombre(e.target.value)}
                                  />
                                )}
                              </motion.div>
                            ) : (
                              <div className="text-center opacity-40 py-10 hidden md:block">
                                 <User className="text-slate-300 mx-auto mb-4" size={64} />
                                 <p className="font-black uppercase tracking-widest text-slate-400">Paso 2</p>
                                 <p className="text-xs font-bold text-slate-400 mt-2 max-w-xs mx-auto">Selecciona o registra un paciente para continuar.</p>
                              </div>
                            )}
                        </div>

                      </div>
                    )}
                  </div>

                  {/* Pie del modal sticky */}
                  <div className="px-5 md:px-10 py-4 md:py-6 border-t border-slate-100 bg-white flex flex-col sm:flex-row justify-between items-center gap-3 md:gap-4 shrink-0 sticky bottom-0 z-20">
                    <div className="flex items-center gap-3 md:gap-4 w-full sm:w-auto">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-[#0A111F] flex items-center justify-center text-[#C9A24B] font-black border border-slate-200 shadow-md text-base md:text-lg shrink-0">{horasSeleccionadas.length}</div>
                      <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Turnos<br />Seleccionados</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 md:gap-4 items-center w-full sm:w-auto">
                      {paso === 2 && (
                        <button
                          onClick={() => { setModoNuevoPaciente(!modoNuevoPaciente); setPacienteSeleccionado(null); setBusquedaPac(''); setEsOtroDocumento(false); }}
                          className="text-[10px] md:text-[10px] py-1 md:py-0 font-black text-[#C9A24B] uppercase underline hover:text-[#8A6D2F] transition-colors md:mr-2 whitespace-nowrap text-center sm:text-left w-full sm:w-auto"
                        >
                          {!citaEnReprogramacion && (modoNuevoPaciente ? 'Buscar Existente' : '+ Registrar Nuevo Paciente')}
                        </button>
                      )}
                      {paso === 2 && (
                        <button onClick={() => setPaso(1)} className="w-full sm:w-auto px-6 md:px-8 py-3.5 md:py-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-[2rem] text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 shadow-sm transition-all text-center">
                          Volver
                        </button>
                      )}
                      <button
                        disabled={cargandoAccion || horasSeleccionadas.length === 0 || !horasSeleccionadas[0]?.hora || (paso === 2 && !modoNuevoPaciente && !pacienteSeleccionado)}
                        onClick={() => { if (paso === 1) setPaso(2); else handleGuardar(); }}
                        className={`w-full sm:w-auto px-8 md:px-10 py-3.5 md:py-4 rounded-xl md:rounded-[2rem] text-[10px] md:text-xs font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 whitespace-nowrap flex items-center justify-center gap-2 ${(citaEnReprogramacion && horasSeleccionadas[0]?.hora) ? 'bg-[#0A111F] hover:bg-[#1a2538] shadow-[#0A111F]/30' : (!horasSeleccionadas[0]?.hora ? 'bg-slate-300 cursor-not-allowed text-slate-500' : 'bg-[#C9A24B] hover:bg-[#8A6D2F] shadow-[#C9A24B]/30')}`}
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
              <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-[#0A111F]/80 backdrop-blur-sm">
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-sm">
                  <div className="bg-white rounded-[2.5rem] md:rounded-[3rem] shadow-2xl p-8 md:p-10 text-center space-y-6 md:space-y-8 border border-[#C9A24B]/20">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto border border-emerald-100 shadow-inner">
                      <CheckCircle2 className="text-emerald-500 w-[40px] h-[40px] md:w-[48px] md:h-[48px]" size={40} />
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-[#0A111F] italic">¡Cita Lista!</h2>
                    <div className="text-left bg-[#FBF8F2] p-5 md:p-6 rounded-2xl md:rounded-3xl border border-slate-200 space-y-4 shadow-sm">
                      <div>
                        <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Paciente</p>
                        <p className="font-black text-sm md:text-base text-[#0A111F] uppercase mt-1 leading-tight md:leading-none">{citaConfirmadaData?.paciente}</p>
                      </div>
                      <div>
                        <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Fecha y Hora</p>
                        <p className="font-black text-sm md:text-base text-[#C9A24B] uppercase mt-1 leading-tight md:leading-none">{citaConfirmadaData?.citas[0]?.fecha} • {citaConfirmadaData?.citas[0]?.hora} hrs</p>
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
                          setMostrarTicket(false); setModalAbierto(false); resetEstados(); fetchDatosDia();
                        }}
                        className="w-full py-4 bg-[#0A111F] rounded-xl md:rounded-2xl font-black text-[10px] md:text-[10px] uppercase tracking-widest text-[#C9A24B] shadow-xl shadow-[#0A111F]/20 hover:bg-[#1a2538] transition-all flex items-center justify-center gap-2"
                      >
                        <MessageCircle className="w-[14px] h-[14px] md:w-[14px] md:h-[14px]" size={14} /> Enviar Confirmación (WSP)
                      </button>
                      <button onClick={() => { setMostrarTicket(false); setModalAbierto(false); resetEstados(); fetchDatosDia(); }} className="w-full py-3.5 md:py-3 bg-white text-slate-500 border border-slate-200 rounded-xl md:rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">Finalizar</button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>,
        portalNode
      ) : null}

    </main>
  );
}

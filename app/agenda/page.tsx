'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { 
  X, Search, ChevronLeft, ChevronRight, Loader2, Clock, 
  CalendarDays, Timer, UserCheck, Trash2, Activity, ClipboardList, 
  CheckCircle2, Plus, Calendar as CalendarIcon, Briefcase, 
  AlertTriangle, Phone, Mail, MessageCircle, Ban, RefreshCcw, ChevronDown, CalendarClock,
  Coins, ReceiptText, Stethoscope,Users, User, ChevronRight as ChevronRightIcon, LayoutGrid, List, Lock, FileText, Send, ArrowDown, Save, File, Link as LinkIcon,
  MessageSquareText, Globe, Star, BellRing, Printer, HeartPulse, CalendarPlus
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner' 
import Link from 'next/link'

const ESTADOS_CITA: Record<string, { label: string, bg: string, border: string, text: string, dot: string, circleText: string, icon: any }> = {
  programada: { label: 'No Conf.', bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-700', dot: 'bg-slate-400', circleText: 'text-slate-600', icon: <Clock size={14}/> },
  confirmado_tel: { label: 'Confirmado', bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-white', dot: 'bg-white', circleText: 'text-blue-600', icon: <Phone size={14}/> },
  en_espera: { label: 'En Espera', bg: 'bg-amber-400', border: 'border-amber-500', text: 'text-amber-950', dot: 'bg-amber-900', circleText: 'text-amber-600', icon: <Timer size={14}/> },
  atendiendose: { label: 'En Box', bg: 'bg-fuchsia-500', border: 'border-fuchsia-600', text: 'text-white', dot: 'bg-white', circleText: 'text-fuchsia-600', icon: <Activity size={14}/> },
  atendido: { label: 'Atendido', bg: 'bg-emerald-400', border: 'border-emerald-500', text: 'text-emerald-950', dot: 'bg-emerald-900', circleText: 'text-emerald-600', icon: <CheckCircle2 size={14}/> },
  no_asiste: { label: 'No Asistió', bg: 'bg-rose-500', border: 'border-rose-600', text: 'text-white', dot: 'bg-white', circleText: 'text-rose-600', icon: <Ban size={14}/> },
  cancelada: { label: 'Anulada', bg: 'bg-neutral-300', border: 'border-neutral-400', text: 'text-neutral-700', dot: 'bg-neutral-500', circleText: 'text-neutral-600', icon: <Trash2 size={14}/> },
  reprogramada: { label: 'Reprogramada', bg: 'bg-violet-500', border: 'border-violet-600', text: 'text-white', dot: 'bg-white', circleText: 'text-violet-600', icon: <RefreshCcw size={14}/> }
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

interface NuevoPaciente { nombre: string; apellido: string; rut: string; telefono: string; fecha_nacimiento: string; sexo: string; }

const getDiasLunesSabado = (d: Date) => { const curr = new Date(d); const day = curr.getDay(); const diff = curr.getDate() - day + (day === 0 ? -6 : 1); return Array.from({ length: 6 }, (_, i) => new Date(curr.getFullYear(), curr.getMonth(), diff + i)); }
const getInitials = (n: string, a: string) => `${n?.charAt(0) || ''}${a?.charAt(0) || ''}`.toUpperCase();

const formatNombreDoctor = (nombre: string = '', apellido: string = '') => {
  if (!nombre && !apellido) return 'S/A';
  const primerNombre = nombre.trim().split(' ')[0] || '';
  const apellidosArr = apellido.trim().split(' ');
  // Toma las últimas 2 palabras del string de apellidos (o todo si hay menos)
  const dosApellidos = apellidosArr.slice(-2).join(' ');
  return `${primerNombre} ${dosApellidos}`.trim();
};

const getAvatarColorClass = (name: string) => {
  const styles = [{ bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-500' }, { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-500' }, { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-500' }, { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-500' }, { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-500' }];
  let hash = 0; for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash); return styles[Math.abs(hash) % styles.length];
}
const getLocalDateISO = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const tToMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
const minsToT = (m: number) => { const h = Math.floor(m / 60).toString().padStart(2, '0'); const min = (m % 60).toString().padStart(2, '0'); return `${h}:${min}`; }
const getMinsFromDateStr = (dtString: string) => { const timePart = dtString.includes('T') ? dtString.split('T')[1] : dtString.split(' ')[1]; return tToMins(timePart.substring(0,5)); }
const getLunes = (d: Date) => { const date = new Date(d); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); date.setHours(0,0,0,0); return date; }

// 🕒 Las columnas inicio/fin/hora_llegada son "timestamp without time zone" (hora local de la clínica).
// Leemos la hora directo del string para que no dependa de la zona horaria del navegador.
const horaDeStr = (dt?: string | null) => {
  if (!dt) return '';
  const t = dt.replace(' ', 'T').split('T')[1] || '';
  return t.substring(0, 5);
};
const fechaLocalDeStr = (dt: string) => new Date(dt.replace(' ', 'T').split('T')[0] + 'T00:00:00');

// 📱 Normaliza teléfonos chilenos para WhatsApp (9 dígitos → 56XXXXXXXXX; 8 dígitos antiguos → 569XXXXXXXX)
const telefonoWA = (tel?: string | null): string | null => {
  if (!tel) return null;
  const n = String(tel).replace(/\D/g, '');
  if (!n) return null;
  if (n.length === 9) return `56${n}`;
  if (n.length === 8) return `569${n}`;
  return n;
};
const abrirWhatsApp = (tel: string | null | undefined, mensaje?: string) => {
  const num = telefonoWA(tel);
  if (!num) { toast.error('El paciente no tiene un teléfono válido registrado'); return false; }
  const url = mensaje ? `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}` : `https://wa.me/${num}`;
  window.open(url, '_blank');
  return true;
};

const normalizarTexto = (s?: string | null) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// 🦷 Procedimientos que requieren control posterior (se busca en el motivo de la cita)
const PROCEDIMIENTOS_CON_CONTROL = ['EXTRAC', 'EXODONCIA', 'ENDODONCIA', 'CIRUGIA', 'IMPLANTE', 'INJERTO', 'FRENECTOMIA', 'TERCEROS MOLARES', 'CORDAL', 'GINGIVECTOMIA', 'DESTARTRAJE SUBGINGIVAL'];
const DIAS_HASTA_CONTROL = 7;
const DURACION_CONTROL = 15;
const requiereControl = (motivo?: string | null) => {
  const m = normalizarTexto(motivo);
  if (!m || m.startsWith('CONTROL')) return false;
  return PROCEDIMIENTOS_CON_CONTROL.some(p => m.includes(p));
};

// ⚠️ Palabras que se destacan como alerta médica en la hoja de ruta
const PALABRAS_ALERTA = ['ALERG', 'ANTICOAG', 'SINTROM', 'NEOSINTROM', 'WARFARIN', 'ASPIRINA', 'CLOPIDOGREL', 'DIABET', 'HIPERTENS', 'EMBARAZ', 'CARDI', 'MARCAPASO', 'EPILEP', 'CONVULS', 'ASMA', 'VIH', 'HEPATIT', 'BIFOSFONAT', 'HEMOFIL', 'RADIOTERAP', 'QUIMIOTERAP', 'INFARTO', 'TRASPLANT', 'RENAL'];
const esAlertaMedica = (txt?: string | null) => {
  const t = normalizarTexto(txt);
  return !!t && PALABRAS_ALERTA.some(p => t.includes(p));
};

const calcularEdad = (fechaNac?: string | null) => {
  if (!fechaNac) return null;
  const n = new Date(fechaNac + 'T00:00:00'); const h = new Date();
  let e = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
  return e >= 0 && e < 130 ? e : null;
};

const escapeHtml = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export default function AgendaPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [vistaAgenda, setVistaAgenda] = useState<'dia' | 'semana'>('dia')
  const [citasDia, setCitasDia] = useState<any[]>([])
  const [profesionales, setProfesionales] = useState<any[]>([])
  const [cargandoPagina, setCargandoPagina] = useState(true)
  const [cambiandoFecha, setCambioFecha] = useState(false)
  const [filtroEspecialista, setFiltroEspecialista] = useState('Todos')
  const [citaEnReprogramacion, setCitaEnReprogramacion] = useState<any>(null)
  const [notificacion, setNotificacion] = useState<{ nombre: string } | null>(null)
  const [usuarioLogueado, setUsuarioLogueado] = useState<string | null>(null)
  const [userRol, setUserRol] = useState<string>('') 
  const [usuariosMap, setUsuariosMap] = useState<Record<string, string>>({});
  const puedeVerFinanzas = ['ADMIN', 'RECEPCIONISTA'].includes(userRol);
  const puedeVerAgendaCompleta = ['ADMIN', 'RECEPCIONISTA', 'ASISTENTE'].includes(userRol);

  const [busquedaAgenda, setBusquedaAgenda] = useState('')
  const [anuladasCount, setAnuladasCount] = useState(0);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [citasAnuladas, setCitasAnuladas] = useState<any[]>([]);
  const [modalAnuladasAbierto, setModalAnuladasAbierto] = useState(false);
  const [realtimeTrigger, setRealtimeTrigger] = useState(0);
  const [modalOnlineAbierto, setModalOnlineAbierto] = useState(false);
  const [citasOnlinePendientes, setCitasOnlinePendientes] = useState<any[]>([]);

  // 🔔 Recordatorios en lote
  const [modalRecordatorios, setModalRecordatorios] = useState(false);
  const [fechaRecordatorio, setFechaRecordatorio] = useState('');
  const [recordatorios, setRecordatorios] = useState<any[]>([]);
  const [cargandoRecordatorios, setCargandoRecordatorios] = useState(false);

  // 🔎 Buscar próxima hora libre
  const [modalBuscarHora, setModalBuscarHora] = useState(false);
  const [buscarHoraFiltro, setBuscarHoraFiltro] = useState({ profesional: 'Todos', duracion: 30, turno: 'cualquiera' as 'cualquiera' | 'manana' | 'tarde', desde: '' });
  const [huecosEncontrados, setHuecosEncontrados] = useState<any[]>([]);
  const [huecosLimite, setHuecosLimite] = useState(5);
  const [buscandoHuecos, setBuscandoHuecos] = useState(false);

  // 📋 Hoja de ruta del doctor
  const [modalHojaRuta, setModalHojaRuta] = useState(false);
  const [hojaRutaFecha, setHojaRutaFecha] = useState('');
  const [hojaRutaProfesional, setHojaRutaProfesional] = useState('Todos');
  const [hojaRutaData, setHojaRutaData] = useState<any[]>([]);
  const [cargandoHojaRuta, setCargandoHojaRuta] = useState(false);

  // Día destacado en el modal de agendar (ej: control sugerido a 7 días)
  const [diaSugerido, setDiaSugerido] = useState<string | null>(null);

  // Refs de control (evitan respuestas desordenadas, timers sueltos y búsquedas excesivas)
  const fetchSeq = useRef(0);
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busquedaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busquedaSeq = useRef(0);

  const hoyISO = getLocalDateISO(new Date());
  const esHoySeleccionado = getLocalDateISO(selectedDate) === hoyISO;

  const citasFiltradas = useMemo(() => {
    if (!busquedaAgenda.trim()) return citasDia;
    const term = busquedaAgenda.toLowerCase().trim();
    return citasDia.filter(c => {
       const nombreCompleto = `${c.pacientes?.nombre} ${c.pacientes?.apellido}`.toLowerCase();
       const rut = c.pacientes?.rut?.toLowerCase() || '';
       return nombreCompleto.includes(term) || rut.includes(term);
    });
  }, [citasDia, busquedaAgenda]);

  const [modalAbierto, setModalAbierto] = useState(false)
  const [paso, setPaso] = useState(1) 
  const [semanaInicio, setSemanaInicio] = useState(new Date())
  const [filtro, setFiltro] = useState({ profesional_id: '', box_id: 1, duracionDefault: 30 })
  const [horasSeleccionadas, setHorasSeleccionadas] = useState<{fecha: string, hora: string, duracion: number}[]>([])
  const [horariosConfigurados, setHorariosConfigurados] = useState<any[]>([])
  const [citasOcupadas, setCitasOcupadas] = useState<any[]>([])
  const [bloqueosSemana, setBloqueosSemana] = useState<any[]>([]) 

  const [modalHuerfanasAbierto, setModalHuerfanasAbierto] = useState(false)
  const [citasHuerfanas, setCitasHuerfanas] = useState<any[]>([])
  const [cargandoHuerfanas, setCargandoHuerfanas] = useState(false)
  const [citaEnEdicion, setCitaEnEdicion] = useState<string | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [nuevaHora, setNuevaHora] = useState('');
  const [nuevoEspecialista, setNuevoEspecialista] = useState('');
  const [duracionCitaEdicion, setDuracionCitaEdicion] = useState(45);
  const [semanaInicioEdicion, setSemanaInicioEdicion] = useState<Date>(getLunes(new Date()));
  const [dispoSemanaEdicion, setDispoSemanaEdicion] = useState<any[]>([]);
  const [cargandoSlotsEdicion, setCargandoSlotsEdicion] = useState(false);

  const [modalBloqueo, setModalBloqueo] = useState(false)
  const [profesionalBloqueo, setProfesionalBloqueo] = useState<string>('')
  const [motivoBloqueo, setMotivoBloqueo] = useState('Imprevisto Médico')
  const [bloqueoTodoElDia, setBloqueoTodoElDia] = useState(true)
  const [horaInicioBloqueo, setHoraInicioBloqueo] = useState('13:00')
  const [horaFinBloqueo, setHoraFinBloqueo] = useState('14:00')

  const [modoNuevoPaciente, setModoNuevoPaciente] = useState(false)
  const [esOtroDocumento, setEsOtroDocumento] = useState(false)
  const [nuevoPaciente, setNuevoPaciente] = useState<NuevoPaciente>({ nombre: '', apellido: '', rut: '', telefono: '', fecha_nacimiento: '', sexo: '' })
  const [busqueda, setBusqueda] = useState('')
  const [pacientesEncontrados, setPacientesEncontrados] = useState<any[]>([])
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<any>(null)
  const [cargandoAccion, setCargandoAccion] = useState(false)
  
  const [nuevoTratamientoNombre, setNuevoTratamientoNombre] = useState('')
  const [tratamientosPaciente, setTratamientosPaciente] = useState<any[]>([])
  const [tratamientoSeleccionadoId, setTratamientoSeleccionadoId] = useState<string | null>(null)
  
  const [mostrarTicket, setMostrarTicket] = useState(false)
  const [citaConfirmadaData, setCitaConfirmadaData] = useState<any>(null)

  const [modalPagoAbierto, setModalPagoAbierto] = useState(false)
  const [pacientePago, setPacientePago] = useState<any>(null)
  const [deudasPaciente, setDeudasPaciente] = useState<any[]>([])
  const [cargandoDeudas, setCargandoDeudas] = useState(false)
  const [cajaActivaId, setCajaActivaId] = useState<string | null>(null);
  const [montoIngresado, setMontoIngresado] = useState<number | ''>('')
  const [metodoPago, setMetodoPago] = useState('tarjeta')
  const [codigoTransaccion, setCodigoTransaccion] = useState('')
  
  const [saldoAFavor, setSaldoAFavor] = useState(0)
  const [deudaTotalPlanAgenda, setDeudaTotalPlanAgenda] = useState(0)
  const [planesDetalladosAgenda, setPlanesDetalladosAgenda] = useState<any[]>([])

  const [modalSeleccionTratamiento, setModalSeleccionTratamiento] = useState<{abierto: boolean, cita: any, tratamientos: any[]}>({abierto: false, cita: null, tratamientos: []});
  const [modalEnvioPresupuesto, setModalEnvioPresupuesto] = useState<{abierto: boolean, cita: any, texto: string}>({abierto: false, cita: null, texto: ''});

  const duracionesDisponibles = [15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300];

  // 🔔 Realtime + notificaciones. Ahora se limpian correctamente al salir de la página
  // y el canal de notificaciones usa el MISMO nombre que el emisor (antes nunca llegaban).
  useEffect(() => {
    setMounted(true);
    let cancelado = false;
    let canalNotif: any = null;
    let canalAgenda: any = null;

    const programarRefresco = () => {
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      realtimeTimer.current = setTimeout(() => setRealtimeTrigger(prev => prev + 1), 400);
    };

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelado || !user) return;

      canalNotif = supabase.channel(`notificaciones-${user.id}`)
        .on('broadcast', { event: 'PACIENTE_EN_ESPERA' }, (payload) => {
          setNotificacion({ nombre: payload.payload?.nombre || 'Un paciente' });
          if (notifTimer.current) clearTimeout(notifTimer.current);
          notifTimer.current = setTimeout(() => setNotificacion(null), 120000);
        })
        .subscribe();

      canalAgenda = supabase.channel(`agenda-realtime-${user.id}-${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'presupuesto_items' }, programarRefresco)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, programarRefresco)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bloqueos_agenda' }, programarRefresco)
        .subscribe();
    })();

    return () => {
      cancelado = true;
      if (canalNotif) supabase.removeChannel(canalNotif);
      if (canalAgenda) supabase.removeChannel(canalAgenda);
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      if (notifTimer.current) clearTimeout(notifTimer.current);
      if (busquedaTimer.current) clearTimeout(busquedaTimer.current);
    };
  }, []);

  useEffect(() => { cargarBasicos() }, [])

  // Carga de agenda al cambiar fecha/filtro/vista (espera a que el rol esté cargado)
  useEffect(() => {
    if (cargandoPagina) return;
    let activo = true;
    setCambioFecha(true);
    fetchCitasAgenda().finally(() => {
      if (activo) setTimeout(() => setCambioFecha(false), 150);
    });
    return () => { activo = false; };
  }, [selectedDate, filtroEspecialista, vistaAgenda, cargandoPagina]);

  // Refresco SILENCIOSO por Realtime (agrupado con debounce para no saturar la BD)
  useEffect(() => {
    if (realtimeTrigger > 0) {
      fetchCitasAgenda();
      // Si el modal de recordatorios está abierto, refrescamos para ver confirmaciones en vivo
      if (modalRecordatorios && fechaRecordatorio) cargarRecordatorios(fechaRecordatorio, true);
    }
  }, [realtimeTrigger]);

  useEffect(() => {
    if (modalAbierto && filtro.profesional_id) {
        fetchCitasOcupadas();
        fetchHorariosDoctor();
        fetchBloqueosSemana();
    }
  }, [semanaInicio, modalAbierto, filtro.profesional_id, realtimeTrigger])

  // ⌨️ Escape cierra el modal abierto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || mostrarTicket) return;
      if (modalEnvioPresupuesto.abierto) return setModalEnvioPresupuesto(p => ({ ...p, abierto: false }));
      if (modalSeleccionTratamiento.abierto) return setModalSeleccionTratamiento({ abierto: false, cita: null, tratamientos: [] });
      if (modalBloqueo) return setModalBloqueo(false);
      if (modalPagoAbierto) return setModalPagoAbierto(false);
      if (modalHuerfanasAbierto) return setModalHuerfanasAbierto(false);
      if (modalAnuladasAbierto) return setModalAnuladasAbierto(false);
      if (modalOnlineAbierto) return setModalOnlineAbierto(false);
      if (modalRecordatorios) return setModalRecordatorios(false);
      if (modalBuscarHora) return setModalBuscarHora(false);
      if (modalHojaRuta) return setModalHojaRuta(false);
      if (modalAbierto) { setModalAbierto(false); resetEstados(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mostrarTicket, modalEnvioPresupuesto.abierto, modalSeleccionTratamiento.abierto, modalBloqueo, modalPagoAbierto, modalHuerfanasAbierto, modalAnuladasAbierto, modalOnlineAbierto, modalRecordatorios, modalBuscarHora, modalHojaRuta, modalAbierto]);

  async function cargarBasicos() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let especialistaInicial = 'Todos';

      if (session?.user) {
         setUsuarioLogueado(session.user.id);
         const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', session.user.id).maybeSingle();
         if (perfil) {
            setUserRol(perfil.rol);
            const veAgendaCompleta = ['ADMIN', 'RECEPCIONISTA', 'ASISTENTE'].includes(perfil.rol);
            if (!veAgendaCompleta) {
                especialistaInicial = session.user.id;
                setFiltroEspecialista(session.user.id);
                setFiltro(prev => ({ ...prev, profesional_id: session.user.id }));
            }
         }
      }

      const { data: pro } = await supabase.from('profesionales').select('*, especialidades(nombre)').eq('activo', true)
      setProfesionales(pro || [])
      const { data: perfilesData } = await supabase.from('perfiles').select('id, nombre_completo');
      const mapUsuarios: Record<string, string> = {};
      perfilesData?.forEach(p => { mapUsuarios[p.id] = p.nombre_completo });
      setUsuariosMap(mapUsuarios);
      const { data: cajaActiva } = await supabase.from('sesiones_caja').select('id').eq('estado', 'abierta').maybeSingle();
      setCajaActivaId(cajaActiva?.id || null);

      // FIX: antes se usaba el estado userRol (aún vacío aquí), por lo que el modal de agendar
      // abría sin especialista seleccionado y no mostraba horarios.
      if (pro?.length && especialistaInicial === 'Todos') {
          setFiltro(prev => ({ ...prev, profesional_id: prev.profesional_id || pro[0].user_id || '' }))
      }
    } finally { setCargandoPagina(false) }
  }

  async function fetchCitasOnlinePendientes() {
    const hoyStr = getLocalDateISO(new Date());
    let q = supabase.from('citas')
      .select('*, pacientes(*)')
      .ilike('motivo', '%Online%')
      .eq('estado_confirmacion', 'pendiente')
      .neq('estado', 'cancelada')
      .gte('inicio', `${hoyStr}T00:00:00`)
      .order('inicio', { ascending: true });
    if (!puedeVerAgendaCompleta && usuarioLogueado) q = q.eq('profesional_id', usuarioLogueado);
    const { data } = await q;
    setCitasOnlinePendientes(data || []);
  }

  // Suma presupuestos aprobados por paciente: total, abonado, deuda y deuda de lo ya realizado
  async function obtenerFinanzasPacientes(pacienteIds: string[]) {
    const finanzasMap: Record<string, { total: number, abonado: number, deuda: number, deuda_realizada: number }> = {};
    pacienteIds.forEach(id => finanzasMap[id] = { total: 0, abonado: 0, deuda: 0, deuda_realizada: 0 });
    if (pacienteIds.length === 0) return finanzasMap;

    const { data: presups } = await supabase.from('presupuestos').select('id, paciente_id').in('paciente_id', pacienteIds).eq('aprobado', true);
    const presupPaciente: Record<string, string> = {};
    presups?.forEach(p => { presupPaciente[p.id] = p.paciente_id; });
    const presupsIds = Object.keys(presupPaciente);
    if (presupsIds.length === 0) return finanzasMap;

    const { data: items } = await supabase.from('presupuesto_items').select('presupuesto_id, precio_pactado, abonado, estado').in('presupuesto_id', presupsIds).neq('estado', 'cancelada');
    items?.forEach((item: any) => {
        const pacId = presupPaciente[item.presupuesto_id];
        if (!pacId || !finanzasMap[pacId]) return;
        const precio = Number(item.precio_pactado || 0);
        const abono = Number(item.abonado || 0);
        const deudaItem = precio - abono;
        finanzasMap[pacId].total += precio;
        finanzasMap[pacId].abonado += abono;
        finanzasMap[pacId].deuda += deudaItem;
        if (item.estado === 'realizado' && deudaItem > 0) finanzasMap[pacId].deuda_realizada += deudaItem;
    });
    return finanzasMap;
  }

  async function fetchCitasAgenda() {
    const seq = ++fetchSeq.current;
    fetchCitasOnlinePendientes();

    let inicioRango: string, finRango: string;
    if (vistaAgenda === 'dia') {
        const fechaLocalStr = getLocalDateISO(selectedDate);
        inicioRango = `${fechaLocalStr}T00:00:00`;
        finRango = `${fechaLocalStr}T23:59:59`;
    } else {
        // FIX: rango en hora local (antes usaba UTC y podía desfasarse 3-4 horas)
        const dias = getDiasLunesSabado(selectedDate);
        inicioRango = `${getLocalDateISO(dias[0])}T00:00:00`;
        finRango = `${getLocalDateISO(dias[5])}T23:59:59`;
    }
    
    let query = supabase.from('citas').select('*, pacientes(*)').gte('inicio', inicioRango).lte('inicio', finRango);
    if (filtroEspecialista !== 'Todos') {
        query = query.eq('profesional_id', filtroEspecialista);
    }
    
    const { data: citasData, error } = await query.order('inicio', { ascending: true }).order('id', { ascending: true });
    if (seq !== fetchSeq.current) return; // llegó una respuesta más nueva, descartamos esta
    if (error) { console.error(error); toast.error('No se pudo cargar la agenda'); return; }
    
    if (!citasData || citasData.length === 0) {
        setCitasDia([]);
        setCitasAnuladas([]);
        setAnuladasCount(0);
        return;
    }

    const anuladas = citasData.filter((c: any) => c.estado === 'cancelada');
    const citasActivas = citasData.filter((c: any) => c.estado !== 'cancelada');
    const pacienteIds = [...new Set(citasActivas.map((c: any) => c.paciente_id).filter(Boolean))] as string[];
    
    const finanzasMap = await obtenerFinanzasPacientes(pacienteIds);
    if (seq !== fetchSeq.current) return;

    const citasConFinanzas = citasActivas.map((c: any) => {
        const fin = finanzasMap[c.paciente_id];
        let estadoFinanciero = 'sin_saldo'; 
        let requiereCobroInmediato = false;

        if (fin && fin.total > 0) {
            if (fin.deuda_realizada > 0) {
                estadoFinanciero = 'deuda';
                requiereCobroInmediato = true;
            } else if (fin.deuda <= 0) {
                estadoFinanciero = 'saldado';
            }
        }
        return { ...c, finanzas: fin, estadoFinanciero, requiereCobroInmediato };
    });

    setAnuladasCount(anuladas.length);
    setCitasAnuladas(anuladas);
    setCitasDia(citasConFinanzas);
  }

  async function fetchBloqueosSemana() {
    const dias = getDiasLunesSabado(semanaInicio);
    const inicioSemana = getLocalDateISO(dias[0]);
    const finSemana = getLocalDateISO(dias[5]);
    const profObj = profesionales.find(p => p.user_id === filtro.profesional_id);
    if (!profObj) return;

    const { data } = await supabase.from('bloqueos_agenda').select('*').eq('profesional_id', profObj.id).gte('fecha', inicioSemana).lte('fecha', finSemana);
    setBloqueosSemana(data || []);
  }

  async function fetchCitasHuerfanas() {
    setCargandoHuerfanas(true);
    try {
      const hoy = new Date();
      const limiteDias = new Date();
      limiteDias.setDate(hoy.getDate() + 90);
      
      const hoyStr = getLocalDateISO(hoy);
      const limiteStr = getLocalDateISO(limiteDias);

      let queryCitas = supabase.from('citas')
        .select('*, pacientes(*)')
        .gte('inicio', `${hoyStr}T00:00:00`)
        .lte('inicio', `${limiteStr}T23:59:59`) 
        .not('estado', 'in', '("cancelada","atendido","no_asiste")')
        .order('inicio', { ascending: true });
        
      if (filtroEspecialista && filtroEspecialista !== 'Todos' && filtroEspecialista !== 'TODOS') { 
          queryCitas = queryCitas.eq('profesional_id', filtroEspecialista); 
      }

      const { data: citasFuturas, error: errCitas } = await queryCitas;
      if (errCitas) console.error("❌ Error en BD al traer citas:", errCitas);

      if (!citasFuturas || citasFuturas.length === 0) {
        setCitasHuerfanas([]); setCargandoHuerfanas(false); return;
      }

      let queryBloqueos = supabase.from('bloqueos_agenda').select('*').gte('fecha', hoyStr).lte('fecha', limiteStr);
      if (filtroEspecialista && filtroEspecialista !== 'Todos' && filtroEspecialista !== 'TODOS') {
          const profObj = profesionales.find(p => p.user_id === filtroEspecialista);
          if (profObj) queryBloqueos = queryBloqueos.eq('profesional_id', profObj.id);
      }
      
      const { data: bloqueos, error: errBloq } = await queryBloqueos;
      if (errBloq) console.error("❌ Error en BD al traer bloqueos:", errBloq);

      const huerfanas = citasFuturas.filter(cita => {
        const [fechaStr] = cita.inicio.replace('T', ' ').split(' ');
        if (!cita.profesional_id) return true;
        const profCita = profesionales.find(p => p.user_id === cita.profesional_id);
        
        return bloqueos?.some(b => {
           if (b.profesional_id !== profCita?.id || b.fecha !== fechaStr) return false;
           if (!b.hora_inicio || !b.hora_fin) return true; 
           
           const citaStart = new Date(cita.inicio.replace(' ', 'T')).getTime();
           const citaEnd = new Date(cita.fin.replace(' ', 'T')).getTime();
           const bStart = new Date(`${fechaStr}T${b.hora_inicio}`).getTime();
           const bEnd = new Date(`${fechaStr}T${b.hora_fin}`).getTime();
           
           return citaStart < bEnd && citaEnd > bStart; 
        });
      });

      setCitasHuerfanas(huerfanas);
    } catch (error) { toast.error("Error al escanear la agenda global"); } finally { setCargandoHuerfanas(false); }
  }

  const validarCitaOnline = async (cita: any) => {
    setCargandoAccion(true);
    try {
        const { error } = await supabase.from('citas').update({ estado_confirmacion: 'enviado', estado: 'programada' }).eq('id', cita.id);
        if (error) throw error;
        toast.success('Cita web aprobada');
        if (cita.pacientes?.telefono) {
            const fechaFormat = fechaLocalDeStr(cita.inicio).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
            const horaFormat = horaDeStr(cita.inicio);
            const link = `https://confirmar-cita-dignidad.vercel.app/confirmar/${cita.id}`;
            const mensaje = `Hola ${cita.pacientes?.nombre} ${cita.pacientes?.apellido}, tu solicitud de hora para el día ${fechaFormat} a las ${horaFormat} hrs ha sido validada y agendada con éxito.\n\nPor favor confirma tu asistencia haciendo clic en el siguiente enlace:\n${link}\n\n¡Te esperamos en Clínica Dignidad!`;
            abrirWhatsApp(cita.pacientes.telefono, mensaje);
        } else {
            toast.warning('La cita fue aprobada, pero el paciente no tiene teléfono registrado.');
        }
        await fetchCitasAgenda();
    } catch (e) { toast.error('Error al aprobar cita web'); } finally { setCargandoAccion(false); }
  };

  const rechazarCitaOnline = async (citaId: string) => {
    if(!confirm("¿Estás seguro de RECHAZAR y ELIMINAR esta solicitud de hora online?")) return;
    setCargandoAccion(true);
    try {
        const { error } = await supabase.from('citas').update({ estado: 'cancelada', cancelado_por: usuarioLogueado }).eq('id', citaId);
        if (error) throw error;
        toast.success('Solicitud web eliminada');
        await fetchCitasAgenda();
    } catch (e) { toast.error('Error al rechazar cita'); } finally { setCargandoAccion(false); }
  };

  const iniciarReprogramacion = (cita: any) => {
    resetEstados(); 
    setCitaEnReprogramacion(cita); 
    const tInicio = new Date(cita.inicio.replace(' ', 'T')).getTime();
    const tFin = new Date(cita.fin.replace(' ', 'T')).getTime();
    const duracionMinutos = Math.round((tFin - tInicio) / 60000);
    const duracionFinal = duracionesDisponibles.includes(duracionMinutos) ? duracionMinutos : 30;
    setFiltro(prev => ({ ...prev, profesional_id: cita.profesional_id || prev.profesional_id, duracionDefault: duracionFinal }));
    seleccionarPacienteExistente(cita.pacientes); 
    setNuevoTratamientoNombre(cita.motivo || ''); 
    setSemanaInicio(new Date(cita.inicio.replace(' ', 'T')));
    setModalAbierto(true); 
    setPaso(1);
  };

  useEffect(() => {
    if (nuevoEspecialista && citaEnEdicion) calcularDisponibilidadSemanalEdicion();
  }, [semanaInicioEdicion, nuevoEspecialista, citaEnEdicion, duracionCitaEdicion]);

  async function calcularDisponibilidadSemanalEdicion() {
    setCargandoSlotsEdicion(true);
    try {
      const dias = Array.from({length: 7}).map((_, i) => { const d = new Date(semanaInicioEdicion); d.setDate(d.getDate() + i); return d; });
      const inicioSemanaStr = getLocalDateISO(dias[0]);
      const finSemanaStr = getLocalDateISO(dias[6]);
      const profNuevo = profesionales.find(p => p.user_id === nuevoEspecialista);

      const [bloqueosRes, dispoRes, citasRes] = await Promise.all([
        supabase.from('bloqueos_agenda').select('fecha, hora_inicio, hora_fin').eq('profesional_id', profNuevo?.id).gte('fecha', inicioSemanaStr).lte('fecha', finSemanaStr),
        supabase.from('disponibilidad_profesional').select('*').eq('profesional_id', nuevoEspecialista),
        supabase.from('citas').select('inicio, fin, estado_confirmacion, motivo').eq('profesional_id', nuevoEspecialista).gte('inicio', `${inicioSemanaStr}T00:00:00`).lte('inicio', `${finSemanaStr}T23:59:59`).neq('estado', 'cancelada')
      ]);

      const semanaProcesada = dias.map(dateObj => {
        const dateStr = getLocalDateISO(dateObj);
        const diaSemanaNum = dateObj.getDay();
        const bloqueosDia = bloqueosRes.data?.filter(b => b.fecha === dateStr) || [];
        if (bloqueosDia.some(b => !b.hora_inicio || !b.hora_fin)) return { date: dateStr, dateObj, status: 'bloqueado', slots: [] };
        
        // Horarios especiales del día tienen prioridad sobre el horario semanal
        const dispoEspecialDia = dispoRes.data?.filter(d => d.fecha_especifica === dateStr) || [];
        let dispoDia = [];
        if (dispoEspecialDia.length > 0) {
            dispoDia = dispoEspecialDia;
        } else {
            dispoDia = dispoRes.data?.filter(d => d.dia_semana === diaSemanaNum && !d.fecha_especifica) || [];
        }

        if (dispoDia.length === 0) return { date: dateStr, dateObj, status: 'sin_horario', slots: [] };
        const citasDelDia = citasRes.data?.filter(c => c.inicio.startsWith(dateStr) && !(c.estado_confirmacion === 'pendiente' && c.motivo?.includes('Online'))).map(c => ({
          inicio: getMinsFromDateStr(c.inicio), fin: getMinsFromDateStr(c.fin)
        })) || [];
        
        let slotsLibres: any[] = [];
        dispoDia.forEach(bloque => {
          let currTime = tToMins(bloque.hora_inicio);
          const endTime = tToMins(bloque.hora_fin);
          while (currTime + duracionCitaEdicion <= endTime) {
            const slotEnd = currTime + duracionCitaEdicion;
            const chocaCita = citasDelDia.some(cita => currTime < cita.fin && slotEnd > cita.inicio);
            const chocaBloqueo = bloqueosDia.some(b => {
              if(!b.hora_inicio || !b.hora_fin) return true;
              return currTime < tToMins(b.hora_fin) && slotEnd > tToMins(b.hora_inicio);
            });
            if (!chocaBloqueo) { slotsLibres.push({ time: minsToT(currTime), ocupado: chocaCita }); }
            currTime += 15;
          }
        });
        const uniqueSlots: any[] = [];
        const seen = new Set();
        for (const s of slotsLibres) { if (!seen.has(s.time)) { seen.add(s.time); uniqueSlots.push(s); } }
        uniqueSlots.sort((a: any, b: any) => a.time.localeCompare(b.time));
        return { date: dateStr, dateObj, status: uniqueSlots.length > 0 ? 'limpio' : 'lleno', slots: uniqueSlots };
      });
      setDispoSemanaEdicion(semanaProcesada);
    } catch (error) { toast.error("Error al calcular la agenda"); } finally { setCargandoSlotsEdicion(false); }
  }

  const prevWeekEdicion = () => { const d = new Date(semanaInicioEdicion); d.setDate(d.getDate() - 7); setSemanaInicioEdicion(d); }
  const nextWeekEdicion = () => { const d = new Date(semanaInicioEdicion); d.setDate(d.getDate() + 7); setSemanaInicioEdicion(d); }

  const reagendarCitaHuérfanaDirecta = async (citaId: string) => {
    if(!nuevaFecha || !nuevaHora || !nuevoEspecialista) return toast.error("Selecciona un día y hora");
    setCargandoAccion(true);
    try {
      const inicioDate = new Date(`${nuevaFecha}T${nuevaHora}:00`);
      const finDate = new Date(inicioDate.getTime() + duracionCitaEdicion * 60000);
      const finHoraStr = `${finDate.getHours().toString().padStart(2, '0')}:${finDate.getMinutes().toString().padStart(2, '0')}:00`;
      const { error } = await supabase.from('citas').update({ inicio: `${nuevaFecha}T${nuevaHora}:00`, fin: `${nuevaFecha}T${finHoraStr}`, profesional_id: nuevoEspecialista, estado: 'reprogramada', modificado_por: usuarioLogueado }).eq('id', citaId);
      if (error) throw error;
      const citaHuérfana = citasHuerfanas.find(c => c.id === citaId);
      if (citaHuérfana) {
          const nombrePaciente = `${citaHuérfana.pacientes?.nombre || ''} ${citaHuérfana.pacientes?.apellido || ''}`.trim();
          await supabase.from('auditoria_clinica').insert([{ usuario_id: usuarioLogueado, accion: 'UPDATE / REPROGRAMACIÓN HUÉRFANA', tabla: 'citas', detalles: `Reprogramó cita huérfana de ${nombrePaciente} para el ${nuevaFecha} a las ${nuevaHora}.` }]);
      }
      toast.success("Cita huérfana reagendada");
      setCitaEnEdicion(null);
      setCitasHuerfanas(prev => prev.filter(c => c.id !== citaId));
      if (citasHuerfanas.length === 1) setModalHuerfanasAbierto(false);
      await fetchCitasAgenda();
    } catch(e) { toast.error("Error al reagendar"); } finally { setCargandoAccion(false); }
  }

  const anularCitaDirecta = async (citaId: string) => {
    if(!confirm("¿Estás seguro de anular la cita de este paciente?")) return;
    try {
      const { error } = await supabase.from('citas').update({ estado: 'cancelada', modificado_por: usuarioLogueado, cancelado_por: usuarioLogueado }).eq('id', citaId);
      if (error) throw error;
      const citaAnulada = citasHuerfanas.find(c => c.id === citaId);
      if (citaAnulada) {
          const nombrePaciente = `${citaAnulada.pacientes?.nombre || ''} ${citaAnulada.pacientes?.apellido || ''}`.trim();
          await supabase.from('auditoria_clinica').insert([{ usuario_id: usuarioLogueado, accion: 'UPDATE / ANULACIÓN CITA', tabla: 'citas', detalles: `Anuló la cita de ${nombrePaciente} del día ${citaAnulada.inicio.split('T')[0]}.` }]);
      }
      toast.success("Cita anulada correctamente");
      setCitasHuerfanas(prev => prev.filter(c => c.id !== citaId));
      await fetchCitasAgenda();
    } catch(e) { toast.error("No se pudo anular la cita"); }
  }

  const handleEliminarCita = async (cita: any) => {
    const nombrePaciente = `${cita.pacientes?.nombre || 'S/N'} ${cita.pacientes?.apellido || ''}`.trim();
    if (confirm(`⚠️ ¿Estás seguro de ELIMINAR PERMANENTEMENTE la cita de ${nombrePaciente}? Esta acción no se puede deshacer.`)) {
      try {
        const { error } = await supabase.from('citas').delete().eq('id', cita.id);
        if (error) throw error;
        await supabase.from('auditoria_clinica').insert([{ usuario_id: usuarioLogueado, accion: 'DELETE / CITA', tabla: 'citas', detalles: `Eliminó permanentemente la cita de ${nombrePaciente} del día ${cita.inicio.split('T')[0]}.` }]);
        toast.success("Cita eliminada de la base de datos");
        await fetchCitasAgenda(); 
      } catch (e) { console.error(e); toast.error("No se pudo eliminar la cita"); }
    }
  };
  
  async function actualizarEstadoCita(citaId: string, nuevoEstado: string) {
    const citaPrevia = citasDia.find(c => c.id === citaId); // trae pacientes(*) completo, útil para los avisos
    setCitasDia(prev => prev.map(c => c.id === citaId ? { ...c, estado: nuevoEstado } : c));
    const ahora = new Date(); const offset = ahora.getTimezoneOffset() * 60000; const horaLocalISO = new Date(ahora.getTime() - offset).toISOString().replace('Z', '');
    const updateData: any = { estado: nuevoEstado, modificado_por: usuarioLogueado };
    if (nuevoEstado === 'cancelada') updateData.cancelado_por = usuarioLogueado;
    if (nuevoEstado === 'en_espera') { updateData.llegada_confirmada = true; updateData.hora_llegada = horaLocalISO; }
    if (nuevoEstado === 'atendiendose') updateData.hora_inicio_atencion = horaLocalISO; 
    if (nuevoEstado === 'atendido') updateData.hora_fin_atencion = horaLocalISO; 
    
    const { data: citaActual, error } = await supabase.from('citas').update(updateData).eq('id', citaId).select('*, pacientes(nombre, apellido)').single();
    if (error) {
      toast.error("Error al actualizar el estado");
      await fetchCitasAgenda(); // revertimos el cambio optimista
      return;
    }
    if (citaActual) {
      const nombrePac = citaActual.pacientes?.nombre || 'Sin nombre';
      const apellidoPac = citaActual.pacientes?.apellido || '';
      await supabase.from('auditoria_clinica').insert([{ usuario_id: usuarioLogueado, accion: `UPDATE / ESTADO CITA`, tabla: 'citas', detalles: `Cambió estado de la cita de ${nombrePac} ${apellidoPac} a "${nuevoEstado.toUpperCase()}".` }]);
    }
    // Avisamos al doctor (si no es él mismo quien marcó la llegada)
    if (nuevoEstado === 'en_espera' && citaActual?.pacientes && citaActual.profesional_id && citaActual.profesional_id !== usuarioLogueado) {
      const canalAviso = supabase.channel(`notificaciones-${citaActual.profesional_id}`);
      canalAviso.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await canalAviso.send({ type: 'broadcast', event: 'PACIENTE_EN_ESPERA', payload: { nombre: `${citaActual.pacientes?.nombre || ''} ${citaActual.pacientes?.apellido || ''}` } });
          supabase.removeChannel(canalAviso);
        }
      });
    }
    toast.success("Estado actualizado");

    // 📵 No asistió → ofrecer WhatsApp para reagendar
    if (nuevoEstado === 'no_asiste' && citaPrevia?.pacientes) {
      const nombre = `${citaPrevia.pacientes.nombre || ''} ${citaPrevia.pacientes.apellido || ''}`.trim();
      toast(`${nombre} no asistió`, {
        description: '¿Enviarle un WhatsApp para reagendar?',
        duration: 15000,
        action: { label: 'Enviar WhatsApp', onClick: () => enviarMensajeInasistencia(citaPrevia) },
      });
    }

    // 🦷 Atendido en un procedimiento que requiere control → ofrecer agendarlo
    if (nuevoEstado === 'atendido' && citaPrevia?.pacientes && requiereControl(citaPrevia.motivo)) {
      const nombre = `${citaPrevia.pacientes.nombre || ''} ${citaPrevia.pacientes.apellido || ''}`.trim();
      toast(`¿Agendar control en ${DIAS_HASTA_CONTROL} días?`, {
        description: `${nombre} · ${citaPrevia.motivo}`,
        duration: 20000,
        action: { label: 'Agendar control', onClick: () => agendarControl(citaPrevia) },
      });
    }

    await fetchCitasAgenda();
  }

  const enviarLinkSatisfaccion = (cita: any) => {
      const link = "https://g.page/r/CTmbdo9C4oVGEBM/review";
      const mensaje = `Hola ${cita.pacientes?.nombre}, esperamos que hayas tenido una excelente experiencia en tu atención en Clínica Dignidad.\n\nNos ayudaría muchísimo si pudieras dejarnos tu opinión o solo dejándonos las estrellas, es solo 1 clic:\n${link}\n\n¡Muchas gracias por confiar en nosotros! 💙🦷`;
      abrirWhatsApp(cita.pacientes?.telefono, mensaje);
  }

  // Arma el mensaje de recordatorio. Si el paciente tiene varias citas el mismo día, van en un solo mensaje.
  const construirMensajeRecordatorio = (citasPac: any[]) => {
      const c0 = citasPac[0];
      const fechaISO = c0.inicio.replace(' ', 'T').split('T')[0];
      const manana = new Date(); manana.setDate(manana.getDate() + 1);
      const fechaLarga = fechaLocalDeStr(c0.inicio).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
      const cuando = fechaISO === getLocalDateISO(new Date())
        ? `HOY ${fechaLarga}`
        : fechaISO === getLocalDateISO(manana)
          ? `MAÑANA ${fechaLarga}`
          : `el día ${fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1)}`;
      const nombreDoc = (c: any) => {
        const d = profesionales.find(p => p.user_id === c.profesional_id);
        return d ? `Dr(a). ${d.nombre} ${d.apellido}` : 'nuestro especialista';
      };
      const linkConf = (c: any) => `https://confirmar-cita-dignidad.vercel.app/confirmar/${c.id}`;
      const nombrePac = `${c0.pacientes?.nombre || ''} ${c0.pacientes?.apellido || ''}`.trim();

      let m = `Hola ${nombrePac}, te escribimos de Clínica Dignidad para recordar `;
      if (citasPac.length === 1) {
        m += `tu cita con el/la ${nombreDoc(c0)} ${cuando} a las ${horaDeStr(c0.inicio)} hrs.\n\n`;
      } else {
        m += `tus citas de ${cuando}:\n`;
        citasPac.forEach(c => { m += `🕒 ${horaDeStr(c.inicio)} hrs con el/la ${nombreDoc(c)}\n`; });
        m += `\n`;
      }
      m += `📍 Dirección: Av. Venancia Leiva 1871, La Pintana.\n\n`;
      m += `⚠️ Importante: Debido a la alta demanda de horas, si tu cita no es confirmada el bloque será asignado a otro paciente.\n\n`;
      if (citasPac.length === 1) {
        m += `Por favor confirma tu asistencia en el siguiente enlace:\n${linkConf(c0)}`;
      } else {
        m += `Por favor confirma tu asistencia en estos enlaces:\n`;
        citasPac.forEach(c => { m += `${horaDeStr(c.inicio)} hrs: ${linkConf(c)}\n`; });
      }
      return m;
  }

  // Marca en la BD que el recordatorio ya se envió (solo pasa de 'pendiente' a 'enviado', nunca baja un 'confirmado').
  // Las solicitudes web sin validar se excluyen para no "aprobarlas" por accidente.
  const marcarRecordatorioEnviado = async (citasPac: any[]) => {
      const ids = citasPac.filter(c => !(c.motivo?.includes('Online') && c.estado_confirmacion === 'pendiente')).map(c => c.id);
      if (ids.length === 0) return;
      const { error } = await supabase.from('citas').update({ estado_confirmacion: 'enviado' }).in('id', ids).eq('estado_confirmacion', 'pendiente');
      if (error) console.error('No se pudo marcar el recordatorio como enviado', error);
  }

  const enviarRecordatorioConLink = (cita: any) => {
      if (abrirWhatsApp(cita.pacientes?.telefono, construirMensajeRecordatorio([cita]))) {
        marcarRecordatorioEnviado([cita]);
      }
  }

  // Próximo día hábil (la clínica atiende de lunes a sábado: si mañana es domingo, salta al lunes)
  const siguienteDiaHabil = () => {
      const d = new Date(); d.setDate(d.getDate() + 1);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      return getLocalDateISO(d);
  }

  async function cargarRecordatorios(fecha: string, silencioso = false) {
      if (!fecha) return;
      if (!silencioso) setCargandoRecordatorios(true);
      try {
        let q = supabase.from('citas').select('*, pacientes(*)')
          .gte('inicio', `${fecha}T00:00:00`).lte('inicio', `${fecha}T23:59:59`)
          .not('estado', 'in', '("cancelada","atendido","no_asiste")')
          .order('inicio', { ascending: true });
        if (!puedeVerAgendaCompleta && usuarioLogueado) q = q.eq('profesional_id', usuarioLogueado);
        else if (filtroEspecialista !== 'Todos') q = q.eq('profesional_id', filtroEspecialista);

        const { data, error } = await q;
        if (error) throw error;

        // Las solicitudes web sin validar se gestionan en "Validar Web", no aquí
        const validas = (data || []).filter((c: any) => c.paciente_id && !(c.estado_confirmacion === 'pendiente' && c.motivo?.includes('Online')));

        const grupos: Record<string, any> = {};
        validas.forEach((c: any) => {
          if (!grupos[c.paciente_id]) grupos[c.paciente_id] = { key: c.paciente_id, paciente: c.pacientes, citas: [] };
          grupos[c.paciente_id].citas.push(c);
        });

        const lista = Object.values(grupos).map((g: any) => {
          const confirmado = g.citas.every((c: any) => c.estado_confirmacion === 'confirmado' || c.estado === 'confirmado_tel');
          const enviado = g.citas.every((c: any) => c.estado_confirmacion && c.estado_confirmacion !== 'pendiente');
          return {
            ...g,
            telefono: g.paciente?.telefono,
            tieneTelefono: !!telefonoWA(g.paciente?.telefono),
            estadoRecordatorio: confirmado ? 'confirmado' : enviado ? 'enviado' : 'pendiente',
          };
        });
        setRecordatorios(lista);
      } catch (e) {
        console.error(e);
        if (!silencioso) toast.error('No se pudieron cargar las citas para recordar');
      } finally {
        if (!silencioso) setCargandoRecordatorios(false);
      }
  }

  const abrirRecordatorios = () => {
      const f = siguienteDiaHabil();
      setFechaRecordatorio(f);
      setRecordatorios([]);
      setModalRecordatorios(true);
      cargarRecordatorios(f);
  }

  // Abre WhatsApp (debe ir directo en el clic para que el navegador no bloquee la pestaña) y marca como enviado
  const enviarRecordatorioGrupo = (g: any) => {
      if (!abrirWhatsApp(g.telefono, construirMensajeRecordatorio(g.citas))) return;
      setRecordatorios(prev => prev.map(x => x.key === g.key && x.estadoRecordatorio === 'pendiente' ? { ...x, estadoRecordatorio: 'enviado' } : x));
      marcarRecordatorioEnviado(g.citas);
  }

  const recordatoriosPendientes = recordatorios.filter(g => g.estadoRecordatorio === 'pendiente' && g.tieneTelefono);
  const recordatoriosSinTelefono = recordatorios.filter(g => g.estadoRecordatorio === 'pendiente' && !g.tieneTelefono);
  const recordatoriosEnviados = recordatorios.filter(g => g.estadoRecordatorio === 'enviado');
  const recordatoriosConfirmados = recordatorios.filter(g => g.estadoRecordatorio === 'confirmado');

  // ─────────────────────────────────────────────────────────────
  // 🔎 BUSCAR PRÓXIMA HORA LIBRE
  // Busca en tramos de 2 semanas (evita el límite de 1000 filas de Supabase) hasta juntar suficientes huecos.
  // ─────────────────────────────────────────────────────────────
  const [busquedaAgotada, setBusquedaAgotada] = useState(false);

  async function buscarHuecosLibres(f = buscarHoraFiltro, limite = huecosLimite) {
    setBuscandoHuecos(true);
    try {
      const TRAMO_DIAS = 14;
      const MAX_TRAMOS = 8; // ~4 meses
      const MAX_POR_DOCTOR_DIA = 3;
      const desdeISO = f.desde && f.desde > hoyISO ? f.desde : hoyISO;

      let pros = profesionales.filter(p => p.user_id && (puedeVerAgendaCompleta || p.user_id === usuarioLogueado));
      if (f.profesional !== 'Todos') pros = pros.filter(p => p.user_id === f.profesional);
      if (pros.length === 0) { setHuecosEncontrados([]); setBusquedaAgotada(true); return; }
      const userIds = pros.map(p => p.user_id);
      const proIds = pros.map(p => p.id);

      const { data: dispo, error: errDispo } = await supabase.from('disponibilidad_profesional').select('*').in('profesional_id', userIds);
      if (errDispo) throw errDispo;

      const ahora = new Date();
      const minAhora = Math.ceil((ahora.getHours() * 60 + ahora.getMinutes() + 1) / 15) * 15;
      const huecos: any[] = [];
      let agotada = true;

      for (let t = 0; t < MAX_TRAMOS; t++) {
        const ini = new Date(desdeISO + 'T00:00:00'); ini.setDate(ini.getDate() + t * TRAMO_DIAS);
        const fin = new Date(ini); fin.setDate(fin.getDate() + TRAMO_DIAS - 1);
        const iniISO = getLocalDateISO(ini); const finISO = getLocalDateISO(fin);

        const [bloqRes, citasRes] = await Promise.all([
          supabase.from('bloqueos_agenda').select('profesional_id, fecha, hora_inicio, hora_fin').in('profesional_id', proIds).gte('fecha', iniISO).lte('fecha', finISO),
          supabase.from('citas').select('profesional_id, inicio, fin, estado_confirmacion, motivo').in('profesional_id', userIds).gte('inicio', `${iniISO}T00:00:00`).lte('inicio', `${finISO}T23:59:59`).neq('estado', 'cancelada').range(0, 4999),
        ]);
        if (bloqRes.error) throw bloqRes.error;
        if (citasRes.error) throw citasRes.error;
        const citasTramo = (citasRes.data || []).filter((c: any) => !(c.estado_confirmacion === 'pendiente' && c.motivo?.includes('Online')));

        for (let d = 0; d < TRAMO_DIAS; d++) {
          const dia = new Date(ini); dia.setDate(dia.getDate() + d);
          const fechaISO = getLocalDateISO(dia);
          const diaSemana = dia.getDay();

          pros.forEach(pro => {
            const dispPro = (dispo || []).filter((x: any) => x.profesional_id === pro.user_id);
            const especiales = dispPro.filter((x: any) => x.fecha_especifica === fechaISO);
            const bloques = (especiales.length > 0 ? especiales : dispPro.filter((x: any) => x.dia_semana === diaSemana && !x.fecha_especifica))
              .sort((a: any, b: any) => a.hora_inicio.localeCompare(b.hora_inicio));
            if (bloques.length === 0) return;

            const bloqDia = (bloqRes.data || []).filter((b: any) => b.profesional_id === pro.id && b.fecha === fechaISO);
            if (bloqDia.some((b: any) => !b.hora_inicio || !b.hora_fin)) return;

            const ocupadas = citasTramo
              .filter((c: any) => c.profesional_id === pro.user_id && c.inicio.startsWith(fechaISO))
              .map((c: any) => ({ i: getMinsFromDateStr(c.inicio), f: getMinsFromDateStr(c.fin) }));

            const minimo = fechaISO === hoyISO ? minAhora : 0;
            let tomados = 0;
            let ultimoFin = -1;

            for (const bloque of bloques) {
              let s = tToMins(bloque.hora_inicio.substring(0, 5));
              const e = tToMins(bloque.hora_fin.substring(0, 5));
              while (s + f.duracion <= e && tomados < MAX_POR_DOCTOR_DIA) {
                const sEnd = s + f.duracion;
                const enTurno = f.turno === 'cualquiera' || (f.turno === 'manana' ? s < 13 * 60 : s >= 13 * 60);
                const libre = !ocupadas.some(o => s < o.f && sEnd > o.i)
                  && !bloqDia.some((b: any) => s < tToMins(b.hora_fin.substring(0, 5)) && sEnd > tToMins(b.hora_inicio.substring(0, 5)));
                if (enTurno && libre && s >= minimo && s >= ultimoFin) {
                  huecos.push({
                    fecha: fechaISO, hora: minsToT(s), duracion: f.duracion,
                    profesional_id: pro.user_id,
                    doctor: `${pro.nombre} ${pro.apellido}`,
                  });
                  tomados++;
                  ultimoFin = sEnd; // las opciones de un mismo doctor no se solapan entre sí
                }
                s += 15;
              }
            }
          });
        }

        if (huecos.length >= limite) { agotada = false; break; }
      }

      huecos.sort((a, b) => `${a.fecha}${a.hora}${a.doctor}`.localeCompare(`${b.fecha}${b.hora}${b.doctor}`));
      setHuecosEncontrados(huecos);
      setBusquedaAgotada(agotada);
    } catch (e) {
      console.error(e);
      toast.error('No se pudo buscar horas disponibles');
    } finally {
      setBuscandoHuecos(false);
    }
  }

  const abrirBuscarHora = () => {
    const f = {
      profesional: !puedeVerAgendaCompleta ? (usuarioLogueado || 'Todos') : filtroEspecialista,
      duracion: 30,
      turno: 'cualquiera' as const,
      desde: hoyISO,
    };
    setBuscarHoraFiltro(f);
    setHuecosLimite(5);
    setHuecosEncontrados([]);
    setModalBuscarHora(true);
    buscarHuecosLibres(f, 5);
  };

  const actualizarFiltroBusqueda = (cambios: Partial<typeof buscarHoraFiltro>) => {
    const f = { ...buscarHoraFiltro, ...cambios };
    setBuscarHoraFiltro(f);
    setHuecosLimite(5);
    buscarHuecosLibres(f, 5);
  };

  const verMasHuecos = () => {
    const nuevo = huecosLimite + 5;
    setHuecosLimite(nuevo);
    if (huecosEncontrados.length < nuevo && !busquedaAgotada) buscarHuecosLibres(buscarHoraFiltro, nuevo);
  };

  // Abre el modal de agendar con el doctor, la duración y el horario ya seleccionados
  const agendarEnHueco = (h: any) => {
    resetEstados();
    setFiltro(prev => ({ ...prev, profesional_id: h.profesional_id, duracionDefault: h.duracion }));
    setSemanaInicio(new Date(h.fecha + 'T00:00:00'));
    setHorasSeleccionadas([{ fecha: h.fecha, hora: h.hora, duracion: h.duracion }]);
    setDiaSugerido(h.fecha);
    setModalBuscarHora(false);
    setModalAbierto(true);
  };

  // Texto para dictar por teléfono o copiar en un chat
  const copiarOpcionesHuecos = async () => {
    const lista = huecosEncontrados.slice(0, huecosLimite).map(h => {
      const f = new Date(h.fecha + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
      return `• ${f.charAt(0).toUpperCase() + f.slice(1)} a las ${h.hora} hrs con Dr(a). ${h.doctor}`;
    }).join('\n');
    try {
      await navigator.clipboard.writeText(`Estas son las próximas horas disponibles en Clínica Dignidad:\n\n${lista}\n\n¿Cuál te acomoda?`);
      toast.success('Opciones copiadas, puedes pegarlas en WhatsApp');
    } catch { toast.error('No se pudo copiar'); }
  };

  // ─────────────────────────────────────────────────────────────
  // 🦷 CONTROL POST-PROCEDIMIENTO y 📵 INASISTENCIA
  // ─────────────────────────────────────────────────────────────
  const agendarControl = (cita: any) => {
    if (!cita?.pacientes) return toast.error('La cita no tiene paciente asociado');
    const base = fechaLocalDeStr(cita.inicio);
    base.setDate(base.getDate() + DIAS_HASTA_CONTROL);
    if (base.getDay() === 0) base.setDate(base.getDate() + 1); // domingo → lunes
    const fechaControl = getLocalDateISO(base);

    resetEstados();
    setFiltro(prev => ({ ...prev, profesional_id: cita.profesional_id || prev.profesional_id, duracionDefault: DURACION_CONTROL }));
    setSemanaInicio(new Date(fechaControl + 'T00:00:00'));
    setDiaSugerido(fechaControl);
    setNuevoTratamientoNombre(`CONTROL ${cita.motivo || ''}`.trim().toUpperCase());
    setModalAbierto(true);
    seleccionarPacienteExistente(cita.pacientes);
  };

  const enviarMensajeInasistencia = (cita: any) => {
    const fechaISO = cita.inicio.replace(' ', 'T').split('T')[0];
    const d = profesionales.find(p => p.user_id === cita.profesional_id);
    const nombreDoctor = d ? `Dr(a). ${d.nombre} ${d.apellido}` : 'nuestro especialista';
    const fechaLarga = fechaLocalDeStr(cita.inicio).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    const cuando = fechaISO === hoyISO ? 'Hoy' : `El ${fechaLarga}`;
    const mensaje = `Hola ${cita.pacientes?.nombre || ''}, te escribimos de Clínica Dignidad. ${cuando} te esperábamos a las ${horaDeStr(cita.inicio)} hrs para tu cita con el/la ${nombreDoctor} y no pudiste asistir.\n\nEntendemos que pueden surgir imprevistos 🙂 ¿Te gustaría que te busquemos una nueva hora? Respóndenos este mensaje y te ayudamos a reagendar.\n\n¡Saludos! 🦷`;
    abrirWhatsApp(cita.pacientes?.telefono, mensaje);
  };

  // ─────────────────────────────────────────────────────────────
  // 📋 HOJA DE RUTA DEL DOCTOR
  // ─────────────────────────────────────────────────────────────
  const esRespuestaNegativa = (txt?: string | null) => {
    const t = normalizarTexto(txt).trim().replace(/[.\s]+$/, '');
    return !t || ['NO', 'NIEGA', 'NINGUNA', 'NINGUNO', 'SIN', 'N/A', 'NA', '-', 'NO REFIERE', 'NO TIENE', 'NADA', 'NIEGA TODO', 'SIN ANTECEDENTES'].includes(t)
      || t.startsWith('NO ') || t.startsWith('NIEGA') || t.startsWith('SIN ANTECEDENTES');
  };

  async function cargarHojaRuta(fecha: string, prof: string) {
    if (!fecha) return;
    setCargandoHojaRuta(true);
    try {
      let q = supabase.from('citas').select('*, pacientes(*)')
        .gte('inicio', `${fecha}T00:00:00`).lte('inicio', `${fecha}T23:59:59`)
        .neq('estado', 'cancelada')
        .order('inicio', { ascending: true });
      const profEfectivo = !puedeVerAgendaCompleta ? usuarioLogueado : prof;
      if (profEfectivo && profEfectivo !== 'Todos') q = q.eq('profesional_id', profEfectivo);
      const { data, error } = await q;
      if (error) throw error;

      const citas = (data || []).filter((c: any) => !(c.estado_confirmacion === 'pendiente' && c.motivo?.includes('Online')));
      const ids = [...new Set(citas.map((c: any) => c.paciente_id).filter(Boolean))] as string[];
      if (ids.length === 0) { setHojaRutaData([]); return; }

      const [finanzas, antRes, previasRes] = await Promise.all([
        obtenerFinanzasPacientes(ids),
        supabase.from('antecedentes').select('paciente_id, categoria, contenido').in('paciente_id', ids),
        supabase.from('citas').select('paciente_id').in('paciente_id', ids).eq('estado', 'atendido').lt('inicio', `${fecha}T00:00:00`),
      ]);
      const conVisitasPrevias = new Set((previasRes.data || []).map((c: any) => c.paciente_id));

      const filas = citas.map((c: any) => {
        const p = c.pacientes || {};
        const ants = (antRes.data || []).filter((a: any) => a.paciente_id === c.paciente_id && !esRespuestaNegativa(a.contenido));
        const alertas: string[] = [];
        const otros: string[] = [];
        ants.forEach((a: any) => {
          const txt = `${a.categoria ? a.categoria + ': ' : ''}${a.contenido}`;
          (esAlertaMedica(txt) ? alertas : otros).push(txt);
        });
        if (p.antecedentes_medicos && !esRespuestaNegativa(p.antecedentes_medicos)) {
          (esAlertaMedica(p.antecedentes_medicos) ? alertas : otros).push(p.antecedentes_medicos);
        }
        const doc = profesionales.find(x => x.user_id === c.profesional_id);
        return {
          cita: c,
          paciente: p,
          edad: calcularEdad(p.fecha_nacimiento),
          alertas,
          otros,
          finanzas: finanzas[c.paciente_id],
          doctor: doc ? `${doc.nombre} ${doc.apellido}` : 'Sin asignar',
          primeraVez: !conVisitasPrevias.has(c.paciente_id),
        };
      });
      setHojaRutaData(filas);
    } catch (e) {
      console.error(e);
      toast.error('No se pudo cargar la hoja de ruta');
    } finally {
      setCargandoHojaRuta(false);
    }
  }

  const abrirHojaRuta = () => {
    const fecha = getLocalDateISO(selectedDate);
    const prof = !puedeVerAgendaCompleta ? (usuarioLogueado || 'Todos') : filtroEspecialista;
    setHojaRutaFecha(fecha);
    setHojaRutaProfesional(prof);
    setHojaRutaData([]);
    setModalHojaRuta(true);
    cargarHojaRuta(fecha, prof);
  };

  // Agrupa por doctor para mostrar/imprimir
  const hojaRutaPorDoctor = useMemo(() => {
    const grupos: Record<string, any[]> = {};
    hojaRutaData.forEach(f => { (grupos[f.doctor] = grupos[f.doctor] || []).push(f); });
    return Object.entries(grupos);
  }, [hojaRutaData]);

  const imprimirHojaRuta = () => {
    const fechaTxt = new Date(hojaRutaFecha + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const secciones = hojaRutaPorDoctor.map(([doctor, filas]) => `
      <h2>Dr(a). ${escapeHtml(doctor)} <span>${filas.length} paciente${filas.length === 1 ? '' : 's'}</span></h2>
      <table>
        <thead><tr><th>Hora</th><th>Paciente</th><th>Motivo</th><th>Alertas / antecedentes</th><th>Saldo</th></tr></thead>
        <tbody>${filas.map(f => `
          <tr>
            <td class="hora">${escapeHtml(horaDeStr(f.cita.inicio))}<br><small>${escapeHtml(horaDeStr(f.cita.fin))}</small></td>
            <td><b>${escapeHtml(`${f.paciente.nombre || ''} ${f.paciente.apellido || ''}`)}</b>${f.primeraVez ? ' <span class="tag">1ª visita</span>' : ''}<br><small>${f.edad !== null ? escapeHtml(f.edad) + ' años · ' : ''}${escapeHtml(f.paciente.rut || '')}</small></td>
            <td>${escapeHtml(f.cita.motivo || '—')}</td>
            <td>${f.alertas.map((a: string) => `<div class="alerta">⚠ ${escapeHtml(a)}</div>`).join('')}${f.otros.map((a: string) => `<div class="otro">${escapeHtml(a)}</div>`).join('') || (f.alertas.length ? '' : '<span class="otro">Sin antecedentes registrados</span>')}</td>
            <td>${f.finanzas?.deuda > 0 ? `$${Number(f.finanzas.deuda).toLocaleString('es-CL')}` : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`).join('');

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de ruta ${escapeHtml(hojaRutaFecha)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0B1220;margin:24px;font-size:12px}
        h1{font-size:18px;margin:0 0 4px}.sub{color:#64748b;margin-bottom:18px;text-transform:capitalize}
        h2{font-size:14px;margin:22px 0 8px;border-bottom:2px solid #C9A24B;padding-bottom:4px}h2 span{font-weight:normal;color:#64748b;font-size:11px;margin-left:8px}
        table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #cbd5e1;padding:6px}
        td{vertical-align:top;border-bottom:1px solid #e2e8f0;padding:7px 6px}td.hora{font-weight:bold;white-space:nowrap}
        small{color:#64748b}.alerta{color:#b91c1c;font-weight:bold}.otro{color:#475569}.tag{background:#dbeafe;color:#1d4ed8;font-size:9px;padding:1px 5px;border-radius:4px}
        tr{page-break-inside:avoid}
      </style></head><body>
      <h1>Hoja de ruta · Clínica Dignidad</h1><div class="sub">${escapeHtml(fechaTxt)}</div>
      ${secciones || '<p>No hay citas para este día.</p>'}
      <script>window.onload=()=>{window.print()}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return toast.error('El navegador bloqueó la ventana de impresión');
    w.document.open(); w.document.write(html); w.document.close();
  };
  
  const generarYMostrarResumen = async (presupuestoId: string, cita: any) => {
    const toastId = toast.loading("Generando resumen del tratamiento...");
    try {
        const { data: items } = await supabase.from('presupuesto_items').select('observacion, precio_pactado, abonado, prestaciones:prestacion_id("Nombre Accion", "Nombre")').eq('presupuesto_id', presupuestoId).neq('estado', 'cancelada');
        if (!items || items.length === 0) { toast.error("El plan seleccionado no contiene tratamientos activos.", { id: toastId }); return; }
        let total = 0; let abonado = 0;
        let detalleText = `Hola ${cita.pacientes?.nombre} ${cita.pacientes?.apellido}, te compartimos el detalle actualizado de tu Plan de Tratamiento Dental:\n\n`;
        items.forEach((item: any) => {
            let nombreDisplay = item.prestaciones?.["Nombre Accion"] || item.prestaciones?.["Nombre"] || 'Tratamiento';
            if (item.observacion && item.observacion.includes('|')) nombreDisplay = item.observacion.split('|')[0].trim();
            let precio = Number(item.precio_pactado || 0);
            total += precio; abonado += Number(item.abonado || 0);
            detalleText += `🔸 ${nombreDisplay} - $${precio.toLocaleString('es-CL')}\n`;
        });
        detalleText += `\n💰 *Total Plan:* $${total.toLocaleString('es-CL')}`;
        if (abonado > 0) detalleText += `\n✅ *Abonado:* $${abonado.toLocaleString('es-CL')}`;
        if (total - abonado > 0) detalleText += `\n🔴 *Saldo Pendiente:* $${(total - abonado).toLocaleString('es-CL')}`;
        detalleText += `\n\n🗓️ *Agenda tus próximas sesiones online aquí:*\nhttps://confirmar-cita-dignidad.vercel.app/agendar`;
        detalleText += `\n\nCualquier consulta, estamos a tu disposición. ¡Saludos! 🦷`;
        setModalEnvioPresupuesto({ abierto: true, cita, texto: detalleText });
        toast.success("Resumen generado", { id: toastId });
    } catch (error) { toast.error("Error al generar resumen", { id: toastId }); }
  }

  const abrirEnvioPresupuesto = async (cita: any) => {
    if (!cita.paciente_id) return toast.error("Cita sin paciente asociado");
    const toastId = toast.loading("Buscando tratamientos...");
    try {
        const { data: presupuestos } = await supabase.from('presupuestos').select('id, nombre_tratamiento').eq('paciente_id', cita.paciente_id).neq('estado', 'finalizado');
        if (!presupuestos || presupuestos.length === 0) { toast.error("El paciente no tiene planes de tratamiento activos.", { id: toastId }); return; }
        if (presupuestos.length === 1) { await generarYMostrarResumen(presupuestos[0].id, cita); toast.dismiss(toastId); } 
        else { setModalSeleccionTratamiento({ abierto: true, cita, tratamientos: presupuestos }); toast.dismiss(toastId); }
    } catch (error) { toast.error("Error al buscar tratamientos", { id: toastId }); }
  }

  const handleGuardarBloqueoRapido = async () => {
      if (!profesionalBloqueo) return toast.error("Debe seleccionar un profesional para bloquear su agenda.");
      if (!motivoBloqueo.trim()) return toast.error("Debe ingresar un motivo para el bloqueo.");
      if (!bloqueoTodoElDia && (!horaInicioBloqueo || !horaFinBloqueo)) return toast.error("Debe especificar hora de inicio y fin.");
      if (!bloqueoTodoElDia && horaFinBloqueo <= horaInicioBloqueo) return toast.error("La hora de término debe ser posterior a la de inicio.");
      
      const profObj = profesionales.find(p => p.user_id === profesionalBloqueo);
      if (!profObj) return toast.error("No se encontró el profesional seleccionado.");

      const fechaBloqueo = getLocalDateISO(selectedDate);
      setCargandoAccion(true);

      try {
          const { data: citasAfectadas } = await supabase.from('citas')
            .select('id, inicio, fin')
            .eq('profesional_id', profesionalBloqueo)
            .gte('inicio', `${fechaBloqueo}T00:00:00`)
            .lte('inicio', `${fechaBloqueo}T23:59:59`)
            .not('estado', 'in', '("cancelada","atendido","no_asiste")');

          let choquesCount = 0;
          if (citasAfectadas && citasAfectadas.length > 0) {
              if (bloqueoTodoElDia) {
                  choquesCount = citasAfectadas.length;
              } else {
                  const bStart = new Date(`${fechaBloqueo}T${horaInicioBloqueo}`).getTime();
                  const bEnd = new Date(`${fechaBloqueo}T${horaFinBloqueo}`).getTime();
                  
                  choquesCount = citasAfectadas.filter(c => {
                      const cStart = new Date(c.inicio.replace(' ', 'T')).getTime();
                      const cEnd = new Date(c.fin.replace(' ', 'T')).getTime();
                      return cStart < bEnd && cEnd > bStart;
                  }).length;
              }
          }

          if (choquesCount > 0) {
              const confirmacion = window.confirm(`⚠️ ADVERTENCIA DE CHOQUE:\n\nHay ${choquesCount} cita(s) agendada(s) que choca(n) con este bloqueo.\n\nSi continúas, esas citas quedarán "Huérfanas" y tendrás que reagendarlas manualmente.\n\n¿Estás seguro de bloquear la agenda?`);
              if (!confirmacion) {
                  setCargandoAccion(false);
                  return;
              }
          }

          const payload = {
              profesional_id: profObj.id, 
              fecha: fechaBloqueo,
              motivo: motivoBloqueo,
              hora_inicio: bloqueoTodoElDia ? null : horaInicioBloqueo,
              hora_fin: bloqueoTodoElDia ? null : horaFinBloqueo
          };
          
          const { error } = await supabase.from('bloqueos_agenda').insert([payload]);
          if (error) throw error;
          
          const nombreProfesional = `${profObj.nombre} ${profObj.apellido}`;
          await supabase.from('auditoria_clinica').insert([{
              usuario_id: usuarioLogueado,
              accion: 'INSERT / BLOQUEO AGENDA',
              tabla: 'bloqueos_agenda',
              detalles: `Bloqueó agenda para Dr/a. ${nombreProfesional} el día ${fechaBloqueo}. Motivo: ${motivoBloqueo}.`
          }]);

          toast.success("Agenda bloqueada exitosamente");
          setModalBloqueo(false);
          await fetchCitasAgenda();
      } catch (e) { toast.error("Error al bloquear el horario."); } finally { setCargandoAccion(false); }
  }

  async function fetchCitasOcupadas() {
    const dias = getDiasLunesSabado(semanaInicio);
    const inicioSemana = `${getLocalDateISO(dias[0])}T00:00:00`;
    const finSemana = `${getLocalDateISO(dias[5])}T23:59:59`;
    
    const { data } = await supabase.from('citas')
      .select('id, inicio, fin, estado_confirmacion, motivo')
      .eq('profesional_id', filtro.profesional_id)
      .gte('inicio', inicioSemana).lte('inicio', finSemana)
      .neq('estado', 'cancelada');
      
    let filtradas = citaEnReprogramacion ? (data || []).filter(c => c.id !== citaEnReprogramacion.id) : (data || []);
    filtradas = filtradas.filter(c => !(c.estado_confirmacion === 'pendiente' && c.motivo?.includes('Online')));
    
    setCitasOcupadas(filtradas);
  }

  async function fetchHorariosDoctor() {
    const { data } = await supabase.from('disponibilidad_profesional').select('*').eq('profesional_id', filtro.profesional_id)
    setHorariosConfigurados(data || [])
  }

  const esHorarioLaboral = (fecha: string, hora: string, duracionMinutos: number) => {
    const diaSemana = new Date(fecha + 'T00:00:00').getDay();
    const slotStart = new Date(`${fecha}T${hora}:00`).getTime();
    const slotEnd = slotStart + duracionMinutos * 60000;

    // Horarios especiales del día tienen prioridad sobre el horario semanal
    const horariosEspecialesDelDia = horariosConfigurados.filter(h => h.fecha_especifica === fecha);
    const horariosAUsar = horariosEspecialesDelDia.length > 0
      ? horariosEspecialesDelDia
      : horariosConfigurados.filter(h => h.dia_semana === diaSemana && !h.fecha_especifica);

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
        if (citaEnReprogramacion && cita.id === citaEnReprogramacion.id) return false;
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

  const toggleHora = (fecha: string, hora: string) => {
    setHorasSeleccionadas(prev => {
      const yaSeleccionada = prev.some(h => h.fecha === fecha && h.hora === hora);
      if (yaSeleccionada) {
        return prev.filter(h => !(h.fecha === fecha && h.hora === hora));
      }
      // Al reprogramar solo puede haber UN horario: reemplazamos la selección
      if (citaEnReprogramacion) return [{ fecha, hora, duracion: filtro.duracionDefault }];
      return [...prev, { fecha, hora, duracion: filtro.duracionDefault }];
    });
  };

  const handleSlotClick = (fecha: string, hora: string) => {
    const sel = horasSeleccionadas.some(x => x.fecha === fecha && x.hora === hora);
    if (sel) {
      toggleHora(fecha, hora);
      return;
    }

    const laboral = esHorarioLaboral(fecha, hora, filtro.duracionDefault);
    const chocaConCita = esCitaOcupada(fecha, hora, filtro.duracionDefault);
    const chocaConBloqueo = esHorarioBloqueado(fecha, hora, filtro.duracionDefault);
    
    const profObj = profesionales.find(p => p.user_id === filtro.profesional_id);
    const diaCompletamenteBloqueado = bloqueosSemana.some(b => b.profesional_id === profObj?.id && b.fecha === fecha && (!b.hora_inicio || !b.hora_fin));
    
    const chocaConSeleccion = !citaEnReprogramacion && horasSeleccionadas.some(s => {
        if (s.fecha === fecha && s.hora === hora) return false; 
        const selStart = new Date(`${s.fecha}T${s.hora}:00`).getTime();
        const selEnd = selStart + s.duracion * 60000;
        const slotStart = new Date(`${fecha}T${hora}:00`).getTime();
        const slotEnd = slotStart + filtro.duracionDefault * 60000;
        return slotStart < selEnd && slotEnd > selStart;
    });

    if (diaCompletamenteBloqueado) return toast.error("Este día está completamente bloqueado.");
    if (chocaConBloqueo) return toast.error("El horario seleccionado está bloqueado por el especialista.");
    if (!laboral) return toast.error("Fuera del horario laboral del especialista.");
    if (chocaConSeleccion) return toast.warning("El horario choca con otra selección actual.");
    
    if (chocaConCita) {
        if (!window.confirm(`⚠️ El bloque completo que intentas agendar choca con otra cita existente. ¿Deseas forzar un SOBRECUPO?`)) {
            return;
        }
    }
    
    toggleHora(fecha, hora);
  };

  const buscarPacientes = async (term: string) => {
    const seq = ++busquedaSeq.current;
    // Quitamos caracteres que rompen el filtro .or() de PostgREST
    const palabras = term.trim().split(/\s+/).map(p => p.replace(/[,()*%\\"']/g, '')).filter(Boolean);
    if (palabras.length === 0) { setPacientesEncontrados([]); return; }
    let query = supabase.from('pacientes').select('*');
    palabras.forEach(palabra => {
      const fuzzy = `%${palabra.split('').join('%')}%`;
      if (/\d/.test(palabra)) {
        // RUT: si viene con guión buscamos por el cuerpo (sin DV), sin puntos
        const limpio = palabra.replace(/\./g, '');
        const rutBusqueda = limpio.includes('-') ? limpio.split('-')[0].replace(/\D/g, '') : limpio.replace(/[^0-9kK]/g, '').toUpperCase();
        query = query.or(`nombre.ilike.${fuzzy},apellido.ilike.${fuzzy},rut.ilike.%${rutBusqueda}%`);
      } else {
        query = query.or(`nombre.ilike.${fuzzy},apellido.ilike.${fuzzy}`);
      }
    });
    const { data } = await query.limit(8);
    if (seq !== busquedaSeq.current) return;
    setPacientesEncontrados(data || []);
  }

  const onCambioBusquedaPaciente = (valor: string) => {
    setBusqueda(valor);
    if (busquedaTimer.current) clearTimeout(busquedaTimer.current);
    if (!valor.trim()) { busquedaSeq.current++; setPacientesEncontrados([]); return; }
    busquedaTimer.current = setTimeout(() => buscarPacientes(valor), 300);
  }

  const seleccionarPacienteExistente = async (paciente: any) => {
    if (!paciente) return;
    if (paciente.activo === false) {
        toast.error(`Paciente Inhabilitado: ${paciente.motivo_deshabilitado || 'No se pueden agendar citas.'}`);
        return;
    }
    setPacienteSeleccionado(paciente); 
    setBusqueda(`${paciente.nombre} ${paciente.apellido}`); 
    setPacientesEncontrados([]);
    
    const { data } = await supabase.from('presupuestos').select('id, nombre_tratamiento').eq('paciente_id', paciente.id).neq('estado', 'finalizado').order('fecha_creacion', { ascending: false });
    setTratamientosPaciente(data || []);
    setTratamientoSeleccionadoId('MANUAL'); 
  };

  const handleGuardar = async () => {
    if (cargandoAccion) return;
    if (horasSeleccionadas.length === 0) return toast.error("Selecciona al menos un horario");
    if (!filtro.profesional_id) return toast.error("Selecciona un especialista");
    if (modoNuevoPaciente && (!nuevoPaciente.nombre || !nuevoPaciente.apellido)) { return toast.error("Faltan datos del nuevo paciente", { description: "Nombre y Apellido son obligatorios." }); }
    if (!modoNuevoPaciente && !pacienteSeleccionado) return toast.error("Selecciona un paciente");
    setCargandoAccion(true);
    try {
      let pId = pacienteSeleccionado?.id;
      let pNombreFull = pacienteSeleccionado ? `${pacienteSeleccionado.nombre} ${pacienteSeleccionado.apellido}` : "";
      let pTelefono = pacienteSeleccionado?.telefono || null;

      if (modoNuevoPaciente && !citaEnReprogramacion) {
        let rutFinal: string | null = nuevoPaciente.rut.toUpperCase().trim();
        if (esOtroDocumento) { if (!rutFinal) rutFinal = `OTRO-DOC-${Date.now()}`; } else { rutFinal = rutFinal.replace(/[^0-9kK-]/g, ''); }
        if (!rutFinal) rutFinal = `SIN-RUT-${Date.now()}`;
        
        // Formateo de teléfono a +56XXXXXXXXX
        let telefonoFinal = nuevoPaciente.telefono ? nuevoPaciente.telefono.trim() : null;
        if (telefonoFinal) {
            const numLimpio = telefonoFinal.replace(/\D/g, '');
            if (numLimpio.length === 9) telefonoFinal = `+56${numLimpio}`;
            else if (numLimpio.length === 11 && numLimpio.startsWith('56')) telefonoFinal = `+${numLimpio}`;
        }

        const { data: pNew, error: pErr } = await supabase.from('pacientes').insert([{ 
            nombre: nuevoPaciente.nombre.toUpperCase().trim(), 
            apellido: nuevoPaciente.apellido.toUpperCase().trim(), 
            rut: rutFinal, 
            telefono: telefonoFinal,
            fecha_nacimiento: nuevoPaciente.fecha_nacimiento || null, 
            sexo: nuevoPaciente.sexo || null, 
            activo: true 
        }]).select().single();
        if (pErr) {
          if ((pErr as any).code === '23505') { toast.error("Ya existe un paciente con ese RUT", { description: "Búscalo en el buscador en vez de crearlo de nuevo." }); setCargandoAccion(false); return; }
          throw pErr;
        }
        pId = pNew.id; pNombreFull = `${nuevoPaciente.nombre} ${nuevoPaciente.apellido}`; pTelefono = telefonoFinal;
      }

      const parsearAFechaLocal = (fechaStr: string, horaStr: string, duracionMin: number) => {
        const finDate = new Date(new Date(`${fechaStr}T${horaStr}:00`).getTime() + duracionMin * 60000);
        const finH = finDate.getHours().toString().padStart(2, '0');
        const finM = finDate.getMinutes().toString().padStart(2, '0');
        return { inicio: `${fechaStr}T${horaStr}:00`, fin: `${fechaStr}T${finH}:${finM}:00` };
      };

      let citaIdParaConfirmacion = null;

      if (citaEnReprogramacion) {
        const s = horasSeleccionadas[0];
        const { inicio, fin } = parsearAFechaLocal(s.fecha, s.hora, s.duracion);
        const { error: errUpd } = await supabase.from('citas').update({ inicio, fin, profesional_id: filtro.profesional_id, estado: 'reprogramada', motivo: nuevoTratamientoNombre.toUpperCase() || citaEnReprogramacion.motivo, modificado_por: usuarioLogueado }).eq('id', citaEnReprogramacion.id);
        if (errUpd) throw errUpd;
        citaIdParaConfirmacion = citaEnReprogramacion.id;
        await supabase.from('auditoria_clinica').insert([{ usuario_id: usuarioLogueado, accion: 'UPDATE / REPROGRAMACIÓN', tabla: 'citas', detalles: `Reprogramó la cita de ${pNombreFull} para el ${s.fecha} a las ${s.hora}.` }]);
      } else {
        const ordenadas = [...horasSeleccionadas].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
        const nuevasCitas = ordenadas.map(s => {
          const { inicio, fin } = parsearAFechaLocal(s.fecha, s.hora, s.duracion);
          return { paciente_id: pId, profesional_id: filtro.profesional_id, presupuesto_id: (tratamientoSeleccionadoId && tratamientoSeleccionadoId !== 'MANUAL') ? tratamientoSeleccionadoId : null, inicio, fin, estado: 'programada', motivo: nuevoTratamientoNombre.toUpperCase() || 'CONSULTA', creado_por: usuarioLogueado };
        });
        const { data: citasCreadas, error: errIns } = await supabase.from('citas').insert(nuevasCitas).select('id');
        if (errIns) throw errIns;
        if (citasCreadas && citasCreadas.length > 0) citaIdParaConfirmacion = citasCreadas[0].id;
        const detallesCitas = nuevasCitas.map(c => `Cita para ${pNombreFull} el ${c.inicio.split('T')[0]} a las ${c.inicio.split('T')[1].substring(0,5)}`).join('; ');
        await supabase.from('auditoria_clinica').insert([{ usuario_id: usuarioLogueado, accion: 'INSERT / CITA', tabla: 'citas', detalles: `Agendó: ${detallesCitas}` }]);
      }

      const citasOrdenadas = [...horasSeleccionadas].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
      setCitaConfirmadaData({ paciente: pNombreFull.toUpperCase(), citas: citasOrdenadas, telefono: pTelefono, citaId: citaIdParaConfirmacion });
      setMostrarTicket(true); await fetchCitasAgenda();
    } catch (e: any) { console.error(e); toast.error("Error al guardar", { description: e?.message }); setCargandoAccion(false); }
  };

  const navegarSemana = (sentido: 'atras' | 'adelante') => {
    const nueva = new Date(semanaInicio); nueva.setDate(nueva.getDate() + (sentido === 'adelante' ? 7 : -7)); setSemanaInicio(nueva);
  }

  const resetEstados = () => { setDiaSugerido(null); setPaso(1); setHorasSeleccionadas([]); setPacienteSeleccionado(null); setBusqueda(''); setPacientesEncontrados([]); setModoNuevoPaciente(false); setNuevoTratamientoNombre(''); setCitasOcupadas([]); setCitaEnReprogramacion(null); setSemanaInicio(new Date()); setTratamientosPaciente([]); setTratamientoSeleccionadoId(null); setNuevoPaciente({ nombre: '', apellido: '', rut: '', telefono: '', fecha_nacimiento: '', sexo: '' }); setBloqueosSemana([]); setCargandoAccion(false); }

  const abrirCaja = (cita: any) => {
    const idPaciente = cita.pacientes?.id || cita.paciente_id;
    if (!idPaciente) return toast.error("Cita no tiene paciente asignado");
    router.push(`/pacientes/${idPaciente}/pagos`);
  }

  const procesarPagoCaja = async () => {
    const pago = Number(montoIngresado);
    if (!montoIngresado || pago <= 0) return toast.error("Ingrese un monto válido a recaudar");
    const requiereComprobante = metodoPago !== 'Saldo a Favor';
    if (requiereComprobante && !codigoTransaccion.trim()) return toast.error("Ingrese el N° de boleta o código de transacción");
    if (metodoPago === 'Saldo a Favor') { if (pago > saldoAFavor) return toast.error("El monto supera el saldo disponible en la billetera."); }

    setCargandoAccion(true); 
    let montoRestante = pago;
    
    try {
        let currentCajaId = cajaActivaId;
        if (!currentCajaId) {
            const { data: perfilData } = await supabase.from('perfiles').select('nombre_completo').eq('id', usuarioLogueado).maybeSingle();
            const userName = perfilData?.nombre_completo || 'Recepcionista';
            const { data: nuevaCaja, error: errCaja } = await supabase.from('sesiones_caja').insert([{ usuario_id: usuarioLogueado, nombre_responsable: userName, monto_apertura: 0, estado: 'abierta', fecha_apertura: new Date().toISOString() }]).select('id').single();
            if (errCaja) throw errCaja;
            currentCajaId = nuevaCaja.id; setCajaActivaId(currentCajaId); toast.success("Turno de caja iniciado automáticamente ($0 inicial)");
        }

        for (const item of deudasPaciente) {
            if (montoRestante <= 0) break;
            const aAbonar = Math.min(item.deuda, montoRestante);
            const detalleAbono = { id: item.id, prestacion: item.nombreDisplay, precio: item.precio_pactado, doctor: item.doctor, abonado_ahora: aAbonar };
            await supabase.from('pagos').insert([{ paciente_id: pacientePago.id, monto: aAbonar, metodo_pago: metodoPago, numero_referencia: codigoTransaccion.trim() || null, numero_boleta: codigoTransaccion.trim() || 'S/N', fecha_pago: new Date().toISOString(), item_id: item.id, comentario: JSON.stringify([detalleAbono]), caja_id: currentCajaId }]);
            await supabase.from('presupuesto_items').update({ abonado: Number(item.abonado) + aAbonar }).eq('id', item.id);
            montoRestante -= aAbonar;
        }
        
        let nuevoSaldo = saldoAFavor;
        if (metodoPago === 'Saldo a Favor') {
            nuevoSaldo = saldoAFavor - pago; await supabase.from('pacientes').update({ saldo_a_favor: nuevoSaldo }).eq('id', pacientePago.id); toast.success(`Se utilizaron $${pago.toLocaleString('es-CL')} de su saldo a favor.`);
        } else {
            if (montoRestante > 0) {
                const detalleSobrante = [{ prestacion: "Saldo a Favor (Abono extra/Vuelto)", precio: montoRestante, abonado_ahora: montoRestante }];
                await supabase.from('pagos').insert([{ paciente_id: pacientePago.id, monto: montoRestante, metodo_pago: metodoPago, numero_referencia: codigoTransaccion.trim() || null, numero_boleta: codigoTransaccion.trim() || 'S/N', fecha_pago: new Date().toISOString(), comentario: JSON.stringify(detalleSobrante), caja_id: currentCajaId }]);
                nuevoSaldo = saldoAFavor + montoRestante; await supabase.from('pacientes').update({ saldo_a_favor: nuevoSaldo }).eq('id', pacientePago.id); toast.info(`¡Quedó un vuelto de $${montoRestante.toLocaleString('es-CL')} guardado a favor del paciente!`);
            } else { toast.success(`Pago procesado exitosamente.`); }
        }

        setSaldoAFavor(nuevoSaldo); setModalPagoAbierto(false); setMontoIngresado(''); setCodigoTransaccion(''); await fetchCitasAgenda(); 
    } catch (e) { toast.error("Ocurrió un error al procesar el pago"); } finally { setCargandoAccion(false); }
  }

  const calcularDeudaTotalCaja = () => deudasPaciente.reduce((acc, curr) => acc + curr.deuda, 0);

  // FIX: el sobrecupo se calcula sobre TODAS las citas (antes dependía del texto del buscador)
  const sobrecupoIds = useMemo(() => {
    const ids = new Set<string>();
    const esPendienteWeb = (c: any) => c.estado_confirmacion === 'pendiente' && c.motivo?.includes('Online');
    const validas = citasDia.filter(c => c.profesional_id && !esPendienteWeb(c));
    validas.forEach(c => {
      const cIni = new Date(c.inicio.replace(' ', 'T')).getTime();
      const cFin = new Date(c.fin.replace(' ', 'T')).getTime();
      const esSobrecupo = validas.some(otra => {
        if (otra.id === c.id) return false;
        if (String(otra.profesional_id) !== String(c.profesional_id)) return false;
        const oIni = new Date(otra.inicio.replace(' ', 'T')).getTime();
        const oFin = new Date(otra.fin.replace(' ', 'T')).getTime();
        if (cIni >= oFin || cFin <= oIni) return false;
        const timeC = c.created_at ? new Date(c.created_at).getTime() : 0;
        const timeO = otra.created_at ? new Date(otra.created_at).getTime() : 0;
        if (timeC !== timeO && timeC > 0 && timeO > 0) return timeC > timeO;
        return String(c.id) > String(otra.id);
      });
      if (esSobrecupo) ids.add(c.id);
    });
    return ids;
  }, [citasDia]);
  const checkIsSobrecupo = (c: any) => sobrecupoIds.has(c.id);

  const GOLD = '#C9A24B'; const NAVY = '#0E1B2E'; const GOLD_LIGHT = '#E8CD8A'; const INK = '#0B1220';

  const etiquetaFecha = vistaAgenda === 'dia'
    ? selectedDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })
    : (() => { const d = getDiasLunesSabado(selectedDate); return `${d[0].getDate()} – ${d[5].toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`; })();

  if (cargandoPagina) return (
    <div className="h-full flex flex-col items-center justify-center bg-[#FBF8F2] relative overflow-hidden">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: "easeOut" }} className="flex flex-col items-center z-10">
            <div className="w-20 h-20 bg-[#0A111F] rounded-3xl flex items-center justify-center mb-6 shadow-2xl relative">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: "linear" }} className="absolute inset-[-2px] rounded-3xl border border-transparent border-t-[#C9A24B] border-b-[#C9A24B]/30 opacity-70" />
                <svg width="32" height="36" viewBox="0 0 24 24" fill="none" stroke="#C9A24B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.5C12 20.5 15 19 16 16C17.3333 12 18 8 16 5C15 3 13 3 12 5C11 3 9 3 8 5C6 8 6.66667 12 8 16C9 19 12 20.5 12 20.5Z"/></svg>
            </div>
            <h2 className="text-xl font-black tracking-widest uppercase text-[#0A111F]">Cargando Agenda</h2>
            <p className="text-xs font-bold text-slate-400 mt-2">Sincronizando con la base de datos...</p>
            <div className="w-48 h-1 bg-slate-200 rounded-full mt-6 overflow-hidden">
            <motion.div initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }} className="h-full bg-[#C9A24B] rounded-full" />
            </div>
        </motion.div>
    </div>
  )

  return (
    <div className="min-h-full bg-[#FBF8F2] font-sans text-slate-800 pb-32 md:pb-24 text-left p-4 sm:p-6 md:p-10">
      
      {/* HEADER DE LA PÁGINA AGENDA */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-[#0A111F]">
          Agenda <span className="italic font-serif" style={{ color: GOLD }}>Clínica</span>
        </h1>
        
        <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-center gap-2 sm:gap-3 w-full xl:w-auto mt-4 xl:mt-0">
          
          <button onClick={() => setModalOnlineAbierto(true)} className="relative w-full lg:w-auto justify-center px-2 md:px-5 py-2.5 md:py-2.5 rounded-lg border border-blue-200 text-blue-600 text-[10px] md:text-[11px] font-bold uppercase tracking-wider hover:bg-blue-50 transition-colors flex items-center gap-2 bg-white">
            <Globe className="md:w-[14px] md:h-[14px]" size={14} /> Validar Web
            {citasOnlinePendientes.length > 0 && (
               <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black animate-pulse shadow-md">{citasOnlinePendientes.length}</span>
            )}
          </button>

          <button onClick={abrirRecordatorios} className="w-full lg:w-auto justify-center px-2 md:px-5 py-2.5 md:py-2.5 rounded-lg border border-emerald-200 text-emerald-600 text-[10px] md:text-[11px] font-bold uppercase tracking-wider hover:bg-emerald-50 transition-colors flex items-center gap-2 bg-white">
            <BellRing className="md:w-[14px] md:h-[14px]" size={14} /> Recordar Mañana
          </button>

          <button onClick={abrirHojaRuta} className="w-full lg:w-auto justify-center px-2 md:px-5 py-2.5 md:py-2.5 rounded-lg border border-slate-200 text-slate-600 text-[10px] md:text-[11px] font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors flex items-center gap-2 bg-white">
            <ClipboardList className="text-[#C9A24B] md:w-[14px] md:h-[14px]" size={14} /> Hoja de Ruta
          </button>

          <button onClick={abrirBuscarHora} className="w-full lg:w-auto justify-center px-2 md:px-5 py-2.5 md:py-2.5 rounded-lg border border-[#C9A24B] text-[#8A6D2F] text-[10px] md:text-[11px] font-bold uppercase tracking-wider hover:bg-[#C9A24B]/10 transition-colors flex items-center gap-2 bg-white">
            <Search className="md:w-[14px] md:h-[14px]" size={14} /> Buscar Hora
          </button>

          {puedeVerFinanzas && (
            <button onClick={() => setModalBloqueo(true)} className="w-full lg:w-auto justify-center px-2 md:px-5 py-2.5 md:py-2.5 rounded-lg border border-red-200 text-red-500 text-[10px] md:text-[11px] font-bold uppercase tracking-wider hover:bg-red-50 transition-colors flex items-center gap-2 bg-white">
              <Lock className="md:w-[14px] md:h-[14px]" size={14} /> Bloquear
            </button>
          )}
          <Link prefetch={false} href="/diaria" className="w-full lg:w-auto justify-center px-2 md:px-5 py-2.5 md:py-2.5 rounded-lg border border-[#C9A24B]/30 text-slate-600 text-[10px] md:text-[11px] font-bold uppercase tracking-wider hover:bg-[#C9A24B]/5 transition-colors flex items-center gap-2 bg-white">
            <CalendarDays className="text-[#C9A24B] md:w-[14px] md:h-[14px]" size={14} /> <span className="truncate">Vista Diaria</span>
          </Link>
          <button onClick={() => { fetchCitasHuerfanas(); setModalHuerfanasAbierto(true); }} className="w-full lg:w-auto justify-center px-2 md:px-5 py-2.5 md:py-2.5 rounded-lg border border-amber-200 text-slate-600 text-[10px] md:text-[11px] font-bold uppercase tracking-wider hover:bg-amber-50 transition-colors flex items-center gap-2 bg-white">
            <AlertTriangle className="text-amber-500 md:w-[14px] md:h-[14px]" size={14} /> Huérfanas
          </button>
          <button onClick={() => { resetEstados(); setModalAbierto(true); }} className="w-full lg:w-auto justify-center px-2 md:px-6 py-2.5 md:py-2.5 rounded-lg font-bold text-[10px] md:text-[11px] uppercase tracking-wider shadow-md transition-all flex items-center gap-2 text-[#0A111F] bg-[#C9A24B] hover:bg-[#B38D3A]">
            <Plus className="md:w-[14px] md:h-[14px]" size={14} strokeWidth={3} /> Agendar
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-start gap-3 md:gap-4 mb-8">
        
        <div className="bg-white border border-slate-200 rounded-full px-4 md:px-5 py-3 md:py-2 shadow-sm flex items-center gap-2 w-full md:w-auto justify-between md:justify-start">
          <Users size={16} className="text-[#C9A24B] shrink-0"/>
          <select 
            className="text-base sm:text-sm md:text-[11px] font-bold uppercase text-slate-600 bg-transparent outline-none cursor-pointer pr-4 w-full disabled:cursor-not-allowed disabled:opacity-80" 
            value={filtroEspecialista} 
            onChange={(e) => setFiltroEspecialista(e.target.value)}
            disabled={!puedeVerAgendaCompleta}
          >
            {puedeVerAgendaCompleta && <option value="Todos">Todos los especialistas</option>}
            {profesionales
              .filter(p => puedeVerAgendaCompleta || p.user_id === usuarioLogueado)
              .map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
          </select>
        </div>

        <div className="flex items-center justify-between bg-white rounded-full p-1 border border-slate-200 shadow-sm w-full md:w-auto">
          <button onClick={() => setVistaAgenda('dia')} className={`flex-1 justify-center px-4 md:px-6 py-2.5 md:py-2 rounded-full text-sm md:text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${vistaAgenda === 'dia' ? 'bg-[#C9A24B] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            <List className="md:w-[14px] md:h-[14px]" size={16} /> Día
          </button>
          <button onClick={() => setVistaAgenda('semana')} className={`flex-1 justify-center px-4 md:px-6 py-2.5 md:py-2 rounded-full text-sm md:text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${vistaAgenda === 'semana' ? 'bg-[#C9A24B] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            <LayoutGrid className="md:w-[14px] md:h-[14px]" size={16} /> Semana
          </button>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex-1 flex items-center justify-between bg-white rounded-full px-2 md:px-4 py-2 md:py-1.5 border border-slate-200 shadow-sm">
            <button onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setDate(newDate.getDate() - (vistaAgenda === 'semana' ? 7 : 1));
              setSelectedDate(newDate);
            }} className="p-2 text-slate-400 hover:text-[#0A111F] transition-colors" title={vistaAgenda === 'semana' ? 'Semana anterior' : 'Día anterior'}><ChevronLeft className="md:w-[16px] md:h-[16px]" size={20} /></button>
            
            <div className="flex-1 relative flex items-center justify-center px-4 md:px-6 cursor-pointer group" onClick={() => { try { dateInputRef.current?.showPicker(); } catch { dateInputRef.current?.focus(); } }}>
               <CalendarIcon size={16} className="mr-2 text-slate-400 shrink-0" />
               <span className="text-[13px] md:text-[12px] font-bold text-slate-700 capitalize min-w-[120px] text-center">
                 {etiquetaFecha}
               </span>
               <input ref={dateInputRef} type="date" className="sr-only" value={getLocalDateISO(selectedDate)} onChange={(e) => { if(e.target.value) { const [y, m, d] = e.target.value.split('-'); setSelectedDate(new Date(Number(y), Number(m)-1, Number(d))); } }} />
            </div>

            <button onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setDate(newDate.getDate() + (vistaAgenda === 'semana' ? 7 : 1));
              setSelectedDate(newDate);
            }} className="p-2 text-slate-400 hover:text-[#0A111F] transition-colors" title={vistaAgenda === 'semana' ? 'Semana siguiente' : 'Día siguiente'}><ChevronRight className="md:w-[16px] md:h-[16px]" size={20} /></button>
          </div>
          {!esHoySeleccionado && (
            <button onClick={() => setSelectedDate(new Date())} className="px-4 py-3 md:py-2.5 rounded-full bg-white border border-[#C9A24B]/40 text-[#8A6D2F] text-[11px] md:text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-[#C9A24B]/10 transition-colors shrink-0">
              Hoy
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-8 text-left">
         <div className="relative w-full max-w-full sm:max-w-lg group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 md:w-[18px] md:h-[18px]" size={20} />
            <input 
               type="text" 
               placeholder="Buscar por paciente o RUT..." 
               className="w-full pl-12 pr-10 py-3.5 bg-white border border-slate-200 rounded-full text-base md:text-sm outline-none shadow-sm focus:border-[#C9A24B] transition-all"
               value={busquedaAgenda}
               onChange={(e) => setBusquedaAgenda(e.target.value)}
            />
            {busquedaAgenda && (
              <button onClick={() => setBusquedaAgenda('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Limpiar búsqueda"><X size={16} /></button>
            )}
         </div>
         <div className="bg-white text-slate-700 px-6 py-3.5 md:py-3 rounded-full border border-slate-200 shadow-sm flex items-center justify-center sm:justify-start gap-2 shrink-0 w-full sm:w-auto">
            <CalendarDays className="text-[#C9A24B] md:w-[16px] md:h-[16px]" size={18} />
            <span className="font-bold text-sm md:text-xs uppercase tracking-widest">
              {citasFiltradas.length} {vistaAgenda === 'dia' ? (esHoySeleccionado ? 'Citas hoy' : 'Citas del día') : 'Citas en la semana'}
            </span>
            {anuladasCount > 0 && (
              <>
                <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-300 mx-1"></span>
                <button onClick={() => setModalAnuladasAbierto(true)} className="font-bold text-sm md:text-xs uppercase tracking-widest text-red-500 hover:text-red-700 transition-colors">
                  {anuladasCount} Anuladas
                </button>
              </>
            )}
         </div>
      </div>

      {vistaAgenda === 'dia' && (
        <div className="relative pl-0 md:pl-[140px] pt-4 pb-20 mt-4 md:mt-0">
          
          {citasFiltradas.length > 0 && !cambiandoFecha && (
            <motion.div 
              initial={{ height: 0 }} 
              animate={{ height: '100%' }} 
              transition={{ duration: 0.8, ease: "easeOut" }} 
              className="absolute left-[70px] md:left-[100px] top-8 bottom-0 w-[2px] bg-gradient-to-b from-[#C9A24B]/60 to-[#C9A24B]/10 z-0 hidden md:block origin-top"
            />
          )}

          {cambiandoFecha && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3 md:-ml-[140px]">
              <Loader2 className="animate-spin text-[#C9A24B]" size={32} />
              <p className="text-[11px] font-black uppercase tracking-widest">Cargando citas...</p>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div 
                key={selectedDate.toISOString() + filtroEspecialista}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
            >
                {citasFiltradas.length > 0 && !cambiandoFecha ? citasFiltradas.map((c, index) => {
                const hInicio = horaDeStr(c.inicio);
                const hFin = horaDeStr(c.fin);
                const pNombre = c.pacientes?.nombre || 'S/N';
                const pApellido = c.pacientes?.apellido || '';
                const doctor = profesionales.find(p => p.user_id === c.profesional_id);
                const theme = getAvatarColorClass(pNombre + pApellido);
                const estadoConfig = ESTADOS_CITA[c.estado] || ESTADOS_CITA.programada;
                const isSobrecupo = checkIsSobrecupo(c);

                return (
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }} 
                        animate={{ opacity: 1, x: 0 }} 
                        transition={{ delay: Math.min(index, 10) * 0.05, duration: 0.3, ease: "easeOut" }}
                        key={c.id} 
                        className="relative mb-6 z-10 flex md:block flex-col gap-2 group"
                    >
                    <div className="md:absolute md:-left-[140px] md:top-4 md:w-[80px] text-left md:text-right flex md:block items-center justify-between md:justify-start gap-2 mb-2 md:mb-0 px-2 md:px-0">
                        <p className="text-xl md:text-xl font-black text-[#0A111F] leading-none tracking-tight group-hover:text-[#C9A24B] transition-colors">{hInicio}</p>
                        <p className="text-xs font-semibold text-slate-400 mt-1">{hFin}</p>
                    </div>

                    <motion.div 
                        initial={{ scale: 0 }} 
                        animate={{ scale: 1 }} 
                        transition={{ delay: Math.min(index, 10) * 0.05 + 0.2, type: "spring" }}
                        className={`hidden md:block absolute -left-[45px] top-5 w-3 h-3 rounded-full bg-white border-[3px] shadow-[0_0_0_6px_#FBF8F2] z-20 group-hover:scale-125 transition-transform ${isSobrecupo ? 'border-red-500' : 'border-[#C9A24B]'}`} 
                    />

                    <div className={`bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border border-l-4 ${theme.border} p-5 md:p-6 w-full flex flex-col gap-4 hover:-translate-y-0.5 ${isSobrecupo ? 'border-red-100 shadow-[0_4px_12px_rgba(239,68,68,0.08)]' : 'border-slate-100'}`}>
                        <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-4 sm:gap-0">
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                            <div className={`w-12 h-12 md:w-12 md:h-12 rounded-full ${theme.bg} ${theme.text} flex items-center justify-center font-bold text-lg shrink-0`}>
                            {getInitials(pNombre, pApellido)}
                            </div>
                            
                           <div className="relative flex-1">
                                <div className="flex flex-wrap gap-2 mb-1.5 items-center">
                                    {isSobrecupo && (
                                        <span className="bg-red-500 text-white text-[10px] md:text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 w-max animate-pulse shadow-sm">
                                            <AlertTriangle size={12} /> Cita de Sobrecupo
                                        </span>
                                    )}
                                    {c.motivo?.includes('Online') && (
                                        <span className="bg-blue-50 text-blue-600 border border-blue-100 text-[10px] md:text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 w-max shadow-sm">
                                            <Globe size={12} /> Agendamiento Web
                                        </span>
                                    )}
                                    {c.estado_confirmacion === 'confirmado' && (
                                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] md:text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 w-max shadow-sm">
                                            <CheckCircle2 size={12} /> Confirmó por link
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-black text-[#0A111F] uppercase tracking-wide leading-tight">{pNombre} {pApellido}</h3>
                                </div>
                                <div className="flex flex-col gap-1 mt-1.5">
                                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400 uppercase">
                                        <span>RUT: {c.pacientes?.rut || 'S/N'}</span>
                                        <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-300"></span>
                                        <span className="flex items-center gap-1"><Phone className="text-slate-400 md:w-[12px] md:h-[12px]" size={14} /> {c.pacientes?.telefono || 'Sin teléfono'}</span>
                                        <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-300"></span>
                                        <span className="flex items-center gap-1"><User className="text-slate-400 md:w-[12px] md:h-[12px]" size={14} /> Dr. {formatNombreDoctor(doctor?.nombre, doctor?.apellido)}</span>
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-400 opacity-60 tracking-wider">
                                      AGENDA: {c.creado_por && usuariosMap[c.creado_por] ? usuariosMap[c.creado_por].split(' ')[0] : 'WEB'}
                                    </span>
                                    {c.motivo && !c.motivo.includes('Online') && (
                                        <div className="flex items-center gap-1.5 text-[11px] md:text-[10px] font-black uppercase tracking-widest mt-1 w-fit px-2 py-1 rounded-md bg-slate-50 text-slate-500 border border-slate-200">
                                            <MessageSquareText size={12} />
                                            <span>{c.motivo}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className={`relative ${estadoConfig.bg} border ${estadoConfig.border} shadow-sm px-3 py-2 md:px-3 md:py-1.5 rounded-full flex items-center gap-2 text-xs md:text-[10px] font-black uppercase ${estadoConfig.text} transition-colors shrink-0 sm:ml-2 mt-2 sm:mt-0 self-start w-auto`}>
                            <div className={`w-2 h-2 rounded-full ${estadoConfig.dot}`}></div>
                            <select value={c.estado || 'programada'} onChange={(e) => actualizarEstadoCita(c.id, e.target.value)} className={`appearance-none bg-transparent outline-none cursor-pointer pr-5 font-black ${estadoConfig.text} text-base md:text-[10px]`}>
                            {Object.entries(ESTADOS_CITA).map(([key, val]) => {
                                let labelText = val.label.toUpperCase();
                                if (key === 'en_espera' && c.hora_llegada && c.estado === 'en_espera') {
                                    labelText = `ESPERA DESDE LAS ${horaDeStr(c.hora_llegada)}`;
                                }
                                return (
                                    <option key={key} value={key} className="text-slate-800 bg-white">
                                        {labelText}
                                    </option>
                                );
                            })}
                            </select>
                            <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${estadoConfig.text} opacity-60 md:w-[12px] md:h-[12px]`} size={14} />
                        </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-2 pt-4 border-t border-slate-50 gap-4">
                        <div>
                            {puedeVerFinanzas && c.requiereCobroInmediato ? (
                                <span onClick={() => abrirCaja(c)} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-[11px] md:text-[10px] font-black uppercase tracking-wider animate-pulse cursor-pointer inline-block">
                                🔔 POR COBRAR: ${c.finanzas?.deuda_realizada.toLocaleString('es-CL')}
                                </span>
                            ) : puedeVerFinanzas && c.estadoFinanciero === 'deuda' ? (
                                <span className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-[11px] md:text-[10px] font-black uppercase tracking-wider inline-block">
                                DEUDA: ${c.finanzas?.deuda.toLocaleString('es-CL')}
                                </span>
                            ) : puedeVerFinanzas && c.estadoFinanciero === 'saldado' ? (
                            <span className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-[11px] md:text-[10px] font-black uppercase tracking-wider inline-block">SALDADO</span>
                            ) : (
                            <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-[11px] md:text-[10px] font-black uppercase tracking-wider inline-block">SIN SALDO</span>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-start sm:justify-end">
                            <button onClick={() => iniciarReprogramacion(c)} className="p-2.5 md:p-2 border border-slate-200 rounded-lg text-slate-500 hover:text-[#C9A24B] hover:bg-slate-50 transition-colors" title="Reprogramar"><CalendarClock className="md:w-[16px] md:h-[16px]" size={18} /></button>
                            <button onClick={() => abrirEnvioPresupuesto(c)} className="p-2.5 md:p-2 border border-slate-200 rounded-lg text-slate-500 hover:text-blue-500 hover:bg-slate-50 transition-colors" title="Enviar Presupuesto"><FileText className="md:w-[16px] md:h-[16px]" size={18} /></button>
                            <button onClick={() => enviarRecordatorioConLink(c)} className="p-2.5 md:p-2 border border-slate-200 rounded-lg text-slate-500 hover:text-[#C9A24B] hover:bg-slate-50 transition-colors" title="Enviar link de confirmación"><LinkIcon className="md:w-[16px] md:h-[16px]" size={18} /></button>
                            <button onClick={() => enviarLinkSatisfaccion(c)} className="p-2.5 md:p-2 border border-slate-200 rounded-lg text-slate-500 hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Pedir reseña en Google Maps"><Star className="md:w-[16px] md:h-[16px]" size={18} /></button>

                            {puedeVerFinanzas && (
                            <button onClick={() => abrirCaja(c)} className="p-2.5 md:p-2 border border-slate-200 rounded-lg text-slate-500 hover:text-amber-500 hover:bg-slate-50 transition-colors" title="Caja/Cobrar"><Coins className="md:w-[16px] md:h-[16px]" size={18} /></button>
                            )}
                            
                            <button onClick={() => handleEliminarCita(c)} className="p-2.5 md:p-2 border border-slate-200 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar"><Trash2 className="md:w-[16px] md:h-[16px]" size={18} /></button>

                            {c.estado === 'no_asiste' && (
                              <button onClick={() => enviarMensajeInasistencia(c)} className="px-3 py-2 border border-rose-200 bg-rose-50 rounded-lg text-rose-600 hover:bg-rose-100 transition-colors text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" title="Enviar WhatsApp para reagendar">
                                <MessageCircle size={14} /> Reagendar por WhatsApp
                              </button>
                            )}
                            {c.estado === 'atendido' && requiereControl(c.motivo) && (
                              <button onClick={() => agendarControl(c)} className="px-3 py-2 border border-emerald-200 bg-emerald-50 rounded-lg text-emerald-700 hover:bg-emerald-100 transition-colors text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" title={`Agendar control en ${DIAS_HASTA_CONTROL} días`}>
                                <CalendarPlus size={14} /> Agendar control
                              </button>
                            )}

                            <div className="ml-auto sm:ml-2 flex items-center gap-2">
                                <Link prefetch={false} href={`/pacientes/${c.paciente_id}`} className="text-xs md:text-[10px] font-black text-blue-600 px-3 py-2 uppercase tracking-widest hover:bg-blue-50 border border-blue-100 bg-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm">
                                    <ClipboardList size={14} /> Ficha
                                </Link>
                                <Link prefetch={false} href={`/pacientes/${c.paciente_id}/tratamientos`} className="text-xs md:text-[10px] font-black text-[#C9A24B] px-3 py-2 uppercase tracking-widest hover:bg-[#C9A24B]/10 border border-[#C9A24B]/30 bg-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm">
                                    <Activity size={14} /> Tratamientos
                                </Link>
                            </div>
                        </div>
                        </div>
                    </div>
                    </motion.div>
                )
                }) : (!cambiandoFecha && ( 
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center opacity-40 py-24 text-center text-slate-500 bg-transparent rounded-3xl border-2 border-dashed border-slate-200">
                    <CalendarIcon size={48} className="mb-3 text-slate-300"/>
                    <h3 className="font-black uppercase text-base tracking-widest text-center text-slate-700">{busquedaAgenda ? 'Sin resultados' : 'Agenda Libre'}</h3>
                    <p className="mt-1 font-bold text-xs tracking-wide text-center">{busquedaAgenda ? 'Ningún paciente coincide con la búsqueda.' : 'No hay citas programadas para este día.'}</p>
                </motion.div> 
                ))}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {vistaAgenda === 'semana' && (
          <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-3 pb-20 transition-opacity ${cambiandoFecha ? 'opacity-50 pointer-events-none' : ''}`}>
              {getDiasLunesSabado(selectedDate).map((dia, diaIndex) => {
                  const diaISO = getLocalDateISO(dia);
                  const esHoyCol = diaISO === hoyISO;
                  const citasEsteDia = citasFiltradas.filter(c => c.inicio.startsWith(diaISO));
                  
                  return (
                      <motion.div 
                          key={diaISO} 
                          initial={{ opacity: 0, y: 10 }} 
                          animate={{ opacity: 1, y: 0 }} 
                          transition={{ delay: diaIndex * 0.05 }}
                          className="flex flex-col gap-3 md:gap-2"
                      >
                          <button
                            onClick={() => { setSelectedDate(new Date(dia)); setVistaAgenda('dia'); }}
                            title="Ver este día"
                            className={`rounded-xl p-3 md:p-2.5 text-center sticky top-24 md:top-28 z-10 border shadow-sm transition-colors ${esHoyCol ? 'bg-[#C9A24B] border-[#B38D3A]' : 'bg-white border-slate-200 hover:border-[#C9A24B]'}`}
                          >
                              <p className={`text-[10px] md:text-[9px] font-black uppercase ${esHoyCol ? 'text-white/80' : 'text-slate-500'}`}>{dia.toLocaleDateString('es-CL', {weekday: 'long'})}</p>
                              <p className={`text-lg md:text-base font-black ${esHoyCol ? 'text-white' : 'text-[#0A111F]'}`}>{dia.getDate()}</p>
                              <p className={`text-[9px] font-bold ${esHoyCol ? 'text-white/80' : 'text-slate-400'}`}>{citasEsteDia.length} cita{citasEsteDia.length === 1 ? '' : 's'}</p>
                          </button>
                          
                          <div className="flex flex-col gap-3 md:gap-2.5">
                              {citasEsteDia.length > 0 ? citasEsteDia.map((c, cIndex) => {
                                  const hInicio = horaDeStr(c.inicio);
                                  const configEstado = ESTADOS_CITA[c.estado] || ESTADOS_CITA.programada;
                                  const pNombre = c.pacientes?.nombre || 'S/N';
                                  const pApellido = c.pacientes?.apellido || '';
                                  const theme = getAvatarColorClass(pNombre + pApellido);
                                  const isSobrecupo = checkIsSobrecupo(c);
                                  
                                  return (
                                      <motion.div 
                                          initial={{ opacity: 0, scale: 0.95 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          transition={{ delay: (diaIndex * 0.05) + (Math.min(cIndex, 8) * 0.05) }}
                                          key={c.id} 
                                          className={`bg-white p-3.5 md:p-3 rounded-xl border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group border-l-4 ${theme.border} ${isSobrecupo ? 'border-t-red-100 border-r-red-100 border-b-red-100 bg-red-50/30' : 'border-slate-200'}`}
                                      >
                                          <div className="pl-1">
                                              <div className="flex flex-wrap gap-1 mb-1.5">
                                                  {isSobrecupo && (
                                                      <span className="text-[8px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded uppercase tracking-widest animate-pulse inline-flex items-center">
                                                          Sobrecupo
                                                      </span>
                                                  )}
                                                  {c.motivo?.includes('Online') && (
                                                      <span className="text-[8px] font-black bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded uppercase tracking-widest inline-flex items-center gap-1">
                                                          <Globe size={8} /> Web
                                                      </span>
                                                  )}
                                              </div>
                                              <p className="text-sm md:text-xs font-black text-slate-900 leading-tight mb-1 truncate">{pNombre} {pApellido}</p>
                                              
                                              <div className="flex flex-col items-start gap-1.5 mt-2">
                                                  <div className="flex items-center justify-between w-full">
                                                      <span className="text-[11px] md:text-[10px] font-black text-[#8A6D2F] bg-[#C9A24B]/10 px-1.5 py-0.5 rounded-md">{hInicio}</span>
                                                      <span className={`text-[9px] md:text-[8px] font-black uppercase ${configEstado.circleText}`}>
                                                          {c.estado === 'en_espera' && c.hora_llegada 
                                                              ? `ESPERA DESDE LAS ${horaDeStr(c.hora_llegada)}` 
                                                              : configEstado.label}
                                                      </span>
                                                  </div>
                                              </div>
                                          </div>
                                          
                                          <div className="absolute inset-0 bg-white/95 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 md:gap-1">
                                              <button onClick={(e) => { e.stopPropagation(); iniciarReprogramacion(c); }} className="p-2 md:p-1.5 text-slate-500 hover:bg-[#C9A24B]/10 hover:text-[#C9A24B] rounded-md transition-all" title="Reprogramar"><CalendarClock className="md:w-[14px] md:h-[14px]" size={16} /></button>
                                              <button onClick={() => abrirEnvioPresupuesto(c)} className="p-2 md:p-1.5 text-slate-500 hover:bg-[#C9A24B]/10 hover:text-[#C9A24B] rounded-md transition-all" title="Enviar Presupuesto"><FileText className="md:w-[14px] md:h-[14px]" size={16} /></button>
                                              <button onClick={() => enviarRecordatorioConLink(c)} className="p-2 md:p-1.5 text-slate-500 hover:bg-[#C9A24B]/10 hover:text-[#C9A24B] rounded-md transition-all" title="Enviar link de confirmación"><LinkIcon className="md:w-[14px] md:h-[14px]" size={16} /></button>
                                              <button onClick={() => enviarLinkSatisfaccion(c)} className="p-2 md:p-1.5 text-slate-500 hover:bg-amber-100 hover:text-amber-500 rounded-md transition-all" title="Pedir reseña en Google Maps"><Star className="md:w-[14px] md:h-[14px]" size={16} /></button>
                                              {puedeVerFinanzas && (
                                                  <button onClick={(e) => { e.stopPropagation(); abrirCaja(c); }} className="p-2 md:p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-600 rounded-md transition-all" title="Caja/Cobrar"><Coins className="md:w-[14px] md:h-[14px]" size={16} /></button>
                                              )}
                                          </div>
                                      </motion.div>
                                  )
                              }) : (
                                  <div className="h-24 md:h-20 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl opacity-40">
                                      <span className="text-[10px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">Sin citas</span>
                                  </div>
                              )}
                          </div>
                      </motion.div>
                  )
              })}
          </div>
      )}

      {mounted && typeof document !== 'undefined' && createPortal(
        <>
          {/* AVISO: PACIENTE EN SALA DE ESPERA (antes se recibía pero nunca se mostraba) */}
          <AnimatePresence>
            {notificacion && (
              <div className="fixed inset-x-0 top-4 z-[1000001] flex justify-center px-4 pointer-events-none">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="pointer-events-auto w-full max-w-md bg-amber-400 text-amber-950 rounded-2xl shadow-2xl border border-amber-500 p-4 flex items-center gap-3">
                  <Timer size={22} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Paciente en sala de espera</p>
                    <p className="font-black uppercase text-sm truncate">{notificacion.nombre}</p>
                  </div>
                  <button onClick={() => setNotificacion(null)} className="p-1.5 rounded-full hover:bg-amber-500/40 transition-colors"><X size={18} /></button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {modalAbierto && (
              <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden text-left">
                   
                   {/* HEADER DEL MODAL */}
                   <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                      <div className="flex items-center gap-4">
                         <div className="p-3 rounded-xl shadow-sm bg-white/10 border border-white/20"><CalendarIcon size={24} className="text-[#C9A24B]"/></div>
                         <div>
                           <h2 className="font-display text-xl tracking-tight text-white leading-none">{citaEnReprogramacion ? 'Reprogramar Cita' : 'Agendar Nueva Cita'}</h2>
                           <p className="text-[10px] md:text-[9px] font-bold uppercase tracking-widest mt-1 text-[#C9A24B]">
                             {citaEnReprogramacion
                               ? `Cita original: ${citaEnReprogramacion.inicio.split('T')[0]} a las ${horaDeStr(citaEnReprogramacion.inicio)}`
                               : diaSugerido
                                 ? `Día sugerido: ${new Date(diaSugerido + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}`
                                 : 'Completa los datos de la atención'}
                           </p>
                         </div>
                      </div>
                      <button onClick={() => { setModalAbierto(false); resetEstados(); }} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
                   </div>

                   {/* CUERPO DEL MODAL */}
                   <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-slate-50 flex flex-col gap-6">

                      {/* 1. SECCIÓN PACIENTE */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                         <h3 className="text-sm font-black uppercase text-slate-800 mb-4 flex items-center gap-2"><User size={16} className="text-[#C9A24B]"/> 1. Datos del Paciente</h3>

                         {!modoNuevoPaciente ? (
                            <div className="space-y-4">
                               {!pacienteSeleccionado && (
                                 <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input autoFocus type="text" placeholder="Buscar por RUT o Nombre..." className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-[#C9A24B] outline-none transition-all" value={busqueda} onChange={(e) => onCambioBusquedaPaciente(e.target.value)} disabled={!!citaEnReprogramacion} />
                                 </div>
                               )}
                               
                               {pacientesEncontrados.length > 0 && !pacienteSeleccionado && (
                                  <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto mt-2">
                                     {pacientesEncontrados.map(p => (
                                        <button key={p.id} onClick={() => seleccionarPacienteExistente(p)} className={`w-full text-left px-5 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${p.activo === false ? 'opacity-50' : ''}`}>
                                           <p className="font-black text-slate-800">{p.nombre} {p.apellido} {p.activo === false && <span className="ml-2 text-[9px] font-black text-red-500 uppercase">Inhabilitado</span>}</p>
                                           <p className="text-xs font-semibold text-slate-500 mt-1">RUT: {p.rut}{p.telefono ? ` · ${p.telefono}` : ''}</p>
                                        </button>
                                     ))}
                                  </div>
                               )}

                               {!citaEnReprogramacion && !pacienteSeleccionado && (
                                   <button onClick={() => setModoNuevoPaciente(true)} className="text-xs font-black text-blue-600 hover:text-blue-800 flex items-center gap-1 uppercase tracking-widest mt-2"><Plus size={14} /> Registrar paciente nuevo</button>
                               )}

                               {pacienteSeleccionado && (
                                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-4 mt-2">
                                     <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-black">{getInitials(pacienteSeleccionado.nombre, pacienteSeleccionado.apellido)}</div>
                                     <div>
                                        <p className="font-black text-emerald-900 text-sm uppercase">{pacienteSeleccionado.nombre} {pacienteSeleccionado.apellido}</p>
                                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mt-0.5">RUT: {pacienteSeleccionado.rut}{!pacienteSeleccionado.telefono && <span className="ml-2 text-amber-600">· Sin teléfono</span>}</p>
                                     </div>
                                     {!citaEnReprogramacion && (
                                         <button onClick={() => { setPacienteSeleccionado(null); setBusqueda(''); setTratamientosPaciente([]); setTratamientoSeleccionadoId(null); }} className="ml-auto p-2 hover:bg-emerald-200 rounded-lg text-emerald-700 transition-colors"><X size={16}/></button>
                                     )}
                                  </div>
                               )}
                            </div>
                         ) : (
                            <div className="space-y-4">
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <input type="text" placeholder="Nombres *" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#C9A24B]" value={nuevoPaciente.nombre} onChange={e => setNuevoPaciente({...nuevoPaciente, nombre: e.target.value})} />
                                  <input type="text" placeholder="Apellidos *" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#C9A24B]" value={nuevoPaciente.apellido} onChange={e => setNuevoPaciente({...nuevoPaciente, apellido: e.target.value})} />
                                  <input type="text" placeholder={esOtroDocumento ? "N° Pasaporte / Documento" : "RUT (Sin puntos, con guión)"} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#C9A24B]" value={nuevoPaciente.rut} onChange={e => setNuevoPaciente({...nuevoPaciente, rut: e.target.value})} />
                                  <input type="tel" placeholder="Teléfono (9 dígitos)" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#C9A24B]" value={nuevoPaciente.telefono} onChange={e => setNuevoPaciente({...nuevoPaciente, telefono: e.target.value})} />
                               </div>
                               <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer w-fit">
                                  <input type="checkbox" checked={esOtroDocumento} onChange={e => setEsOtroDocumento(e.target.checked)} className="accent-[#C9A24B] w-4 h-4" /> Extranjero / otro documento
                               </label>
                               <button onClick={() => setModoNuevoPaciente(false)} className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 mt-2 flex items-center gap-1"><ChevronLeft size={14}/> Volver a buscar</button>
                            </div>
                         )}
                      </div>

                      {/* 2. SECCIÓN MOTIVO */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                         <h3 className="text-sm font-black uppercase text-slate-800 mb-4 flex items-center gap-2"><ClipboardList size={16} className="text-[#C9A24B]"/> 2. Motivo o Tratamiento</h3>
                         <div className="space-y-3">
                            {tratamientosPaciente.length > 0 && (
                               <select className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-[#C9A24B]" value={tratamientoSeleccionadoId || 'MANUAL'} onChange={e => {
                                 const id = e.target.value;
                                 setTratamientoSeleccionadoId(id);
                                 const t = tratamientosPaciente.find(x => x.id === id);
                                 if (t && !nuevoTratamientoNombre.trim()) setNuevoTratamientoNombre(t.nombre_tratamiento || '');
                               }}>
                                  <option value="MANUAL">-- Ingresar motivo manualmente --</option>
                                  {tratamientosPaciente.map(t => <option key={t.id} value={t.id}>{t.nombre_tratamiento || 'Tratamiento sin nombre'}</option>)}
                               </select>
                            )}
                            <input type="text" placeholder="Ej: Evaluación, Limpieza, Control..." className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#C9A24B]" value={nuevoTratamientoNombre} onChange={e => setNuevoTratamientoNombre(e.target.value)} />
                         </div>
                      </div>

                      {/* 3. SECCIÓN HORARIOS */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                         <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
                             <h3 className="text-sm font-black uppercase text-slate-800 flex items-center gap-2"><Clock size={16} className="text-[#C9A24B]"/> 3. Fecha y Hora</h3>
                             <div className="flex items-center gap-2 w-full md:w-auto">
                                <select 
                                  className="w-full md:w-auto p-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none disabled:cursor-not-allowed disabled:bg-slate-100" 
                                  value={filtro.profesional_id} 
                                  onChange={e => { setFiltro({...filtro, profesional_id: e.target.value}); setHorasSeleccionadas([]); }}
                                  disabled={!puedeVerAgendaCompleta}
                                >
                                  {!filtro.profesional_id && <option value="">Seleccione especialista...</option>}
                                  {profesionales
                                    .filter(p => puedeVerAgendaCompleta || p.user_id === usuarioLogueado)
                                    .map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)
                                  }
                                </select>
                                <select className="w-full md:w-auto p-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none" value={filtro.duracionDefault} onChange={e => setFiltro({...filtro, duracionDefault: Number(e.target.value)})}>
                                   {duracionesDisponibles.map(d => <option key={d} value={d}>{d} min</option>)}
                                </select>
                             </div>
                         </div>
                         
                         <div className="mb-4 flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100">
                            <button onClick={() => navegarSemana('atras')} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"><ChevronLeft size={18}/></button>
                            <span className="text-xs font-black uppercase tracking-widest text-slate-700">Semana del {getDiasLunesSabado(semanaInicio)[0].toLocaleDateString('es-CL', {day: 'numeric', month:'short'})}</span>
                            <button onClick={() => navegarSemana('adelante')} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"><ChevronRight size={18}/></button>
                         </div>

                         <div className="flex items-center gap-4 mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-slate-300"></span> Libre</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200"></span> Ocupado / Bloqueado</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500"></span> Seleccionado</span>
                         </div>

                         <div className="overflow-x-auto custom-scrollbar">
                         <div className="grid grid-cols-6 gap-2 min-w-[540px]">
                            {getDiasLunesSabado(semanaInicio).map((dia, dIdx) => {
                               const diaStr = getLocalDateISO(dia);
                               const esPasado = diaStr < hoyISO;
                               const slotsDia = slotsHorarios.filter(hora => esHorarioLaboral(diaStr, hora, filtro.duracionDefault));
                               return (
                                  <div key={dIdx} className={`text-center rounded-xl ${esPasado ? 'opacity-40' : ''} ${diaSugerido === diaStr ? 'bg-emerald-50 ring-2 ring-emerald-300 p-1' : ''}`}>
                                     <div className="mb-3">
                                        {diaSugerido === diaStr && <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Sugerido</p>}
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{dia.toLocaleDateString('es-CL', {weekday: 'short'})}</p>
                                        <p className={`text-base font-black ${diaStr === hoyISO ? 'text-[#C9A24B]' : 'text-slate-800'}`}>{dia.getDate()}</p>
                                     </div>
                                     <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                                        {slotsDia.length === 0 && (
                                          <span className="text-[10px] font-bold text-slate-300 italic py-4">Sin horario</span>
                                        )}
                                        {slotsDia.map(hora => {
                                           const ocupado = esCitaOcupada(diaStr, hora, filtro.duracionDefault);
                                           const bloqueado = esHorarioBloqueado(diaStr, hora, filtro.duracionDefault); 
                                           const seleccionado = horasSeleccionadas.some(s => s.fecha === diaStr && s.hora === hora);

                                           let btnClass = "py-2 text-[11px] font-black rounded-lg border transition-all ";
                                           if(seleccionado) {
                                             btnClass += "bg-emerald-500 text-white border-emerald-600 shadow-md";
                                           } else if(ocupado || bloqueado) { 
                                             btnClass += "bg-red-50 text-red-500 border-red-200 opacity-60"; 
                                           } else {
                                             btnClass += "bg-white text-slate-600 border-slate-200 hover:border-[#C9A24B] hover:text-[#C9A24B] shadow-sm";
                                           }

                                           return (
                                              <button key={hora} onClick={() => handleSlotClick(diaStr, hora)} className={btnClass} title={bloqueado ? 'Bloqueado' : ocupado ? 'Ocupado (sobrecupo)' : 'Disponible'}>
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
                   </div>

                   {/* FOOTER MODAL */}
                   <div className="p-6 md:p-8 border-t border-slate-100 bg-white shrink-0 flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="text-xs font-black text-slate-500 uppercase tracking-widest w-full md:w-auto">
                         {horasSeleccionadas.length > 0 ? (
                            <div className="flex flex-col gap-2">
                              <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={16}/> {horasSeleccionadas.length} bloque(s) seleccionado(s)</span>
                              <div className="flex flex-wrap gap-1.5">
                                {[...horasSeleccionadas].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`)).map(s => (
                                  <span key={`${s.fecha}-${s.hora}`} className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-md px-2 py-1 text-[10px] normal-case tracking-normal">
                                    {new Date(s.fecha + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })} · {s.hora} ({s.duracion} min)
                                    <button onClick={() => toggleHora(s.fecha, s.hora)} className="hover:text-red-500"><X size={12} /></button>
                                  </span>
                                ))}
                              </div>
                            </div>
                         ) : "Selecciona un horario en el calendario"}
                      </div>
                      <button 
                         onClick={handleGuardar} 
                         disabled={cargandoAccion || horasSeleccionadas.length === 0 || (!pacienteSeleccionado && !modoNuevoPaciente)} 
                         className="w-full md:w-auto px-8 py-4 bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg shrink-0"
                      >
                         {cargandoAccion ? <Loader2 className="animate-spin" size={18}/> : <Save size={18} />} 
                         {citaEnReprogramacion ? 'Confirmar Reprogramación' : 'Confirmar y Agendar'}
                      </button>
                   </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {modalEnvioPresupuesto.abierto && (
              <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-left">
                 <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden text-left">
                    <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0 text-left" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                       <div className="flex items-center gap-4 text-left">
                          <div className="p-3 rounded-xl shadow-sm" style={{ backgroundColor: 'rgba(201,162,75,0.15)', border: `1px solid ${GOLD}` }}><Send size={20} style={{ color: GOLD_LIGHT }}/></div>
                          <div>
                            <h2 className="font-display text-lg tracking-tight text-white leading-none">Enviar Presupuesto</h2>
                            <p className="text-[10px] md:text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: GOLD }}>Pre-armado automático</p>
                          </div>
                       </div>
                       <button onClick={() => setModalEnvioPresupuesto({...modalEnvioPresupuesto, abierto: false})} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-colors"><X className="md:w-[18px] md:h-[18px]" size={20} /></button>
                    </div>
                    <div className="p-6 md:p-8 space-y-4">
                        <p className="text-sm md:text-xs font-bold text-slate-500 leading-relaxed">Puedes editar el texto antes de enviarlo. Al hacer clic en enviar, se abrirá WhatsApp Web/Móvil con este mensaje listo para tu paciente <span className="font-black text-slate-800">{modalEnvioPresupuesto.cita?.pacientes?.nombre} {modalEnvioPresupuesto.cita?.pacientes?.apellido}</span>.</p>
                        <textarea 
                            className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-base md:text-sm outline-none focus:border-[#C9A24B] transition-all shadow-inner resize-none custom-scrollbar"
                            value={modalEnvioPresupuesto.texto}
                            onChange={(e) => setModalEnvioPresupuesto({...modalEnvioPresupuesto, texto: e.target.value})}
                        />
                    </div>
                    <div className="p-6 md:p-8 border-t border-slate-100 bg-white shrink-0 text-left sticky bottom-0 z-20">
                       <button 
                           onClick={() => {
                               const ok = abrirWhatsApp(modalEnvioPresupuesto.cita?.pacientes?.telefono, modalEnvioPresupuesto.texto);
                               if (ok) setModalEnvioPresupuesto({...modalEnvioPresupuesto, abierto: false});
                           }} 
                           className="w-full py-4 bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-md hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                       >
                          <MessageCircle className="md:w-[16px] md:h-[16px]" size={18} /> Abrir WhatsApp y Enviar
                       </button>
                    </div>
                 </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {modalSeleccionTratamiento.abierto && (
              <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden text-left">
                    <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0 text-left" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                      <div className="flex items-center gap-4 text-left">
                          <div className="p-3 rounded-xl shadow-sm" style={{ backgroundColor: 'rgba(201,162,75,0.15)', border: `1px solid ${GOLD}` }}><FileText size={20} style={{ color: GOLD_LIGHT }}/></div>
                          <div>
                            <h2 className="font-display text-lg tracking-tight text-white leading-none">Seleccionar Tratamiento</h2>
                            <p className="text-[10px] md:text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: GOLD }}>Elige qué plan enviar</p>
                          </div>
                      </div>
                      <button onClick={() => setModalSeleccionTratamiento({abierto: false, cita: null, tratamientos: []})} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-colors"><X className="md:w-[18px] md:h-[18px]" size={20} /></button>
                    </div>
                    <div className="p-6 md:p-8 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <p className="text-sm md:text-xs font-bold text-slate-500 leading-relaxed">El paciente tiene varios planes de tratamiento. Por favor, selecciona cuál de ellos deseas enviar por WhatsApp.</p>
                        {modalSeleccionTratamiento.tratamientos.map(t => (
                            <button 
                              key={t.id} 
                              onClick={() => {
                                  generarYMostrarResumen(t.id, modalSeleccionTratamiento.cita);
                                  setModalSeleccionTratamiento({abierto: false, cita: null, tratamientos: []});
                              }}
                              className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-[#C9A24B] hover:bg-[#C9A24B]/5 transition-all flex items-center justify-between group text-left"
                            >
                              <span className="font-black text-sm uppercase text-slate-800 group-hover:text-[#8A6D2F]">{t.nombre_tratamiento || 'Tratamiento sin nombre'}</span>
                              <ChevronRightIcon className="text-slate-300 group-hover:text-[#C9A24B] group-hover:translate-x-1 transition-transform" size={20} />
                            </button>
                        ))}
                    </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {modalBloqueo && (
              <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-left">
                 <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden text-left max-h-[90vh]">
                    <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0 text-left" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                       <div className="flex items-center gap-4 text-left">
                          <div className="p-3 rounded-xl shadow-sm" style={{ backgroundColor: 'rgba(220,80,70,0.15)', border: '1px solid rgba(220,80,70,0.6)' }}><Lock size={20} className="text-red-300"/></div>
                          <div>
                            <h2 className="font-display text-lg tracking-tight text-white leading-none">Bloquear Agenda</h2>
                            <p className="text-[10px] md:text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: GOLD }}>Bloquea turnos a pacientes</p>
                          </div>
                       </div>
                       <button onClick={() => setModalBloqueo(false)} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-colors"><X className="md:w-[18px] md:h-[18px]" size={20} /></button>
                    </div>
                    <div className="p-6 md:p-8 space-y-6 overflow-y-auto">
                        <p className="text-sm md:text-xs font-bold text-slate-600 leading-relaxed">Se bloqueará la agenda para el <span className="font-black text-red-500">{selectedDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</span>. Para otro día, cambia la fecha en la agenda antes de abrir este panel.</p>
                        
                        <div className="space-y-2">
                           <label className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Doctor a bloquear</label>
                           <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-base md:text-xs outline-none focus:border-red-500 transition-all shadow-sm cursor-pointer" value={profesionalBloqueo} onChange={(e) => setProfesionalBloqueo(e.target.value)}>
                               <option value="">Seleccione especialista...</option>
                               {profesionales.map(p => <option key={p.id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
                           </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Motivo del bloqueo</label>
                            <input type="text" placeholder="Ej: Licencia Médica, Colación..." className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-base md:text-xs outline-none focus:border-red-500 transition-all shadow-sm" value={motivoBloqueo} onChange={(e) => setMotivoBloqueo(e.target.value)} />
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">¿Bloquear todo el día?</span>
                                <input type="checkbox" checked={bloqueoTodoElDia} onChange={(e) => setBloqueoTodoElDia(e.target.checked)} className="w-6 h-6 md:w-5 md:h-5 accent-red-500 cursor-pointer" />
                            </div>
                            
                            {!bloqueoTodoElDia && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Desde las</label>
                                        <input type="time" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-base md:text-sm outline-none focus:border-red-500" value={horaInicioBloqueo} onChange={e => setHoraInicioBloqueo(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Hasta las</label>
                                        <input type="time" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-base md:text-sm outline-none focus:border-red-500" value={horaFinBloqueo} onChange={e => setHoraFinBloqueo(e.target.value)} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="p-6 md:p-8 border-t border-slate-100 bg-white shrink-0 text-left sticky bottom-0 z-20">
                       <button onClick={handleGuardarBloqueoRapido} disabled={cargandoAccion || !motivoBloqueo.trim() || !profesionalBloqueo || (!bloqueoTodoElDia && (!horaInicioBloqueo || !horaFinBloqueo))} className="w-full py-4 bg-red-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-md hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                          {cargandoAccion ? <Loader2 className="animate-spin" size={16}/> : <Ban className="md:w-[16px] md:h-[16px]" size={18} />} Confirmar Bloqueo
                       </button>
                    </div>
                 </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {modalPagoAbierto && (
              <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-left">
                 <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden text-left">
                    <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0 text-left" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                       <div className="flex items-center gap-4 text-left">
                          <div className="p-3 rounded-2xl shadow-sm" style={{ backgroundColor: 'rgba(201,162,75,0.15)', border: `1px solid ${GOLD}` }}><ReceiptText size={24} style={{ color: GOLD_LIGHT }}/></div>
                          <div>
                            <h2 className="font-display text-xl tracking-tight text-white leading-none">Caja y Pagos</h2>
                            <p className="text-[11px] md:text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: GOLD }}>Paciente: {pacientePago?.nombre} {pacientePago?.apellido}</p>
                          </div>
                       </div>
                       <button onClick={() => setModalPagoAbierto(false)} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-colors"><X className="md:w-[20px] md:h-[20px]" size={24} /></button>
                    </div>

                    <div className="p-6 md:p-8 bg-slate-50 flex-1 overflow-y-auto custom-scrollbar text-left text-slate-900">
                        {cargandoDeudas ? (
                            <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={40}/></div>
                        ) : deudasPaciente.length === 0 ? (
                            <div className="py-12 text-center text-slate-400">
                               <CheckCircle2 className="mx-auto text-emerald-400 mb-4 opacity-50" size={60} />
                               <p className="text-base md:text-sm font-black uppercase tracking-widest text-slate-600">Al día</p>
                               <p className="text-sm md:text-xs mt-1">El paciente no tiene tratamientos aprobados con deuda pendiente.</p>
                            </div>
                        ) : (
                            <div className="space-y-6 text-left">
                               <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm text-left">
                                  <h4 className="text-[11px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Deuda Exigible</h4>
                                  <p className="text-4xl md:text-4xl font-black text-slate-900 tracking-tighter">${calcularDeudaTotalCaja().toLocaleString('es-CL')}</p>
                                  {planesDetalladosAgenda.length > 1 && deudaTotalPlanAgenda > calcularDeudaTotalCaja() ? (
                                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                                      <p className="text-[10px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Desglose Deuda Total</p>
                                      {planesDetalladosAgenda.map(plan => (
                                        <div key={plan.id} className="flex justify-between items-center text-sm md:text-xs">
                                          <span className="font-bold text-slate-500 uppercase">{plan.nombre}</span>
                                          <span className="font-black text-slate-700">${plan.deudaTotal.toLocaleString('es-CL')}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : deudaTotalPlanAgenda > calcularDeudaTotalCaja() ? (
                                    <p className="text-sm md:text-xs font-bold text-slate-400 mt-2 border-t border-slate-100 pt-2">
                                      Deuda Plan Completo: 
                                      <span className="text-slate-600 font-black ml-2">${deudaTotalPlanAgenda.toLocaleString('es-CL')}</span>
                                    </p>
                                  ) : null}
                               </div>

                               <div className="text-left text-slate-900">
                                  <h4 className="text-[11px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 pl-2">Detalle a pagar</h4>
                                  <div className="space-y-2">
                                     {deudasPaciente.map(d => (
                                         <div key={d.id} className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-0 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-left">
                                             <div className="text-left">
                                                <div className="flex flex-wrap items-center gap-3 mb-1">
                                                    <p className="text-sm md:text-xs font-black uppercase text-slate-800 leading-none">{d.nombreDisplay}</p>
                                                    <span className={`px-2 py-1 md:py-0.5 rounded-md text-[9px] md:text-[8px] font-black uppercase leading-none ${d.estado === 'realizado' ? 'bg-emerald-100 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-500 border border-red-100'}`}>
                                                        {d.estado}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] md:text-[9px] font-bold text-slate-400 mt-2 tracking-widest">Pactado: ${Number(d.precio_pactado).toLocaleString('es-CL')} | Pagado: ${Number(d.abonado).toLocaleString('es-CL')}</p>
                                             </div>
                                             <p className="text-lg md:text-sm font-black text-red-500">${d.deuda.toLocaleString('es-CL')}</p>
                                         </div>
                                     ))}
                                  </div>
                               </div>

                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t border-slate-200 text-left text-slate-900">
                                  <div className="space-y-2">
                                     <label className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Método de Pago</label>
                                     <select className="w-full p-4 md:p-4 bg-white border border-slate-200 rounded-xl font-bold text-base md:text-xs uppercase outline-none focus:border-[#C9A24B] transition-all shadow-sm cursor-pointer" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                                         <option value="tarjeta">Tarjeta (Débito/Crédito)</option>
                                         <option value="efectivo">Efectivo</option>
                                         <option value="transferencia">Transferencia</option>
                                         {saldoAFavor > 0 && (
                                            <option value="Saldo a Favor">💰 Saldo a Favor (${saldoAFavor.toLocaleString('es-CL')})</option>
                                         )}
                                     </select>
                                  </div>
                                  <div className="space-y-2 text-left">
                                     <label className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Monto a Recaudar ($)</label>
                                     <input type="number" placeholder="Ej: 50000" className="w-full p-4 md:p-4 bg-white border border-slate-200 rounded-2xl font-black text-xl md:text-lg text-emerald-600 outline-none focus:border-emerald-500 placeholder:text-slate-300 transition-all shadow-sm" value={montoIngresado} onChange={(e) => setMontoIngresado(e.target.value === '' ? '' : Number(e.target.value))} />
                                  </div>
                                  
                                  {metodoPago !== 'Saldo a Favor' && (
                                    <div className="space-y-2 md:col-span-2 text-left">
                                       <label className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">N° Boleta / Cód. Transacción</label>
                                       <input type="text" placeholder="Ej: BOLETA-1234 o TX-987" className="w-full p-4 md:p-4 bg-white border border-slate-200 rounded-2xl font-bold text-base md:text-xs outline-none focus:border-[#C9A24B] placeholder:text-slate-300 uppercase transition-all shadow-sm" value={codigoTransaccion} onChange={(e) => setCodigoTransaccion(e.target.value)} />
                                    </div>
                                  )}
                               </div>
                            </div>
                        )}
                    </div>

                    <div className="p-6 md:p-8 border-t border-slate-100 bg-white shrink-0 text-left sticky bottom-0 z-20">
                       <button 
                          onClick={procesarPagoCaja}
                          disabled={cargandoAccion || deudasPaciente.length === 0 || !montoIngresado}
                          className="w-full py-5 md:py-5 rounded-[1.5rem] font-black text-sm md:text-xs uppercase tracking-widest shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:brightness-110"
                          style={{ background: NAVY, color: GOLD_LIGHT }}
                       >
                          {cargandoAccion ? <Loader2 className="animate-spin" size={20}/> : <Coins className="md:w-[18px] md:h-[18px]" size={20} />}
                          Registrar Pago Seguro
                       </button>
                    </div>
                 </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {modalHuerfanasAbierto && (
              <div className="fixed inset-0 z-[99999] flex items-start justify-center px-4 pb-4 pt-16 md:pt-24 bg-slate-900/60 backdrop-blur-sm text-slate-900 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-4xl max-h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden relative text-slate-900 text-left">
                  <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0 text-left" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                    <div className="flex items-center gap-4 md:gap-5 text-left">
                      <div className="p-3 rounded-2xl shadow-sm" style={{ backgroundColor: 'rgba(245,180,60,0.15)', border: '1px solid rgba(245,180,60,0.6)' }}><AlertTriangle className="text-amber-300" size={24} /></div>
                      <div>
                        <h2 className="font-display text-lg md:text-xl tracking-tight text-white leading-none text-left">Citas Huérfanas</h2>
                        <p className="text-[11px] md:text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: GOLD }}>Requieren Reagendamiento · próximos 90 días</p>
                      </div>
                    </div>
                    <button onClick={() => setModalHuerfanasAbierto(false)} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-all text-left"><X className="md:w-[20px] md:h-[20px]" size={24} /></button>
                  </div>
                  
                  <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar">
                    {cargandoHuerfanas ? (
                      <div className="h-full py-12 flex flex-col items-center justify-center text-slate-400 gap-4">
                        <Loader2 className="animate-spin" size={40} />
                        <p className="text-sm md:text-xs font-black uppercase tracking-widest">Analizando agenda global...</p>
                      </div>
                    ) : citasHuerfanas.length === 0 ? (
                      <div className="h-full py-12 flex flex-col items-center justify-center text-slate-400 gap-4 opacity-60">
                        <CheckCircle2 className="text-emerald-500" size={60} />
                        <p className="text-base md:text-sm font-black uppercase tracking-widest text-slate-600">No hay citas huérfanas</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm md:text-xs font-bold text-slate-500 mb-6">Se encontraron <span className="font-black text-amber-600">{citasHuerfanas.length} citas</span> afectadas por bloqueos.</p>
                        {citasHuerfanas.map(cita => {
                            const fechaFormat = fechaLocalDeStr(cita.inicio).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' });
                            const horaFormat = horaDeStr(cita.inicio);
                            const isEditing = citaEnEdicion === cita.id;
                            const docCita = profesionales.find(p => p.user_id === cita.profesional_id);

                            return (
                                <div key={cita.id} className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col group transition-all">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4 md:gap-5 w-full md:w-auto">
                                    <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex flex-col items-center justify-center border border-amber-100 shrink-0">
                                        <span className="text-sm md:text-xs font-black">{horaFormat}</span>
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-black text-base md:text-sm text-slate-800 uppercase leading-none">{cita.pacientes?.nombre} {cita.pacientes?.apellido}</h4>
                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                        <span className="text-[10px] md:text-[9px] font-bold text-slate-500 tracking-widest bg-slate-50 border border-slate-200 px-2 py-1 rounded-md capitalize">
                                            <CalendarDays className="inline mr-1 md:w-[10px] md:h-[10px]" size={12} /> {fechaFormat}
                                        </span>
                                        {docCita && (
                                          <span className="text-[10px] md:text-[9px] font-bold text-slate-500 tracking-widest bg-slate-50 border border-slate-200 px-2 py-1 rounded-md uppercase">
                                            Dr. {formatNombreDoctor(docCita.nombre, docCita.apellido)}
                                          </span>
                                        )}
                                        </div>
                                    </div>
                                    </div>
                                    
                                    {!isEditing && (
                                    <div className="flex gap-2 self-start md:self-auto w-full md:w-auto">
                                        {cita.pacientes?.telefono && (
                                          <button onClick={() => abrirWhatsApp(cita.pacientes?.telefono)} className="p-3 md:p-2 bg-white border border-slate-200 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all shadow-sm" title="Contactar por WhatsApp">
                                            <MessageCircle className="md:w-[16px] md:h-[16px]" size={18} />
                                          </button>
                                        )}
                                        <button onClick={() => {
                                        const dInicio = new Date(cita.inicio.replace(' ', 'T'));
                                        const dFin = new Date(cita.fin.replace(' ', 'T'));
                                        const calcMins = Math.round((dFin.getTime() - dInicio.getTime()) / 60000);
                                        setDuracionCitaEdicion(calcMins > 0 ? calcMins : 30);
                                        setCitaEnEdicion(cita.id);
                                        setNuevaFecha(''); setNuevaHora('');
                                        setNuevoEspecialista(cita.profesional_id || profesionales[0]?.user_id || '');
                                        setSemanaInicioEdicion(getLunes(new Date()));
                                        }} className="flex-1 md:flex-none justify-center px-4 py-3 md:py-2 bg-amber-50 text-amber-600 text-xs md:text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-white rounded-xl transition-all flex items-center gap-2 shadow-sm">
                                        <CalendarClock className="md:w-[14px] md:h-[14px]" size={16} /> Reagendar
                                        </button>
                                        <button onClick={() => anularCitaDirecta(cita.id)} className="p-3 md:p-2 bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all shadow-sm" title="Anular cita">
                                            <Ban className="md:w-[16px] md:h-[16px]" size={18} />
                                        </button>
                                    </div>
                                    )}
                                </div>

                                <AnimatePresence>
                                    {isEditing && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col gap-6">
                                        
                                        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                                            <div className="space-y-2 flex-1 w-full">
                                            <label className="text-[11px] md:text-[9px] font-black uppercase ml-2 flex items-center gap-1" style={{ color: GOLD }}><UserCheck className="md:w-[12px] md:h-[12px]" size={14} /> Especialista a derivar</label>
                                            <select 
                                              className="w-full p-4 bg-white border border-[#C9A24B]/40 rounded-xl font-bold text-base md:text-xs outline-none text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-50" 
                                              value={nuevoEspecialista} 
                                              onChange={(e) => { setNuevoEspecialista(e.target.value); setNuevaFecha(''); setNuevaHora(''); }}
                                              disabled={!puedeVerAgendaCompleta}
                                            >
                                                {profesionales
                                                  .filter(p => puedeVerAgendaCompleta || p.user_id === usuarioLogueado)
                                                  .map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)
                                                }
                                            </select>
                                            </div>
                                            <div className="bg-emerald-50 w-full md:w-auto px-4 py-3 rounded-xl border border-emerald-100 self-end md:self-auto shrink-0 mt-2 md:mt-0 text-center">
                                            <span className="text-[11px] md:text-[10px] font-black text-emerald-600 uppercase">Buscando huecos de {duracionCitaEdicion} min</span>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col">
                                            <div className="flex items-center justify-between mb-4 bg-white p-2 rounded-xl shadow-sm border border-slate-100">
                                            <button onClick={prevWeekEdicion} className="p-3 md:p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all"><ChevronLeft className="md:w-[18px] md:h-[18px]" size={20} /></button>
                                            <span className="text-[11px] md:text-[10px] font-black text-slate-700 uppercase tracking-widest text-center px-2">
                                                Semana del {semanaInicioEdicion.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                                            </span>
                                            <button onClick={nextWeekEdicion} className="p-3 md:p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all"><ChevronRight className="md:w-[18px] md:h-[18px]" size={20} /></button>
                                            </div>

                                            <div className="flex gap-3 md:gap-2 overflow-x-auto pb-4 custom-scrollbar snap-x">
                                            {cargandoSlotsEdicion ? (
                                                <div className="w-full py-10 flex flex-col items-center justify-center text-slate-400 gap-2">
                                                <Loader2 className="animate-spin md:w-[24px] md:h-[24px]" size={28} />
                                                </div>
                                            ) : (
                                                dispoSemanaEdicion.map((dia, idx) => {
                                                const nombreDia = dia.dateObj.toLocaleDateString('es-CL', { weekday: 'short' });
                                                const numDia = dia.dateObj.getDate();
                                                const esHoy = dia.date === hoyISO;

                                                return (
                                                    <div key={idx} className={`snap-center min-w-[130px] md:min-w-[110px] flex-1 bg-white border ${esHoy ? 'border-[#C9A24B] shadow-md' : 'border-slate-200'} rounded-2xl p-4 md:p-3 flex flex-col items-center`}>
                                                    <div className="text-center mb-4 md:mb-3">
                                                        <span className="block text-[11px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">{nombreDia}</span>
                                                        <span className={`block text-xl md:text-lg font-black ${esHoy ? '' : 'text-slate-800'}`} style={esHoy ? { color: '#8A6D2F' } : undefined}>{numDia}</span>
                                                    </div>

                                                    <div className="w-full flex-1 flex flex-col gap-2.5 md:gap-2 overflow-y-auto max-h-56 md:max-h-48 pr-1 custom-scrollbar">
                                                        {dia.status === 'bloqueado' && <span className="text-[10px] md:text-[9px] font-bold text-red-400 text-center py-4 italic">Bloqueado</span>}
                                                        {dia.status === 'sin_horario' && <span className="text-[10px] md:text-[9px] font-bold text-slate-300 text-center py-4 italic">Sin Horario</span>}
                                                        {dia.status === 'lleno' && <span className="text-[10px] md:text-[9px] font-bold text-amber-400 text-center py-4 italic">Agenda Llena</span>}
                                                        
                                                        {dia.status === 'limpio' && dia.slots.map((slotObj: any, sIdx: number) => {
                                                        const slot = slotObj.time;
                                                        const ocupado = slotObj.ocupado;
                                                        const isSelected = nuevaFecha === dia.date && nuevaHora === slot;
                                                        
                                                        let btnClass = `w-full py-3 md:py-2 rounded-lg text-xs md:text-[10px] font-black transition-all border `;
                                                        if (isSelected) btnClass += 'bg-emerald-500 text-white border-emerald-600 shadow-md';
                                                        else if (ocupado) btnClass += 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100';
                                                        else btnClass += 'bg-slate-50 text-emerald-600 border-emerald-100 hover:bg-emerald-50';

                                                        return (
                                                            <button
                                                            key={sIdx}
                                                            onClick={() => { 
                                                                if (ocupado && !window.confirm(`⚠️ El horario de las ${slot} ya está ocupado. ¿Deseas agendar un SOBRECUPO?`)) return;
                                                                setNuevaFecha(dia.date); setNuevaHora(slot); 
                                                            }}
                                                            className={btnClass}
                                                            >
                                                            {slot}
                                                            </button>
                                                        )
                                                        })}
                                                    </div>
                                                    </div>
                                                )
                                                })
                                            )}
                                            </div>
                                        </div>
                                        
                                        <div className="mt-2 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-200 pt-4 text-center md:text-left">
                                            <div className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                Seleccionado: <span className={nuevaHora ? "text-emerald-600 block mt-1 md:inline md:mt-0" : "text-red-400 block mt-1 md:inline md:mt-0"}>
                                                {nuevaHora ? `${nuevaFecha} a las ${nuevaHora}` : "Ninguno"}
                                                </span>
                                            </div>
                                            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                                                <button onClick={() => setCitaEnEdicion(null)} className="w-full sm:w-auto px-6 py-4 md:py-3 text-[11px] md:text-[10px] font-black text-slate-400 uppercase hover:text-slate-700 transition-all border border-slate-200 sm:border-transparent rounded-xl">Cancelar</button>
                                                <button onClick={() => reagendarCitaHuérfanaDirecta(cita.id)} disabled={cargandoAccion || !nuevaHora} className={`w-full sm:w-auto px-8 py-4 md:py-3 text-white text-[11px] md:text-[10px] font-black uppercase tracking-widest rounded-xl shadow-md flex items-center justify-center gap-2 transition-all ${nuevaHora ? 'bg-emerald-500 hover:bg-emerald-600 active:scale-95' : 'bg-slate-300 cursor-not-allowed'}`}>
                                                {cargandoAccion ? <Loader2 className="animate-spin md:w-[14px] md:h-[14px]" size={16} /> : <Save className="md:w-[14px] md:h-[14px]" size={16} />} Confirmar
                                                </button>
                                            </div>
                                        </div>

                                        </div>
                                    </motion.div>
                                    )}
                                </AnimatePresence>
                                </div>
                            )
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {mostrarTicket && (
              <div className="fixed inset-0 z-[1000000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-sm">
                  <div className="bg-white rounded-[3rem] shadow-2xl p-8 md:p-10 text-center space-y-8">
                    <CheckCircle2 className="mx-auto text-emerald-500 md:w-[64px] md:h-[64px]" size={80} />
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-800">¡Cita Lista!</h2>
                    <div className="text-left bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                      <div>
                        <p className="text-[11px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Paciente</p>
                        <p className="font-black text-lg md:text-base text-slate-800 uppercase mt-1 leading-tight md:leading-none">{citaConfirmadaData?.paciente}</p>
                      </div>
                      <div>
                        <p className="text-[11px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Fecha y Hora</p>
                        {(citaConfirmadaData?.citas || []).map((s: any) => (
                          <p key={`${s.fecha}-${s.hora}`} className="font-black text-lg md:text-base text-slate-800 uppercase mt-1 leading-tight">
                            {new Date(s.fecha + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })} • {s.hora} hrs
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 md:gap-2">
                      <button
                        onClick={() => {
                          if (!citaConfirmadaData) return;
                          const { paciente, citas, telefono, citaId } = citaConfirmadaData;
                          if (!telefonoWA(telefono)) {
                            toast.error("El paciente no tiene un número de teléfono registrado.");
                            return;
                          }

                          const doctor = profesionales.find(p => p.user_id === filtro.profesional_id);
                          const nombreDoctor = doctor ? `Dr(a). ${doctor.nombre} ${doctor.apellido}` : "nuestro especialista";

                          const fechaObj = new Date(citas[0].fecha + 'T00:00:00');
                          let fechaCita = fechaObj.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
                          fechaCita = fechaCita.charAt(0).toUpperCase() + fechaCita.slice(1);
                          
                          const hora = citas[0].hora;
                          
                          const hoyStr = getLocalDateISO(new Date());
                          const manana = new Date();
                          manana.setDate(manana.getDate() + 1);
                          const mananaStr = getLocalDateISO(manana);

                          const esHoy = citas[0].fecha === hoyStr;
                          const esManana = citas[0].fecha === mananaStr;

                          let mensaje = "";

                          if (esHoy || esManana) {
                            const textoDia = esHoy ? "HOY" : "MAÑANA";
                            
                            mensaje = `Hola ${paciente}, hemos agendado tu cita con el/la ${nombreDoctor} para ${textoDia} a las ${hora} hrs.\n\n`;
                            mensaje += `📍 Dirección: Av. Venancia Leiva 1871, La Pintana.\n\n`;
                            if (citaId) {
                              mensaje += `⚠️ Importante: Debido a la alta demanda de horas, si tu cita no es confirmada el bloque será asignado a otro paciente.\n\n`;
                              mensaje += `Por favor confirma tu asistencia en el siguiente enlace:\nhttps://confirmar-cita-dignidad.vercel.app/confirmar/${citaId}\n\n`;
                            }
                            mensaje += `¡Te esperamos en Clínica Dignidad!`;
                          } else {
                            mensaje = `Hola ${paciente}, hemos agendado exitosamente tu cita con el/la ${nombreDoctor} para el día ${fechaCita} a las ${hora} hrs.\n\n`;
                            if (citas.length > 1) {
                              mensaje += `También quedaron agendadas tus siguientes sesiones:\n`;
                              citas.slice(1).forEach((s: any) => {
                                const f = new Date(s.fecha + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
                                mensaje += `🗓️ ${f.charAt(0).toUpperCase() + f.slice(1)} a las ${s.hora} hrs\n`;
                              });
                              mensaje += `\n`;
                            }
                            mensaje += `📍 Dirección: Av. Venancia Leiva 1871, La Pintana.\n\n`;
                            mensaje += `¡Te esperamos en Clínica Dignidad!`;
                          }

                          abrirWhatsApp(telefono, mensaje);
                          
                          setMostrarTicket(false);
                          setModalAbierto(false);
                          resetEstados();
                          fetchCitasAgenda();
                        }}
                        className="w-full py-4 bg-emerald-500 rounded-2xl font-black text-xs md:text-[10px] uppercase tracking-widest text-white shadow-md hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                      >
                         <MessageCircle size={16}/> Confirmar y Enviar
                      </button>

                      <button
                        onClick={() => {
                          setMostrarTicket(false);
                          setModalAbierto(false);
                          resetEstados();
                          fetchCitasAgenda();
                        }}
                        className="w-full py-4 md:py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs md:text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                      >
                        Finalizar sin enviar
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* MODAL BUSCAR PRÓXIMA HORA LIBRE */}
          <AnimatePresence>
            {modalBuscarHora && (
              <div className="fixed inset-0 z-[99999] flex items-start justify-center px-4 pb-4 pt-16 md:pt-24 bg-slate-900/60 backdrop-blur-sm text-slate-900 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-2xl max-h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden text-left">
                  <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-2xl shadow-sm" style={{ backgroundColor: 'rgba(201,162,75,0.15)', border: `1px solid ${GOLD}` }}>
                        <Search size={24} style={{ color: GOLD_LIGHT }} />
                      </div>
                      <div>
                        <h2 className="font-display text-lg md:text-xl tracking-tight text-white leading-none">Próxima hora libre</h2>
                        <p className="text-[11px] md:text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: GOLD }}>Para cuando el paciente llama</p>
                      </div>
                    </div>
                    <button onClick={() => setModalBuscarHora(false)} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-all"><X size={24} /></button>
                  </div>

                  {/* Filtros */}
                  <div className="px-6 md:px-8 py-4 border-b border-slate-100 bg-white grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
                    <div className="col-span-2 md:col-span-1 space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Especialista</label>
                      <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#C9A24B] disabled:opacity-70" value={buscarHoraFiltro.profesional} disabled={!puedeVerAgendaCompleta || buscandoHuecos} onChange={e => actualizarFiltroBusqueda({ profesional: e.target.value })}>
                        {puedeVerAgendaCompleta && <option value="Todos">Cualquiera</option>}
                        {profesionales.filter(p => puedeVerAgendaCompleta || p.user_id === usuarioLogueado).map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Duración</label>
                      <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#C9A24B]" value={buscarHoraFiltro.duracion} disabled={buscandoHuecos} onChange={e => actualizarFiltroBusqueda({ duracion: Number(e.target.value) })}>
                        {duracionesDisponibles.map(d => <option key={d} value={d}>{d} min</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Turno</label>
                      <select className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#C9A24B]" value={buscarHoraFiltro.turno} disabled={buscandoHuecos} onChange={e => actualizarFiltroBusqueda({ turno: e.target.value as any })}>
                        <option value="cualquiera">Cualquiera</option>
                        <option value="manana">Mañana (antes 13:00)</option>
                        <option value="tarde">Tarde (desde 13:00)</option>
                      </select>
                    </div>
                    <div className="col-span-2 md:col-span-1 space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Desde</label>
                      <input type="date" min={hoyISO} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#C9A24B]" value={buscarHoraFiltro.desde} disabled={buscandoHuecos} onChange={e => { if (e.target.value) actualizarFiltroBusqueda({ desde: e.target.value }); }} />
                    </div>
                  </div>

                  <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-2.5">
                    {buscandoHuecos && huecosEncontrados.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                        <Loader2 className="animate-spin text-[#C9A24B]" size={32} />
                        <p className="text-xs font-black uppercase tracking-widest">Buscando horas libres...</p>
                      </div>
                    ) : huecosEncontrados.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3 opacity-70">
                        <CalendarIcon size={44} className="text-slate-300" />
                        <p className="text-sm font-black uppercase tracking-widest text-slate-600">Sin horas disponibles</p>
                        <p className="text-xs text-center max-w-xs">No hay huecos en los próximos meses con estos filtros. Prueba con otro especialista, turno o una duración menor.</p>
                      </div>
                    ) : (
                      <>
                        {huecosEncontrados.slice(0, huecosLimite).map((h, i) => {
                          const fechaTxt = new Date(h.fecha + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
                          const etiquetaDia = h.fecha === hoyISO ? 'Hoy' : h.fecha === getLocalDateISO(new Date(Date.now() + 86400000)) ? 'Mañana' : null;
                          return (
                            <div key={`${h.fecha}-${h.hora}-${h.profesional_id}`} className={`bg-white p-4 rounded-2xl border shadow-sm flex items-center justify-between gap-3 ${i === 0 ? 'border-[#C9A24B] ring-2 ring-[#C9A24B]/15' : 'border-slate-200'}`}>
                              <div className="flex items-center gap-4 min-w-0">
                                <div className="w-16 h-14 rounded-xl bg-[#C9A24B]/10 text-[#8A6D2F] flex flex-col items-center justify-center shrink-0">
                                  <span className="text-base font-black leading-none">{h.hora}</span>
                                  <span className="text-[9px] font-bold mt-1">{h.duracion} min</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="font-black text-sm text-slate-800 capitalize leading-tight">
                                    {etiquetaDia && <span className="mr-2 text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded align-middle">{etiquetaDia}</span>}
                                    {fechaTxt}
                                  </p>
                                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mt-1 flex items-center gap-1 truncate"><Stethoscope size={12} /> Dr(a). {h.doctor}</p>
                                </div>
                              </div>
                              <button onClick={() => agendarEnHueco(h)} className="shrink-0 px-4 py-2.5 bg-[#C9A24B] hover:bg-[#B38D3A] text-[#0A111F] rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm transition-colors">
                                <Plus size={14} strokeWidth={3} /> Agendar
                              </button>
                            </div>
                          );
                        })}
                        {(huecosEncontrados.length > huecosLimite || !busquedaAgotada) && (
                          <button onClick={verMasHuecos} disabled={buscandoHuecos} className="w-full py-3 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-[#8A6D2F] border-2 border-dashed border-slate-200 hover:border-[#C9A24B]/50 rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                            {buscandoHuecos ? <Loader2 size={14} className="animate-spin" /> : <ArrowDown size={14} />} Ver 5 más
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {huecosEncontrados.length > 0 && (
                    <div className="px-6 md:px-8 py-4 border-t border-slate-100 bg-white shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <p className="text-[10px] font-bold text-slate-400">Máximo 3 opciones por doctor y día, sin solaparse entre sí.</p>
                      <button onClick={copiarOpcionesHuecos} className="px-4 py-2.5 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                        <MessageCircle size={14} /> Copiar opciones para WhatsApp
                      </button>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* MODAL HOJA DE RUTA DEL DOCTOR */}
          <AnimatePresence>
            {modalHojaRuta && (
              <div className="fixed inset-0 z-[99999] flex items-start justify-center px-4 pb-4 pt-12 md:pt-16 bg-slate-900/60 backdrop-blur-sm text-slate-900 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-4xl max-h-[88vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden text-left">
                  <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-2xl shadow-sm" style={{ backgroundColor: 'rgba(201,162,75,0.15)', border: `1px solid ${GOLD}` }}>
                        <ClipboardList size={24} style={{ color: GOLD_LIGHT }} />
                      </div>
                      <div>
                        <h2 className="font-display text-lg md:text-xl tracking-tight text-white leading-none">Hoja de ruta</h2>
                        <p className="text-[11px] md:text-[10px] font-bold uppercase tracking-widest mt-1 capitalize" style={{ color: GOLD }}>
                          {hojaRutaFecha && new Date(hojaRutaFecha + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setModalHojaRuta(false)} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-all"><X size={24} /></button>
                  </div>

                  <div className="px-6 md:px-8 py-4 border-b border-slate-100 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="date" className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-[#C9A24B]" value={hojaRutaFecha} onChange={e => { if (e.target.value) { setHojaRutaFecha(e.target.value); cargarHojaRuta(e.target.value, hojaRutaProfesional); } }} />
                      <select className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-[#C9A24B] disabled:opacity-70" value={hojaRutaProfesional} disabled={!puedeVerAgendaCompleta} onChange={e => { setHojaRutaProfesional(e.target.value); cargarHojaRuta(hojaRutaFecha, e.target.value); }}>
                        {puedeVerAgendaCompleta && <option value="Todos">Todos los especialistas</option>}
                        {profesionales.filter(p => puedeVerAgendaCompleta || p.user_id === usuarioLogueado).map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
                      </select>
                    </div>
                    <button onClick={imprimirHojaRuta} disabled={cargandoHojaRuta || hojaRutaData.length === 0} className="px-4 py-2.5 bg-[#0A111F] text-[#E8CD8A] rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:brightness-125 disabled:opacity-40 transition-all">
                      <Printer size={14} /> Imprimir
                    </button>
                  </div>

                  <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar">
                    {cargandoHojaRuta ? (
                      <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                        <Loader2 className="animate-spin text-[#C9A24B]" size={32} />
                        <p className="text-xs font-black uppercase tracking-widest">Preparando hoja de ruta...</p>
                      </div>
                    ) : hojaRutaData.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3 opacity-70">
                        <CalendarIcon size={44} className="text-slate-300" />
                        <p className="text-sm font-black uppercase tracking-widest text-slate-600">Sin citas este día</p>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {hojaRutaPorDoctor.map(([doctor, filas]) => {
                          const conAlertas = filas.filter((f: any) => f.alertas.length > 0).length;
                          const primeras = filas.filter((f: any) => f.primeraVez).length;
                          return (
                            <div key={doctor}>
                              <div className="flex flex-wrap items-end justify-between gap-2 mb-3 pb-2 border-b-2 border-[#C9A24B]/40">
                                <h3 className="font-black text-base text-[#0A111F] uppercase tracking-wide">Dr(a). {doctor}</h3>
                                <div className="flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-widest">
                                  <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">{filas.length} pacientes</span>
                                  {primeras > 0 && <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700">{primeras} primera vez</span>}
                                  {conAlertas > 0 && <span className="px-2 py-1 rounded-full bg-red-50 text-red-600">{conAlertas} con alerta médica</span>}
                                </div>
                              </div>
                              <div className="space-y-2.5">
                                {filas.map((f: any) => {
                                  const est = ESTADOS_CITA[f.cita.estado] || ESTADOS_CITA.programada;
                                  return (
                                    <div key={f.cita.id} className={`bg-white rounded-2xl border p-4 shadow-sm flex flex-col md:flex-row gap-4 ${f.alertas.length ? 'border-red-200' : 'border-slate-200'}`}>
                                      <div className="flex md:flex-col items-center md:items-start gap-2 md:w-16 shrink-0">
                                        <span className="text-lg font-black text-[#0A111F] leading-none">{horaDeStr(f.cita.inicio)}</span>
                                        <span className="text-[10px] font-bold text-slate-400">{horaDeStr(f.cita.fin)}</span>
                                      </div>
                                      <div className="flex-1 min-w-0 space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Link prefetch={false} href={`/pacientes/${f.cita.paciente_id}`} onClick={() => setModalHojaRuta(false)} className="font-black text-sm text-slate-800 uppercase hover:text-[#8A6D2F]">
                                            {f.paciente.nombre} {f.paciente.apellido}
                                          </Link>
                                          {f.edad !== null && <span className="text-[10px] font-bold text-slate-500">{f.edad} años</span>}
                                          {f.primeraVez && <span className="text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">Primera visita</span>}
                                          <span className={`text-[9px] font-black uppercase tracking-widest ${est.circleText}`}>{est.label}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-600">
                                          <MessageSquareText size={13} className="text-[#C9A24B] shrink-0" /> {f.cita.motivo || 'Sin motivo registrado'}
                                        </div>
                                        {f.alertas.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5">
                                            {f.alertas.map((a: string, i: number) => (
                                              <span key={i} className="inline-flex items-center gap-1 text-[10px] font-black bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-lg">
                                                <HeartPulse size={12} /> {a}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        {f.otros.length > 0 && (
                                          <p className="text-[11px] text-slate-500 leading-relaxed"><span className="font-bold">Antecedentes:</span> {f.otros.join(' · ')}</p>
                                        )}
                                        {f.alertas.length === 0 && f.otros.length === 0 && (
                                          <p className="text-[11px] text-slate-400 italic">Sin antecedentes médicos registrados</p>
                                        )}
                                      </div>
                                      <div className="md:w-40 shrink-0 flex md:flex-col md:items-end gap-2 text-right">
                                        {f.finanzas?.deuda_realizada > 0 ? (
                                          <span className="text-[10px] font-black uppercase tracking-wider bg-red-500 text-white px-2.5 py-1 rounded-lg">Por cobrar ${Number(f.finanzas.deuda_realizada).toLocaleString('es-CL')}</span>
                                        ) : f.finanzas?.deuda > 0 ? (
                                          <span className="text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg">Saldo plan ${Number(f.finanzas.deuda).toLocaleString('es-CL')}</span>
                                        ) : f.finanzas?.total > 0 ? (
                                          <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg">Al día</span>
                                        ) : (
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sin plan</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* MODAL DE RECORDATORIOS EN LOTE */}
          <AnimatePresence>
            {modalRecordatorios && (
              <div className="fixed inset-0 z-[99999] flex items-start justify-center px-4 pb-4 pt-16 md:pt-24 bg-slate-900/60 backdrop-blur-sm text-slate-900 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-3xl max-h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden relative text-slate-900 text-left">
                  <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0 text-left" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                    <div className="flex items-center gap-4 text-left">
                      <div className="p-3 rounded-2xl shadow-sm" style={{ backgroundColor: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.6)' }}>
                        <BellRing className="text-emerald-300" size={24} />
                      </div>
                      <div>
                        <h2 className="font-display text-lg md:text-xl tracking-tight text-white leading-none">Recordatorios</h2>
                        <p className="text-[11px] md:text-[10px] font-bold uppercase tracking-widest mt-1 text-emerald-300 capitalize">
                          {fechaRecordatorio && new Date(fechaRecordatorio + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                          {!puedeVerAgendaCompleta ? ' · Mis citas' : filtroEspecialista !== 'Todos' ? ` · Dr. ${profesionales.find(p => p.user_id === filtroEspecialista)?.apellido || ''}` : ' · Todos los especialistas'}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setModalRecordatorios(false)} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-all text-left">
                      <X className="md:w-[20px] md:h-[20px]" size={24} />
                    </button>
                  </div>

                  {/* Barra: fecha + contadores */}
                  <div className="px-6 md:px-8 py-4 border-b border-slate-100 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Día</label>
                      <input
                        type="date"
                        className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-[#C9A24B]"
                        value={fechaRecordatorio}
                        onChange={(e) => { if (e.target.value) { setFechaRecordatorio(e.target.value); cargarRecordatorios(e.target.value); } }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">{recordatoriosPendientes.length} por enviar</span>
                      <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{recordatoriosEnviados.length} enviados</span>
                      <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{recordatoriosConfirmados.length} confirmados</span>
                      {recordatoriosSinTelefono.length > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-100">{recordatoriosSinTelefono.length} sin teléfono</span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-3">
                    {cargandoRecordatorios ? (
                      <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                        <Loader2 className="animate-spin" size={36} />
                        <p className="text-xs font-black uppercase tracking-widest">Buscando citas...</p>
                      </div>
                    ) : recordatorios.length === 0 ? (
                      <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3 opacity-70">
                        <CalendarIcon size={48} className="text-slate-300" />
                        <p className="text-sm font-black uppercase tracking-widest text-slate-600">Sin citas ese día</p>
                      </div>
                    ) : (
                      [...recordatoriosPendientes, ...recordatoriosSinTelefono, ...recordatoriosEnviados, ...recordatoriosConfirmados].map(g => {
                        const esSiguiente = recordatoriosPendientes[0]?.key === g.key;
                        const nombre = `${g.paciente?.nombre || ''} ${g.paciente?.apellido || ''}`.trim() || 'S/N';
                        const badge =
                          g.estadoRecordatorio === 'confirmado' ? { txt: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700' } :
                          g.estadoRecordatorio === 'enviado' ? { txt: 'Enviado · esperando', cls: 'bg-blue-100 text-blue-700' } :
                          !g.tieneTelefono ? { txt: 'Sin teléfono', cls: 'bg-red-100 text-red-600' } :
                          { txt: 'Por enviar', cls: 'bg-amber-100 text-amber-700' };

                        return (
                          <div key={g.key} className={`bg-white p-4 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${esSiguiente ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'} ${g.estadoRecordatorio === 'confirmado' ? 'opacity-60' : ''}`}>
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="flex flex-col gap-1 shrink-0">
                                {g.citas.map((c: any) => (
                                  <span key={c.id} className="text-[11px] font-black text-[#8A6D2F] bg-[#C9A24B]/10 px-2 py-1 rounded-md text-center">{horaDeStr(c.inicio)}</span>
                                ))}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="font-black text-sm text-slate-800 uppercase leading-tight truncate">{nombre}</h4>
                                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${badge.cls}`}>{badge.txt}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                  <span className="flex items-center gap-1"><Phone size={11} /> {g.telefono || 'Sin teléfono'}</span>
                                  <span>•</span>
                                  <span>{g.citas.map((c: any) => { const d = profesionales.find(p => p.user_id === c.profesional_id); return `Dr. ${d?.apellido || 'S/A'}`; }).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).join(', ')}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2 shrink-0">
                              {!g.tieneTelefono ? (
                                <Link prefetch={false} href={`/pacientes/${g.key}`} onClick={() => setModalRecordatorios(false)} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5">
                                  <User size={14} /> Agregar teléfono
                                </Link>
                              ) : g.estadoRecordatorio === 'confirmado' ? (
                                <CheckCircle2 className="text-emerald-500" size={22} />
                              ) : (
                                <button
                                  onClick={() => enviarRecordatorioGrupo(g)}
                                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-1.5 transition-all ${g.estadoRecordatorio === 'enviado' ? 'text-slate-500 border border-slate-200 hover:bg-slate-50' : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm'}`}
                                >
                                  <MessageCircle size={14} /> {g.estadoRecordatorio === 'enviado' ? 'Reenviar' : 'Enviar'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="p-6 md:p-8 border-t border-slate-100 bg-white shrink-0">
                    {recordatoriosPendientes.length > 0 ? (
                      <button
                        onClick={() => enviarRecordatorioGrupo(recordatoriosPendientes[0])}
                        className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                      >
                        <Send size={16} />
                        Enviar siguiente: {`${recordatoriosPendientes[0].paciente?.nombre || ''} ${recordatoriosPendientes[0].paciente?.apellido || ''}`.trim()}
                        <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px]">{recordatoriosPendientes.length} restantes</span>
                      </button>
                    ) : (
                      <div className="w-full py-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                        <CheckCircle2 size={16} /> {recordatorios.length > 0 ? 'Todos los recordatorios están enviados' : 'Nada por enviar'}
                      </div>
                    )}
                    <p className="text-[10px] font-bold text-slate-400 text-center mt-3">
                      Cada clic abre WhatsApp con el mensaje listo. Envíalo, vuelve a esta pestaña y presiona el botón para el siguiente.
                    </p>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* MODAL DE CITAS ANULADAS */}
          <AnimatePresence>
            {modalAnuladasAbierto && (
              <div className="fixed inset-0 z-[99999] flex items-start justify-center px-4 pb-4 pt-16 md:pt-24 bg-slate-900/60 backdrop-blur-sm text-slate-900 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-2xl max-h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden relative text-slate-900 text-left">
                  <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0 text-left" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                    <div className="flex items-center gap-4 text-left">
                      <div className="p-3 rounded-2xl shadow-sm" style={{ backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.6)' }}><Trash2 className="text-red-400" size={24} /></div>
                      <div>
                        <h2 className="font-display text-lg md:text-xl tracking-tight text-white leading-none">Citas Anuladas</h2>
                        <p className="text-[11px] md:text-[10px] font-bold uppercase tracking-widest mt-1 text-red-300">Pacientes que cancelaron</p>
                      </div>
                    </div>
                    <button onClick={() => setModalAnuladasAbierto(false)} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-all text-left"><X className="md:w-[20px] md:h-[20px]" size={24} /></button>
                  </div>
                  
                  <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-4">
                    {citasAnuladas.map(cita => {
                      const horaFormat = horaDeStr(cita.inicio);
                      const fechaCorta = vistaAgenda === 'semana' ? fechaLocalDeStr(cita.inicio).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }) : '';
                      const doctor = profesionales.find(p => p.user_id === cita.profesional_id);
                      const canceladoPor = cita.cancelado_por ? usuariosMap[cita.cancelado_por] : null;
                      
                      return (
                        <div key={cita.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 opacity-75 hover:opacity-100 transition-opacity">
                          <div className="flex items-center gap-4">
                             <div className="w-14 h-12 rounded-xl bg-red-50 text-red-500 flex flex-col items-center justify-center font-black shrink-0 border border-red-100 text-sm leading-tight">
                                 {fechaCorta && <span className="text-[9px] uppercase">{fechaCorta}</span>}
                                 {horaFormat}
                             </div>
                             <div>
                                 <h4 className="font-black text-sm text-slate-800 uppercase leading-none">{cita.pacientes?.nombre} {cita.pacientes?.apellido}</h4>
                                 <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span>RUT: {cita.pacientes?.rut || 'S/N'}</span>
                                    <span>•</span>
                                    <span>Tel: {cita.pacientes?.telefono || 'N/A'}</span>
                                 </div>
                                 <div className="mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span>Dr(a). {doctor?.apellido || 'S/A'}</span>
                                    {canceladoPor && <span className="ml-2 text-red-400">· Anulada por {canceladoPor.split(' ')[0]}</span>}
                                 </div>
                             </div>
                          </div>
                          
                          <div className="flex gap-2 w-full sm:w-auto">
                             {cita.pacientes?.telefono && (
                               <button onClick={() => abrirWhatsApp(cita.pacientes?.telefono)} className="flex-1 sm:flex-none p-3 sm:p-2 bg-slate-50 text-slate-600 hover:text-emerald-500 rounded-xl border border-slate-200 transition-colors flex justify-center items-center" title="Contactar por WhatsApp">
                                 <MessageSquareText size={18} />
                               </button>
                             )}
                             <Link prefetch={false} href={`/pacientes/${cita.paciente_id}`} onClick={() => setModalAnuladasAbierto(false)} className="flex-1 sm:flex-none p-3 sm:p-2 bg-slate-50 text-slate-600 hover:text-blue-500 rounded-xl border border-slate-200 transition-colors flex justify-center items-center" title="Ver ficha del paciente">
                               <User size={18} />
                             </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {modalOnlineAbierto && (
              <div className="fixed inset-0 z-[99999] flex items-start justify-center px-4 pb-4 pt-16 md:pt-24 bg-slate-900/60 backdrop-blur-sm text-slate-900 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-3xl max-h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden relative text-slate-900 text-left">
                  <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0 text-left" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                    <div className="flex items-center gap-4 text-left">
                      <div className="p-3 rounded-2xl shadow-sm" style={{ backgroundColor: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.6)' }}>
                        <Globe className="text-blue-400" size={24} />
                      </div>
                      <div>
                        <h2 className="font-display text-lg md:text-xl tracking-tight text-white leading-none">Citas Web Pendientes</h2>
                        <p className="text-[11px] md:text-[10px] font-bold uppercase tracking-widest mt-1 text-blue-300">Todas las solicitudes futuras · aprobar y notificar</p>
                      </div>
                    </div>
                    <button onClick={() => setModalOnlineAbierto(false)} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-all text-left">
                      <X className="md:w-[20px] md:h-[20px]" size={24} />
                    </button>
                  </div>
                  
                  <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-4">
                    {citasOnlinePendientes.length === 0 ? (
                      <div className="h-full py-12 flex flex-col items-center justify-center text-slate-400 gap-4 opacity-60">
                        <CheckCircle2 className="text-emerald-500" size={60} />
                        <p className="text-base md:text-sm font-black uppercase tracking-widest text-slate-600">Al día</p>
                        <p className="text-sm md:text-xs mt-1">No hay citas web pendientes de validación.</p>
                      </div>
                    ) : (
                      citasOnlinePendientes.map(cita => {
                        const fechaFormat = fechaLocalDeStr(cita.inicio).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' });
                        const horaFormat = horaDeStr(cita.inicio);
                        const doctor = profesionales.find(p => p.user_id === cita.profesional_id);

                        return (
                          <div key={cita.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:border-blue-300 hover:shadow-md">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex flex-col items-center justify-center font-black shrink-0 border border-blue-100">
                                <span className="text-sm">{horaFormat}</span>
                              </div>
                              <div>
                                <h4 className="font-black text-sm text-slate-800 uppercase leading-none">{cita.pacientes?.nombre} {cita.pacientes?.apellido}</h4>
                                <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                  <span className="text-slate-700">{fechaFormat}</span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1"><Phone size={12}/> {cita.pacientes?.telefono || 'Sin teléfono'}</span>
                                </div>
                                <div className="mt-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                  <Stethoscope size={12}/> Dr(a). {doctor?.apellido || 'S/A'}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
                              <button 
                                onClick={() => rechazarCitaOnline(cita.id)} 
                                disabled={cargandoAccion} 
                                className="flex-1 md:flex-none p-3 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white rounded-xl border border-red-100 transition-all font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                <Ban size={16} /> Rechazar
                              </button>
                              <button 
                                onClick={() => validarCitaOnline(cita)} 
                                disabled={cargandoAccion} 
                                className="flex-1 md:flex-none p-3 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                              >
                                {cargandoAccion ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />} Validar y Avisar
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>,
        document.body
      )}
    </div>
  )
}

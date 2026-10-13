'use client'
// Agenda Clínica: carga de datos, filtros, lista de citas y conexión con los modales.
// Cada modal vive en ./_components y maneja su propio estado.
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlertTriangle, BellRing, Calendar as CalendarIcon, CalendarDays, ChevronLeft, ChevronRight, ClipboardList,
  Globe, LayoutGrid, List, Loader2, Lock, Plus, Search, Users, X,
} from 'lucide-react'

import { contarInasistencias, obtenerFinanzasPacientes, registrarAuditoria } from './_components/data'
import { configControl, configReprogramar, enviarRecordatorioIndividual, guardarEstadoCita } from './_components/acciones'
import { useAgendaRealtime, useAvisoPacienteEspera, useReloj } from './_components/hooks'
import AvisoPacienteEspera from './_components/AvisoPacienteEspera'
import {
  abrirWhatsApp, construirMensajeInasistencia, construirMensajeResena,
  esWebPendiente, fechaISODeStr, getDiasLunesSabado, getLocalDateISO, GOLD, nombrePaciente,
} from './_components/utils'
import type { AgendarConfig, Hueco, Profesional } from './_components/types'
import { TarjetaCitaDia, TarjetaCitaSemana, type AccionesCita } from './_components/TarjetaCita'
import ModalAgendar from './_components/ModalAgendar'
import ModalEnvioPresupuesto from './_components/ModalEnvioPresupuesto'
import ModalBloqueo from './_components/ModalBloqueo'
import ModalHuerfanas from './_components/ModalHuerfanas'
import ModalAnuladas from './_components/ModalAnuladas'
import ModalCitasWeb from './_components/ModalCitasWeb'
import ModalRecordatorios from './_components/ModalRecordatorios'
import ModalBuscarHora from './_components/ModalBuscarHora'
import ModalHojaRuta from './_components/ModalHojaRuta'

const ROLES_AGENDA_COMPLETA = ['ADMIN', 'RECEPCIONISTA', 'ASISTENTE'];
const ROLES_FINANZAS = ['ADMIN', 'RECEPCIONISTA'];
const ROLES_RECORDATORIOS = ['ADMIN', 'RECEPCIONISTA', 'ASISTENTE']; // los doctores no envían recordatorios

export default function AgendaPage() {
  const router = useRouter();

  // ── Sesión y datos base ──
  const [usuarioLogueado, setUsuarioLogueado] = useState<string | null>(null);
  const [userRol, setUserRol] = useState('');
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [usuariosMap, setUsuariosMap] = useState<Record<string, string>>({});
  const [cargandoPagina, setCargandoPagina] = useState(true);
  const puedeVerFinanzas = ROLES_FINANZAS.includes(userRol);
  const puedeVerAgendaCompleta = ROLES_AGENDA_COMPLETA.includes(userRol);
  const puedeEnviarRecordatorios = ROLES_RECORDATORIOS.includes(userRol);

  // ── Agenda ──
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [vistaAgenda, setVistaAgenda] = useState<'dia' | 'semana'>('dia');
  const [filtroEspecialista, setFiltroEspecialista] = useState('Todos');
  const [citasDia, setCitasDia] = useState<any[]>([]);
  const [citasAnuladas, setCitasAnuladas] = useState<any[]>([]);
  const [citasOnlinePendientes, setCitasOnlinePendientes] = useState<any[]>([]);
  const [cambiandoFecha, setCambiandoFecha] = useState(false);
  const [busquedaAgenda, setBusquedaAgenda] = useState('');
  const realtimeTrigger = useAgendaRealtime();
  const [avisoEspera, cerrarAvisoEspera] = useAvisoPacienteEspera();
  const ahoraMs = useReloj(30000); // reloj del semáforo de espera

  // ── Modales ──
  const [agendarConfig, setAgendarConfig] = useState<AgendarConfig | null>(null);
  const [citaPresupuesto, setCitaPresupuesto] = useState<any>(null);
  const [modal, setModal] = useState<null | 'bloqueo' | 'huerfanas' | 'anuladas' | 'web' | 'recordatorios' | 'buscarHora' | 'hojaRuta'>(null);
  const cerrarModal = () => setModal(null);

  const dateInputRef = useRef<HTMLInputElement>(null);
  const fetchSeq = useRef(0);

  const hoyISO = getLocalDateISO(new Date());
  const esHoySeleccionado = getLocalDateISO(selectedDate) === hoyISO;

  // ─────────────────────────────────────────────────────────────
  // Efectos
  // ─────────────────────────────────────────────────────────────

  useEffect(() => { cargarBasicos(); }, []);

  // Carga al cambiar fecha / filtro / vista (espera a que el rol esté cargado)
  useEffect(() => {
    if (cargandoPagina) return;
    let activo = true;
    setCambiandoFecha(true);
    fetchCitasAgenda().finally(() => { if (activo) setTimeout(() => setCambiandoFecha(false), 150); });
    return () => { activo = false; };
  }, [selectedDate, filtroEspecialista, vistaAgenda, cargandoPagina]);

  // Refresco silencioso por realtime
  useEffect(() => { if (realtimeTrigger > 0) fetchCitasAgenda(); }, [realtimeTrigger]);

  // ─────────────────────────────────────────────────────────────
  // Datos
  // ─────────────────────────────────────────────────────────────
  async function cargarBasicos() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUsuarioLogueado(session.user.id);
        const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', session.user.id).maybeSingle();
        if (perfil) {
          setUserRol(perfil.rol);
          // Los doctores solo ven su propia agenda
          if (!ROLES_AGENDA_COMPLETA.includes(perfil.rol)) setFiltroEspecialista(session.user.id);
        }
      }

      const [{ data: pro }, { data: perfiles }] = await Promise.all([
        supabase.from('profesionales').select('*, especialidades(nombre)').eq('activo', true),
        supabase.from('perfiles').select('id, nombre_completo'),
      ]);
      setProfesionales(pro || []);
      const mapa: Record<string, string> = {};
      perfiles?.forEach((p: any) => { mapa[p.id] = p.nombre_completo; });
      setUsuariosMap(mapa);
    } finally {
      setCargandoPagina(false);
    }
  }

  async function fetchCitasOnlinePendientes() {
    let q = supabase.from('citas').select('*, pacientes(*)')
      .ilike('motivo', '%Online%').eq('estado_confirmacion', 'pendiente').neq('estado', 'cancelada')
      .gte('inicio', `${getLocalDateISO(new Date())}T00:00:00`)
      .order('inicio', { ascending: true });
    if (!puedeVerAgendaCompleta && usuarioLogueado) q = q.eq('profesional_id', usuarioLogueado);
    const { data } = await q;
    setCitasOnlinePendientes(data || []);
  }

  async function fetchCitasAgenda() {
    const seq = ++fetchSeq.current;
    fetchCitasOnlinePendientes();

    const dias = getDiasLunesSabado(selectedDate);
    const [desde, hasta] = vistaAgenda === 'dia'
      ? [getLocalDateISO(selectedDate), getLocalDateISO(selectedDate)]
      : [getLocalDateISO(dias[0]), getLocalDateISO(dias[5])];

    let query = supabase.from('citas').select('*, pacientes(*)').gte('inicio', `${desde}T00:00:00`).lte('inicio', `${hasta}T23:59:59`);
    if (filtroEspecialista !== 'Todos') query = query.eq('profesional_id', filtroEspecialista);

    const { data, error } = await query.order('inicio', { ascending: true }).order('id', { ascending: true });
    if (seq !== fetchSeq.current) return; // llegó una respuesta más nueva
    if (error) { console.error(error); toast.error('No se pudo cargar la agenda'); return; }
    if (!data?.length) { setCitasDia([]); setCitasAnuladas([]); return; }

    const anuladas = data.filter((c: any) => c.estado === 'cancelada');
    const activas = data.filter((c: any) => c.estado !== 'cancelada');
    const ids = [...new Set(activas.map((c: any) => c.paciente_id).filter(Boolean))] as string[];

    const [finanzas, inasistencias] = await Promise.all([obtenerFinanzasPacientes(ids), contarInasistencias(ids)]);
    if (seq !== fetchSeq.current) return;

    setCitasAnuladas(anuladas);
    setCitasDia(activas.map((c: any) => {
      const fin = finanzas[c.paciente_id];
      let estadoFinanciero = 'sin_saldo';
      let requiereCobroInmediato = false;
      if (fin && fin.total > 0) {
        if (fin.deuda_realizada > 0) { estadoFinanciero = 'deuda'; requiereCobroInmediato = true; }
        else if (fin.deuda <= 0) estadoFinanciero = 'saldado';
      }
      return { ...c, finanzas: fin, estadoFinanciero, requiereCobroInmediato, inasistencias: inasistencias[c.paciente_id] || 0 };
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Derivados
  // ─────────────────────────────────────────────────────────────
  const citasFiltradas = useMemo(() => {
    const term = busquedaAgenda.toLowerCase().trim();
    if (!term) return citasDia;
    return citasDia.filter(c => nombrePaciente(c.pacientes).toLowerCase().includes(term) || (c.pacientes?.rut || '').toLowerCase().includes(term));
  }, [citasDia, busquedaAgenda]);

  // El sobrecupo se calcula sobre TODAS las citas (no depende del buscador)
  const sobrecupoIds = useMemo(() => {
    const ids = new Set<string>();
    const validas = citasDia.filter(c => c.profesional_id && !esWebPendiente(c));
    const ms = (s: string) => new Date(s.replace(' ', 'T')).getTime();
    validas.forEach(c => {
      const cIni = ms(c.inicio); const cFin = ms(c.fin);
      const choca = validas.some(o => {
        if (o.id === c.id || String(o.profesional_id) !== String(c.profesional_id)) return false;
        if (cIni >= ms(o.fin) || cFin <= ms(o.inicio)) return false;
        const tC = c.created_at ? new Date(c.created_at).getTime() : 0;
        const tO = o.created_at ? new Date(o.created_at).getTime() : 0;
        if (tC !== tO && tC > 0 && tO > 0) return tC > tO; // la agendada después es el sobrecupo
        return String(c.id) > String(o.id);
      });
      if (choca) ids.add(c.id);
    });
    return ids;
  }, [citasDia]);

  const etiquetaFecha = vistaAgenda === 'dia'
    ? selectedDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })
    : (() => { const d = getDiasLunesSabado(selectedDate); return `${d[0].getDate()} – ${d[5].toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`; })();

  const moverFecha = (sentido: 1 | -1) => {
    const n = new Date(selectedDate);
    n.setDate(n.getDate() + sentido * (vistaAgenda === 'semana' ? 7 : 1));
    setSelectedDate(n);
  };

  // ─────────────────────────────────────────────────────────────
  // Acciones sobre citas
  // ─────────────────────────────────────────────────────────────
  const abrirAgendar = (cfg: Omit<AgendarConfig, 'id'> = {}) => {
    setAgendarConfig({
      profesionalId: cfg.profesionalId || (filtroEspecialista !== 'Todos' ? filtroEspecialista : profesionales[0]?.user_id),
      ...cfg,
      id: Date.now(),
    });
  };

  const iniciarReprogramacion = (cita: any) => abrirAgendar(configReprogramar(cita));

  const agendarControl = (cita: any) => {
    if (!cita?.pacientes) return toast.error('La cita no tiene paciente asociado');
    abrirAgendar(configControl(cita));
  };

  const agendarEnHueco = (h: Hueco) => {
    setModal(null);
    abrirAgendar({ profesionalId: h.profesional_id, duracion: h.duracion, semanaInicio: h.fecha, diaSugerido: h.fecha, horas: [{ fecha: h.fecha, hora: h.hora, duracion: h.duracion }] });
  };

  async function actualizarEstadoCita(cita: any, nuevoEstado: string) {
    setCitasDia(prev => prev.map(c => c.id === cita.id ? { ...c, estado: nuevoEstado } : c)); // optimista
    await guardarEstadoCita(cita, nuevoEstado, { usuarioLogueado, profesionales, onAgendarControl: agendarControl });
    await fetchCitasAgenda(); // si falló, esto revierte el cambio optimista
  }

  const eliminarCita = async (cita: any) => {
    const nombre = nombrePaciente(cita.pacientes) || 'S/N';
    if (!confirm(`⚠️ ¿Estás seguro de ELIMINAR PERMANENTEMENTE la cita de ${nombre}? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await supabase.from('citas').delete().eq('id', cita.id);
      if (error) throw error;
      await registrarAuditoria(usuarioLogueado, 'DELETE / CITA', 'citas', `Eliminó permanentemente la cita de ${nombre} del día ${fechaISODeStr(cita.inicio)}.`);
      toast.success('Cita eliminada de la base de datos');
      await fetchCitasAgenda();
    } catch (e) { console.error(e); toast.error('No se pudo eliminar la cita'); }
  };

  const acciones: AccionesCita = {
    onCambiarEstado: actualizarEstadoCita,
    onReprogramar: iniciarReprogramacion,
    onPresupuesto: setCitaPresupuesto,
    onRecordatorio: (c) => enviarRecordatorioIndividual(c, profesionales),
    onResena: (c) => abrirWhatsApp(c.pacientes?.telefono, construirMensajeResena(c)),
    onCaja: (c) => {
      const id = c.pacientes?.id || c.paciente_id;
      if (!id) return toast.error('Cita no tiene paciente asignado');
      router.push(`/pacientes/${id}/pagos`);
    },
    onEliminar: eliminarCita,
    onInasistencia: (c) => abrirWhatsApp(c.pacientes?.telefono, construirMensajeInasistencia(c, profesionales)),
    onControl: agendarControl,
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  if (cargandoPagina) return <PantallaCarga />;

  const botonCabecera = "w-full lg:w-auto justify-center px-2 md:px-5 py-2.5 rounded-lg border text-[10px] md:text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center gap-2 bg-white";

  return (
    <div className="min-h-full bg-[#FBF8F2] font-sans text-slate-800 pb-32 md:pb-24 text-left p-4 sm:p-6 md:p-10">

      {/* CABECERA */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-[#0A111F]">
          Agenda <span className="italic font-serif" style={{ color: GOLD }}>Clínica</span>
        </h1>

        <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-center gap-2 sm:gap-3 w-full xl:w-auto mt-4 xl:mt-0">
          <button onClick={() => setModal('web')} className={`relative ${botonCabecera} border-blue-200 text-blue-600 hover:bg-blue-50`}>
            <Globe size={14} /> Validar Web
            {citasOnlinePendientes.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black animate-pulse shadow-md">{citasOnlinePendientes.length}</span>
            )}
          </button>
          {puedeEnviarRecordatorios && (
            <button onClick={() => setModal('recordatorios')} className={`${botonCabecera} border-emerald-200 text-emerald-600 hover:bg-emerald-50`}>
              <BellRing size={14} /> Recordar Mañana
            </button>
          )}
          <button onClick={() => setModal('hojaRuta')} className={`${botonCabecera} border-slate-200 text-slate-600 hover:bg-slate-50`}>
            <ClipboardList className="text-[#C9A24B]" size={14} /> Hoja de Ruta
          </button>
          <button onClick={() => setModal('buscarHora')} className={`${botonCabecera} border-[#C9A24B] text-[#8A6D2F] hover:bg-[#C9A24B]/10`}>
            <Search size={14} /> Buscar Hora
          </button>
          {puedeVerFinanzas && (
            <button onClick={() => setModal('bloqueo')} className={`${botonCabecera} border-red-200 text-red-500 hover:bg-red-50`}>
              <Lock size={14} /> Bloquear
            </button>
          )}
          <Link prefetch={false} href="/diaria" className={`${botonCabecera} border-[#C9A24B]/30 text-slate-600 hover:bg-[#C9A24B]/5`}>
            <CalendarDays className="text-[#C9A24B]" size={14} /> <span className="truncate">Vista Diaria</span>
          </Link>
          <button onClick={() => setModal('huerfanas')} className={`${botonCabecera} border-amber-200 text-slate-600 hover:bg-amber-50`}>
            <AlertTriangle className="text-amber-500" size={14} /> Huérfanas
          </button>
          <button onClick={() => abrirAgendar()} className="w-full lg:w-auto justify-center px-2 md:px-6 py-2.5 rounded-lg font-bold text-[10px] md:text-[11px] uppercase tracking-wider shadow-md transition-all flex items-center gap-2 text-[#0A111F] bg-[#C9A24B] hover:bg-[#B38D3A]">
            <Plus size={14} strokeWidth={3} /> Agendar
          </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-start gap-3 md:gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-full px-4 md:px-5 py-3 md:py-2 shadow-sm flex items-center gap-2 w-full md:w-auto">
          <Users size={16} className="text-[#C9A24B] shrink-0" />
          <select className="text-base sm:text-sm md:text-[11px] font-bold uppercase text-slate-600 bg-transparent outline-none cursor-pointer pr-4 w-full disabled:cursor-not-allowed disabled:opacity-80" value={filtroEspecialista} onChange={(e) => setFiltroEspecialista(e.target.value)} disabled={!puedeVerAgendaCompleta}>
            {puedeVerAgendaCompleta && <option value="Todos">Todos los especialistas</option>}
            {profesionales.filter(p => puedeVerAgendaCompleta || p.user_id === usuarioLogueado).map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
          </select>
        </div>

        <div className="flex items-center justify-between bg-white rounded-full p-1 border border-slate-200 shadow-sm w-full md:w-auto">
          {([['dia', List, 'Día'], ['semana', LayoutGrid, 'Semana']] as const).map(([v, Icono, txt]) => (
            <button key={v} onClick={() => setVistaAgenda(v)} className={`flex-1 justify-center px-4 md:px-6 py-2.5 md:py-2 rounded-full text-sm md:text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${vistaAgenda === v ? 'bg-[#C9A24B] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              <Icono size={15} /> {txt}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex-1 flex items-center justify-between bg-white rounded-full px-2 md:px-4 py-2 md:py-1.5 border border-slate-200 shadow-sm">
            <button onClick={() => moverFecha(-1)} className="p-2 text-slate-400 hover:text-[#0A111F] transition-colors" title={vistaAgenda === 'semana' ? 'Semana anterior' : 'Día anterior'}><ChevronLeft size={18} /></button>
            <div className="flex-1 relative flex items-center justify-center px-4 md:px-6 cursor-pointer" onClick={() => { try { dateInputRef.current?.showPicker(); } catch { dateInputRef.current?.focus(); } }}>
              <CalendarIcon size={16} className="mr-2 text-slate-400 shrink-0" />
              <span className="text-[13px] md:text-[12px] font-bold text-slate-700 capitalize min-w-[120px] text-center">{etiquetaFecha}</span>
              <input ref={dateInputRef} type="date" className="sr-only" value={getLocalDateISO(selectedDate)} onChange={(e) => { if (e.target.value) { const [y, m, d] = e.target.value.split('-'); setSelectedDate(new Date(Number(y), Number(m) - 1, Number(d))); } }} />
            </div>
            <button onClick={() => moverFecha(1)} className="p-2 text-slate-400 hover:text-[#0A111F] transition-colors" title={vistaAgenda === 'semana' ? 'Semana siguiente' : 'Día siguiente'}><ChevronRight size={18} /></button>
          </div>
          {!esHoySeleccionado && (
            <button onClick={() => setSelectedDate(new Date())} className="px-4 py-3 md:py-2.5 rounded-full bg-white border border-[#C9A24B]/40 text-[#8A6D2F] text-[11px] md:text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-[#C9A24B]/10 transition-colors shrink-0">Hoy</button>
          )}
        </div>
      </div>

      {/* BUSCADOR + CONTADOR */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-8">
        <div className="relative w-full sm:max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input type="text" placeholder="Buscar por paciente o RUT..." className="w-full pl-12 pr-10 py-3.5 bg-white border border-slate-200 rounded-full text-base md:text-sm outline-none shadow-sm focus:border-[#C9A24B] transition-all" value={busquedaAgenda} onChange={(e) => setBusquedaAgenda(e.target.value)} />
          {busquedaAgenda && (
            <button onClick={() => setBusquedaAgenda('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Limpiar búsqueda"><X size={16} /></button>
          )}
        </div>
        <div className="bg-white text-slate-700 px-6 py-3.5 md:py-3 rounded-full border border-slate-200 shadow-sm flex items-center justify-center gap-2 shrink-0">
          <CalendarDays className="text-[#C9A24B]" size={17} />
          <span className="font-bold text-sm md:text-xs uppercase tracking-widest">
            {citasFiltradas.length} {vistaAgenda === 'dia' ? (esHoySeleccionado ? 'Citas hoy' : 'Citas del día') : 'Citas en la semana'}
          </span>
          {citasAnuladas.length > 0 && (
            <>
              <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-300 mx-1"></span>
              <button onClick={() => setModal('anuladas')} className="font-bold text-sm md:text-xs uppercase tracking-widest text-red-500 hover:text-red-700 transition-colors">{citasAnuladas.length} Anuladas</button>
            </>
          )}
        </div>
      </div>

      {/* VISTA DÍA */}
      {vistaAgenda === 'dia' && (
        <div className="relative pl-0 md:pl-[140px] pt-4 pb-20 mt-4 md:mt-0">
          {citasFiltradas.length > 0 && !cambiandoFecha && (
            <motion.div initial={{ height: 0 }} animate={{ height: '100%' }} transition={{ duration: 0.8, ease: 'easeOut' }} className="absolute left-[70px] md:left-[100px] top-8 bottom-0 w-[2px] bg-gradient-to-b from-[#C9A24B]/60 to-[#C9A24B]/10 z-0 hidden md:block origin-top" />
          )}

          {cambiandoFecha ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3 md:-ml-[140px]">
              <Loader2 className="animate-spin text-[#C9A24B]" size={32} />
              <p className="text-[11px] font-black uppercase tracking-widest">Cargando citas...</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={selectedDate.toISOString() + filtroEspecialista} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                {citasFiltradas.length > 0 ? citasFiltradas.map((c, i) => (
                  <TarjetaCitaDia
                    key={c.id}
                    cita={c}
                    index={i}
                    esSobrecupo={sobrecupoIds.has(c.id)}
                    ahoraMs={ahoraMs}
                    puedeVerFinanzas={puedeVerFinanzas}
                    acciones={acciones}
                    profesionales={profesionales}
                    usuariosMap={usuariosMap}
                  />
                )) : (
                  <div className="flex flex-col items-center justify-center opacity-40 py-24 text-center text-slate-500 rounded-3xl border-2 border-dashed border-slate-200 md:-ml-[140px]">
                    <CalendarIcon size={48} className="mb-3 text-slate-300" />
                    <h3 className="font-black uppercase text-base tracking-widest text-slate-700">{busquedaAgenda ? 'Sin resultados' : 'Agenda Libre'}</h3>
                    <p className="mt-1 font-bold text-xs tracking-wide">{busquedaAgenda ? 'Ningún paciente coincide con la búsqueda.' : 'No hay citas programadas para este día.'}</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}

      {/* VISTA SEMANA */}
      {vistaAgenda === 'semana' && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-3 pb-20 transition-opacity ${cambiandoFecha ? 'opacity-50 pointer-events-none' : ''}`}>
          {getDiasLunesSabado(selectedDate).map((dia, diaIndex) => {
            const diaISO = getLocalDateISO(dia);
            const esHoyCol = diaISO === hoyISO;
            const citasEsteDia = citasFiltradas.filter(c => c.inicio.startsWith(diaISO));
            return (
              <motion.div key={diaISO} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: diaIndex * 0.05 }} className="flex flex-col gap-3 md:gap-2">
                <button
                  onClick={() => { setSelectedDate(new Date(dia)); setVistaAgenda('dia'); }}
                  title="Ver este día"
                  className={`rounded-xl p-3 md:p-2.5 text-center sticky top-24 md:top-28 z-10 border shadow-sm transition-colors ${esHoyCol ? 'bg-[#C9A24B] border-[#B38D3A]' : 'bg-white border-slate-200 hover:border-[#C9A24B]'}`}
                >
                  <p className={`text-[10px] md:text-[9px] font-black uppercase ${esHoyCol ? 'text-white/80' : 'text-slate-500'}`}>{dia.toLocaleDateString('es-CL', { weekday: 'long' })}</p>
                  <p className={`text-lg md:text-base font-black ${esHoyCol ? 'text-white' : 'text-[#0A111F]'}`}>{dia.getDate()}</p>
                  <p className={`text-[9px] font-bold ${esHoyCol ? 'text-white/80' : 'text-slate-400'}`}>{citasEsteDia.length} cita{citasEsteDia.length === 1 ? '' : 's'}</p>
                </button>
                <div className="flex flex-col gap-3 md:gap-2.5">
                  {citasEsteDia.length > 0 ? citasEsteDia.map((c, i) => (
                    <TarjetaCitaSemana
                      key={c.id}
                      cita={c}
                      delay={diaIndex * 0.05 + Math.min(i, 8) * 0.05}
                      esSobrecupo={sobrecupoIds.has(c.id)}
                      ahoraMs={ahoraMs}
                      puedeVerFinanzas={puedeVerFinanzas}
                      acciones={acciones}
                    />
                  )) : (
                    <div className="h-24 md:h-20 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl opacity-40">
                      <span className="text-[10px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">Sin citas</span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* AVISO: PACIENTE EN SALA DE ESPERA */}
      <AvisoPacienteEspera nombre={avisoEspera} onClose={cerrarAvisoEspera} />

      {/* MODALES */}
      <ModalAgendar
        config={agendarConfig}
        onClose={() => setAgendarConfig(null)}
        onGuardado={fetchCitasAgenda}
        profesionales={profesionales}
        usuarioLogueado={usuarioLogueado}
        puedeVerAgendaCompleta={puedeVerAgendaCompleta}
        realtimeTrigger={realtimeTrigger}
      />
      <ModalEnvioPresupuesto cita={citaPresupuesto} onClose={() => setCitaPresupuesto(null)} />
      <ModalBloqueo abierto={modal === 'bloqueo'} onClose={cerrarModal} onGuardado={fetchCitasAgenda} fecha={selectedDate} profesionales={profesionales} usuarioLogueado={usuarioLogueado} />
      <ModalHuerfanas abierto={modal === 'huerfanas'} onClose={cerrarModal} onCambio={fetchCitasAgenda} filtroEspecialista={filtroEspecialista} profesionales={profesionales} usuarioLogueado={usuarioLogueado} puedeVerAgendaCompleta={puedeVerAgendaCompleta} />
      <ModalAnuladas abierto={modal === 'anuladas'} onClose={cerrarModal} citas={citasAnuladas} profesionales={profesionales} usuariosMap={usuariosMap} mostrarFecha={vistaAgenda === 'semana'} />
      <ModalCitasWeb abierto={modal === 'web'} onClose={cerrarModal} onCambio={fetchCitasAgenda} citas={citasOnlinePendientes} profesionales={profesionales} usuarioLogueado={usuarioLogueado} />
      <ModalRecordatorios abierto={modal === 'recordatorios' && puedeEnviarRecordatorios} onClose={cerrarModal} profesionales={profesionales} usuarioLogueado={usuarioLogueado} puedeVerAgendaCompleta={puedeVerAgendaCompleta} filtroEspecialista={filtroEspecialista} realtimeTrigger={realtimeTrigger} />
      <ModalBuscarHora abierto={modal === 'buscarHora'} onClose={cerrarModal} onElegir={agendarEnHueco} profesionales={profesionales} usuarioLogueado={usuarioLogueado} puedeVerAgendaCompleta={puedeVerAgendaCompleta} especialistaInicial={filtroEspecialista} />
      <ModalHojaRuta abierto={modal === 'hojaRuta'} onClose={cerrarModal} fechaInicial={getLocalDateISO(selectedDate)} especialistaInicial={filtroEspecialista} profesionales={profesionales} usuarioLogueado={usuarioLogueado} puedeVerAgendaCompleta={puedeVerAgendaCompleta} />
    </div>
  );
}

function PantallaCarga() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-[#FBF8F2] relative overflow-hidden">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }} className="flex flex-col items-center z-10">
        <div className="w-20 h-20 bg-[#0A111F] rounded-3xl flex items-center justify-center mb-6 shadow-2xl relative">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: 'linear' }} className="absolute inset-[-2px] rounded-3xl border border-transparent border-t-[#C9A24B] border-b-[#C9A24B]/30 opacity-70" />
          <svg width="32" height="36" viewBox="0 0 24 24" fill="none" stroke="#C9A24B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.5C12 20.5 15 19 16 16C17.3333 12 18 8 16 5C15 3 13 3 12 5C11 3 9 3 8 5C6 8 6.66667 12 8 16C9 19 12 20.5 12 20.5Z" /></svg>
        </div>
        <h2 className="text-xl font-black tracking-widest uppercase text-[#0A111F]">Cargando Agenda</h2>
        <p className="text-xs font-bold text-slate-400 mt-2">Sincronizando con la base de datos...</p>
        <div className="w-48 h-1 bg-slate-200 rounded-full mt-6 overflow-hidden">
          <motion.div initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }} className="h-full bg-[#C9A24B] rounded-full" />
        </div>
      </motion.div>
    </div>
  );
}

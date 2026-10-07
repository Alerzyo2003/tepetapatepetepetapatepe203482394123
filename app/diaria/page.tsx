'use client'
// Vista Diaria: grilla por doctor del día seleccionado.
// Reutiliza los componentes de la Agenda (../agenda/_components) para que ambas páginas se comporten igual.
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, Ban, CalendarClock, CalendarDays, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList,
  Clock, Globe, LayoutGrid, Link as LinkIcon, Loader2, Lock, MessageCircle, MessageSquare, MoreVertical, Plus,
  Save, Search, Timer, User, Users, Wallet, X,
} from 'lucide-react'

import ModalShell from '../agenda/_components/ModalShell'
import ModalAgendar from '../agenda/_components/ModalAgendar'
import ModalBloqueo, { type BloqueoInicial } from '../agenda/_components/ModalBloqueo'
import ModalBuscarHora from '../agenda/_components/ModalBuscarHora'
import ModalHojaRuta from '../agenda/_components/ModalHojaRuta'
import AvisoPacienteEspera from '../agenda/_components/AvisoPacienteEspera'
import { contarInasistencias, registrarAuditoria } from '../agenda/_components/data'
import {
  configControl, configReprogramar, eliminarBloqueo, enviarRecordatorioIndividual, guardarEstadoCita, moverCita, restaurarCita,
} from '../agenda/_components/acciones'
import { useAgendaRealtime, useAvisoPacienteEspera, useReloj } from '../agenda/_components/hooks'
import {
  abrirWhatsApp, claseBadgeSemaforo, construirMensajeCambioHora, construirMensajeInasistencia, duracionMinutos,
  esWebPendiente, ESTADOS_CITA, estiloInasistencias, fechaISODeStr, getInitials, getLocalDateISO, getMinsFromDateStr,
  horaDeStr, horaLocalAhoraISO, MESES_INASISTENCIAS, minsToT, minutosDesde, nivelSemaforo, nombrePaciente,
  rangoCita, requiereControl, SLOTS_HORARIOS, tToMins,
} from '../agenda/_components/utils'
import type { AgendarConfig, Hueco, Profesional } from '../agenda/_components/types'

const ROLES_AGENDA_COMPLETA = ['ADMIN', 'RECEPCIONISTA', 'ASISTENTE'];
const ROLES_FINANZAS = ['ADMIN', 'RECEPCIONISTA'];
const INICIO_DIA = 8 * 60;           // 08:00
const FIN_DIA = 21 * 60;             // 21:00
const DURACION_SLOT = 15;
const DURACION_DESDE_SLOT = 15;      // duración inicial al hacer clic en un horario libre
const ESTADOS_NO_MOVIBLES = ['atendido', 'no_asiste'];
const ESTADOS_PRESENTE = ['en_espera', 'atendiendose', 'atendido'];

export default function VistaDiariaPage() {
  // ── Sesión ──
  const [usuarioLogueado, setUsuarioLogueado] = useState<string | null>(null);
  const [userRol, setUserRol] = useState('');
  const [authListo, setAuthListo] = useState(false);
  const puedeVerAgendaCompleta = ROLES_AGENDA_COMPLETA.includes(userRol);
  const puedeVerFinanzas = ROLES_FINANZAS.includes(userRol);
  const puedeGestionarBloqueos = puedeVerFinanzas;

  // ── Datos del día ──
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [citas, setCitas] = useState<any[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<any[]>([]);
  const [bloqueos, setBloqueos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  // ── UI ──
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [comentario, setComentario] = useState<{ cita: any; texto: string } | null>(null);
  const [guardandoComentario, setGuardandoComentario] = useState(false);
  const [agendarConfig, setAgendarConfig] = useState<AgendarConfig | null>(null);
  const [modal, setModal] = useState<null | 'buscarHora' | 'hojaRuta' | 'bloqueo'>(null);
  const [bloqueoInicial, setBloqueoInicial] = useState<BloqueoInicial | null>(null);
  const [modoBloqueo, setModoBloqueo] = useState(false);
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const [destino, setDestino] = useState<{ profId: string; hora: string } | null>(null);

  const realtimeTrigger = useAgendaRealtime(['citas', 'bloqueos_agenda', 'disponibilidad_profesional']);
  const [avisoEspera, cerrarAvisoEspera] = useAvisoPacienteEspera();
  const ahoraMs = useReloj(30000);

  const dateInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const scrolleadoRef = useRef<string | null>(null);
  const fetchSeq = useRef(0);

  const fechaStr = getLocalDateISO(selectedDate);
  const hoyISO = getLocalDateISO(new Date(ahoraMs));
  const esHoy = fechaStr === hoyISO;

  // ─────────────────────────────────────────────────────────────
  // Carga
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        setUsuarioLogueado(data.session.user.id);
        const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', data.session.user.id).maybeSingle();
        if (perfil) setUserRol(perfil.rol);
      }
      setAuthListo(true);
    })();
  }, []);

  useEffect(() => { if (authListo) fetchDatosDia(); }, [fechaStr, authListo]);
  useEffect(() => { if (authListo && realtimeTrigger > 0) fetchDatosDia(true); }, [realtimeTrigger]);

  // Cierra el menú de una cita al hacer clic fuera
  useEffect(() => {
    if (!menuAbiertoId) return;
    const cerrar = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.zona-cita')) setMenuAbiertoId(null); };
    const conEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAbiertoId(null); };
    document.addEventListener('click', cerrar);
    document.addEventListener('keydown', conEscape);
    return () => { document.removeEventListener('click', cerrar); document.removeEventListener('keydown', conEscape); };
  }, [menuAbiertoId]);

  // Escape sale del modo bloqueo
  useEffect(() => {
    if (!modoBloqueo) return;
    const salir = (e: KeyboardEvent) => { if (e.key === 'Escape') setModoBloqueo(false); };
    window.addEventListener('keydown', salir);
    return () => window.removeEventListener('keydown', salir);
  }, [modoBloqueo]);

  async function fetchDatosDia(silencioso = false) {
    const seq = ++fetchSeq.current;
    if (!silencioso) setCargando(true);
    try {
      const { data: profs, error } = await supabase.from('profesionales').select('id, nombre, apellido, user_id').eq('activo', true);
      if (error) throw error;
      const lista = (profs || []) as Profesional[];
      if (lista.length === 0) {
        if (seq === fetchSeq.current) { setProfesionales([]); setCitas([]); setDisponibilidades([]); setBloqueos([]); }
        return;
      }

      const [citasRes, dispoRes, bloqRes] = await Promise.all([
        supabase.from('citas').select('*, pacientes(*)')
          .gte('inicio', `${fechaStr}T00:00:00`).lte('inicio', `${fechaStr}T23:59:59`)
          .neq('estado', 'cancelada'),
        supabase.from('disponibilidad_profesional').select('*').in('profesional_id', lista.map(p => p.user_id)),
        supabase.from('bloqueos_agenda').select('*').in('profesional_id', lista.map(p => p.id)).eq('fecha', fechaStr),
      ]);
      if (citasRes.error) throw citasRes.error;

      const pacienteIds = [...new Set((citasRes.data || []).map((c: any) => c.paciente_id).filter(Boolean))] as string[];
      const inasistencias = await contarInasistencias(pacienteIds);
      if (seq !== fetchSeq.current) return; // llegó una respuesta más nueva

      setProfesionales(lista);
      setCitas((citasRes.data || []).map((c: any) => ({ ...c, inasistencias: inasistencias[c.paciente_id] || 0 })));
      setDisponibilidades(dispoRes.data || []);
      setBloqueos(bloqRes.data || []);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar la agenda del día');
    } finally {
      if (seq === fetchSeq.current) setCargando(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Reglas del día
  // ─────────────────────────────────────────────────────────────
  const bloquesLaborales = (userId: string) => {
    const delDoc = disponibilidades.filter(d => d.profesional_id === userId);
    const especiales = delDoc.filter(d => d.fecha_especifica === fechaStr);
    return especiales.length > 0 ? especiales : delDoc.filter(d => d.dia_semana === selectedDate.getDay() && !d.fecha_especifica);
  };
  const esLaboral = (userId: string, ini: number, fin: number) =>
    bloquesLaborales(userId).some(b => ini >= tToMins(b.hora_inicio.substring(0, 5)) && fin <= tToMins(b.hora_fin.substring(0, 5)));
  const bloqueoEn = (p: Profesional, ini: number, fin: number) =>
    bloqueos.find(b => b.profesional_id === p.id && (!b.hora_inicio || !b.hora_fin || (ini < tToMins(b.hora_fin.substring(0, 5)) && fin > tToMins(b.hora_inicio.substring(0, 5)))));
  // Las solicitudes web sin validar no ocupan horario (igual que en la Agenda)
  const citaQueOcupa = (userId: string, ini: number, fin: number, excluirId?: string) =>
    citas.find(c => c.profesional_id === userId && c.id !== excluirId && !esWebPendiente(c) && ini < getMinsFromDateStr(c.fin) && fin > getMinsFromDateStr(c.inicio));

  const profesionalesDelDia = useMemo(() => profesionales.filter(p => {
    if (!puedeVerAgendaCompleta && p.user_id !== usuarioLogueado) return false;
    const tieneDispo = disponibilidades.some(d => d.profesional_id === p.user_id && ((d.fecha_especifica && d.fecha_especifica === fechaStr) || (!d.fecha_especifica && d.dia_semana === selectedDate.getDay())));
    return tieneDispo || citas.some(c => c.profesional_id === p.user_id) || bloqueos.some(b => b.profesional_id === p.id);
  }), [profesionales, disponibilidades, citas, bloqueos, fechaStr, puedeVerAgendaCompleta, usuarioLogueado]);

  // La cita agendada después es la de sobrecupo
  const sobrecupoIds = useMemo(() => {
    const ids = new Set<string>();
    const validas = citas.filter(c => !esWebPendiente(c));
    validas.forEach(c => {
      if (normalizar(c.motivo).includes('SOBRECUPO')) { ids.add(c.id); return; }
      const cIni = getMinsFromDateStr(c.inicio); const cFin = getMinsFromDateStr(c.fin);
      const choca = validas.some(o => {
        if (o.id === c.id || o.profesional_id !== c.profesional_id) return false;
        if (cIni >= getMinsFromDateStr(o.fin) || cFin <= getMinsFromDateStr(o.inicio)) return false;
        const tC = c.created_at ? new Date(c.created_at).getTime() : 0;
        const tO = o.created_at ? new Date(o.created_at).getTime() : 0;
        if (tC !== tO && tC > 0 && tO > 0) return tC > tO;
        return String(c.id) > String(o.id);
      });
      if (choca) ids.add(c.id);
    });
    return ids;
  }, [citas]);

  // Resumen por doctor: citas, confirmadas y % de ocupación
  const resumenDoctor = (p: Profesional) => {
    const delDoc = citas.filter(c => c.profesional_id === p.user_id && !esWebPendiente(c));
    const confirmadas = delDoc.filter(c => c.estado_confirmacion === 'confirmado' || ['confirmado_tel', 'en_espera', 'atendiendose', 'atendido'].includes(c.estado)).length;
    const diaBloqueado = bloqueos.some(b => b.profesional_id === p.id && (!b.hora_inicio || !b.hora_fin));
    let minsLab = 0;
    if (!diaBloqueado) {
      bloquesLaborales(p.user_id).forEach(b => {
        const bi = tToMins(b.hora_inicio.substring(0, 5)); const bf = tToMins(b.hora_fin.substring(0, 5));
        let libres = bf - bi;
        bloqueos.filter(x => x.profesional_id === p.id && x.hora_inicio && x.hora_fin).forEach(x => {
          libres -= Math.max(0, Math.min(bf, tToMins(x.hora_fin.substring(0, 5))) - Math.max(bi, tToMins(x.hora_inicio.substring(0, 5))));
        });
        minsLab += Math.max(0, libres);
      });
    }
    const minsOcupados = delDoc.reduce((a, c) => a + Math.max(0, getMinsFromDateStr(c.fin) - getMinsFromDateStr(c.inicio)), 0);
    return { total: delDoc.length, confirmadas, ocupacion: minsLab > 0 ? Math.min(100, Math.round((minsOcupados / minsLab) * 100)) : null };
  };

  // ─────────────────────────────────────────────────────────────
  // Saltar a la hora actual al abrir el día de hoy
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cargando || scrolleadoRef.current === fechaStr || !scrollRef.current) return;
    scrolleadoRef.current = fechaStr;
    const ahora = new Date();
    const mins = ahora.getHours() * 60 + ahora.getMinutes();
    const slotPx = slotRef.current?.offsetHeight || 40;
    const top = esHoy && mins > INICIO_DIA ? ((mins - INICIO_DIA) / DURACION_SLOT) * slotPx - 120 : 0;
    scrollRef.current.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [cargando, fechaStr]);

  // ─────────────────────────────────────────────────────────────
  // Acciones
  // ─────────────────────────────────────────────────────────────
  const abrirAgendar = (cfg: Omit<AgendarConfig, 'id'>) => { setMenuAbiertoId(null); setAgendarConfig({ ...cfg, id: Date.now() }); };
  const agendarControl = (cita: any) => abrirAgendar(configControl(cita));

  const clicEnSlotLibre = (p: Profesional, hora: string) => {
    if (modoBloqueo) return abrirBloqueoDesdeSlot(p, hora);
    abrirAgendar({
      profesionalId: p.user_id,
      duracion: DURACION_DESDE_SLOT,
      semanaInicio: fechaStr,
      diaSugerido: fechaStr,
      horas: [{ fecha: fechaStr, hora, duracion: DURACION_DESDE_SLOT }],
    });
  };

  // Bloquear desde la grilla (ej: colación): 1 hora por defecto, sin pasarse del horario del doctor
  const abrirBloqueoDesdeSlot = (p: Profesional, hora: string) => {
    const ini = tToMins(hora);
    const bloque = bloquesLaborales(p.user_id).find(b => ini >= tToMins(b.hora_inicio.substring(0, 5)) && ini < tToMins(b.hora_fin.substring(0, 5)));
    const limite = bloque ? tToMins(bloque.hora_fin.substring(0, 5)) : FIN_DIA;
    setBloqueoInicial({ profesionalUserId: p.user_id, horaInicio: hora, horaFin: minsToT(Math.min(ini + 60, limite)), motivo: 'Colación' });
    setModoBloqueo(false);
    setModal('bloqueo');
  };

  const clicEnBloqueo = async (p: Profesional, b: any) => {
    if (!puedeGestionarBloqueos) return toast.info(`Horario bloqueado: ${b.motivo || 'sin motivo'}`);
    const rango = b.hora_inicio && b.hora_fin ? `de ${b.hora_inicio.substring(0, 5)} a ${b.hora_fin.substring(0, 5)}` : 'todo el día';
    if (!confirm(`¿Quitar el bloqueo "${b.motivo || 'sin motivo'}" ${rango} de Dr(a). ${p.nombre} ${p.apellido}?`)) return;
    if (await eliminarBloqueo(b, usuarioLogueado, `${p.nombre} ${p.apellido}`)) fetchDatosDia(true);
  };

  const cambiarEstado = async (cita: any, estado: string) => {
    setMenuAbiertoId(null);
    setCitas(prev => prev.map(c => c.id === cita.id ? { ...c, estado, ...(estado === 'en_espera' ? { hora_llegada: horaLocalAhoraISO() } : {}) } : c));
    await guardarEstadoCita(cita, estado, { usuarioLogueado, profesionales, onAgendarControl: agendarControl });
    fetchDatosDia(true); // confirma el cambio (o lo revierte si falló)
  };

  const guardarComentario = async () => {
    if (!comentario) return;
    setGuardandoComentario(true);
    try {
      const texto = comentario.texto.toUpperCase().trim();
      const { error } = await supabase.from('citas').update({ motivo: texto, modificado_por: usuarioLogueado }).eq('id', comentario.cita.id);
      if (error) throw error;
      await registrarAuditoria(usuarioLogueado, 'UPDATE / MOTIVO CITA', 'citas', `Cambió el motivo de la cita de ${nombrePaciente(comentario.cita.pacientes)} a "${texto}".`);
      toast.success('Comentario / motivo actualizado');
      setComentario(null);
      fetchDatosDia(true);
    } catch {
      toast.error('Error al guardar el comentario');
    } finally {
      setGuardandoComentario(false);
    }
  };

  // ── Arrastrar y soltar ──
  const iniciarArrastre = (e: DragEvent, cita: any) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cita.id);
    setMenuAbiertoId(null);
    setTimeout(() => setArrastrandoId(cita.id), 0); // diferido: cambiar el DOM en dragstart cancela el arrastre en Chrome
  };
  const terminarArrastre = () => { setArrastrandoId(null); setDestino(null); };

  const soltarCita = async (p: Profesional, hora: string) => {
    const cita = citas.find(c => c.id === arrastrandoId);
    terminarArrastre();
    if (!cita) return;
    const dur = duracionMinutos(cita);
    const ini = tToMins(hora); const fin = ini + dur;
    if (cita.profesional_id === p.user_id && horaDeStr(cita.inicio) === hora && fechaISODeStr(cita.inicio) === fechaStr) return;

    if (bloqueoEn(p, ini, fin)) return toast.error('Ese horario está bloqueado para el especialista.');
    if (!esLaboral(p.user_id, ini, fin) && !confirm(`⚠️ ${hora} hrs (${dur} min) queda fuera del horario de Dr(a). ${p.nombre} ${p.apellido}. ¿Mover igual?`)) return;
    const choque = citaQueOcupa(p.user_id, ini, fin, cita.id);
    if (choque && !confirm(`⚠️ Se cruza con la cita de ${nombrePaciente(choque.pacientes)}. ¿Mover igual como SOBRECUPO?`)) return;

    const original = { ...cita };
    // Optimista
    setCitas(prev => prev.map(c => c.id === cita.id
      ? { ...c, ...rangoCita(fechaStr, hora, dur), profesional_id: p.user_id, estado: ESTADOS_PRESENTE.includes(c.estado) ? c.estado : 'reprogramada' }
      : c));

    const ok = await moverCita(cita, { fecha: fechaStr, hora, profesionalId: p.user_id }, usuarioLogueado, `${p.nombre} ${p.apellido}`);
    if (!ok) { fetchDatosDia(true); return; }

    toast.success(`${nombrePaciente(cita.pacientes)} movido a las ${hora} hrs`, {
      description: cita.profesional_id !== p.user_id ? `Ahora con Dr(a). ${p.nombre} ${p.apellido}` : undefined,
      duration: 15000,
      action: { label: 'Avisar por WhatsApp', onClick: () => abrirWhatsApp(cita.pacientes?.telefono, construirMensajeCambioHora(cita, fechaStr, hora, p.user_id, profesionales)) },
      cancel: { label: 'Deshacer', onClick: async () => { if (await restaurarCita(original, usuarioLogueado)) { toast.success('Movimiento deshecho'); fetchDatosDia(true); } } },
    });
    fetchDatosDia(true);
  };

  const moverDia = (dias: number) => { const n = new Date(selectedDate); n.setDate(n.getDate() + dias); setSelectedDate(n); };

  // Línea de "ahora"
  const ahora = new Date(ahoraMs);
  const minutosDesdeInicio = ahora.getHours() * 60 + ahora.getMinutes() - INICIO_DIA;
  const mostrarLineaTiempo = esHoy && minutosDesdeInicio >= 0 && minutosDesdeInicio <= FIN_DIA - INICIO_DIA;

  const citaArrastrada = arrastrandoId ? citas.find(c => c.id === arrastrandoId) : null;
  const botonHeader = "flex-1 lg:flex-none justify-center px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest shadow-sm transition-all flex items-center gap-1.5 border";

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#FBF8F2] p-3 md:p-5 pb-24 md:pb-6 font-sans text-slate-900 relative overflow-hidden z-0">
      <div className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"></div>

      <div className="max-w-[1600px] mx-auto space-y-3 md:space-y-4 relative z-10 text-left">

        {/* CABECERA */}
        <header className="bg-white/90 backdrop-blur-md p-3 md:p-4 rounded-xl md:rounded-2xl shadow-sm border border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 md:gap-4">
          <div className="flex items-center gap-3 w-full xl:w-auto">
            <div className="bg-[#0A111F] w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-[#C9A24B] shadow-sm shrink-0"><LayoutGrid size={17} /></div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight">Agenda Médicos</h1>
              <p className="text-slate-400 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C9A24B] animate-pulse"></span> Vista Diaria
              </p>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 md:gap-3 w-full xl:w-auto">
            {/* Fecha */}
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg md:rounded-xl p-1 flex items-center justify-between gap-2 shadow-inner">
                <button onClick={() => moverDia(-1)} className="p-1.5 md:p-2 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500" title="Día anterior"><ChevronLeft size={16} /></button>
                <div className="relative flex items-center justify-center cursor-pointer px-2" onClick={() => { try { dateInputRef.current?.showPicker(); } catch { dateInputRef.current?.focus(); } }}>
                  <span className="text-[10px] md:text-xs font-black uppercase text-slate-800 tracking-widest min-w-[120px] md:min-w-[150px] text-center hover:text-[#C9A24B] transition-colors">
                    {selectedDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </span>
                  <input ref={dateInputRef} type="date" className="sr-only" value={fechaStr} onChange={(e) => { if (e.target.value) { const [y, m, d] = e.target.value.split('-'); setSelectedDate(new Date(Number(y), Number(m) - 1, Number(d))); } }} />
                </div>
                <button onClick={() => moverDia(1)} className="p-1.5 md:p-2 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500" title="Día siguiente"><ChevronRight size={16} /></button>
              </div>
              {!esHoy && (
                <button onClick={() => setSelectedDate(new Date())} className="px-3 py-2 md:py-2.5 rounded-lg md:rounded-xl bg-white border border-[#C9A24B]/40 text-[#8A6D2F] text-[9px] md:text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-[#C9A24B]/10 transition-colors">Hoy</button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 w-full lg:w-auto">
              <button onClick={() => setModal('buscarHora')} className={`${botonHeader} bg-white border-[#C9A24B] text-[#8A6D2F] hover:bg-[#C9A24B]/10`}><Search size={13} /> Buscar Hora</button>
              <button onClick={() => setModal('hojaRuta')} className={`${botonHeader} bg-white border-slate-200 text-slate-600 hover:bg-slate-50`}><ClipboardList size={13} className="text-[#C9A24B]" /> Hoja de Ruta</button>
              {puedeGestionarBloqueos && (
                <button onClick={() => setModoBloqueo(m => !m)} className={`${botonHeader} ${modoBloqueo ? 'bg-red-500 border-red-600 text-white' : 'bg-white border-red-200 text-red-500 hover:bg-red-50'}`}>
                  <Lock size={13} /> {modoBloqueo ? 'Cancelar bloqueo' : 'Bloquear'}
                </button>
              )}
              <Link href="/semana" className={`${botonHeader} bg-[#C9A24B] border-[#C9A24B] text-white hover:bg-[#a7853b]`}><CalendarDays size={13} /> Semanal</Link>
              <Link href="/agenda" className={`${botonHeader} bg-[#0A111F] border-[#0A111F] text-white hover:bg-[#1a2538]`}><LayoutGrid size={13} /> Agenda</Link>
            </div>
          </div>
        </header>

        {modoBloqueo && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-[11px] font-bold">
            <span className="flex items-center gap-2"><Lock size={14} /> Modo bloqueo: haz clic en un horario para bloquearlo (por ejemplo, la colación). Luego puedes ajustar el rango.</span>
            <button onClick={() => setModoBloqueo(false)} className="p-1 rounded-md hover:bg-red-100"><X size={16} /></button>
          </div>
        )}

        {/* GRILLA */}
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
              <div ref={scrollRef} className="flex flex-1 overflow-auto custom-scrollbar relative">

                {/* Columna de horas */}
                <div className="w-12 md:w-20 border-r border-slate-100 bg-slate-50/80 shrink-0 z-40 flex flex-col sticky left-0 shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
                  <div className="h-[56px] md:h-[84px] border-b border-slate-200 bg-white/90 backdrop-blur-md flex items-center justify-center shrink-0 sticky top-0 z-50">
                    <Clock className="text-slate-400" size={18} />
                  </div>
                  <div className="relative [--slot-h:1.5rem] md:[--slot-h:2.5rem]">
                    {SLOTS_HORARIOS.map((hora, i) => (
                      <div key={hora} ref={i === 0 ? slotRef : undefined} className={`h-[var(--slot-h)] border-b border-slate-200/50 flex items-center justify-center text-[9px] md:text-[10px] font-black ${hora.endsWith(':00') ? 'text-slate-600' : 'text-slate-400'}`}>
                        {hora}
                      </div>
                    ))}
                    {/* Hora actual en la columna de horas */}
                    {mostrarLineaTiempo && (
                      <div className="absolute inset-x-0 z-10 flex items-center justify-center pointer-events-none" style={{ top: `calc(${minutosDesdeInicio / DURACION_SLOT} * var(--slot-h))`, transform: 'translateY(-50%)' }}>
                        <span className="bg-red-600 text-white text-[9px] md:text-[11px] font-black px-1 md:px-2 py-0.5 rounded-md shadow-md tabular-nums">
                          {String(ahora.getHours()).padStart(2, '0')}:{String(ahora.getMinutes()).padStart(2, '0')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Columnas de doctores */}
                {profesionalesDelDia.map(p => {
                  const citasDoc = citas.filter(c => c.profesional_id === p.user_id);
                  const carriles = calcularCarriles(citasDoc);
                  const unico = profesionalesDelDia.length === 1;
                  const res = resumenDoctor(p);
                  const fantasma = citaArrastrada && destino?.profId === p.user_id ? (() => {
                    const ini = tToMins(destino.hora); const dur = duracionMinutos(citaArrastrada); const fin = ini + dur;
                    const valido = !bloqueoEn(p, ini, fin) && esLaboral(p.user_id, ini, fin);
                    const choca = !!citaQueOcupa(p.user_id, ini, fin, citaArrastrada.id);
                    return { ini, dur, color: !valido ? 'bg-red-200/70 border-red-400' : choca ? 'bg-amber-200/70 border-amber-400' : 'bg-emerald-200/70 border-emerald-500' };
                  })() : null;

                  return (
                    <div key={p.user_id} className={`${unico ? 'flex-1 min-w-full md:min-w-0' : 'min-w-[130px] md:min-w-[210px] flex-1'} border-r border-slate-100 flex flex-col relative`}>

                      {/* Encabezado del doctor con resumen */}
                      <div className={`h-[56px] md:h-[84px] border-b border-slate-200 bg-white/95 backdrop-blur-xl flex ${unico ? 'flex-row gap-3 md:gap-4' : 'flex-col'} items-center justify-center shrink-0 sticky top-0 z-30 px-2 py-1 md:p-3 text-center shadow-md`}>
                        <div className={`bg-[#C9A24B]/10 text-[#C9A24B] rounded-full items-center justify-center ${unico ? 'flex w-8 h-8 md:w-10 md:h-10 border border-[#C9A24B]/20' : 'hidden md:flex w-7 h-7 mb-0.5'}`}>
                          <User size={unico ? 18 : 13} />
                        </div>
                        <div className="min-w-0">
                          <p className={`${unico ? 'text-sm md:text-xl text-[#8A6D2F]' : 'text-[9px] md:text-[11px] text-[#0A111F]'} font-black uppercase tracking-tight truncate leading-none`}>
                            {unico ? `Dr(a). ${p.nombre} ${p.apellido}` : `${p.nombre.split(' ')[0]} ${p.apellido.split(' ')[0]}`}
                          </p>
                          <p className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1 truncate" title={`${res.total} citas · ${res.confirmadas} confirmadas · ocupación ${res.ocupacion ?? '-'}%`}>
                            {res.total} cita{res.total === 1 ? '' : 's'}
                            <span className="text-emerald-600"> · ✓{res.confirmadas}</span>
                            {res.ocupacion !== null && <span className={res.ocupacion >= 85 ? 'text-red-500' : res.ocupacion >= 60 ? 'text-amber-600' : 'text-slate-400'}> · {res.ocupacion}%</span>}
                          </p>
                        </div>
                      </div>

                      {/* Horarios */}
                      <div className="relative min-h-[400px] md:min-h-[600px] [--slot-h:1.5rem] md:[--slot-h:2.5rem] bg-white/50">
                        {/* Línea de la hora actual: por encima de las citas, sin bloquear clics */}
                        {mostrarLineaTiempo && (
                          <div className="absolute left-0 w-full z-[35] flex items-center pointer-events-none" style={{ top: `calc(${minutosDesdeInicio / DURACION_SLOT} * var(--slot-h))`, transform: 'translateY(-50%)' }}>
                            <div className="w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-white shadow-[0_0_10px_rgba(220,38,38,0.8)] -ml-1 shrink-0"></div>
                            <div className="flex-1 h-[2px] bg-red-600 shadow-[0_0_6px_rgba(220,38,38,0.6)]"></div>
                          </div>
                        )}

                        {SLOTS_HORARIOS.map(hora => {
                          const ini = tToMins(hora); const fin = ini + DURACION_SLOT;
                          const bloqueo = bloqueoEn(p, ini, fin);
                          const libre = !bloqueo && esLaboral(p.user_id, ini, fin) && !citaQueOcupa(p.user_id, ini, fin);
                          const esDestino = destino?.profId === p.user_id && destino?.hora === hora;
                          return (
                            <div
                              key={hora}
                              className={`w-full h-[var(--slot-h)] border-b border-r border-slate-100/50 p-0.5 md:p-1 relative ${esDestino ? 'bg-slate-100' : ''}`}
                              onDragOver={(e) => {
                                if (!arrastrandoId) return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                if (!esDestino) setDestino({ profId: p.user_id, hora });
                              }}
                              onDrop={(e) => { e.preventDefault(); soltarCita(p, hora); }}
                            >
                              {bloqueo ? (
                                <button
                                  onClick={() => clicEnBloqueo(p, bloqueo)}
                                  className="h-full w-full rounded-[4px] md:rounded-lg bg-rose-50/60 border border-rose-200 border-dashed flex items-center justify-center gap-1 overflow-hidden hover:bg-rose-100/70 transition-colors"
                                  title={`Bloqueado: ${bloqueo.motivo || 'sin motivo'}${puedeGestionarBloqueos ? ' (clic para quitar)' : ''}`}
                                >
                                  <Ban className="text-rose-300 shrink-0 w-[10px] h-[10px] md:w-[14px] md:h-[14px]" />
                                  {ini === (bloqueo.hora_inicio ? tToMins(bloqueo.hora_inicio.substring(0, 5)) : INICIO_DIA) && (
                                    <span className="hidden md:inline text-[9px] font-black uppercase tracking-wider text-rose-400 truncate">{bloqueo.motivo}</span>
                                  )}
                                </button>
                              ) : modoBloqueo ? (
                                <button onClick={() => abrirBloqueoDesdeSlot(p, hora)} className="h-full w-full rounded-[4px] md:rounded-lg border border-dashed border-red-200 bg-red-50/40 hover:bg-red-100 hover:border-red-400 transition-all flex items-center justify-center group/slot" title={`Bloquear desde las ${hora}`}>
                                  <Lock className="text-red-400 opacity-0 group-hover/slot:opacity-100 w-[10px] h-[10px] md:w-[14px] md:h-[14px]" />
                                </button>
                              ) : libre ? (
                                <button onClick={() => clicEnSlotLibre(p, hora)} className="h-full w-full rounded-[4px] md:rounded-lg bg-emerald-100/80 border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-200 transition-all flex items-center justify-center group/slot" title={`Agendar a las ${hora}`}>
                                  <Plus className="text-emerald-700 opacity-0 group-hover/slot:opacity-100 transition-opacity w-[10px] h-[10px] md:w-[16px] md:h-[16px]" />
                                </button>
                              ) : (
                                <div className="h-full w-full rounded-[4px] md:rounded-lg bg-slate-50/40" />
                              )}
                            </div>
                          );
                        })}

                        {/* Vista previa al arrastrar */}
                        {fantasma && (
                          <div
                            className={`absolute left-1 right-1 rounded-lg border-2 border-dashed pointer-events-none z-[45] ${fantasma.color}`}
                            style={{ top: `calc(${(fantasma.ini - INICIO_DIA) / DURACION_SLOT} * var(--slot-h))`, height: `calc(${fantasma.dur / DURACION_SLOT} * var(--slot-h))` }}
                          >
                            <span className="absolute top-0.5 left-1.5 text-[9px] md:text-[10px] font-black text-slate-700">{destino?.hora}</span>
                          </div>
                        )}

                        {/* Citas */}
                        {citasDoc.map(cita => (
                          <TarjetaCitaGrilla
                            key={cita.id}
                            cita={cita}
                            unico={unico}
                            esSobrecupo={sobrecupoIds.has(cita.id)}
                            carril={carriles.get(cita.id)?.carril ?? 0}
                            totalCarriles={carriles.get(cita.id)?.total ?? 1}
                            ahoraMs={ahoraMs}
                            menuAbierto={menuAbiertoId === cita.id}
                            arrastrando={!!arrastrandoId}
                            esLaArrastrada={arrastrandoId === cita.id}
                            puedeVerFinanzas={puedeVerFinanzas}
                            onToggleMenu={() => setMenuAbiertoId(id => id === cita.id ? null : cita.id)}
                            onDragStart={(e) => iniciarArrastre(e, cita)}
                            onDragEnd={terminarArrastre}
                            onReagendar={() => abrirAgendar(configReprogramar(cita))}
                            onComentario={() => { setMenuAbiertoId(null); setComentario({ cita, texto: cita.motivo || '' }); }}
                            onRecordatorio={() => { setMenuAbiertoId(null); enviarRecordatorioIndividual(cita, profesionales); }}
                            onInasistencia={() => { setMenuAbiertoId(null); abrirWhatsApp(cita.pacientes?.telefono, construirMensajeInasistencia(cita, profesionales)); }}
                            onControl={() => agendarControl(cita)}
                            onCambiarEstado={(estado) => cambiarEstado(cita, estado)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <p className="hidden md:block text-[10px] font-bold text-slate-400 text-center">
          Clic en una cita para ver sus opciones · Arrastra una cita para moverla de hora o de doctor · Clic en un horario verde para agendar
        </p>
      </div>

      {/* MODAL COMENTARIO / MOTIVO */}
      <ModalShell
        abierto={!!comentario}
        onClose={() => setComentario(null)}
        ancho="max-w-sm"
        icono={<MessageSquare size={20} className="text-amber-300" />}
        colorIcono={{ bg: 'rgba(245,180,60,0.15)', border: 'rgba(245,180,60,0.6)' }}
        titulo="Comentario"
        subtitulo="Motivo de atención"
      >
        <div className="p-5 md:p-6 space-y-4">
          <p className="text-xs font-bold text-slate-500">Actualiza el motivo o deja un comentario sobre la cita de <span className="text-slate-800">{nombrePaciente(comentario?.cita?.pacientes)}</span>.</p>
          <textarea
            autoFocus
            className="w-full h-32 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-[#C9A24B] resize-none uppercase"
            placeholder="Ej: Urgencia dolor dental..."
            value={comentario?.texto || ''}
            onChange={(e) => setComentario(c => c ? { ...c, texto: e.target.value } : c)}
          />
        </div>
        <div className="p-5 md:p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button onClick={() => setComentario(null)} className="px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-widest hover:bg-slate-200 rounded-xl transition-colors">Cancelar</button>
          <button onClick={guardarComentario} disabled={guardandoComentario} className="px-6 py-3 text-xs font-black text-white uppercase tracking-widest bg-[#0A111F] hover:bg-[#1a2538] rounded-xl flex items-center gap-2 shadow-lg disabled:opacity-50">
            {guardandoComentario ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
          </button>
        </div>
      </ModalShell>

      {/* MODALES COMPARTIDOS CON LA AGENDA */}
      <ModalAgendar
        config={agendarConfig}
        onClose={() => setAgendarConfig(null)}
        onGuardado={() => fetchDatosDia(true)}
        profesionales={profesionales}
        usuarioLogueado={usuarioLogueado}
        puedeVerAgendaCompleta={puedeVerAgendaCompleta}
        realtimeTrigger={realtimeTrigger}
      />
      <ModalBloqueo
        abierto={modal === 'bloqueo'}
        onClose={() => { setModal(null); setBloqueoInicial(null); }}
        onGuardado={() => fetchDatosDia(true)}
        fecha={selectedDate}
        profesionales={profesionales}
        usuarioLogueado={usuarioLogueado}
        inicial={bloqueoInicial}
      />
      <ModalBuscarHora
        abierto={modal === 'buscarHora'}
        onClose={() => setModal(null)}
        onElegir={(h: Hueco) => { setModal(null); abrirAgendar({ profesionalId: h.profesional_id, duracion: h.duracion, semanaInicio: h.fecha, diaSugerido: h.fecha, horas: [{ fecha: h.fecha, hora: h.hora, duracion: h.duracion }] }); }}
        profesionales={profesionales}
        usuarioLogueado={usuarioLogueado}
        puedeVerAgendaCompleta={puedeVerAgendaCompleta}
        especialistaInicial={puedeVerAgendaCompleta ? 'Todos' : (usuarioLogueado || 'Todos')}
      />
      <ModalHojaRuta
        abierto={modal === 'hojaRuta'}
        onClose={() => setModal(null)}
        fechaInicial={fechaStr}
        especialistaInicial={puedeVerAgendaCompleta ? 'Todos' : (usuarioLogueado || 'Todos')}
        profesionales={profesionales}
        usuarioLogueado={usuarioLogueado}
        puedeVerAgendaCompleta={puedeVerAgendaCompleta}
      />
      <AvisoPacienteEspera nombre={avisoEspera} onClose={cerrarAvisoEspera} />
    </main>
  );
}

const normalizar = (s?: string | null) => (s || '').toUpperCase();

/**
 * Reparte las citas que se cruzan en carriles lado a lado (como Google Calendar),
 * para que un sobrecupo no tape a la cita original.
 * La cita agendada primero queda a la izquierda.
 */
function calcularCarriles(citasDoc: any[]) {
  const resultado = new Map<string, { carril: number; total: number }>();
  const orden = [...citasDoc].sort((a, b) =>
    getMinsFromDateStr(a.inicio) - getMinsFromDateStr(b.inicio)
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || String(a.id).localeCompare(String(b.id)));

  let grupo: any[] = [];
  let finGrupo = -1;
  const cerrarGrupo = () => {
    const finesPorCarril: number[] = [];
    const asignados: { id: string; carril: number }[] = [];
    grupo.forEach(c => {
      const ini = getMinsFromDateStr(c.inicio);
      let carril = finesPorCarril.findIndex(f => f <= ini);
      if (carril === -1) { carril = finesPorCarril.length; finesPorCarril.push(0); }
      finesPorCarril[carril] = Math.max(getMinsFromDateStr(c.fin), ini + DURACION_SLOT);
      asignados.push({ id: c.id, carril });
    });
    asignados.forEach(a => resultado.set(a.id, { carril: a.carril, total: finesPorCarril.length }));
    grupo = [];
  };

  orden.forEach(c => {
    const ini = getMinsFromDateStr(c.inicio);
    const fin = Math.max(getMinsFromDateStr(c.fin), ini + DURACION_SLOT);
    if (grupo.length > 0 && ini >= finGrupo) cerrarGrupo();
    grupo.push(c);
    finGrupo = grupo.length === 1 ? fin : Math.max(finGrupo, fin);
  });
  if (grupo.length > 0) cerrarGrupo();
  return resultado;
}

// ─────────────────────────────────────────────────────────────
// Tarjeta de cita dentro de la grilla
// ─────────────────────────────────────────────────────────────
interface TarjetaProps {
  cita: any;
  unico: boolean;
  esSobrecupo: boolean;
  carril: number;          // posición lado a lado cuando hay citas que se cruzan
  totalCarriles: number;
  ahoraMs: number;
  menuAbierto: boolean;
  arrastrando: boolean;
  esLaArrastrada: boolean;
  puedeVerFinanzas: boolean;
  onToggleMenu: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onReagendar: () => void;
  onComentario: () => void;
  onRecordatorio: () => void;
  onInasistencia: () => void;
  onControl: () => void;
  onCambiarEstado: (estado: string) => void;
}

function TarjetaCitaGrilla({
  cita, unico: unicoDoctor, esSobrecupo, carril, totalCarriles, ahoraMs, menuAbierto, arrastrando, esLaArrastrada, puedeVerFinanzas,
  onToggleMenu, onDragStart, onDragEnd, onReagendar, onComentario, onRecordatorio, onInasistencia, onControl, onCambiarEstado,
}: TarjetaProps) {
  // Si comparte espacio con otra cita, usa el diseño compacto aunque sea el único doctor
  const unico = unicoDoctor && totalCarriles === 1;
  const ini = getMinsFromDateStr(cita.inicio);
  const fin = getMinsFromDateStr(cita.fin);
  const dur = Math.max(DURACION_SLOT, fin - ini);
  const slots = dur / DURACION_SLOT;
  const web = esWebPendiente(cita);
  const estado = ESTADOS_CITA[cita.estado] || ESTADOS_CITA.programada;
  const minEspera = cita.estado === 'en_espera' ? minutosDesde(cita.hora_llegada, ahoraMs) : null;
  const semaforo = nivelSemaforo(minEspera);
  const confirmoLink = cita.estado_confirmacion === 'confirmado';
  const movible = !web && !ESTADOS_NO_MOVIBLES.includes(cita.estado);
  const pNombre = cita.pacientes?.nombre || 'S/N';
  const pApellido = cita.pacientes?.apellido || '';
  const nombreMostrar = unico ? `${pNombre} ${pApellido}` : `${pNombre.split(' ')[0]} ${pApellido.split(' ')[0]}`;

  const fondo = web ? 'bg-blue-50' : esSobrecupo ? 'bg-rose-100' : estado.bg;
  const borde = web
    ? 'border-2 border-dashed border-blue-300'
    : esSobrecupo
      ? 'border-rose-400 border-dashed border-2 shadow-[0_0_15px_rgba(244,63,94,0.4)]'
      : `border-b-[3px] border-r-[3px] border-t border-l ${estado.border} shadow-sm`;
  const texto = web ? 'text-blue-800' : esSobrecupo ? 'text-rose-900' : estado.text;
  const anilloSemaforo = semaforo === 'rojo' ? 'ring-2 ring-red-500' : semaforo === 'naranja' ? 'ring-2 ring-orange-400' : '';
  const z = menuAbierto ? 'z-[50] shadow-xl ring-2 ring-[#C9A24B]/30' : 'z-10 hover:z-30';
  // Carriles lado a lado: cada cita ocupa su fracción del ancho, con 2px de separación
  const anchoPct = 100 / totalCarriles;
  const posicionLateral = { left: `calc(${carril * anchoPct}% + 2px)`, width: `calc(${anchoPct}% - 4px)` };

  const tooltip = [
    `${pNombre} ${pApellido}`,
    `${horaDeStr(cita.inicio)} – ${horaDeStr(cita.fin)} (${dur} min)`,
    `Tel: ${cita.pacientes?.telefono || 'sin teléfono'}`,
    `Motivo: ${cita.motivo || '—'}`,
    `Estado: ${web ? 'Solicitud web sin validar' : estado.label}${confirmoLink ? ' · confirmó por link' : ''}`,
    minEspera !== null ? `Esperando ${minEspera} min (llegó ${horaDeStr(cita.hora_llegada)})` : null,
    cita.inasistencias > 0 ? `${cita.inasistencias} inasistencia(s) en ${MESES_INASISTENCIAS} meses` : null,
    movible ? 'Arrastra para mover' : null,
  ].filter(Boolean).join('\n');

  return (
    <div
      draggable={movible}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onToggleMenu}
      title={menuAbierto ? undefined : tooltip}
      className={`zona-cita absolute ${z} ${fondo} ${borde} ${anilloSemaforo} rounded-[4px] md:rounded-lg px-1 md:px-2 py-0.5 md:py-1 hover:shadow-md transition-all duration-150 flex flex-col justify-center ${movible ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${arrastrando ? 'pointer-events-none' : ''} ${esLaArrastrada ? 'opacity-40' : ''}`}
      style={{ top: `calc(${(ini - INICIO_DIA) / DURACION_SLOT} * var(--slot-h))`, height: `calc(${slots} * var(--slot-h))`, ...posicionLateral }}
    >
      <div className={`flex ${unico ? 'flex-row items-center justify-between gap-3' : 'flex-col'} h-full justify-center min-w-0 pr-5 md:pr-6`}>
        {/* Paciente + insignias */}
        <div className="flex items-center gap-1 md:gap-1.5 min-w-0">
          <div className={`w-4 h-4 md:w-6 md:h-6 rounded-full bg-white flex items-center justify-center text-[7px] md:text-[10px] font-black shadow-md shrink-0 ${web ? 'text-blue-600' : esSobrecupo ? 'text-rose-600' : estado.circleText}`}>
            {getInitials(pNombre, pApellido)}
          </div>
          <span className={`text-[9px] md:text-[12px] font-black truncate uppercase ${texto}`}>{nombreMostrar}</span>
          {confirmoLink && <CheckCircle2 className="shrink-0 text-emerald-600 bg-white rounded-full w-[10px] h-[10px] md:w-[14px] md:h-[14px]" />}
          {web && <Globe className="shrink-0 text-blue-500 w-[10px] h-[10px] md:w-[13px] md:h-[13px]" />}
          {minEspera !== null && (
            <span className={`shrink-0 hidden md:inline-flex items-center gap-0.5 px-1 rounded text-[8px] font-black ${claseBadgeSemaforo(semaforo)}`}><Timer size={9} />{minEspera}′</span>
          )}
          {cita.inasistencias > 0 && (
            <span className={`shrink-0 hidden md:inline-flex items-center gap-0.5 px-1 rounded border text-[8px] font-black ${estiloInasistencias(cita.inasistencias)}`} title={`${cita.inasistencias} inasistencias`}><Ban size={8} />{cita.inasistencias}</span>
          )}
          {esSobrecupo && <span className={`shrink-0 bg-rose-600 text-white px-1 rounded text-[7px] md:text-[8px] font-black uppercase tracking-wider ${totalCarriles > 2 ? 'hidden' : totalCarriles > 1 ? 'hidden md:inline' : ''}`}>Sobrecupo</span>}
        </div>

        {/* Estado y hora (solo si hay espacio) */}
        {(slots >= 2 || unico) && (
          <div className={`flex items-center justify-between gap-2 min-w-0 ${unico ? '' : 'mt-0.5'}`}>
            <div className="flex items-center gap-1 truncate">
              <span className={`${texto} shrink-0 [&>svg]:w-[10px] [&>svg]:h-[10px] md:[&>svg]:w-[13px] md:[&>svg]:h-[13px]`}>{web ? <Globe /> : estado.icon}</span>
              <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest truncate ${texto}`}>{web ? 'Web sin validar' : estado.label}</span>
            </div>
            <span className={`text-[8px] md:text-[10px] font-bold shrink-0 opacity-80 ${texto}`}>{horaDeStr(cita.inicio)}</span>
          </div>
        )}
      </div>

      {/* Botón de menú (también se abre haciendo clic en la tarjeta) */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
        className={`absolute top-0.5 right-0.5 md:top-1 md:right-1 p-0.5 md:p-1 rounded-md transition-all border ${menuAbierto ? 'bg-[#0A111F] text-[#C9A24B] border-[#0A111F]' : 'bg-white/80 text-slate-400 border-slate-200/50 hover:bg-white hover:text-[#C9A24B]'}`}
        aria-label="Opciones de la cita"
      >
        <MoreVertical className="w-[11px] h-[11px] md:w-[14px] md:h-[14px]" />
      </button>

      <AnimatePresence>
        {menuAbierto && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.12 }}
            style={{ transformOrigin: 'top right' }}
            className="absolute top-7 md:top-9 right-0 w-56 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.25)] border border-slate-100 z-[60] flex flex-col py-2 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pb-2 mb-1 border-b border-slate-50">
              <p className="text-[11px] font-black text-slate-800 uppercase leading-tight">{pNombre} {pApellido}</p>
              <p className="text-[9px] font-bold text-slate-400 mt-0.5">{horaDeStr(cita.inicio)} – {horaDeStr(cita.fin)} · {dur} min{cita.pacientes?.telefono ? ` · ${cita.pacientes.telefono}` : ''}</p>
              {cita.motivo && <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase line-clamp-2">{cita.motivo}</p>}
            </div>

            <p className="px-4 pt-1 pb-1 text-[8px] font-black text-slate-400 uppercase tracking-widest">Paciente</p>
            <ItemLink href={`/pacientes/${cita.paciente_id}`} icono={<ClipboardList size={14} />} texto="Ficha clínica" />
            <ItemLink href={`/pacientes/${cita.paciente_id}/tratamientos`} icono={<Activity size={14} />} texto="Tratamientos" />
            {puedeVerFinanzas && <ItemLink href={`/pacientes/${cita.paciente_id}/pagos`} icono={<Wallet size={14} />} texto="Pagos" />}
            <ItemLink href={`/pacientes/${cita.paciente_id}/datos`} icono={<User size={14} />} texto="Datos personales" />

            <div className="h-px bg-slate-100 my-1 mx-2"></div>
            <p className="px-4 pt-1 pb-1 text-[8px] font-black text-slate-400 uppercase tracking-widest">Cita</p>
            <ItemBoton onClick={onReagendar} icono={<CalendarClock size={14} />} texto="Reagendar / duración" color="hover:bg-blue-50 hover:text-blue-600" />
            <ItemBoton onClick={onComentario} icono={<MessageSquare size={14} />} texto="Comentario / motivo" color="hover:bg-amber-50 hover:text-amber-600" />
            {!web && <ItemBoton onClick={onRecordatorio} icono={<LinkIcon size={14} />} texto="Enviar recordatorio" color="hover:bg-emerald-50 hover:text-emerald-600" />}
            {cita.estado === 'no_asiste' && <ItemBoton onClick={onInasistencia} icono={<MessageCircle size={14} />} texto="WhatsApp para reagendar" color="hover:bg-rose-50 hover:text-rose-600" />}
            {cita.estado === 'atendido' && requiereControl(cita.motivo) && <ItemBoton onClick={onControl} icono={<CalendarPlus size={14} />} texto="Agendar control" color="hover:bg-emerald-50 hover:text-emerald-600" />}

            <div className="h-px bg-slate-100 my-1 mx-2"></div>
            <div className="px-3 pt-1">
              <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5 mb-1.5 px-1">
                <span className={`w-2 h-2 rounded-full ${estado.dot === 'bg-white' ? 'bg-slate-400' : estado.dot}`}></span> Estado
              </span>
              <select
                value={cita.estado || 'programada'}
                onChange={(e) => onCambiarEstado(e.target.value)}
                className="w-full p-2.5 text-[10px] md:text-xs font-bold uppercase rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-[#C9A24B] cursor-pointer text-slate-700 shadow-sm"
              >
                {Object.entries(ESTADOS_CITA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ItemLink({ href, icono, texto }: { href: string; icono: ReactNode; texto: string }) {
  return (
    <Link href={href} prefetch={false} className="px-4 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-[#C9A24B] flex items-center gap-2 transition-colors [&>svg]:opacity-70">
      {icono} {texto}
    </Link>
  );
}

function ItemBoton({ onClick, icono, texto, color }: { onClick: () => void; icono: ReactNode; texto: string; color: string }) {
  return (
    <button onClick={onClick} className={`w-full px-4 py-2 text-[11px] font-bold text-slate-600 ${color} flex items-center gap-2 text-left transition-colors [&>svg]:opacity-70`}>
      {icono} {texto}
    </button>
  );
}

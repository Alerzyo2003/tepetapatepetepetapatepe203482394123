'use client'
// Modal para agendar una cita nueva o reprogramar una existente.
// Incluye el ticket "¡Cita lista!" con el envío por WhatsApp.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Ban, Calendar as CalendarIcon, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock,
  Loader2, MessageCircle, Plus, Save, Search, User, X,
} from 'lucide-react'
import ModalShell from './ModalShell'
import { contarInasistencias, registrarAuditoria } from './data'
import {
  abrirWhatsApp, capitalizar, DIRECCION_CLINICA, DURACIONES_DISPONIBLES, esWebPendiente, fechaLarga,
  formatearTelefonoParaGuardar, getDiasLunesSabado, getInitials, getLocalDateISO, horaDeStr,
  limpiarParaFiltro, MESES_INASISTENCIAS, nombreDoctorCompleto, rangoCita, SLOTS_HORARIOS, telefonoWA, URL_CONFIRMAR,
} from './utils'
import type { AgendarConfig, HoraSeleccionada, Profesional } from './types'

interface NuevoPaciente { nombre: string; apellido: string; rut: string; telefono: string; fecha_nacimiento: string; sexo: string; }
const PACIENTE_VACIO: NuevoPaciente = { nombre: '', apellido: '', rut: '', telefono: '', fecha_nacimiento: '', sexo: '' };

interface TicketData {
  paciente: string;
  citas: HoraSeleccionada[];
  telefono: string | null;
  citaId: string | null;
  profesionalId: string;
}

interface Props {
  config: AgendarConfig | null;      // null = cerrado
  onClose: () => void;
  onGuardado: () => void;            // para refrescar la agenda
  profesionales: Profesional[];
  usuarioLogueado: string | null;
  puedeVerAgendaCompleta: boolean;
  realtimeTrigger: number;
}

export default function ModalAgendar(props: Props) {
  const { config, onClose, onGuardado } = props;
  const [ticket, setTicket] = useState<TicketData | null>(null);

  // Mantiene el último config mientras el modal hace la animación de salida
  const ultimoConfig = useRef<AgendarConfig | null>(config);
  if (config) ultimoConfig.current = config;
  const cfg = config || ultimoConfig.current;

  const cerrarTodo = () => { setTicket(null); onClose(); };
  const esReprogramacion = !!cfg?.citaReprogramar;

  return (
    <>
      <ModalShell
        abierto={!!config}
        onClose={onClose}
        cerrarConEscape={!ticket}
        ancho="max-w-4xl"
        icono={<CalendarIcon size={24} className="text-[#C9A24B]" />}
        colorIcono={{ bg: 'rgba(255,255,255,0.1)', border: 'rgba(255,255,255,0.2)' }}
        titulo={esReprogramacion ? 'Reprogramar Cita' : 'Agendar Nueva Cita'}
        subtitulo={
          cfg?.citaReprogramar
            ? `Cita original: ${cfg.citaReprogramar.inicio.split('T')[0]} a las ${horaDeStr(cfg.citaReprogramar.inicio)}`
            : cfg?.diaSugerido
              ? `Día sugerido: ${fechaLarga(cfg.diaSugerido)}`
              : 'Completa los datos de la atención'
        }
      >
        {cfg && (
          <FormularioAgendar
            key={cfg.id}
            {...props}
            config={cfg}
            onGuardadoOk={(t) => { setTicket(t); onGuardado(); }}
          />
        )}
      </ModalShell>

      <TicketCitaLista
        ticket={ticket}
        profesionales={props.profesionales}
        onFinalizar={cerrarTodo}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Formulario (se reinicia en cada apertura gracias a key={config.id})
// ─────────────────────────────────────────────────────────────
function FormularioAgendar({
  config, profesionales, usuarioLogueado, puedeVerAgendaCompleta, realtimeTrigger, onGuardadoOk,
}: Props & { config: AgendarConfig; onGuardadoOk: (t: TicketData) => void }) {
  const citaEnReprogramacion = config.citaReprogramar || null;
  const hoyISO = getLocalDateISO(new Date());

  const [filtro, setFiltro] = useState({
    profesional_id: config.profesionalId || '',
    duracionDefault: config.duracion || 30,
  });
  const [semanaInicio, setSemanaInicio] = useState<Date>(config.semanaInicio ? new Date(config.semanaInicio + 'T00:00:00') : new Date());
  const [horasSeleccionadas, setHorasSeleccionadas] = useState<HoraSeleccionada[]>(config.horas || []);
  const [horariosConfigurados, setHorariosConfigurados] = useState<any[]>([]);
  const [citasOcupadas, setCitasOcupadas] = useState<any[]>([]);
  const [bloqueosSemana, setBloqueosSemana] = useState<any[]>([]);

  const [modoNuevoPaciente, setModoNuevoPaciente] = useState(false);
  const [esOtroDocumento, setEsOtroDocumento] = useState(false);
  const [nuevoPaciente, setNuevoPaciente] = useState<NuevoPaciente>(PACIENTE_VACIO);
  const [busqueda, setBusqueda] = useState('');
  const [pacientesEncontrados, setPacientesEncontrados] = useState<any[]>([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<any>(null);
  const [inasistenciasPaciente, setInasistenciasPaciente] = useState(0);
  const [cargandoAccion, setCargandoAccion] = useState(false);

  const [motivo, setMotivo] = useState(config.motivo || citaEnReprogramacion?.motivo || '');
  const [tratamientosPaciente, setTratamientosPaciente] = useState<any[]>([]);
  const [tratamientoSeleccionadoId, setTratamientoSeleccionadoId] = useState<string | null>(null);

  const busquedaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busquedaSeq = useRef(0);

  // Paciente precargado (reprogramación, control sugerido, etc.)
  useEffect(() => {
    const p = citaEnReprogramacion?.pacientes || config.paciente;
    if (p) seleccionarPacienteExistente(p);
    return () => { if (busquedaTimer.current) clearTimeout(busquedaTimer.current); };
  }, []);

  // Disponibilidad del doctor en la semana mostrada
  useEffect(() => {
    if (!filtro.profesional_id) return;
    fetchCitasOcupadas();
    fetchHorariosDoctor();
    fetchBloqueosSemana();
  }, [semanaInicio, filtro.profesional_id, realtimeTrigger]);

  async function fetchCitasOcupadas() {
    const dias = getDiasLunesSabado(semanaInicio);
    const { data } = await supabase.from('citas')
      .select('id, inicio, fin, estado_confirmacion, motivo')
      .eq('profesional_id', filtro.profesional_id)
      .gte('inicio', `${getLocalDateISO(dias[0])}T00:00:00`).lte('inicio', `${getLocalDateISO(dias[5])}T23:59:59`)
      .neq('estado', 'cancelada');
    setCitasOcupadas((data || []).filter((c: any) => c.id !== citaEnReprogramacion?.id && !esWebPendiente(c)));
  }

  async function fetchHorariosDoctor() {
    const { data } = await supabase.from('disponibilidad_profesional').select('*').eq('profesional_id', filtro.profesional_id);
    setHorariosConfigurados(data || []);
  }

  async function fetchBloqueosSemana() {
    const profObj = profesionales.find(p => p.user_id === filtro.profesional_id);
    if (!profObj) { setBloqueosSemana([]); return; }
    const dias = getDiasLunesSabado(semanaInicio);
    const { data } = await supabase.from('bloqueos_agenda').select('*').eq('profesional_id', profObj.id)
      .gte('fecha', getLocalDateISO(dias[0])).lte('fecha', getLocalDateISO(dias[5]));
    setBloqueosSemana(data || []);
  }

  // ── Reglas de disponibilidad ──
  const rango = (fecha: string, hora: string, duracion: number) => {
    const ini = new Date(`${fecha}T${hora}:00`).getTime();
    return [ini, ini + duracion * 60000] as const;
  };

  const esHorarioLaboral = (fecha: string, hora: string, duracion: number) => {
    const diaSemana = new Date(fecha + 'T00:00:00').getDay();
    const [ini, fin] = rango(fecha, hora, duracion);
    // Un horario especial del día reemplaza al horario semanal
    const especiales = horariosConfigurados.filter(h => h.fecha_especifica === fecha);
    const horarios = especiales.length > 0 ? especiales : horariosConfigurados.filter(h => h.dia_semana === diaSemana && !h.fecha_especifica);
    return horarios.some(h => {
      const iniLab = new Date(`${fecha}T${h.hora_inicio.substring(0, 5)}:00`).getTime();
      const finLab = new Date(`${fecha}T${h.hora_fin.substring(0, 5)}:00`).getTime();
      return ini >= iniLab && fin <= finLab;
    });
  };

  const esCitaOcupada = (fecha: string, hora: string, duracion: number) => {
    const [ini, fin] = rango(fecha, hora, duracion);
    return citasOcupadas.some(c => {
      const cIni = new Date(c.inicio.replace(' ', 'T')).getTime();
      const cFin = new Date(c.fin.replace(' ', 'T')).getTime();
      return ini < cFin && fin > cIni;
    });
  };

  const esHorarioBloqueado = (fecha: string, hora: string, duracion: number) => {
    const [ini, fin] = rango(fecha, hora, duracion);
    return bloqueosSemana.some(b => {
      if (b.fecha !== fecha) return false;
      if (!b.hora_inicio || !b.hora_fin) return true;
      return ini < new Date(`${fecha}T${b.hora_fin}`).getTime() && fin > new Date(`${fecha}T${b.hora_inicio}`).getTime();
    });
  };

  const toggleHora = (fecha: string, hora: string) => {
    setHorasSeleccionadas(prev => {
      if (prev.some(h => h.fecha === fecha && h.hora === hora)) return prev.filter(h => !(h.fecha === fecha && h.hora === hora));
      // Al reprogramar solo puede haber UN horario: reemplazamos la selección
      if (citaEnReprogramacion) return [{ fecha, hora, duracion: filtro.duracionDefault }];
      return [...prev, { fecha, hora, duracion: filtro.duracionDefault }];
    });
  };

  const handleSlotClick = (fecha: string, hora: string) => {
    if (horasSeleccionadas.some(x => x.fecha === fecha && x.hora === hora)) return toggleHora(fecha, hora);

    const dur = filtro.duracionDefault;
    const diaBloqueado = bloqueosSemana.some(b => b.fecha === fecha && (!b.hora_inicio || !b.hora_fin));
    const chocaConSeleccion = !citaEnReprogramacion && horasSeleccionadas.some(s => {
      const [sIni, sFin] = rango(s.fecha, s.hora, s.duracion);
      const [ini, fin] = rango(fecha, hora, dur);
      return ini < sFin && fin > sIni;
    });

    if (diaBloqueado) return toast.error("Este día está completamente bloqueado.");
    if (esHorarioBloqueado(fecha, hora, dur)) return toast.error("El horario seleccionado está bloqueado por el especialista.");
    if (!esHorarioLaboral(fecha, hora, dur)) return toast.error("Fuera del horario laboral del especialista.");
    if (chocaConSeleccion) return toast.warning("El horario choca con otra selección actual.");
    if (esCitaOcupada(fecha, hora, dur) && !window.confirm(`⚠️ El bloque completo que intentas agendar choca con otra cita existente. ¿Deseas forzar un SOBRECUPO?`)) return;

    toggleHora(fecha, hora);
  };

  const navegarSemana = (dias: number) => { const n = new Date(semanaInicio); n.setDate(n.getDate() + dias); setSemanaInicio(n); };

  // Incluye la duración actual aunque no esté en la lista (ej: una cita de 75 min no se acorta al reprogramar)
  const opcionesDuracion = [...new Set([...DURACIONES_DISPONIBLES, filtro.duracionDefault])].sort((a, b) => a - b);

  // Al cambiar la duración se ajustan también los horarios ya elegidos
  const cambiarDuracion = (d: number) => {
    setFiltro(f => ({ ...f, duracionDefault: d }));
    if (horasSeleccionadas.length === 0) return;
    const nuevas = horasSeleccionadas.map(h => ({ ...h, duracion: d }));
    const validas = nuevas.filter(h => esHorarioLaboral(h.fecha, h.hora, d) && !esHorarioBloqueado(h.fecha, h.hora, d));
    const quitadas = nuevas.length - validas.length;
    const conChoque = validas.filter(h => esCitaOcupada(h.fecha, h.hora, d)).length;
    if (quitadas > 0) toast.warning(`${quitadas} horario(s) se quitaron porque no caben con ${d} min (fuera de horario o bloqueado).`);
    else if (conChoque > 0) toast.warning(`Con ${d} min, ${conChoque} horario(s) se cruzan con otra cita y quedarán como sobrecupo.`);
    setHorasSeleccionadas(validas);
  };

  // ── Pacientes ──
  const buscarPacientes = async (term: string) => {
    const seq = ++busquedaSeq.current;
    const palabras = term.trim().split(/\s+/).map(limpiarParaFiltro).filter(Boolean);
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
  };

  const onCambioBusqueda = (valor: string) => {
    setBusqueda(valor);
    if (busquedaTimer.current) clearTimeout(busquedaTimer.current);
    if (!valor.trim()) { busquedaSeq.current++; setPacientesEncontrados([]); return; }
    busquedaTimer.current = setTimeout(() => buscarPacientes(valor), 300);
  };

  async function seleccionarPacienteExistente(paciente: any) {
    if (!paciente) return;
    if (paciente.activo === false) {
      toast.error(`Paciente Inhabilitado: ${paciente.motivo_deshabilitado || 'No se pueden agendar citas.'}`);
      return;
    }
    setPacienteSeleccionado(paciente);
    setBusqueda(`${paciente.nombre} ${paciente.apellido}`);
    setPacientesEncontrados([]);
    setInasistenciasPaciente(0);

    const [{ data }, inasist] = await Promise.all([
      supabase.from('presupuestos').select('id, nombre_tratamiento').eq('paciente_id', paciente.id).neq('estado', 'finalizado').order('fecha_creacion', { ascending: false }),
      contarInasistencias([paciente.id]),
    ]);
    setTratamientosPaciente(data || []);
    setTratamientoSeleccionadoId('MANUAL');
    setInasistenciasPaciente(inasist[paciente.id] || 0);
  }

  const quitarPaciente = () => {
    setPacienteSeleccionado(null); setBusqueda(''); setTratamientosPaciente([]);
    setTratamientoSeleccionadoId(null); setInasistenciasPaciente(0);
  };

  // ── Guardar ──
  const handleGuardar = async () => {
    if (cargandoAccion) return;
    if (horasSeleccionadas.length === 0) return toast.error("Selecciona al menos un horario");
    if (!filtro.profesional_id) return toast.error("Selecciona un especialista");
    if (modoNuevoPaciente && (!nuevoPaciente.nombre || !nuevoPaciente.apellido)) return toast.error("Faltan datos del nuevo paciente", { description: "Nombre y Apellido son obligatorios." });
    if (!modoNuevoPaciente && !pacienteSeleccionado) return toast.error("Selecciona un paciente");

    setCargandoAccion(true);
    try {
      let pId = pacienteSeleccionado?.id;
      let pNombreFull = pacienteSeleccionado ? `${pacienteSeleccionado.nombre} ${pacienteSeleccionado.apellido}` : '';
      let pTelefono = pacienteSeleccionado?.telefono || null;

      if (modoNuevoPaciente && !citaEnReprogramacion) {
        let rutFinal = nuevoPaciente.rut.toUpperCase().trim();
        if (esOtroDocumento) { if (!rutFinal) rutFinal = `OTRO-DOC-${Date.now()}`; } else { rutFinal = rutFinal.replace(/[^0-9kK-]/g, ''); }
        if (!rutFinal) rutFinal = `SIN-RUT-${Date.now()}`;
        const telefonoFinal = formatearTelefonoParaGuardar(nuevoPaciente.telefono);

        const { data: pNew, error: pErr } = await supabase.from('pacientes').insert([{
          nombre: nuevoPaciente.nombre.toUpperCase().trim(),
          apellido: nuevoPaciente.apellido.toUpperCase().trim(),
          rut: rutFinal,
          telefono: telefonoFinal,
          fecha_nacimiento: nuevoPaciente.fecha_nacimiento || null,
          sexo: nuevoPaciente.sexo || null,
          activo: true,
        }]).select().single();
        if (pErr) {
          if ((pErr as any).code === '23505') { toast.error("Ya existe un paciente con ese RUT", { description: "Búscalo en el buscador en vez de crearlo de nuevo." }); setCargandoAccion(false); return; }
          throw pErr;
        }
        pId = pNew.id; pNombreFull = `${nuevoPaciente.nombre} ${nuevoPaciente.apellido}`; pTelefono = telefonoFinal;
      }

      const aFechas = (s: HoraSeleccionada) => rangoCita(s.fecha, s.hora, s.duracion);
      const ordenadas = [...horasSeleccionadas].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
      let citaIdConfirmacion: string | null = null;

      if (citaEnReprogramacion) {
        const s = ordenadas[0];
        const { inicio, fin } = aFechas(s);
        const { error } = await supabase.from('citas').update({
          inicio, fin, profesional_id: filtro.profesional_id, estado: 'reprogramada',
          motivo: motivo.toUpperCase() || citaEnReprogramacion.motivo, modificado_por: usuarioLogueado,
        }).eq('id', citaEnReprogramacion.id);
        if (error) throw error;
        citaIdConfirmacion = citaEnReprogramacion.id;
        await registrarAuditoria(usuarioLogueado, 'UPDATE / REPROGRAMACIÓN', 'citas', `Reprogramó la cita de ${pNombreFull} para el ${s.fecha} a las ${s.hora}.`);
      } else {
        const nuevasCitas = ordenadas.map(s => ({
          paciente_id: pId,
          profesional_id: filtro.profesional_id,
          presupuesto_id: tratamientoSeleccionadoId && tratamientoSeleccionadoId !== 'MANUAL' ? tratamientoSeleccionadoId : null,
          ...aFechas(s),
          estado: 'programada',
          motivo: motivo.toUpperCase() || 'CONSULTA',
          creado_por: usuarioLogueado,
        }));
        const { data: creadas, error } = await supabase.from('citas').insert(nuevasCitas).select('id');
        if (error) throw error;
        citaIdConfirmacion = creadas?.[0]?.id || null;
        const detalle = nuevasCitas.map(c => `Cita para ${pNombreFull} el ${c.inicio.split('T')[0]} a las ${c.inicio.split('T')[1].substring(0, 5)}`).join('; ');
        await registrarAuditoria(usuarioLogueado, 'INSERT / CITA', 'citas', `Agendó: ${detalle}`);
      }

      onGuardadoOk({ paciente: pNombreFull.toUpperCase(), citas: ordenadas, telefono: pTelefono, citaId: citaIdConfirmacion, profesionalId: filtro.profesional_id });
    } catch (e: any) {
      console.error(e);
      toast.error("Error al guardar", { description: e?.message });
      setCargandoAccion(false);
    }
  };

  const profesionalesVisibles = profesionales.filter(p => puedeVerAgendaCompleta || p.user_id === usuarioLogueado);

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-slate-50 flex flex-col gap-6">

        {/* 1. PACIENTE */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-black uppercase text-slate-800 mb-4 flex items-center gap-2"><User size={16} className="text-[#C9A24B]" /> 1. Datos del Paciente</h3>

          {!modoNuevoPaciente ? (
            <div className="space-y-4">
              {!pacienteSeleccionado && (
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input autoFocus type="text" placeholder="Buscar por RUT o Nombre..." className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-[#C9A24B] outline-none transition-all" value={busqueda} onChange={(e) => onCambioBusqueda(e.target.value)} disabled={!!citaEnReprogramacion} />
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
                    <button onClick={quitarPaciente} className="ml-auto p-2 hover:bg-emerald-200 rounded-lg text-emerald-700 transition-colors"><X size={16} /></button>
                  )}
                </div>
              )}

              {pacienteSeleccionado && inasistenciasPaciente > 0 && (
                <div className={`p-3 rounded-xl border flex items-start gap-3 ${inasistenciasPaciente >= 3 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  <Ban size={18} className="shrink-0 mt-0.5" />
                  <div className="text-xs font-bold leading-relaxed">
                    <span className="font-black uppercase tracking-wide">{inasistenciasPaciente} inasistencia{inasistenciasPaciente === 1 ? '' : 's'}</span> en los últimos {MESES_INASISTENCIAS} meses.
                    {inasistenciasPaciente >= 3
                      ? ' Se recomienda pedir confirmación obligatoria (o abono) antes de reservar la hora.'
                      : ' Considera recordarle la cita con anticipación.'}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Nombres *" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#C9A24B]" value={nuevoPaciente.nombre} onChange={e => setNuevoPaciente({ ...nuevoPaciente, nombre: e.target.value })} />
                <input type="text" placeholder="Apellidos *" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#C9A24B]" value={nuevoPaciente.apellido} onChange={e => setNuevoPaciente({ ...nuevoPaciente, apellido: e.target.value })} />
                <input type="text" placeholder={esOtroDocumento ? "N° Pasaporte / Documento" : "RUT (Sin puntos, con guión)"} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#C9A24B]" value={nuevoPaciente.rut} onChange={e => setNuevoPaciente({ ...nuevoPaciente, rut: e.target.value })} />
                <input type="tel" placeholder="Teléfono (9 dígitos)" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#C9A24B]" value={nuevoPaciente.telefono} onChange={e => setNuevoPaciente({ ...nuevoPaciente, telefono: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer w-fit">
                <input type="checkbox" checked={esOtroDocumento} onChange={e => setEsOtroDocumento(e.target.checked)} className="accent-[#C9A24B] w-4 h-4" /> Extranjero / otro documento
              </label>
              <button onClick={() => setModoNuevoPaciente(false)} className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 mt-2 flex items-center gap-1"><ChevronLeft size={14} /> Volver a buscar</button>
            </div>
          )}
        </div>

        {/* 2. MOTIVO */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-black uppercase text-slate-800 mb-4 flex items-center gap-2"><ClipboardList size={16} className="text-[#C9A24B]" /> 2. Motivo o Tratamiento</h3>
          <div className="space-y-3">
            {tratamientosPaciente.length > 0 && (
              <select className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-[#C9A24B]" value={tratamientoSeleccionadoId || 'MANUAL'} onChange={e => {
                const id = e.target.value;
                setTratamientoSeleccionadoId(id);
                const t = tratamientosPaciente.find(x => x.id === id);
                if (t && !motivo.trim()) setMotivo(t.nombre_tratamiento || '');
              }}>
                <option value="MANUAL">-- Ingresar motivo manualmente --</option>
                {tratamientosPaciente.map(t => <option key={t.id} value={t.id}>{t.nombre_tratamiento || 'Tratamiento sin nombre'}</option>)}
              </select>
            )}
            <input type="text" placeholder="Ej: Evaluación, Limpieza, Control..." className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#C9A24B]" value={motivo} onChange={e => setMotivo(e.target.value)} />
          </div>
        </div>

        {/* 3. FECHA Y HORA */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
            <h3 className="text-sm font-black uppercase text-slate-800 flex items-center gap-2"><Clock size={16} className="text-[#C9A24B]" /> 3. Fecha y Hora</h3>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                className="w-full md:w-auto p-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                value={filtro.profesional_id}
                onChange={e => { setFiltro({ ...filtro, profesional_id: e.target.value }); setHorasSeleccionadas([]); }}
                disabled={!puedeVerAgendaCompleta}
              >
                {!filtro.profesional_id && <option value="">Seleccione especialista...</option>}
                {profesionalesVisibles.map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
              </select>
              <select className="w-full md:w-auto p-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none" value={filtro.duracionDefault} onChange={e => cambiarDuracion(Number(e.target.value))}>
                {opcionesDuracion.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100">
            <button onClick={() => navegarSemana(-7)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"><ChevronLeft size={18} /></button>
            <span className="text-xs font-black uppercase tracking-widest text-slate-700">Semana del {getDiasLunesSabado(semanaInicio)[0].toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</span>
            <button onClick={() => navegarSemana(7)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"><ChevronRight size={18} /></button>
          </div>

          <div className="flex items-center gap-4 mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-slate-300"></span> Libre</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200"></span> Ocupado / Bloqueado</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500"></span> Seleccionado</span>
          </div>

          {!filtro.profesional_id ? (
            <p className="text-center text-xs font-bold text-slate-400 py-8">Selecciona un especialista para ver sus horarios.</p>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <div className="grid grid-cols-6 gap-2 min-w-[540px]">
                {getDiasLunesSabado(semanaInicio).map((dia, dIdx) => {
                  const diaStr = getLocalDateISO(dia);
                  const esPasado = diaStr < hoyISO;
                  const sugerido = config.diaSugerido === diaStr;
                  const slotsDia = SLOTS_HORARIOS.filter(hora => esHorarioLaboral(diaStr, hora, filtro.duracionDefault));
                  return (
                    <div key={dIdx} className={`text-center rounded-xl ${esPasado ? 'opacity-40' : ''} ${sugerido ? 'bg-emerald-50 ring-2 ring-emerald-300 p-1' : ''}`}>
                      <div className="mb-3">
                        {sugerido && <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Sugerido</p>}
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{dia.toLocaleDateString('es-CL', { weekday: 'short' })}</p>
                        <p className={`text-base font-black ${diaStr === hoyISO ? 'text-[#C9A24B]' : 'text-slate-800'}`}>{dia.getDate()}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                        {slotsDia.length === 0 && <span className="text-[10px] font-bold text-slate-300 italic py-4">Sin horario</span>}
                        {slotsDia.map(hora => {
                          const ocupado = esCitaOcupada(diaStr, hora, filtro.duracionDefault);
                          const bloqueado = esHorarioBloqueado(diaStr, hora, filtro.duracionDefault);
                          const seleccionado = horasSeleccionadas.some(s => s.fecha === diaStr && s.hora === hora);
                          const clase = seleccionado
                            ? 'bg-emerald-500 text-white border-emerald-600 shadow-md'
                            : ocupado || bloqueado
                              ? 'bg-red-50 text-red-500 border-red-200 opacity-60'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-[#C9A24B] hover:text-[#C9A24B] shadow-sm';
                          return (
                            <button key={hora} onClick={() => handleSlotClick(diaStr, hora)} className={`py-2 text-[11px] font-black rounded-lg border transition-all ${clase}`} title={bloqueado ? 'Bloqueado' : ocupado ? 'Ocupado (sobrecupo)' : 'Disponible'}>
                              {hora}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PIE */}
      <div className="p-6 md:p-8 border-t border-slate-100 bg-white shrink-0 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-xs font-black text-slate-500 uppercase tracking-widest w-full md:w-auto">
          {horasSeleccionadas.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={16} /> {horasSeleccionadas.length} bloque(s) seleccionado(s)</span>
              <div className="flex flex-wrap gap-1.5">
                {[...horasSeleccionadas].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`)).map(s => (
                  <span key={`${s.fecha}-${s.hora}`} className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-md px-2 py-1 text-[10px] normal-case tracking-normal">
                    {fechaLarga(s.fecha, { weekday: 'short', day: 'numeric', month: 'short' })} · {s.hora} ({s.duracion} min)
                    <button onClick={() => toggleHora(s.fecha, s.hora)} className="hover:text-red-500"><X size={12} /></button>
                  </span>
                ))}
              </div>
            </div>
          ) : 'Selecciona un horario en el calendario'}
        </div>
        <button
          onClick={handleGuardar}
          disabled={cargandoAccion || horasSeleccionadas.length === 0 || (!pacienteSeleccionado && !modoNuevoPaciente)}
          className="w-full md:w-auto px-8 py-4 bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg shrink-0"
        >
          {cargandoAccion ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          {citaEnReprogramacion ? 'Confirmar Reprogramación' : 'Confirmar y Agendar'}
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Ticket "¡Cita lista!" con envío por WhatsApp
// ─────────────────────────────────────────────────────────────
function TicketCitaLista({ ticket, profesionales, onFinalizar }: { ticket: TicketData | null; profesionales: Profesional[]; onFinalizar: () => void }) {
  const ultimo = useRef<TicketData | null>(ticket);
  if (ticket) ultimo.current = ticket;
  const t = ticket || ultimo.current;

  const enviarYFinalizar = () => {
    if (!t) return;
    if (!telefonoWA(t.telefono)) { toast.error("El paciente no tiene un número de teléfono registrado."); return; }

    const doctor = nombreDoctorCompleto(profesionales, t.profesionalId);
    const primera = t.citas[0];
    const hoyStr = getLocalDateISO(new Date());
    const manana = new Date(); manana.setDate(manana.getDate() + 1);
    const esHoy = primera.fecha === hoyStr;
    const esManana = primera.fecha === getLocalDateISO(manana);

    let mensaje = '';
    if (esHoy || esManana) {
      mensaje = `Hola ${t.paciente}, hemos agendado tu cita con el/la ${doctor} para ${esHoy ? 'HOY' : 'MAÑANA'} a las ${primera.hora} hrs.\n\n`;
      mensaje += `📍 Dirección: ${DIRECCION_CLINICA}.\n\n`;
      if (t.citaId) {
        mensaje += `⚠️ Importante: Debido a la alta demanda de horas, si tu cita no es confirmada el bloque será asignado a otro paciente.\n\n`;
        mensaje += `Por favor confirma tu asistencia en el siguiente enlace:\n${URL_CONFIRMAR}/${t.citaId}\n\n`;
      }
      mensaje += `¡Te esperamos en Clínica Dignidad!`;
    } else {
      mensaje = `Hola ${t.paciente}, hemos agendado exitosamente tu cita con el/la ${doctor} para el día ${capitalizar(fechaLarga(primera.fecha))} a las ${primera.hora} hrs.\n\n`;
      if (t.citas.length > 1) {
        mensaje += `También quedaron agendadas tus siguientes sesiones:\n`;
        t.citas.slice(1).forEach(s => { mensaje += `🗓️ ${capitalizar(fechaLarga(s.fecha))} a las ${s.hora} hrs\n`; });
        mensaje += `\n`;
      }
      mensaje += `📍 Dirección: ${DIRECCION_CLINICA}.\n\n¡Te esperamos en Clínica Dignidad!`;
    }

    abrirWhatsApp(t.telefono, mensaje);
    onFinalizar();
  };

  return (
    <ModalShell abierto={!!ticket} onClose={onFinalizar} sinEncabezado cerrarConEscape={false} ancho="max-w-sm" zIndex={1000000}>
      <div className="bg-white rounded-[3rem] shadow-2xl p-8 md:p-10 text-center space-y-8">
        <CheckCircle2 className="mx-auto text-emerald-500 md:w-[64px] md:h-[64px]" size={80} />
        <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-800">¡Cita Lista!</h2>
        <div className="text-left bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
          <div>
            <p className="text-[11px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Paciente</p>
            <p className="font-black text-lg md:text-base text-slate-800 uppercase mt-1 leading-tight md:leading-none">{t?.paciente}</p>
          </div>
          <div>
            <p className="text-[11px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Fecha y Hora</p>
            {(t?.citas || []).map(s => (
              <p key={`${s.fecha}-${s.hora}`} className="font-black text-lg md:text-base text-slate-800 uppercase mt-1 leading-tight">
                {fechaLarga(s.fecha, { weekday: 'short', day: 'numeric', month: 'short' })} • {s.hora} hrs
              </p>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 md:gap-2">
          <button onClick={enviarYFinalizar} className="w-full py-4 bg-emerald-500 rounded-2xl font-black text-xs md:text-[10px] uppercase tracking-widest text-white shadow-md hover:bg-emerald-600 transition-all flex items-center justify-center gap-2">
            <MessageCircle size={16} /> Confirmar y Enviar
          </button>
          <button onClick={onFinalizar} className="w-full py-4 md:py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs md:text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">
            Finalizar sin enviar
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

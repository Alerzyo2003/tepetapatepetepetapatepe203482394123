'use client'
// Mapa de box: plano de la clínica con los 5 box, qué profesional está en cada uno (sorteo diario) y qué pasa ahora
// (con paciente, paciente llegó, libre), quién está en la sala de espera y hace cuánto, y la ocupación del día.
// Se actualiza cada 30 segundos. Cada doctor ve arriba sus pacientes del día. Recepción puede cambiar el box de un profesional.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeftRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Hourglass, Loader2, MapPin, RefreshCw, Shuffle, Stethoscope, User, Users, WifiOff, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAgendaRealtime, useReloj } from '../_components/hooks'
import { capitalizar, claseBadgeSemaforo, fechaLarga, formatNombreDoctor, getLocalDateISO, getMinsFromDateStr, minsToT, minutosDesde, nivelSemaforo } from '../_components/utils'
import { BOXES, cambiarBox, cargarBoxDia, seSorteaAutomatico, useBoxDia, volverASortear, type AsignacionBox, type BoxDia } from '../_components/boxes'
import type { Profesional } from '../_components/types'

const ROLES_GESTION = ['ADMIN', 'RECEPCIONISTA', 'ASISTENTE'];
const ESTADOS_FUERA = ['cancelada', 'no_asiste'];
const HORA_INICIO = 8 * 60, HORA_FIN = 21 * 60;   // eje de la ocupación del día
const REFRESCO_MS = 30_000;                          // el mapa se actualiza solo cada 30 segundos

type EstadoBox = 'libre' | 'entre' | 'agenda' | 'llego' | 'atendiendo' | 'atrasado' | 'sin_uso';
const ESTILO: Record<EstadoBox, { label: string; caja: string; pill: string }> = {
  libre:      { label: 'Libre',              caja: 'bg-emerald-50 border-emerald-200', pill: 'bg-emerald-100 text-emerald-800' },
  entre:      { label: 'Doctor sin paciente', caja: 'bg-teal-50 border-teal-200',      pill: 'bg-teal-100 text-teal-800' },
  agenda:     { label: 'Con paciente',       caja: 'bg-sky-50 border-sky-200',         pill: 'bg-sky-100 text-sky-800' },
  llego:      { label: 'Paciente llegó',     caja: 'bg-amber-50 border-amber-300',     pill: 'bg-amber-100 text-amber-800' },
  atendiendo: { label: 'Atendiendo',         caja: 'bg-blue-50 border-blue-300',       pill: 'bg-blue-100 text-blue-800' },
  atrasado:   { label: 'Atrasado',           caja: 'bg-red-50 border-red-300',         pill: 'bg-red-100 text-red-800' },
  sin_uso:    { label: 'Sin uso hoy',        caja: 'bg-slate-50 border-slate-200',     pill: 'bg-slate-100 text-slate-500' },
};
const COLORES_DOC = ['bg-sky-400', 'bg-violet-400', 'bg-amber-400', 'bg-emerald-400', 'bg-rose-400', 'bg-teal-400', 'bg-indigo-400', 'bg-orange-400'];

const local = (s?: string | null) => String(s || '').replace(' ', 'T').slice(0, 19);
const hhmm = (s?: string | null) => local(s).slice(11, 16);
const pacienteCorto = (p: any) => {
  if (!p) return 'Paciente';
  const n = String(p.nombre || '').trim().split(/\s+/)[0] || '';
  const a = String(p.apellido || '').trim().charAt(0);
  return `${capitalizar(n.toLowerCase())}${a ? ` ${a.toUpperCase()}.` : ''}`;
};

export default function MapaBoxPage() {
  const [usuario, setUsuario] = useState<string | null>(null);
  const [rol, setRol] = useState('');
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [listo, setListo] = useState(false);
  const [fecha, setFecha] = useState(new Date());
  const [citas, setCitas] = useState<any[]>([]);
  const [boxAbierto, setBoxAbierto] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [tick, setTick] = useState(0);
  const ahoraMs = useReloj(10_000);
  const realtime = useAgendaRealtime(['citas']);
  const puedeGestionar = ROLES_GESTION.includes(rol);

  // Actualización automática cada 30 s (si la pestaña está a la vista, como en la pantalla de la clínica)
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') setTick(x => x + 1); }, REFRESCO_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') setTick(x => x + 1); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, []);

  const fechaISO = getLocalDateISO(fecha);
  const hoyISO = getLocalDateISO(new Date(ahoraMs));
  const esHoy = fechaISO === hoyISO;
  const esPasado = fechaISO < hoyISO;
  const { dia, setDia, cargando } = useBoxDia(fechaISO, { activo: listo, clave: `${realtime}|${tick}`, refrescoMs: 0 });

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUsuario(session.user.id);
          const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', session.user.id).maybeSingle();
          setRol(perfil?.rol || '');
        }
        const { data } = await supabase.from('profesionales').select('*, especialidades(nombre)');
        setProfesionales(data || []);
      } finally { setListo(true); }
    })();
  }, []);

  // Citas del día (para saber qué pasa ahora en cada box y la ocupación)
  useEffect(() => {
    if (!listo) return;
    let activo = true;
    (async () => {
      const { data, error } = await supabase.from('citas')
        .select('id, inicio, fin, estado, motivo, profesional_id, hora_llegada, hora_inicio_atencion, pacientes(nombre, apellido)')
        .gte('inicio', `${fechaISO}T00:00:00`).lte('inicio', `${fechaISO}T23:59:59`)
        .not('estado', 'in', `(${ESTADOS_FUERA.join(',')})`).order('inicio', { ascending: true });
      if (!activo) return;
      if (error) { console.error('No se pudieron cargar las citas del día', error); setSinConexion(true); return; }
      setCitas(data || []); setSinConexion(false); setActualizado(new Date());
    })();
    return () => { activo = false; };
  }, [listo, fechaISO, realtime, tick]);

  const doc = (id?: string | null) => profesionales.find(p => p.user_id === id);
  const nombreDoc = (id?: string | null) => { const d = doc(id); return d ? formatNombreDoctor(d.nombre, d.apellido) : 'Profesional'; };
  const colorDoc = useMemo(() => {
    const ids = [...new Set((dia?.asignaciones || []).map(a => a.profesional_id))];
    return (id: string) => COLORES_DOC[Math.max(0, ids.indexOf(id)) % COLORES_DOC.length];
  }, [dia]);
  const ahora = `${hoyISO}T${minsToT(new Date(ahoraMs).getHours() * 60 + new Date(ahoraMs).getMinutes())}:00`;
  const citasDe = (id: string) => citas.filter(c => c.profesional_id === id);

  // ¿Qué pasa ahora en este box?
  const estadoDe = (numero: number): { estado: EstadoBox; asig?: AsignacionBox; cita?: any; siguiente?: any; proximoDoc?: AsignacionBox } => {
    const asigs = (dia?.asignaciones || []).filter(a => a.box === numero);
    if (asigs.length === 0) return { estado: 'sin_uso' };
    if (!esHoy) return { estado: 'libre' };
    const asig = asigs.find(a => local(a.desde) <= ahora && ahora < local(a.hasta));
    if (!asig) return { estado: 'libre', proximoDoc: asigs.find(a => local(a.desde) > ahora) };
    const cs = citasDe(asig.profesional_id);
    const atrasada = cs.find(c => c.estado === 'atendiendose' && local(c.fin) < ahora);
    const actual = cs.find(c => local(c.inicio) <= ahora && ahora < local(c.fin));
    const siguiente = cs.find(c => local(c.inicio) > ahora);
    if (atrasada) return { estado: 'atrasado', asig, cita: atrasada, siguiente };
    if (actual && actual.estado === 'atendiendose') return { estado: 'atendiendo', asig, cita: actual, siguiente };
    if (actual && actual.estado === 'en_espera') return { estado: 'llego', asig, cita: actual, siguiente };
    if (actual && actual.estado !== 'atendido') return { estado: 'agenda', asig, cita: actual, siguiente };
    return { estado: 'entre', asig, siguiente };
  };

  // Sala de espera: los que ya llegaron, el que más espera primero (con el semáforo de la agenda)
  const minEspera = (c: any) => minutosDesde(c.hora_llegada, ahoraMs);
  const enEspera = esHoy ? citas.filter(c => c.estado === 'en_espera').sort((a, b) => (minEspera(b) ?? -1) - (minEspera(a) ?? -1)) : [];
  const esperandoDe = (ids: string[]) => enEspera.filter(c => ids.includes(c.profesional_id));
  const boxDeDoc = (id: string) => (dia?.asignaciones || []).filter(a => a.profesional_id === id).map(a => a.box);
  const badgeEspera = (c: any) => {
    const m = minEspera(c);
    return <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${claseBadgeSemaforo(nivelSemaforo(m))}`}>{m === null ? 'Llegó' : `${m} min`}</span>;
  };
  // Mis pacientes de hoy (si quien mira es un profesional)
  const soyProfesional = profesionales.some(p => p.user_id === usuario);
  const misCitas = usuario ? citasDe(usuario) : [];
  const miBox = (dia?.asignaciones || []).filter(a => a.profesional_id === usuario);
  const sinBoxHoy = dia?.sinBox || [];
  const choques = useMemo(() => {
    const out: string[] = [];
    const xs = dia?.asignaciones || [];
    xs.forEach((a, i) => xs.slice(i + 1).forEach(b => {
      if (a.box === b.box && local(a.desde) < local(b.hasta) && local(b.desde) < local(a.hasta)) out.push(`Box ${a.box}: ${nombreDoc(a.profesional_id)} y ${nombreDoc(b.profesional_id)} se topan`);
    }));
    return out;
  }, [dia, profesionales]);

  const mover = (dias: number) => { const n = new Date(fecha); n.setDate(n.getDate() + dias); setFecha(n); setBoxAbierto(null); };

  async function cambiar(profesionalId: string, box: number) {
    setOcupado(true);
    try {
      setDia(await cambiarBox(fechaISO, profesionalId, box));
      toast.success(`${nombreDoc(profesionalId)} quedó en el Box ${box}`);
    } catch (e: any) { toast.error('No se pudo cambiar el box', { description: e?.message }); }
    finally { setOcupado(false); }
  }
  async function sortear(deNuevo: boolean) {
    if (deNuevo && !confirm('¿Volver a sortear los box de este día? Los cambios hechos a mano se mantienen.')) return;
    setOcupado(true);
    try {
      setDia(deNuevo ? await volverASortear(fechaISO) : await cargarBoxDia(fechaISO, true));
      toast.success('Box sorteados');
    } catch (e: any) { toast.error('No se pudo sortear', { description: e?.message }); }
    finally { setOcupado(false); }
  }

  if (!listo) return <div className="min-h-full flex items-center justify-center py-40"><Loader2 className="animate-spin text-[#C9A24B]" size={40} /></div>;

  // ── Tarjeta de un box en el plano ──
  const TarjetaBox = (numero: number, alto = 'min-h-[150px]') => {
    const b = BOXES.find(x => x.numero === numero)!;
    const { estado, asig, cita, siguiente, proximoDoc } = estadoDe(numero);
    const st = ESTILO[estado];
    const asigs = (dia?.asignaciones || []).filter(a => a.box === numero);
    return (
      <button onClick={() => setBoxAbierto(numero)} className={`w-full ${alto} text-left rounded-2xl border-2 p-3 md:p-4 transition-all hover:shadow-md hover:-translate-y-0.5 flex flex-col ${st.caja} ${asigs.some(a => a.profesional_id === usuario) ? 'ring-2 ring-[#C9A24B] ring-offset-2' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-black text-[#0A111F] text-base md:text-lg leading-none">{b.nombre}</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{b.tipo === 'medico' ? 'Médico' : 'Dental'}</span>
          </div>
          {(esHoy || estado === 'sin_uso') && <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${st.pill}`}>{st.label}</span>}
        </div>
        <div className="mt-2 flex-1 min-w-0">
          {asig ? (
            <>
              <p className="text-[13px] font-black text-slate-800 truncate">Dr(a). {nombreDoc(asig.profesional_id)}</p>
              {cita && <p className="text-[11px] font-bold text-slate-600 truncate">{pacienteCorto(cita.pacientes)}{cita.motivo ? ` · ${String(cita.motivo).toLowerCase()}` : ''} · hasta {hhmm(cita.fin)}</p>}
              {!cita && siguiente && <p className="text-[11px] font-bold text-slate-500 truncate">Próximo paciente {hhmm(siguiente.inicio)}</p>}
              {!cita && !siguiente && <p className="text-[11px] font-bold text-slate-500">Sin más pacientes hoy</p>}
            </>
          ) : esHoy && proximoDoc ? (
            <p className="text-[11px] font-bold text-slate-500 truncate">Llega Dr(a). {nombreDoc(proximoDoc.profesional_id)} a las {hhmm(proximoDoc.desde)}</p>
          ) : asigs.length === 0 ? (
            <p className="text-[11px] font-bold text-slate-400">Nadie asignado {esHoy ? 'hoy' : 'este día'}</p>
          ) : null}
        </div>
        {(() => {
          const esperan = esperandoDe(asigs.map(a => a.profesional_id));
          if (esperan.length === 0) return null;
          return (
            <div className="mt-2 rounded-xl bg-white/70 border border-amber-200 px-2.5 py-1.5 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-700 flex items-center gap-1"><Hourglass size={10} /> En sala de espera ({esperan.length})</p>
              {esperan.slice(0, 3).map(c => (
                <p key={c.id} className="text-[11px] font-bold text-slate-700 flex items-center justify-between gap-2">
                  <span className="truncate">{pacienteCorto(c.pacientes)} · cita {hhmm(c.inicio)}{asigs.length > 1 ? ` · ${nombreDoc(c.profesional_id).split(' ')[0]}` : ''}</span>
                  {badgeEspera(c)}
                </p>
              ))}
              {esperan.length > 3 && <p className="text-[10px] font-bold text-slate-500">y {esperan.length - 3} más</p>}
            </div>
          );
        })()}
        {asigs.length > 0 && (
          <div className="mt-2 pt-2 border-t border-black/5 space-y-0.5">
            {asigs.map(a => (
              <p key={a.profesional_id} className="text-[10px] font-bold text-slate-500 truncate flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${colorDoc(a.profesional_id)}`} />
                {nombreDoc(a.profesional_id)} · {hhmm(a.desde)}–{hhmm(a.hasta)}{a.manual ? ' · a mano' : ''}
              </p>
            ))}
          </div>
        )}
      </button>
    );
  };

  const boxDetalle = boxAbierto ? BOXES.find(b => b.numero === boxAbierto)! : null;

  return (
    <div className="min-h-full bg-[#FBF8F2] font-sans text-slate-800 pb-24 p-4 sm:p-6 md:p-10">
      {/* Cabecera */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0A111F]">Mapa de <span className="italic font-serif text-[#C9A24B]">Box</span></h1>
          <p className="text-[11px] font-bold text-slate-500 mt-1">Box 1 médico · Box 2 a 5 dentales · se sortean cada día entre quienes tienen citas, por el rato de sus citas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {miBox.length > 0 && (
            <span className="px-4 py-2.5 rounded-full bg-[#0A111F] text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2"><MapPin size={14} className="text-[#C9A24B]" /> {esHoy ? 'Hoy estás en el' : 'Ese día estás en el'} Box {[...new Set(miBox.map(a => a.box))].join(' / ')}</span>
          )}
          <div className="flex items-center bg-white rounded-full px-2 py-1.5 border border-slate-200 shadow-sm">
            <button onClick={() => mover(-1)} className="p-2 text-slate-400 hover:text-[#0A111F]" aria-label="Día anterior"><ChevronLeft size={18} /></button>
            <span className="text-[12px] font-bold text-slate-700 min-w-[150px] text-center">{capitalizar(fechaLarga(fechaISO, { weekday: 'long', day: 'numeric', month: 'short' }))}</span>
            <button onClick={() => mover(1)} className="p-2 text-slate-400 hover:text-[#0A111F]" aria-label="Día siguiente"><ChevronRight size={18} /></button>
          </div>
          {!esHoy && <button onClick={() => setFecha(new Date())} className="px-4 py-2.5 rounded-full bg-white border border-[#C9A24B]/40 text-[#8A6D2F] text-[10px] font-black uppercase tracking-widest">Hoy</button>}
          <button onClick={() => setTick(x => x + 1)} className="pl-3 pr-4 py-2.5 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest" title="Se actualiza solo cada 30 segundos. Toca para actualizar ahora.">
            {sinConexion ? <WifiOff size={15} className="text-red-500" /> : <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />}
            <span className={sinConexion ? 'text-red-500' : ''}>{sinConexion ? 'Sin conexión, reintentando' : actualizado ? `Actualizado ${actualizado.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Cargando'}</span>
          </button>
          {puedeGestionar && !esPasado && (dia?.asignaciones.length || 0) > 0 && (
            <button disabled={ocupado} onClick={() => sortear(true)} className="px-4 py-2.5 rounded-full bg-white border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50"><Shuffle size={14} /> Volver a sortear</button>
          )}
          <Link prefetch={false} href="/agenda" className="px-4 py-2.5 rounded-full bg-[#0A111F] text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><CalendarDays size={14} /> Agenda</Link>
        </div>
      </div>

      {/* Avisos */}
      {sinBoxHoy.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 text-[12px] font-bold">
          {sinBoxHoy.map(s => `Dr(a). ${nombreDoc(s.profesional_id)} (${hhmm(s.desde)}–${hhmm(s.hasta)})`).join(', ')} {sinBoxHoy.length === 1 ? 'quedó' : 'quedaron'} sin box: a esa hora hay más profesionales que box {sinBoxHoy[0].tipo === 'medico' ? 'médicos' : 'dentales'}. {puedeGestionar ? 'Asígnalo a mano tocando un box.' : ''}
        </div>
      )}
      {choques.length > 0 && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-[12px] font-bold">{choques.join(' · ')}</div>}
      {!cargando && dia && dia.asignaciones.length === 0 && dia.sinBox.length === 0 && (
        <div className="mb-4 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-[12px] font-bold text-slate-500 flex flex-wrap items-center justify-between gap-3">
          <span>{esPasado ? 'Ese día no quedó registro de box.' : seSorteaAutomatico(fechaISO) ? 'No hay citas con profesionales este día.' : 'Los box se sortean solos el día anterior. Si quieres verlos antes, puedes sortearlos ahora (pueden cambiar si se agendan más citas).'}</span>
          {puedeGestionar && !esPasado && !seSorteaAutomatico(fechaISO) && (
            <button disabled={ocupado} onClick={() => sortear(false)} className="px-4 py-2 rounded-full bg-[#C9A24B] text-[#0A111F] text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Shuffle size={14} /> Sortear este día</button>
          )}
        </div>
      )}

      {/* Mis pacientes de hoy (si quien mira es un profesional) */}
      {soyProfesional && esHoy && misCitas.length > 0 && (() => {
        const esperando = misCitas.filter(c => c.estado === 'en_espera').sort((a, b) => (minEspera(b) ?? -1) - (minEspera(a) ?? -1));
        const enBox = misCitas.filter(c => c.estado === 'atendiendose');
        const atendidos = misCitas.filter(c => c.estado === 'atendido');
        const proximos = misCitas.filter(c => !['en_espera', 'atendiendose', 'atendido'].includes(c.estado) && local(c.fin) > ahora);
        const nombre = (c: any) => `${c.pacientes?.nombre || ''} ${c.pacientes?.apellido || ''}`.trim() || 'Paciente';
        return (
          <div className="max-w-5xl mx-auto mb-5 bg-white rounded-3xl border-2 border-[#C9A24B]/50 p-4 md:p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#0A111F] flex items-center gap-2"><User size={16} className="text-[#C9A24B]" /> Tus pacientes de hoy{boxDeDoc(usuario!).length ? ` · Box ${[...new Set(boxDeDoc(usuario!))].join(' / ')}` : ''}</h2>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{atendidos.length} atendido{atendidos.length === 1 ? '' : 's'} · {proximos.length} por atender</span>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-2 flex items-center gap-1.5"><Hourglass size={12} /> En sala de espera ({esperando.length})</p>
                {esperando.length === 0 ? <p className="text-[11px] font-bold text-slate-400">Nadie esperando</p> : esperando.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-2 py-1">
                    <span className="min-w-0"><span className="block text-[12px] font-black text-slate-800 truncate">{nombre(c)}</span><span className="block text-[10px] font-bold text-slate-500">Cita {hhmm(c.inicio)}{c.hora_llegada ? ` · llegó ${hhmm(c.hora_llegada)}` : ''}</span></span>
                    {badgeEspera(c)}
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 mb-2 flex items-center gap-1.5"><Stethoscope size={12} /> En box ({enBox.length})</p>
                {enBox.length === 0 ? <p className="text-[11px] font-bold text-slate-400">Nadie en atención</p> : enBox.map(c => (
                  <div key={c.id} className="py-1">
                    <span className="block text-[12px] font-black text-slate-800 truncate">{nombre(c)}</span>
                    <span className="block text-[10px] font-bold text-slate-500">{hhmm(c.inicio)}–{hhmm(c.fin)}{c.hora_inicio_atencion ? ` · entró ${hhmm(c.hora_inicio_atencion)}` : ''}{c.motivo ? ` · ${String(c.motivo).toLowerCase()}` : ''}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2 flex items-center gap-1.5"><Clock size={12} /> Próximos ({proximos.length})</p>
                {proximos.length === 0 ? <p className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-500" /> Sin más pacientes hoy</p> : proximos.slice(0, 6).map(c => (
                  <div key={c.id} className="flex items-baseline gap-2 py-0.5">
                    <span className="text-[11px] font-black text-[#8A6D2F] w-11 shrink-0">{hhmm(c.inicio)}</span>
                    <span className="text-[12px] font-bold text-slate-700 truncate">{nombre(c)}{c.motivo ? <span className="text-slate-400 font-bold"> · {String(c.motivo).toLowerCase()}</span> : null}</span>
                  </div>
                ))}
                {proximos.length > 6 && <p className="text-[10px] font-bold text-slate-400 mt-1">y {proximos.length - 6} más</p>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Plano */}
      <div className="bg-white rounded-[2rem] border-4 border-[#0A111F] p-3 md:p-5 shadow-sm max-w-5xl mx-auto">
        {/* Celular: lista */}
        <div className="md:hidden space-y-3">
          {[1, 2, 3, 4, 5].map(n => <div key={n}>{TarjetaBox(n, 'min-h-[120px]')}</div>)}
        </div>
        {/* Escritorio: como el plano */}
        <div className="hidden md:grid grid-cols-[1.25fr_0.32fr_1fr] grid-rows-[repeat(4,minmax(150px,auto))] gap-3">
          <div className="col-start-1 row-start-1">{TarjetaBox(4, 'h-full')}</div>
          <div className="col-start-1 row-start-2">{TarjetaBox(3, 'h-full')}</div>
          <div className="col-start-1 row-start-3">{TarjetaBox(2, 'h-full')}</div>
          <div className="col-start-1 row-start-4">{TarjetaBox(1, 'h-full')}</div>
          <div className="col-start-2 row-start-1 row-span-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 [writing-mode:vertical-rl] rotate-180">Pasillo</span>
          </div>
          <div className="col-start-3 row-start-1">{TarjetaBox(5, 'h-full')}</div>
          <div className="col-start-3 row-start-2 row-span-3 grid grid-rows-[1.3fr_1fr_1fr_1fr] gap-2">
            <div className="rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-400">Baño accesible</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-400">Baño 1</div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-400">Baño 2</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-400">Baño 3</div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-400">Baño 4</div>
          </div>
        </div>
        {/* Recepción */}
        <div className="mt-3 rounded-2xl bg-[#0A111F] text-white p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><Users size={18} className="text-[#C9A24B]" /></div>
            <div>
              <p className="font-black uppercase tracking-widest text-sm">Recepción</p>
              <p className="text-[11px] font-bold text-white/60">{esHoy ? (enEspera.length ? `Sala de espera: ${enEspera.length} paciente${enEspera.length === 1 ? '' : 's'}` : 'Sala de espera vacía (según lo marcado en la agenda)') : `${citas.length} citas este día`}</p>
            </div>
          </div>
          {enEspera.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {enEspera.map(c => (
                <span key={c.id} className="pl-3 pr-1 py-1 rounded-full bg-white/10 text-white text-[11px] font-bold flex items-center gap-2">
                  {pacienteCorto(c.pacientes)} · {nombreDoc(c.profesional_id).split(' ')[0]}{boxDeDoc(c.profesional_id).length ? ` · Box ${boxDeDoc(c.profesional_id).join('/')}` : ''}
                  {badgeEspera(c)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leyenda */}
      {esHoy && (
        <div className="max-w-5xl mx-auto mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider">
          {(['libre', 'entre', 'agenda', 'llego', 'atendiendo', 'atrasado'] as EstadoBox[]).map(k => <span key={k} className={`px-2.5 py-1 rounded-full ${ESTILO[k].pill}`}>{ESTILO[k].label}</span>)}
          <span className="normal-case tracking-normal font-bold text-slate-400 py-1">"Con paciente" es según la agenda; "Paciente llegó" y "Atendiendo" aparecen cuando se marcan en la cita.</span>
        </div>
      )}

      {/* Ocupación del día */}
      <div className="max-w-5xl mx-auto mt-8 bg-white rounded-3xl border border-slate-200 p-4 md:p-6 shadow-sm">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-4">Ocupación del día por box</h2>
        <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-2 items-center">
          <span />
          <div className="relative h-4 text-[9px] font-bold text-slate-400">
            {Array.from({ length: (HORA_FIN - HORA_INICIO) / 120 + 1 }, (_, i) => HORA_INICIO + i * 120).map(m => (
              <span key={m} className="absolute -translate-x-1/2" style={{ left: `${((m - HORA_INICIO) / (HORA_FIN - HORA_INICIO)) * 100}%` }}>{minsToT(m)}</span>
            ))}
          </div>
          {BOXES.map(b => {
            const asigs = (dia?.asignaciones || []).filter(a => a.box === b.numero);
            return [
              <span key={`l${b.numero}`} className="text-[11px] font-black text-slate-600">{b.nombre}</span>,
              <div key={`b${b.numero}`} className="relative h-7 bg-slate-100 rounded-lg overflow-hidden">
                {asigs.flatMap(a => citasDe(a.profesional_id).filter(c => local(c.inicio) >= local(a.desde) && local(c.inicio) < local(a.hasta)).map(c => {
                  const i = Math.max(HORA_INICIO, getMinsFromDateStr(local(c.inicio))), f = Math.min(HORA_FIN, getMinsFromDateStr(local(c.fin)));
                  if (f <= i) return null;
                  return <span key={c.id} title={`${nombreDoc(a.profesional_id)} · ${hhmm(c.inicio)}–${hhmm(c.fin)}`} className={`absolute top-1 bottom-1 rounded ${colorDoc(a.profesional_id)} opacity-80`} style={{ left: `${((i - HORA_INICIO) / (HORA_FIN - HORA_INICIO)) * 100}%`, width: `${((f - i) / (HORA_FIN - HORA_INICIO)) * 100}%` }} />;
                }))}
                {esHoy && (() => { const m = new Date(ahoraMs).getHours() * 60 + new Date(ahoraMs).getMinutes(); return m > HORA_INICIO && m < HORA_FIN ? <span className="absolute top-0 bottom-0 w-0.5 bg-red-500" style={{ left: `${((m - HORA_INICIO) / (HORA_FIN - HORA_INICIO)) * 100}%` }} /> : null; })()}
              </div>,
            ];
          })}
        </div>
      </div>

      {/* Detalle del box */}
      {boxDetalle && (
        <div className="fixed inset-0 z-[100] bg-[#0A111F]/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={() => setBoxAbierto(null)}>
          <div className="bg-white w-full md:max-w-xl rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-[#0A111F] text-white px-6 py-5 flex items-center justify-between rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">{boxDetalle.tipo === 'medico' ? <Stethoscope size={18} className="text-[#C9A24B]" /> : <MapPin size={18} className="text-[#C9A24B]" />}</div>
                <div>
                  <p className="font-black text-lg leading-none">{boxDetalle.nombre}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mt-1">{boxDetalle.tipo === 'medico' ? 'Box médico' : 'Box dental'} · {capitalizar(fechaLarga(fechaISO, { weekday: 'long', day: 'numeric', month: 'short' }))}</p>
                </div>
              </div>
              <button onClick={() => setBoxAbierto(null)} className="p-2 rounded-full hover:bg-white/10" aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="p-5 md:p-6 space-y-4">
              {(dia?.asignaciones || []).filter(a => a.box === boxDetalle.numero).length === 0 && <p className="text-sm font-bold text-slate-400">Nadie asignado a este box ese día.</p>}
              {(dia?.asignaciones || []).filter(a => a.box === boxDetalle.numero).map(a => (
                <div key={a.profesional_id} className="border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full ${colorDoc(a.profesional_id)}`} />
                      <p className="font-black text-sm text-slate-800 truncate">Dr(a). {nombreDoc(a.profesional_id)}</p>
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 shrink-0">{hhmm(a.desde)}–{hhmm(a.hasta)}{a.manual ? ' · a mano' : ''}</span>
                  </div>
                  <div className="mt-3 space-y-1">
                    {citasDe(a.profesional_id).map(c => (
                      <p key={c.id} className="text-[11px] font-bold text-slate-600 flex items-center gap-2"><User size={11} className="text-slate-300" />{hhmm(c.inicio)}–{hhmm(c.fin)} · {pacienteCorto(c.pacientes)}{c.motivo ? ` · ${String(c.motivo).toLowerCase()}` : ''}</p>
                    ))}
                  </div>
                  {puedeGestionar && !esPasado && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><ArrowLeftRight size={12} /> Mover a</span>
                      {BOXES.filter(b => b.numero !== boxDetalle.numero).map(b => (
                        <button key={b.numero} disabled={ocupado} onClick={() => cambiar(a.profesional_id, b.numero)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 hover:border-[#C9A24B] hover:bg-[#C9A24B]/10 disabled:opacity-50">Box {b.numero}</button>
                      ))}
                      <span className="text-[10px] font-bold text-slate-400 w-full">Si el box está ocupado a esa hora, se intercambian.</span>
                    </div>
                  )}
                </div>
              ))}
              {puedeGestionar && !esPasado && sinBoxHoy.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Sin box ese día</p>
                  {sinBoxHoy.map(s => (
                    <div key={s.profesional_id} className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold text-slate-700">Dr(a). {nombreDoc(s.profesional_id)} · {hhmm(s.desde)}–{hhmm(s.hasta)}</span>
                      <button disabled={ocupado} onClick={() => cambiar(s.profesional_id, boxDetalle.numero)} className="px-3 py-1.5 rounded-lg bg-[#C9A24B] text-[#0A111F] text-[10px] font-black uppercase">Poner en {boxDetalle.nombre}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

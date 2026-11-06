'use client'
// Lista de espera: pacientes que esperan que se libere una hora con un doctor.
// - "Horas libres": las próximas horas libres de cada doctor y qué pacientes de la lista calzan (por doctor, duración,
//   días y horario en que pueden venir), ordenados por prioridad: urgencia → adelantar → sin hora, y antigüedad.
// - "En espera": la lista, con lo que se le ofreció a cada uno y su respuesta.
// - "Sugeridos": pacientes del doctor sin hora futura (tratamiento pendiente, anularon o faltaron) para sumarlos.
// Ofrecer: WhatsApp con la hora exacta o con enlace (el de reagendar si quiere adelantar su hora; si no, la agenda online).
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { filtroPalabraPaciente } from '@/lib/busquedaPacientes'
import { toast } from 'sonner'
import {
  CalendarCheck, CalendarClock, CalendarPlus, ChevronDown, ChevronUp, Hourglass, Link2, Loader2, MessageCircle, Pencil,
  PhoneOff, Plus, RefreshCw, Search, Sparkles, ThumbsDown, Trash2, User, UserPlus, X,
} from 'lucide-react'
import ModalShell from './ModalShell'
import { generarEnlaceReagendar, registrarAuditoria } from './data'
import {
  abrirWhatsApp, capitalizar, DURACIONES_DISPONIBLES, fechaISODeStr, fechaLarga, formatNombreDoctor, getLocalDateISO, horaDeStr,
  limpiarParaFiltro, minsToT, nombreDoctorCompleto, nombrePaciente, prepararVentanaWhatsApp, telefonoWA, URL_REAGENDAR,
} from './utils'
import {
  actualizarEntrada, agregarAListaEspera, buscarVentanasLibres, marcarAgendado, calcesDeVentana, cargarListaEspera, cargarSugeridos, citasFuturasPaciente,
  DIAS_HORAS_LIBRES, DIAS_SEMANA, diasEsperando, enlaceUsaReagendar, FRANJAS, horaDeOferta, mensajeOfertaEnlace,
  mensajeOfertaHora, ofertaVigente, registrarOferta, registrarRespuesta, retirarDeLista, textoDias, textoDoctorEntrada, TIPOS,
  URL_AGENDAR_ONLINE, ventanasDeEntrada,
  type EntradaEspera, type Franja, type NuevaEntrada, type Sugerido, type TipoEspera, type VentanaLibre,
} from './listaEspera'
import type { Profesional } from './types'

export interface HoraElegida { fecha: string; hora: string; duracion: number; profesionalId: string }

interface Props {
  abierto: boolean;
  onClose: () => void;
  profesionales: Profesional[];
  usuarioLogueado: string | null;
  filtroEspecialista: string;
  onAgendar: (entrada: EntradaEspera, hora?: HoraElegida) => void;
  onCambio?: () => void;            // para refrescar el contador del botón
}

type Pestana = 'horas' | 'lista' | 'sugeridos';
interface CitaFutura { id: string; inicio: string; profesional_id: string | null }
interface Formulario {
  id?: string;                     // si viene: editar
  paciente: any | null;
  doctor: string;                  // 'doc:<user_id>' | 'esp:<especialidad_id>' | 'cualquiera'
  motivo: string;
  duracion: number;
  tipo: TipoEspera;
  dias: number[];
  franja: Franja;
  aviso_corto: boolean;
  cita_actual_id: string | null;
  nota: string;
}

const boton = 'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50';
const chip = (activo: boolean) => `px-3 py-2 rounded-xl border text-[11px] font-bold transition-colors ${activo ? 'bg-[#0E1B2E] text-white border-[#0E1B2E]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#C9A24B]'}`;

export default function ModalListaEspera({ abierto, onClose, profesionales, usuarioLogueado, filtroEspecialista, onAgendar, onCambio }: Props) {
  const [pestana, setPestana] = useState<Pestana>('horas');
  const [doctor, setDoctor] = useState('Todos');
  const [entradas, setEntradas] = useState<EntradaEspera[]>([]);
  const [proximas, setProximas] = useState<Record<string, CitaFutura[]>>({});   // paciente → sus próximas horas agendadas
  const [cargando, setCargando] = useState(false);
  const [ventanas, setVentanas] = useState<VentanaLibre[]>([]);
  const [cargandoVentanas, setCargandoVentanas] = useState(false);
  const [soloConPacientes, setSoloConPacientes] = useState(true);
  const [abierta, setAbierta] = useState<string | null>(null);           // ventana o entrada desplegada
  const [sugeridos, setSugeridos] = useState<Sugerido[] | null>(null);
  const [cargandoSugeridos, setCargandoSugeridos] = useState(false);
  const [form, setForm] = useState<Formulario | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const especialidades = useMemo(() => {
    const m: Record<string, string> = {};
    profesionales.forEach(p => { if (p.especialidad_id) m[p.especialidad_id] = p.especialidades?.nombre || 'Especialidad'; });
    return m;
  }, [profesionales]);
  const doctorDe = (id?: string | null) => profesionales.find(p => p.user_id === id);
  const nombreDr = (id?: string | null) => { const d = doctorDe(id); return d ? `Dr(a). ${formatNombreDoctor(d.nombre, d.apellido)}` : 'Doctor'; };

  // ── Carga ──
  useEffect(() => {
    if (!abierto) return;
    const inicial = filtroEspecialista !== 'Todos' && profesionales.some(p => p.user_id === filtroEspecialista) ? filtroEspecialista : 'Todos';
    setDoctor(inicial); setForm(null); setAbierta(null); setSugeridos(null);
    cargarEntradas();
    cargarVentanas(inicial);
  }, [abierto]);

  async function cargarEntradas() {
    setCargando(true);
    try {
      const lista = await cargarListaEspera();
      setEntradas(lista);
      // ¿Ya consiguió hora por su cuenta? (agendó por teléfono, por la web o con el enlace)
      const ids = [...new Set(lista.map(e => e.paciente_id))];
      const mapa: Record<string, CitaFutura[]> = {};
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await supabase.from('citas').select('id, paciente_id, inicio, profesional_id').in('paciente_id', ids.slice(i, i + 150))
          .gte('inicio', `${getLocalDateISO(new Date())}T00:00:00`).not('estado', 'in', '(cancelada,no_asiste,atendido)').order('inicio', { ascending: true });
        (data || []).forEach((c: any) => { (mapa[c.paciente_id] ||= []).push({ id: c.id, inicio: String(c.inicio).replace(' ', 'T'), profesional_id: c.profesional_id }); });
      }
      setProximas(mapa);
    } catch (e: any) {
      console.error(e);
      toast.error('No se pudo cargar la lista de espera', { description: e?.message });
    } finally { setCargando(false); }
  }

  async function cargarVentanas(doc: string) {
    setCargandoVentanas(true);
    try {
      const pros = doc === 'Todos' ? profesionales : profesionales.filter(p => p.user_id === doc);
      setVentanas(await buscarVentanasLibres(pros));
    } catch (e: any) {
      console.error(e);
      toast.error('No se pudieron buscar las horas libres', { description: e?.message });
    } finally { setCargandoVentanas(false); }
  }

  async function cargarListaSugeridos(doc: string) {
    if (doc === 'Todos') { setSugeridos(null); return; }
    setCargandoSugeridos(true);
    try {
      const yaEnLista = new Set(entradas.filter(e => !e.profesional_id || e.profesional_id === doc).map(e => e.paciente_id));
      setSugeridos(await cargarSugeridos(doc, yaEnLista));
    } catch (e: any) {
      console.error(e);
      toast.error('No se pudieron cargar los sugeridos', { description: e?.message });
    } finally { setCargandoSugeridos(false); }
  }

  const cambiarDoctor = (doc: string) => {
    setDoctor(doc); setAbierta(null);
    cargarVentanas(doc);
    if (pestana === 'sugeridos') cargarListaSugeridos(doc);
    else setSugeridos(null);
  };
  const cambiarPestana = (p: Pestana) => {
    setPestana(p); setAbierta(null);
    if (p === 'sugeridos' && sugeridos === null) cargarListaSugeridos(doctor);
  };

  // ¿Ya consiguió hora con ese doctor? Si quería adelantar: ¿tiene otra hora antes de la que tenía?
  const yaTieneHora = (e: EntradaEspera): CitaFutura | null => {
    const citas = (proximas[e.paciente_id] || []).filter(c => !e.profesional_id || c.profesional_id === e.profesional_id);
    if (e.tipo === 'adelantar') {
      const actual = e.cita_actual?.inicio ? String(e.cita_actual.inicio).replace(' ', 'T') : null;
      return actual ? citas.find(c => c.id !== e.cita_actual_id && c.inicio < actual) || null : null;
    }
    return citas[0] || null;
  };

  const visibles = useMemo(() => entradas.filter(e => doctor === 'Todos' || !e.profesional_id || e.profesional_id === doctor), [entradas, doctor]);
  const disponibles = useMemo(() => visibles.filter(e => !yaTieneHora(e)), [visibles, proximas]);
  const ventanasConCalces = useMemo(() => ventanas.map(v => ({ v, calces: calcesDeVentana(v, disponibles) })), [ventanas, disponibles]);
  const ventanasMostradas = soloConPacientes ? ventanasConCalces.filter(x => x.calces.length > 0) : ventanasConCalces;

  const reemplazar = (e: EntradaEspera) => {
    setEntradas(prev => e.estado === 'esperando' || e.estado === 'ofrecido' ? prev.map(x => x.id === e.id ? e : x) : prev.filter(x => x.id !== e.id));
    onCambio?.();
  };

  // ── Acciones ──
  async function ofrecerHora(e: EntradaEspera, fecha: string, inicio: number, profesionalId: string) {
    const hora = minsToT(inicio);
    if (!abrirWhatsApp(e.pacientes?.telefono, mensajeOfertaHora(e, fecha, hora, profesionalId, profesionales))) return;
    setOcupado(e.id);
    try {
      reemplazar(await registrarOferta(e, { inicio: `${fecha}T${hora}:00`, profesionalId, porEnlace: false }));
      toast.success(`Hora ofrecida a ${nombrePaciente(e.pacientes)}`, { description: 'Cuando responda, marca si la tomó, si no contestó o si no quiso.' });
    } catch (err: any) { toast.error('Se abrió WhatsApp, pero no se pudo marcar como ofrecido', { description: err?.message }); }
    finally { setOcupado(null); }
  }

  async function enviarEnlace(e: EntradaEspera) {
    if (!telefonoWA(e.pacientes?.telefono)) { toast.error('El paciente no tiene un teléfono válido registrado'); return; }
    setOcupado(e.id);
    try {
      let enlace = URL_AGENDAR_ONLINE; let esReagendar = false;
      if (enlaceUsaReagendar(e)) {
        prepararVentanaWhatsApp(); // en el mismo clic: si se abre después de esperar, el navegador la bloquea
        const r = await generarEnlaceReagendar(e.cita_actual_id!);
        if (r.ok) { enlace = `${URL_REAGENDAR}/${r.token}`; esReagendar = true; }
        else toast.warning('No se pudo crear el enlace para mover su hora: se envía la agenda online.');
      }
      if (!abrirWhatsApp(e.pacientes?.telefono, mensajeOfertaEnlace(e, enlace, profesionales, esReagendar))) return;
      reemplazar(await registrarOferta(e, { inicio: null, profesionalId: e.profesional_id, porEnlace: true }));
      toast.success(`Enlace enviado a ${nombrePaciente(e.pacientes)}`);
    } catch (err: any) { toast.error('No se pudo enviar el enlace', { description: err?.message }); }
    finally { setOcupado(null); }
  }

  async function sacarYaAgendado(e: EntradaEspera, cita: CitaFutura) {
    setOcupado(e.id);
    try {
      reemplazar(await marcarAgendado(e.id, cita.id));
      toast.success(`${nombrePaciente(e.pacientes)} ya tiene hora: salió de la lista de espera`);
    } catch (err: any) { toast.error('No se pudo actualizar', { description: err?.message }); }
    finally { setOcupado(null); }
  }

  async function responder(e: EntradaEspera, r: 'no_contesta' | 'no_quiso') {
    setOcupado(e.id);
    try { reemplazar(await registrarRespuesta(e, r)); toast.success(r === 'no_contesta' ? 'Marcado: no contesta. Sigue en la lista.' : 'Marcado: no quiso esa hora. Sigue en la lista.'); }
    catch (err: any) { toast.error('No se pudo guardar', { description: err?.message }); }
    finally { setOcupado(null); }
  }

  async function quitar(e: EntradaEspera, motivo: string) {
    if (!confirm(`¿Sacar a ${nombrePaciente(e.pacientes)} de la lista de espera? (${motivo})`)) return;
    setOcupado(e.id);
    try {
      reemplazar(await retirarDeLista(e.id));
      await registrarAuditoria(usuarioLogueado, 'UPDATE / LISTA DE ESPERA', 'lista_espera', `Sacó a ${nombrePaciente(e.pacientes)} de la lista de espera (${motivo}).`);
      toast.success('Sacado de la lista de espera');
    } catch (err: any) { toast.error('No se pudo sacar de la lista', { description: err?.message }); }
    finally { setOcupado(null); }
  }

  const agendar = (e: EntradaEspera, fecha?: string, inicio?: number, profesionalId?: string) =>
    onAgendar(e, fecha && inicio !== undefined && profesionalId ? { fecha, hora: minsToT(inicio), duracion: e.duracion, profesionalId } : undefined);

  // ── Formulario ──
  const nuevoFormulario = (base: Partial<Formulario> = {}): Formulario => ({
    paciente: null, doctor: doctor !== 'Todos' ? `doc:${doctor}` : (profesionales[0] ? `doc:${profesionales[0].user_id}` : 'cualquiera'),
    motivo: '', duracion: 30, tipo: 'sin_hora', dias: [1, 2, 3, 4, 5, 6], franja: 'cualquiera', aviso_corto: false, cita_actual_id: null, nota: '',
    ...base,
  });
  const editar = (e: EntradaEspera) => setForm({
    id: e.id, paciente: e.pacientes, doctor: e.profesional_id ? `doc:${e.profesional_id}` : e.especialidad_id ? `esp:${e.especialidad_id}` : 'cualquiera',
    motivo: e.motivo || '', duracion: e.duracion || 30, tipo: e.tipo, dias: e.dias?.length ? e.dias : [1, 2, 3, 4, 5, 6], franja: e.franja,
    aviso_corto: e.aviso_corto, cita_actual_id: e.cita_actual_id, nota: e.nota || '',
  });

  async function guardarFormulario(f: Formulario) {
    if (!f.paciente?.id) { toast.error('Elige un paciente'); return; }
    if (f.dias.length === 0) { toast.error('Marca al menos un día en que puede venir'); return; }
    if (f.tipo === 'adelantar' && !f.cita_actual_id) { toast.error('Elige la hora que quiere adelantar (o cambia el tipo a "Sin hora")'); return; }
    const profesional_id = f.doctor.startsWith('doc:') ? f.doctor.slice(4) : null;
    const especialidad_id = f.doctor.startsWith('esp:') ? f.doctor.slice(4) : null;
    const repetida = entradas.find(e => e.id !== f.id && e.paciente_id === f.paciente.id && (e.profesional_id || null) === profesional_id);
    if (repetida) { toast.error('Este paciente ya está en la lista de espera para ese doctor', { description: 'Edita la que ya existe.' }); return; }
    const datos: NuevaEntrada = {
      paciente_id: f.paciente.id, profesional_id, especialidad_id, motivo: f.motivo.trim().toUpperCase(), duracion: f.duracion, tipo: f.tipo,
      dias: [...f.dias].sort(), franja: f.franja, aviso_corto: f.aviso_corto, cita_actual_id: f.tipo === 'adelantar' ? f.cita_actual_id : null,
      nota: f.nota.trim() || null,
    };
    setOcupado('form');
    try {
      if (f.id) {
        reemplazar(await actualizarEntrada(f.id, datos));
        toast.success('Cambios guardados');
      } else {
        const nueva = await agregarAListaEspera(datos);
        setEntradas(prev => [...prev, nueva]);
        setSugeridos(prev => prev ? prev.filter(s => s.paciente.id !== nueva.paciente_id) : prev);
        onCambio?.();
        await registrarAuditoria(usuarioLogueado, 'INSERT / LISTA DE ESPERA', 'lista_espera',
          `Agregó a ${nombrePaciente(f.paciente)} a la lista de espera (${TIPOS[f.tipo].label}) para ${textoDoctorEntrada(datos, profesionales, especialidades)}.`);
        toast.success(`${nombrePaciente(f.paciente)} quedó en la lista de espera`);
      }
      setForm(null);
    } catch (err: any) { toast.error('No se pudo guardar', { description: err?.message }); }
    finally { setOcupado(null); }
  }

  // ─────────────────────────────────────────────────────────────
  // Piezas de la vista
  // ─────────────────────────────────────────────────────────────
  const badge = (tipo: TipoEspera) => (
    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${TIPOS[tipo].clases}`}>{TIPOS[tipo].emoji} {TIPOS[tipo].corto}</span>
  );

  const estadoOferta = (e: EntradaEspera) => {
    if (e.estado === 'ofrecido') {
      const vigente = ofertaVigente(e);
      const que = e.ofrecido_por_enlace ? 'Se le envió enlace' : `Se le ofreció ${horaDeOferta(e)}${e.ofrecido_profesional_id ? ` con ${nombreDr(e.ofrecido_profesional_id)}` : ''}`;
      return <span className={`text-[10px] font-bold ${vigente ? 'text-blue-600' : 'text-slate-400'}`}>{que}{vigente ? ' · esperando respuesta' : ' · ya pasó'}</span>;
    }
    if (e.ultimo_resultado) return <span className="text-[10px] font-bold text-slate-500">Última vez: {e.ultimo_resultado === 'no_contesta' ? 'no contestó' : 'no quiso la hora'}</span>;
    return null;
  };

  const detallePaciente = (e: EntradaEspera) => {
    const tiene = yaTieneHora(e);
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link prefetch={false} href={`/pacientes/${e.paciente_id}`} className="font-black text-sm text-slate-800 uppercase leading-none hover:text-[#8A6D2F]">{nombrePaciente(e.pacientes)}</Link>
          {badge(e.tipo)}
          {e.aviso_corto && <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Con poco aviso</span>}
        </div>
        <p className="text-[11px] font-bold text-slate-600 mt-1.5">{e.motivo || 'Sin motivo'} · {e.duracion} min · {textoDoctorEntrada(e, profesionales, especialidades)}</p>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
          {textoDias(e.dias)} · {FRANJAS[e.franja]} · espera hace {diasEsperando(e) === 0 ? 'hoy' : `${diasEsperando(e)} día${diasEsperando(e) === 1 ? '' : 's'}`}
          {e.pacientes?.telefono ? ` · Tel: ${e.pacientes.telefono}` : ' · sin teléfono'}
        </p>
        {e.tipo === 'adelantar' && e.cita_actual?.inicio && (
          <p className="text-[10px] font-bold text-amber-700 mt-0.5">Tiene hora el {fechaLarga(fechaISODeStr(e.cita_actual.inicio), { weekday: 'short', day: 'numeric', month: 'short' })} a las {horaDeStr(e.cita_actual.inicio)}</p>
        )}
        {tiene && <p className="text-[10px] font-black text-emerald-700 mt-0.5">✓ Ya tiene hora el {fechaLarga(fechaISODeStr(tiene.inicio), { weekday: 'short', day: 'numeric', month: 'short' })} a las {horaDeStr(tiene.inicio)}{tiene.profesional_id ? ` con ${nombreDr(tiene.profesional_id)}` : ''}</p>}
        {e.nota && <p className="text-[10px] italic text-slate-500 mt-0.5">“{e.nota}”</p>}
        <div className="mt-0.5">{estadoOferta(e)}</div>
      </div>
    );
  };

  const botonesRespuesta = (e: EntradaEspera) => e.estado !== 'ofrecido' ? null : (
    <>
      <button disabled={ocupado === e.id} onClick={() => responder(e, 'no_contesta')} className={`${boton} bg-white border border-slate-200 text-slate-500 hover:bg-slate-50`} title="No respondió: sigue en la lista"><PhoneOff size={13} /> No contesta</button>
      <button disabled={ocupado === e.id} onClick={() => responder(e, 'no_quiso')} className={`${boton} bg-white border border-slate-200 text-slate-500 hover:bg-slate-50`} title="No le acomodó esa hora: sigue en la lista"><ThumbsDown size={13} /> No quiso</button>
    </>
  );

  // ── Pestaña: horas libres ──
  const vistaHoras = () => {
    if (cargandoVentanas) return <Cargando texto="Buscando horas libres..." />;
    if (ventanasMostradas.length === 0) return (
      <Vacio texto={soloConPacientes
        ? (ventanas.length === 0 ? `No hay horas libres en los próximos ${DIAS_HORAS_LIBRES} días.` : 'Hay horas libres, pero nadie de la lista calza con ellas (doctor, duración, días u horario).')
        : `No hay horas libres en los próximos ${DIAS_HORAS_LIBRES} días.`} />
    );
    let diaAnterior = '';
    return ventanasMostradas.map(({ v, calces }) => {
      const cabecera = v.fecha !== diaAnterior ? (diaAnterior = v.fecha, (
        <h3 key={`d-${v.fecha}`} className="text-[11px] font-black uppercase tracking-widest text-slate-500 pt-2">{capitalizar(fechaLarga(v.fecha))}</h3>
      )) : null;
      const desplegada = abierta === v.clave;
      return (
        <div key={v.clave} className="space-y-2">
          {cabecera}
          <div className={`bg-white rounded-2xl border shadow-sm ${calces.length ? 'border-emerald-200' : 'border-slate-200'}`}>
            <button onClick={() => setAbierta(desplegada ? null : v.clave)} disabled={calces.length === 0} className="w-full p-4 flex items-center justify-between gap-3 text-left disabled:cursor-default">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-16 h-12 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex flex-col items-center justify-center font-black text-sm leading-tight shrink-0">
                  {minsToT(v.inicio)}<span className="text-[9px] font-bold">{v.fin - v.inicio} min</span>
                </div>
                <div className="min-w-0">
                  <p className="font-black text-sm text-slate-800 leading-tight">{minsToT(v.inicio)} – {minsToT(v.fin)} · {nombreDr(v.profesional_id)}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {v.liberada && <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border bg-rose-50 text-rose-600 border-rose-200">Se liberó (cita anulada)</span>}
                    <span className={`text-[10px] font-black uppercase tracking-wider ${calces.length ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {calces.length ? `${calces.length} paciente${calces.length === 1 ? '' : 's'} en espera calza${calces.length === 1 ? '' : 'n'}` : 'Nadie de la lista calza'}
                    </span>
                  </div>
                </div>
              </div>
              {calces.length > 0 && (desplegada ? <ChevronUp size={18} className="text-slate-400 shrink-0" /> : <ChevronDown size={18} className="text-slate-400 shrink-0" />)}
            </button>
            {desplegada && (
              <div className="border-t border-slate-100 p-3 space-y-2 bg-slate-50/60 rounded-b-2xl">
                {calces.map(({ entrada: e, inicio }, i) => (
                  <div key={e.id} className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="w-6 h-6 rounded-full bg-[#0E1B2E] text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      {detallePaciente(e)}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end lg:max-w-[50%]">
                      <button disabled={ocupado === e.id} onClick={() => ofrecerHora(e, v.fecha, inicio, v.profesional_id)} className={`${boton} bg-emerald-500 text-white hover:bg-emerald-600`}><MessageCircle size={13} /> Ofrecer {minsToT(inicio)}</button>
                      <button disabled={ocupado === e.id} onClick={() => enviarEnlace(e)} className={`${boton} bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50`} title={enlaceUsaReagendar(e) ? 'Enlace para que mueva su hora a una anterior' : 'Enlace a la agenda online'}><Link2 size={13} /> Enlace</button>
                      <button onClick={() => agendar(e, v.fecha, inicio, v.profesional_id)} className={`${boton} bg-[#C9A24B] text-[#0A111F] hover:bg-[#B38D3A]`}><CalendarPlus size={13} /> Agendar</button>
                      {botonesRespuesta(e)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  // ── Pestaña: en espera ──
  const vistaLista = () => {
    if (cargando) return <Cargando texto="Cargando lista de espera..." />;
    if (visibles.length === 0) return <Vacio texto="No hay pacientes en la lista de espera." />;
    return (['urgencia', 'adelantar', 'sin_hora'] as TipoEspera[]).map(t => {
      const grupo = visibles.filter(e => e.tipo === t);
      if (grupo.length === 0) return null;
      return (
        <section key={t} className="space-y-2">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">{TIPOS[t].emoji} {TIPOS[t].label} ({grupo.length}) · <span className="normal-case font-bold tracking-normal">{TIPOS[t].ayuda}</span></h3>
          {grupo.map(e => {
            const desplegada = abierta === e.id;
            const opciones = desplegada ? ventanasDeEntrada(e, ventanas).slice(0, 8) : [];
            const tiene = yaTieneHora(e);
            return (
              <div key={e.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="p-4 flex flex-col gap-3">
                  {detallePaciente(e)}
                  <div className="flex flex-wrap gap-2">
                    {tiene ? (
                      <button disabled={ocupado === e.id} onClick={() => sacarYaAgendado(e, tiene)} className={`${boton} bg-emerald-500 text-white hover:bg-emerald-600`}><CalendarCheck size={13} /> Ya tiene hora: sacar</button>
                    ) : (
                      <button onClick={() => setAbierta(desplegada ? null : e.id)} className={`${boton} bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100`}><CalendarClock size={13} /> Horas que calzan {desplegada ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button>
                    )}
                    <button disabled={ocupado === e.id} onClick={() => enviarEnlace(e)} className={`${boton} bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50`}><Link2 size={13} /> Enlace</button>
                    <button onClick={() => agendar(e)} className={`${boton} bg-[#C9A24B] text-[#0A111F] hover:bg-[#B38D3A]`}><CalendarPlus size={13} /> Agendar</button>
                    {botonesRespuesta(e)}
                    <button onClick={() => editar(e)} className={`${boton} bg-white border border-slate-200 text-slate-500 hover:bg-slate-50`} title="Editar"><Pencil size={13} /></button>
                    <button disabled={ocupado === e.id} onClick={() => quitar(e, 'ya no necesita')} className={`${boton} bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50`} title="Sacar de la lista"><Trash2 size={13} /></button>
                  </div>
                </div>
                {desplegada && (
                  <div className="border-t border-slate-100 p-3 bg-slate-50/60 rounded-b-2xl">
                    {cargandoVentanas ? <Cargando texto="Buscando horas..." /> : opciones.length === 0 ? (
                      <p className="text-[11px] font-bold text-slate-400 text-center py-3">
                        Ninguna hora libre de {doctor === 'Todos' ? 'los próximos' : `${nombreDr(doctor)} en los próximos`} {DIAS_HORAS_LIBRES} días calza con este paciente.
                        {doctor !== 'Todos' && !e.profesional_id ? ' Prueba con "Todos los doctores".' : ''}
                      </p>
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-2">
                        {opciones.map(({ ventana: v, inicio }) => (
                          <div key={v.clave} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[12px] font-black text-slate-800">{capitalizar(fechaLarga(v.fecha, { weekday: 'short', day: 'numeric', month: 'short' }))} · {minsToT(inicio)}</p>
                              <p className="text-[10px] font-bold text-slate-400 truncate">{nombreDr(v.profesional_id)}{v.liberada ? ' · se liberó' : ''}</p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <button disabled={ocupado === e.id} onClick={() => ofrecerHora(e, v.fecha, inicio, v.profesional_id)} className={`${boton} bg-emerald-500 text-white hover:bg-emerald-600`} title="Ofrecer esta hora por WhatsApp"><MessageCircle size={13} /></button>
                              <button onClick={() => agendar(e, v.fecha, inicio, v.profesional_id)} className={`${boton} bg-[#C9A24B] text-[#0A111F] hover:bg-[#B38D3A]`} title="Agendar en esta hora"><CalendarPlus size={13} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      );
    });
  };

  // ── Pestaña: sugeridos ──
  const vistaSugeridos = () => {
    if (doctor === 'Todos') return <Vacio texto="Elige un doctor arriba para ver sus pacientes sugeridos." />;
    if (cargandoSugeridos || sugeridos === null) return <Cargando texto="Buscando pacientes del doctor sin hora..." />;
    if (sugeridos.length === 0) return <Vacio texto={`No hay pacientes de ${nombreDr(doctor)} sin hora para sugerir.`} />;
    return (
      <>
        <p className="text-[11px] font-bold text-slate-500">Pacientes de {nombreDr(doctor)} (últimos 90 días) que no tienen ninguna hora futura. Súmalos a la lista para ofrecerles las horas que se liberen.</p>
        {sugeridos.map(s => (
          <div key={s.paciente.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <Link prefetch={false} href={`/pacientes/${s.paciente.id}`} className="font-black text-sm text-slate-800 uppercase leading-none hover:text-[#8A6D2F]">{nombrePaciente(s.paciente)}</Link>
              <p className={`text-[11px] font-bold mt-1.5 ${s.motivo === 'pendiente' ? 'text-amber-700' : 'text-rose-600'}`}>{s.texto}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Última cita con el doctor: {s.ultima.split('-').reverse().join('-')}{s.paciente.telefono ? ` · Tel: ${s.paciente.telefono}` : ' · sin teléfono'}</p>
            </div>
            <button onClick={() => setForm(nuevoFormulario({ paciente: s.paciente, doctor: `doc:${doctor}`, motivo: s.motivoCita, duracion: s.duracion }))} className={`${boton} bg-[#0E1B2E] text-white hover:bg-[#1a2d47] shrink-0`}><UserPlus size={13} /> Agregar a la lista</button>
          </div>
        ))}
      </>
    );
  };

  const cuentaHoras = ventanasConCalces.filter(x => x.calces.length > 0).length;

  return (
    <ModalShell
      abierto={abierto}
      onClose={() => { if (form) setForm(null); else onClose(); }}
      posicion="arriba"
      ancho="max-w-5xl"
      icono={<Hourglass className="text-sky-300" size={24} />}
      colorIcono={{ bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.6)' }}
      colorSubtitulo="#7dd3fc"
      titulo="Lista de espera"
      subtitulo="Pacientes esperando que se libere una hora"
    >
      {form ? (
        <FormularioEspera
          form={form} setForm={setForm} profesionales={profesionales} especialidades={especialidades}
          guardando={ocupado === 'form'} onGuardar={guardarFormulario} onCancelar={() => setForm(null)}
        />
      ) : (
        <>
          <div className="px-4 md:px-8 pt-4 pb-3 border-b border-slate-100 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1 overflow-x-auto">
              {([['horas', `Horas libres${cuentaHoras ? ` (${cuentaHoras})` : ''}`], ['lista', `En espera (${visibles.length})`], ['sugeridos', 'Sugeridos']] as [Pestana, string][]).map(([p, t]) => (
                <button key={p} onClick={() => cambiarPestana(p)} className={`px-2.5 md:px-4 py-2 rounded-lg text-[10px] md:text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-colors ${pestana === p ? 'bg-white text-[#0E1B2E] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{t}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <select value={doctor} onChange={e => cambiarDoctor(e.target.value)} className="min-w-0 flex-1 md:flex-none md:w-60 text-base md:text-[11px] font-bold uppercase text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#C9A24B]">
                <option value="Todos">Todos los doctores</option>
                {profesionales.map(p => <option key={p.user_id} value={p.user_id}>Dr(a). {formatNombreDoctor(p.nombre, p.apellido)}</option>)}
              </select>
              <button onClick={() => { cargarEntradas(); cargarVentanas(doctor); if (pestana === 'sugeridos') cargarListaSugeridos(doctor); }} className="shrink-0 p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" title="Actualizar"><RefreshCw size={15} /></button>
              <button onClick={() => setForm(nuevoFormulario())} className={`${boton} bg-[#C9A24B] text-[#0A111F] hover:bg-[#B38D3A] py-2.5 whitespace-nowrap shrink-0`}><Plus size={14} strokeWidth={3} /> Agregar</button>
            </div>
          </div>
          {pestana === 'horas' && (
            <div className="px-4 md:px-8 py-2 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-slate-500 shrink-0">
              <span>Próximos {DIAS_HORAS_LIBRES} días · primero urgencias, después quienes adelantan su hora, y luego por antigüedad.</span>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={soloConPacientes} onChange={e => setSoloConPacientes(e.target.checked)} className="accent-[#C9A24B]" />
                Solo horas con pacientes que calzan
              </label>
            </div>
          )}
          <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-3">
            {pestana === 'horas' && vistaHoras()}
            {pestana === 'lista' && vistaLista()}
            {pestana === 'sugeridos' && vistaSugeridos()}
          </div>
        </>
      )}
    </ModalShell>
  );
}

function Cargando({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
      <Loader2 className="animate-spin text-[#C9A24B]" size={28} />
      <p className="text-[11px] font-black uppercase tracking-widest">{texto}</p>
    </div>
  );
}
function Vacio({ texto }: { texto: string }) {
  return <p className="text-center text-sm font-bold text-slate-400 py-12">{texto}</p>;
}

// ─────────────────────────────────────────────────────────────
// Formulario: agregar o editar un paciente de la lista
// ─────────────────────────────────────────────────────────────
function FormularioEspera({ form, setForm, profesionales, especialidades, guardando, onGuardar, onCancelar }: {
  form: Formulario; setForm: (f: Formulario | null) => void; profesionales: Profesional[]; especialidades: Record<string, string>;
  guardando: boolean; onGuardar: (f: Formulario) => void; onCancelar: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [citasPaciente, setCitasPaciente] = useState<any[] | null>(null);
  const seq = useRef(0); const timer = useRef<any>(null);
  const set = (cambios: Partial<Formulario>) => setForm({ ...form, ...cambios });

  useEffect(() => {
    if (!form.paciente?.id) { setCitasPaciente(null); return; }
    let activo = true;
    citasFuturasPaciente(form.paciente.id).then(c => { if (activo) setCitasPaciente(c); }).catch(() => { if (activo) setCitasPaciente([]); });
    return () => { activo = false; };
  }, [form.paciente?.id]);

  const buscar = (valor: string) => {
    setBusqueda(valor);
    if (timer.current) clearTimeout(timer.current);
    if (!valor.trim()) { seq.current++; setResultados([]); return; }
    timer.current = setTimeout(async () => {
      const n = ++seq.current;
      const palabras = valor.trim().split(/\s+/).map(limpiarParaFiltro).filter(Boolean);
      let q = supabase.from('pacientes').select('id, nombre, apellido, rut, telefono, activo');
      palabras.forEach(p => { const f = filtroPalabraPaciente(p, { subsecuencia: true }); if (f) q = q.or(f); });
      const { data } = await q.limit(8);
      if (n === seq.current) setResultados(data || []);
    }, 300);
  };

  const opcionesDoctor = [
    ...profesionales.map(p => ({ v: `doc:${p.user_id}`, t: `Dr(a). ${formatNombreDoctor(p.nombre, p.apellido)}` })),
    ...Object.entries(especialidades).map(([id, nombre]) => ({ v: `esp:${id}`, t: `Cualquier doctor de ${nombre}` })),
    { v: 'cualquiera', t: 'Cualquier doctor' },
  ];
  const etiqueta = 'text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block';

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="p-5 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-base text-[#0E1B2E]">{form.id ? 'Editar paciente en espera' : 'Agregar a la lista de espera'}</h3>
          <button onClick={onCancelar} className="p-2 rounded-full text-slate-400 hover:bg-slate-100" aria-label="Volver"><X size={18} /></button>
        </div>

        {/* Paciente */}
        <div>
          <span className={etiqueta}>Paciente</span>
          {form.paciente ? (
            <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <User size={16} className="text-[#C9A24B] shrink-0" />
                <div className="min-w-0">
                  <p className="font-black text-sm uppercase text-slate-800 truncate">{nombrePaciente(form.paciente)}</p>
                  <p className="text-[10px] font-bold text-slate-400">{form.paciente.rut || 'Sin RUT'} · {form.paciente.telefono || 'sin teléfono'}</p>
                </div>
              </div>
              {!form.id && <button onClick={() => set({ paciente: null, cita_actual_id: null })} className="text-[10px] font-black uppercase text-slate-500 hover:text-[#8A6D2F]">Cambiar</button>}
            </div>
          ) : (
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={busqueda} onChange={e => buscar(e.target.value)} placeholder="Buscar por nombre o RUT..." className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl text-base md:text-sm outline-none focus:border-[#C9A24B]" />
              {resultados.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {resultados.map(p => (
                    <button key={p.id} disabled={p.activo === false} onClick={() => { set({ paciente: p }); setResultados([]); setBusqueda(''); }} className="w-full text-left px-4 py-2.5 hover:bg-[#C9A24B]/10 disabled:opacity-40">
                      <span className="font-black text-xs uppercase text-slate-800">{nombrePaciente(p)}</span>
                      <span className="text-[10px] font-bold text-slate-400 ml-2">{p.rut || ''}{p.activo === false ? ' · inhabilitado' : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tipo */}
        <div>
          <span className={etiqueta}>Tipo de espera</span>
          <div className="grid sm:grid-cols-3 gap-2">
            {(Object.keys(TIPOS) as TipoEspera[]).map(t => (
              <button key={t} onClick={() => set({ tipo: t })} className={`text-left px-4 py-3 rounded-xl border transition-colors ${form.tipo === t ? 'border-[#0E1B2E] bg-[#0E1B2E] text-white' : 'border-slate-200 bg-white hover:border-[#C9A24B]'}`}>
                <p className="text-xs font-black">{TIPOS[t].emoji} {TIPOS[t].label}</p>
                <p className={`text-[10px] font-bold mt-0.5 ${form.tipo === t ? 'text-white/70' : 'text-slate-400'}`}>{TIPOS[t].ayuda}</p>
              </button>
            ))}
          </div>
          {form.tipo === 'adelantar' && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-2">¿Qué hora quiere adelantar?</p>
              {!form.paciente ? <p className="text-[11px] font-bold text-amber-700">Primero elige al paciente.</p>
                : citasPaciente === null ? <p className="text-[11px] font-bold text-amber-700">Cargando sus horas...</p>
                : citasPaciente.length === 0 ? <p className="text-[11px] font-bold text-amber-700">No tiene horas futuras: usa "Sin hora".</p>
                : (
                  <div className="space-y-1.5">
                    {citasPaciente.map(c => (
                      <label key={c.id} className="flex items-center gap-2 text-[12px] font-bold text-slate-700 cursor-pointer">
                        <input type="radio" name="cita_actual" checked={form.cita_actual_id === c.id} onChange={() => set({
                          cita_actual_id: c.id,
                          doctor: c.profesional_id ? `doc:${c.profesional_id}` : form.doctor,
                          motivo: form.motivo || c.motivo || '',
                          duracion: Math.max(15, Math.round((new Date(String(c.fin).replace(' ', 'T')).getTime() - new Date(String(c.inicio).replace(' ', 'T')).getTime()) / 60000)) || form.duracion,
                        })} className="accent-[#C9A24B]" />
                        {capitalizar(fechaLarga(fechaISODeStr(c.inicio), { weekday: 'long', day: 'numeric', month: 'short' }))} a las {horaDeStr(c.inicio)} · {nombreDoctorCompleto(profesionales, c.profesional_id)}{c.motivo ? ` · ${c.motivo}` : ''}
                      </label>
                    ))}
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Doctor, motivo, duración */}
        <div className="grid md:grid-cols-[1.2fr_1.5fr_0.6fr] gap-4">
          <label className="block">
            <span className={etiqueta}>Doctor</span>
            <select value={form.doctor} onChange={e => set({ doctor: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-3 text-base md:text-sm font-bold text-slate-700 outline-none focus:border-[#C9A24B] bg-white">
              {opcionesDoctor.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={etiqueta}>Qué necesita</span>
            <input value={form.motivo} onChange={e => set({ motivo: e.target.value })} placeholder="Ej: endodoncia, control, urgencia por dolor..." className="w-full border border-slate-200 rounded-xl px-3 py-3 text-base md:text-sm outline-none focus:border-[#C9A24B]" />
          </label>
          <label className="block">
            <span className={etiqueta}>Duración</span>
            <select value={form.duracion} onChange={e => set({ duracion: Number(e.target.value) })} className="w-full border border-slate-200 rounded-xl px-3 py-3 text-base md:text-sm font-bold text-slate-700 outline-none focus:border-[#C9A24B] bg-white">
              {DURACIONES_DISPONIBLES.map(d => <option key={d} value={d}>{d} min</option>)}
            </select>
          </label>
        </div>

        {/* Disponibilidad */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <span className={etiqueta}>Días que puede venir</span>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_SEMANA.map(d => (
                <button key={d.n} title={d.largo} onClick={() => set({ dias: form.dias.includes(d.n) ? form.dias.filter(x => x !== d.n) : [...form.dias, d.n] })} className={`w-10 ${chip(form.dias.includes(d.n))}`}>{d.corto}</button>
              ))}
              <button onClick={() => set({ dias: [1, 2, 3, 4, 5, 6] })} className="px-2 text-[10px] font-black uppercase text-slate-400 hover:text-[#8A6D2F]">Todos</button>
            </div>
          </div>
          <div>
            <span className={etiqueta}>Horario</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FRANJAS) as Franja[]).map(f => (
                <button key={f} onClick={() => set({ franja: f })} className={chip(form.franja === f)}>{FRANJAS[f]}</button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none bg-emerald-50/60 border border-emerald-100 rounded-xl px-4 py-3">
          <input type="checkbox" checked={form.aviso_corto} onChange={e => set({ aviso_corto: e.target.checked })} className="mt-0.5 accent-emerald-600" />
          <span>
            <span className="block text-xs font-black text-slate-700">Puede venir con poco aviso</span>
            <span className="block text-[10px] font-bold text-slate-500">Se le pueden ofrecer horas para hoy o mañana. Si no se marca, solo horas con más de 24 horas de anticipación.</span>
          </span>
        </label>

        <label className="block">
          <span className={etiqueta}>Nota (opcional)</span>
          <textarea value={form.nota} onChange={e => set({ nota: e.target.value })} rows={2} placeholder="Ej: prefiere que la llamen después de las 18:00" className="w-full border border-slate-200 rounded-xl px-3 py-3 text-base md:text-sm outline-none focus:border-[#C9A24B] resize-none" />
        </label>
      </div>
      <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 md:px-8 py-4 flex justify-end gap-2">
        <button onClick={onCancelar} className={`${boton} bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 px-5 py-3`}>Cancelar</button>
        <button disabled={guardando} onClick={() => onGuardar(form)} className={`${boton} bg-[#C9A24B] text-[#0A111F] hover:bg-[#B38D3A] px-6 py-3`}>
          {guardando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {form.id ? 'Guardar cambios' : 'Agregar a la lista'}
        </button>
      </div>
    </div>
  );
}

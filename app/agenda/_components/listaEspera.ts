// Lista de espera: pacientes que esperan que se libere una hora con un doctor.
// Datos (tabla lista_espera), horas libres por doctor, qué pacientes calzan con cada hora,
// pacientes sugeridos y mensajes de WhatsApp para ofrecerles la hora.
import { supabase } from '@/lib/supabase'
import { variarMensaje } from '@/lib/mensajes'
import { obtenerContinuidad } from './data'
import {
  capitalizar, esWebPendiente, fechaISODeStr, fechaLarga, getLocalDateISO, getMinsFromDateStr, horaDeStr, minsToT,
  nombreDoctorCompleto, tToMins, URL_AGENDAR_ONLINE,
} from './utils'
import type { Profesional } from './types'

export type TipoEspera = 'urgencia' | 'adelantar' | 'sin_hora';
export type Franja = 'cualquiera' | 'manana' | 'tarde';
export type EstadoEspera = 'esperando' | 'ofrecido' | 'agendado' | 'retirado';

export interface EntradaEspera {
  id: string;
  paciente_id: string;
  profesional_id: string | null;
  especialidad_id: string | null;
  motivo: string;
  duracion: number;
  tipo: TipoEspera;
  dias: number[];
  franja: Franja;
  aviso_corto: boolean;
  cita_actual_id: string | null;
  estado: EstadoEspera;
  ultimo_resultado: 'no_contesta' | 'no_quiso' | null;
  ofrecido_inicio: string | null;
  ofrecido_profesional_id: string | null;
  ofrecido_por_enlace: boolean;
  ofrecido_at: string | null;
  ofrecimientos: number;
  cita_agendada_id: string | null;
  nota: string | null;
  created_at: string;
  pacientes?: any;
  cita_actual?: any;
}

export type NuevaEntrada = Pick<EntradaEspera, 'paciente_id' | 'profesional_id' | 'especialidad_id' | 'motivo' | 'duracion' | 'tipo' | 'dias' | 'franja' | 'aviso_corto' | 'cita_actual_id' | 'nota'>;

// Orden de prioridad: primero urgencias, después quienes quieren adelantar su hora y al final quienes no tienen hora
export const TIPOS: Record<TipoEspera, { label: string; corto: string; prioridad: number; clases: string; emoji: string; ayuda: string }> = {
  urgencia: { label: 'Urgencia', corto: 'Urgencia', prioridad: 0, emoji: '🔴', clases: 'bg-red-50 text-red-700 border-red-200', ayuda: 'Dolor o algo que no puede esperar' },
  adelantar: { label: 'Adelantar su hora', corto: 'Adelantar', prioridad: 1, emoji: '🟡', clases: 'bg-amber-50 text-amber-700 border-amber-200', ayuda: 'Ya tiene hora, pero para muy adelante' },
  sin_hora: { label: 'Sin hora', corto: 'Sin hora', prioridad: 2, emoji: '⚪', clases: 'bg-slate-50 text-slate-600 border-slate-200', ayuda: 'No había cupo con el doctor' },
};
export const FRANJAS: Record<Franja, string> = { cualquiera: 'Cualquier horario', manana: 'Mañana (antes de 13:00)', tarde: 'Tarde (desde 13:00)' };
export const DIAS_SEMANA = [
  { n: 1, corto: 'L', largo: 'Lunes' }, { n: 2, corto: 'M', largo: 'Martes' }, { n: 3, corto: 'X', largo: 'Miércoles' },
  { n: 4, corto: 'J', largo: 'Jueves' }, { n: 5, corto: 'V', largo: 'Viernes' }, { n: 6, corto: 'S', largo: 'Sábado' },
];
const MEDIODIA = 13 * 60;
const HORAS_POCO_AVISO = 24;          // una hora que empieza antes de esto es "con poco aviso"
const MIN_VENTANA = 15;               // huecos más cortos no se muestran
export const DIAS_HORAS_LIBRES = 14;  // cuántos días hacia adelante se buscan horas libres
const DIAS_SUGERIDOS = 90;            // pacientes sugeridos: atendidos o con hora en los últimos N días
export const ESTADOS_ACTIVOS: EstadoEspera[] = ['esperando', 'ofrecido'];

const SELECT_ENTRADA = '*, pacientes(id, nombre, apellido, telefono, rut, activo), cita_actual:citas!lista_espera_cita_actual_id_fkey(id, inicio, fin, profesional_id, estado, motivo)';

// ─────────────────────────────────────────────────────────────
// Tabla lista_espera
// ─────────────────────────────────────────────────────────────
export async function cargarListaEspera(): Promise<EntradaEspera[]> {
  const { data, error } = await supabase.from('lista_espera').select(SELECT_ENTRADA)
    .in('estado', ESTADOS_ACTIVOS).order('created_at', { ascending: true }).range(0, 1999);
  if (error) throw error;
  return ordenarPorPrioridad((data || []) as EntradaEspera[]);
}

export async function contarListaEspera(profesionalId?: string | null): Promise<number> {
  let q = supabase.from('lista_espera').select('id', { count: 'exact', head: true }).in('estado', ESTADOS_ACTIVOS);
  if (profesionalId) q = q.or(`profesional_id.eq.${profesionalId},profesional_id.is.null`);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

export async function agregarAListaEspera(e: NuevaEntrada): Promise<EntradaEspera> {
  const { data, error } = await supabase.from('lista_espera').insert([{ ...e, estado: 'esperando' }]).select(SELECT_ENTRADA).single();
  if (error) throw error;
  return data as EntradaEspera;
}

export async function actualizarEntrada(id: string, cambios: Partial<EntradaEspera>): Promise<EntradaEspera> {
  const { pacientes, cita_actual, ...limpio } = cambios as any;
  const { data, error } = await supabase.from('lista_espera').update(limpio).eq('id', id).select(SELECT_ENTRADA).single();
  if (error) throw error;
  return data as EntradaEspera;
}

export const registrarOferta = (e: EntradaEspera, oferta: { inicio: string | null; profesionalId: string | null; porEnlace: boolean }) =>
  actualizarEntrada(e.id, {
    estado: 'ofrecido', ultimo_resultado: null, ofrecido_inicio: oferta.inicio, ofrecido_profesional_id: oferta.profesionalId,
    ofrecido_por_enlace: oferta.porEnlace, ofrecido_at: new Date().toISOString(), ofrecimientos: (e.ofrecimientos || 0) + 1,
  });

export const registrarRespuesta = (e: EntradaEspera, resultado: 'no_contesta' | 'no_quiso') =>
  actualizarEntrada(e.id, { estado: 'esperando', ultimo_resultado: resultado });

export const marcarAgendado = (id: string, citaId: string | null) =>
  actualizarEntrada(id, { estado: 'agendado', cita_agendada_id: citaId });

export const retirarDeLista = (id: string) => actualizarEntrada(id, { estado: 'retirado' });

// Citas futuras del paciente (para elegir cuál quiere adelantar)
export async function citasFuturasPaciente(pacienteId: string): Promise<any[]> {
  const { data, error } = await supabase.from('citas').select('id, inicio, fin, profesional_id, estado, motivo')
    .eq('paciente_id', pacienteId).gte('inicio', `${getLocalDateISO(new Date())}T00:00:00`)
    .not('estado', 'in', '(cancelada,no_asiste,atendido)').order('inicio', { ascending: true }).limit(10);
  if (error) throw error;
  return data || [];
}

// ─────────────────────────────────────────────────────────────
// Prioridad y descripción
// ─────────────────────────────────────────────────────────────
export const ordenarPorPrioridad = <T extends EntradaEspera>(xs: T[]) =>
  [...xs].sort((a, b) => (TIPOS[a.tipo]?.prioridad ?? 9) - (TIPOS[b.tipo]?.prioridad ?? 9) || a.created_at.localeCompare(b.created_at));

export const diasEsperando = (e: EntradaEspera) => Math.max(0, Math.floor((Date.now() - new Date(e.created_at).getTime()) / 86_400_000));

export const textoDias = (dias: number[]) => {
  const ds = [...(dias || [])].sort();
  if (ds.length === 0 || ds.length === 6) return 'Cualquier día';
  if (ds.join(',') === '1,2,3,4,5') return 'Lunes a viernes';
  return ds.map(n => DIAS_SEMANA.find(d => d.n === n)?.largo.slice(0, 3)).join(', ');
};

export const textoDoctorEntrada = (e: Pick<EntradaEspera, 'profesional_id' | 'especialidad_id'>, profesionales: Profesional[], especialidades: Record<string, string>) => {
  if (e.profesional_id) return nombreDoctorCompleto(profesionales, e.profesional_id);
  if (e.especialidad_id) return `Cualquier doctor de ${especialidades[e.especialidad_id] || 'la especialidad'}`;
  return 'Cualquier doctor';
};

// La oferta ya no corre si la hora ofrecida pasó (o si se envió el enlace hace más de 7 días)
export const ofertaVigente = (e: EntradaEspera) => {
  if (e.estado !== 'ofrecido') return false;
  if (e.ofrecido_inicio) return e.ofrecido_inicio.replace(' ', 'T').slice(0, 19) > horaLocalISO();
  return !!e.ofrecido_at && Date.now() - new Date(e.ofrecido_at).getTime() < 7 * 86_400_000;
};

const horaLocalISO = () => { const d = new Date(); return `${getLocalDateISO(d)}T${minsToT(d.getHours() * 60 + d.getMinutes())}:00`; };

// ─────────────────────────────────────────────────────────────
// Horas libres (huecos) por doctor
// Mismas reglas que "Buscar hora": horario del doctor, bloqueos y citas no anuladas (las web pendientes no ocupan)
// ─────────────────────────────────────────────────────────────
export interface VentanaLibre {
  clave: string;
  fecha: string;          // YYYY-MM-DD
  inicio: number;         // minutos desde las 00:00
  fin: number;
  profesional_id: string; // user_id
  especialidad_id: string | null;
  liberada: boolean;      // coincide con una cita anulada (se liberó)
}

export async function buscarVentanasLibres(pros: Profesional[], dias = DIAS_HORAS_LIBRES): Promise<VentanaLibre[]> {
  pros = pros.filter(p => p.user_id);
  if (pros.length === 0) return [];
  const userIds = pros.map(p => p.user_id);
  const proIds = pros.map(p => p.id);
  const hoy = new Date();
  const desdeISO = getLocalDateISO(hoy);
  const hastaD = new Date(hoy); hastaD.setDate(hastaD.getDate() + dias - 1);
  const hastaISO = getLocalDateISO(hastaD);

  const citasPaginadas = async () => {
    const filas: any[] = [];
    for (let d = 0; ; d += 1000) {
      const { data, error } = await supabase.from('citas').select('id, profesional_id, inicio, fin, estado, estado_confirmacion, motivo')
        .in('profesional_id', userIds).gte('inicio', `${desdeISO}T00:00:00`).lte('inicio', `${hastaISO}T23:59:59`)
        .order('id').range(d, d + 999);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return filas;
  };
  const [dispoRes, bloqRes, citas] = await Promise.all([
    supabase.from('disponibilidad_profesional').select('*').in('profesional_id', userIds),
    supabase.from('bloqueos_agenda').select('profesional_id, fecha, hora_inicio, hora_fin').in('profesional_id', proIds).gte('fecha', desdeISO).lte('fecha', hastaISO),
    citasPaginadas(),
  ]);
  if (dispoRes.error) throw dispoRes.error;
  if (bloqRes.error) throw bloqRes.error;
  const ocupan = citas.filter((c: any) => c.estado !== 'cancelada' && !esWebPendiente(c));
  const anuladas = citas.filter((c: any) => c.estado === 'cancelada');
  const minAhora = Math.ceil((hoy.getHours() * 60 + hoy.getMinutes() + 1) / 15) * 15;

  const ventanas: VentanaLibre[] = [];
  for (let i = 0; i < dias; i++) {
    const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
    const fechaISO = getLocalDateISO(dia);
    for (const pro of pros) {
      const dispPro = (dispoRes.data || []).filter((x: any) => x.profesional_id === pro.user_id);
      const especiales = dispPro.filter((x: any) => x.fecha_especifica === fechaISO);
      const bloques = (especiales.length > 0 ? especiales : dispPro.filter((x: any) => x.dia_semana === dia.getDay() && !x.fecha_especifica))
        .map((b: any) => ({ i: tToMins(b.hora_inicio.substring(0, 5)), f: tToMins(b.hora_fin.substring(0, 5)) }))
        .sort((a: any, b: any) => a.i - b.i);
      if (bloques.length === 0) continue;
      const bloqDia = (bloqRes.data || []).filter((b: any) => b.profesional_id === pro.id && b.fecha === fechaISO);
      if (bloqDia.some((b: any) => !b.hora_inicio || !b.hora_fin)) continue; // día bloqueado completo
      const ocupado = [
        ...ocupan.filter((c: any) => c.profesional_id === pro.user_id && fechaISODeStr(c.inicio) === fechaISO)
          .map((c: any) => ({ i: getMinsFromDateStr(c.inicio), f: getMinsFromDateStr(c.fin) })),
        ...bloqDia.map((b: any) => ({ i: tToMins(b.hora_inicio.substring(0, 5)), f: tToMins(b.hora_fin.substring(0, 5)) })),
      ].sort((a, b) => a.i - b.i);
      const anuladasDia = anuladas.filter((c: any) => c.profesional_id === pro.user_id && fechaISODeStr(c.inicio) === fechaISO)
        .map((c: any) => ({ i: getMinsFromDateStr(c.inicio), f: getMinsFromDateStr(c.fin) }));
      const minimo = i === 0 ? minAhora : 0;

      for (const b of bloques) {
        let cursor = Math.max(b.i, minimo);
        const cortar = (fin: number) => {
          if (fin - cursor >= MIN_VENTANA) {
            const liberada = anuladasDia.some(a => a.i < fin && a.f > cursor);
            ventanas.push({ clave: `${pro.user_id}|${fechaISO}|${cursor}`, fecha: fechaISO, inicio: cursor, fin, profesional_id: pro.user_id, especialidad_id: pro.especialidad_id || null, liberada });
          }
        };
        for (const o of ocupado) {
          if (o.f <= cursor || o.i >= b.f) continue;
          if (o.i > cursor) cortar(Math.min(o.i, b.f));
          cursor = Math.max(cursor, o.f);
          if (cursor >= b.f) break;
        }
        if (cursor < b.f) cortar(b.f);
      }
    }
  }
  return ventanas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.inicio - b.inicio);
}

// ─────────────────────────────────────────────────────────────
// ¿Este paciente calza con esta hora libre?
// ─────────────────────────────────────────────────────────────
export interface Calce { entrada: EntradaEspera; inicio: number }

const diaSemana = (fechaISO: string) => { const [y, m, d] = fechaISO.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };

export const doctorCalza = (e: EntradaEspera, profesionalId: string, especialidadId: string | null) =>
  e.profesional_id ? e.profesional_id === profesionalId : (!e.especialidad_id || e.especialidad_id === especialidadId);

// Devuelve la hora en que podría empezar (en minutos) o null si no calza
export function horaQueCalza(e: EntradaEspera, v: VentanaLibre): number | null {
  if (!doctorCalza(e, v.profesional_id, v.especialidad_id)) return null;
  const ds = e.dias?.length ? e.dias : [1, 2, 3, 4, 5, 6];
  if (!ds.includes(diaSemana(v.fecha))) return null;
  let inicio = v.inicio;
  if (e.franja === 'manana' && inicio >= MEDIODIA) return null;
  if (e.franja === 'tarde') inicio = Math.max(inicio, MEDIODIA);
  if (inicio + (e.duracion || 30) > v.fin) return null;
  const empieza = new Date(`${v.fecha}T${minsToT(inicio)}:00`).getTime();
  if (!e.aviso_corto && empieza - Date.now() < HORAS_POCO_AVISO * 3_600_000) return null;
  // Adelantar: solo sirve una hora anterior a la que ya tiene
  if (e.tipo === 'adelantar' && e.cita_actual?.inicio && `${v.fecha}T${minsToT(inicio)}` >= String(e.cita_actual.inicio).replace(' ', 'T').slice(0, 16)) return null;
  return inicio;
}

export const calcesDeVentana = (v: VentanaLibre, entradas: EntradaEspera[]): Calce[] =>
  ordenarPorPrioridad(entradas).flatMap(e => { const h = horaQueCalza(e, v); return h === null ? [] : [{ entrada: e, inicio: h }]; });

export const ventanasDeEntrada = (e: EntradaEspera, ventanas: VentanaLibre[]) =>
  ventanas.flatMap(v => { const h = horaQueCalza(e, v); return h === null ? [] : [{ ventana: v, inicio: h }]; });

// ─────────────────────────────────────────────────────────────
// Sugeridos: pacientes del doctor sin hora futura, con tratamiento pendiente o que anularon / faltaron
// ─────────────────────────────────────────────────────────────
export interface Sugerido {
  paciente: any;
  motivo: 'pendiente' | 'anulo' | 'no_asistio';
  texto: string;
  motivoCita: string;
  duracion: number;
  ultima: string;          // fecha de su última cita con el doctor
}

export async function cargarSugeridos(profesionalId: string, excluirPacientes: Set<string>): Promise<Sugerido[]> {
  const hoyISO = getLocalDateISO(new Date());
  const desde = new Date(); desde.setDate(desde.getDate() - DIAS_SUGERIDOS);
  const filas: any[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await supabase.from('citas').select('paciente_id, inicio, fin, estado, motivo')
      .eq('profesional_id', profesionalId).gte('inicio', `${getLocalDateISO(desde)}T00:00:00`).lte('inicio', `${hoyISO}T23:59:59`)
      .not('paciente_id', 'is', null).order('inicio', { ascending: false }).range(d, d + 999);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  // Última cita de cada paciente con este doctor
  const ultima = new Map<string, any>();
  filas.forEach(c => { if (!ultima.has(c.paciente_id)) ultima.set(c.paciente_id, c); });
  const ids = [...ultima.keys()].filter(id => !excluirPacientes.has(id));
  if (ids.length === 0) return [];

  const continuidad = await obtenerContinuidad(ids, hoyISO);
  const candidatos = ids.filter(id => (continuidad[id]?.futuras.length ?? 1) === 0);
  if (candidatos.length === 0) return [];

  const pacientes: Record<string, any> = {};
  for (let i = 0; i < candidatos.length; i += 150) {
    const { data, error } = await supabase.from('pacientes').select('id, nombre, apellido, telefono, rut, activo').in('id', candidatos.slice(i, i + 150));
    if (error) throw error;
    (data || []).forEach(p => { pacientes[p.id] = p; });
  }

  const out: Sugerido[] = [];
  for (const id of candidatos) {
    const p = pacientes[id];
    if (!p || p.activo === false) continue;
    const c = ultima.get(id); const cont = continuidad[id];
    const dur = Math.round((new Date(String(c.fin).replace(' ', 'T')).getTime() - new Date(String(c.inicio).replace(' ', 'T')).getTime()) / 60000);
    const duracion = dur >= 15 && dur <= 300 ? dur : 30;
    const fecha = fechaISODeStr(c.inicio);
    const fechaCorta = fecha.split('-').reverse().slice(0, 2).join('-');
    const delDoctor = !cont.doctorId || cont.doctorId === profesionalId;
    if (cont.pendientes > 0 && delDoctor) {
      out.push({ paciente: p, motivo: 'pendiente', duracion, ultima: fecha,
        texto: `${cont.pendientes} ${cont.pendientes === 1 ? 'prestación pendiente' : 'prestaciones pendientes'}${cont.tratamiento ? ` · ${cont.tratamiento}` : ''}`,
        motivoCita: (cont.proxima || c.motivo || 'Continuar tratamiento').toUpperCase() });
    } else if (c.estado === 'cancelada' || c.estado === 'no_asiste') {
      out.push({ paciente: p, motivo: c.estado === 'cancelada' ? 'anulo' : 'no_asistio', duracion, ultima: fecha,
        texto: `${c.estado === 'cancelada' ? 'Anuló' : 'No asistió a'} su hora del ${fechaCorta} y no tiene otra`,
        motivoCita: (c.motivo || 'REAGENDAMIENTO').toUpperCase() });
    }
  }
  const orden = { pendiente: 0, anulo: 1, no_asistio: 2 };
  return out.sort((a, b) => orden[a.motivo] - orden[b.motivo] || b.ultima.localeCompare(a.ultima));
}

// ─────────────────────────────────────────────────────────────
// Mensajes de WhatsApp
// ─────────────────────────────────────────────────────────────
const cuandoTexto = (fechaISO: string, hora: string) => {
  const hoy = getLocalDateISO(new Date());
  const m = new Date(); m.setDate(m.getDate() + 1);
  const dia = fechaISO === hoy ? 'hoy' : fechaISO === getLocalDateISO(m) ? `mañana ${fechaLarga(fechaISO)}` : `el ${fechaLarga(fechaISO)}`;
  return `${dia} a las ${hora} hrs`;
};

export function mensajeOfertaHora(e: EntradaEspera, fechaISO: string, hora: string, profesionalId: string, profesionales: Profesional[]) {
  const nombre = e.pacientes?.nombre || '';
  const doctor = nombreDoctorCompleto(profesionales, profesionalId);
  const actual = e.tipo === 'adelantar' && e.cita_actual?.inicio
    ? ` Vimos que tienes hora para el ${fechaLarga(fechaISODeStr(e.cita_actual.inicio))} y quizás te sirva adelantarla.`
    : '';
  return variarMensaje(`Hola ${nombre}, te escribimos de Clínica Dignidad. Se liberó una hora con el/la ${doctor} ${cuandoTexto(fechaISO, hora)}.${actual}\n\n¿Te acomoda? Respóndenos este mensaje y te la reservamos. Las horas que se liberan se asignan a quien confirma primero.\n\n¡Saludos! 🦷`);
}

export function mensajeOfertaEnlace(e: EntradaEspera, enlace: string, profesionales: Profesional[], esReagendar: boolean) {
  const nombre = e.pacientes?.nombre || '';
  const doctorId = e.profesional_id || e.cita_actual?.profesional_id || null;
  const doctor = doctorId ? `el/la ${nombreDoctorCompleto(profesionales, doctorId)}` : 'nuestros especialistas';
  const cuerpo = esReagendar
    ? `Se liberaron horas con ${doctor} antes de tu cita del ${fechaLarga(fechaISODeStr(e.cita_actual.inicio))}. Si quieres adelantarla, puedes elegir tu nueva hora en este enlace (dura 7 días):\n${enlace}`
    : `Se liberaron horas con ${doctor}. Puedes reservar la que más te acomode en nuestra agenda online${doctorId ? ` (elige a ${nombreDoctorCompleto(profesionales, doctorId)})` : ''}:\n${enlace}`;
  return variarMensaje(`Hola ${nombre}, te escribimos de Clínica Dignidad. ${cuerpo}\n\nSi ningún horario te acomoda, respóndenos por aquí y te ayudamos.\n\n¡Saludos! 🦷`);
}

// Enlace que corresponde: el de reagendar si quiere adelantar una hora que ya tiene; si no, la agenda online
export const enlaceUsaReagendar = (e: EntradaEspera) => e.tipo === 'adelantar' && !!e.cita_actual_id && !!e.cita_actual?.inicio;
export { URL_AGENDAR_ONLINE };

export const etiquetaVentana = (v: Pick<VentanaLibre, 'fecha' | 'inicio' | 'fin'>) =>
  `${capitalizar(fechaLarga(v.fecha, { weekday: 'long', day: 'numeric', month: 'short' }))} · ${minsToT(v.inicio)} – ${minsToT(v.fin)}`;

export const horaDeOferta = (e: EntradaEspera) => e.ofrecido_inicio
  ? `${capitalizar(fechaLarga(fechaISODeStr(e.ofrecido_inicio), { weekday: 'short', day: 'numeric', month: 'short' }))} ${horaDeStr(e.ofrecido_inicio)}`
  : null;

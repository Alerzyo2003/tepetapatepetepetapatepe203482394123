// Utilidades y constantes compartidas por la agenda (sin acceso a la base de datos)
import { Clock, Phone, Timer, Activity, CheckCircle2, Ban, Trash2, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { Profesional } from './types'

// ─────────────────────────────────────────────────────────────
// Colores de marca
// ─────────────────────────────────────────────────────────────
export const GOLD = '#C9A24B';
export const NAVY = '#0E1B2E';
export const GOLD_LIGHT = '#E8CD8A';

// ─────────────────────────────────────────────────────────────
// Estados de cita
// ─────────────────────────────────────────────────────────────
export const ESTADOS_CITA: Record<string, { label: string, bg: string, border: string, text: string, dot: string, circleText: string, icon: any }> = {
  programada: { label: 'No Conf.', bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-700', dot: 'bg-slate-400', circleText: 'text-slate-600', icon: <Clock size={14}/> },
  confirmado_tel: { label: 'Confirmado', bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-white', dot: 'bg-white', circleText: 'text-blue-600', icon: <Phone size={14}/> },
  en_espera: { label: 'En Espera', bg: 'bg-amber-400', border: 'border-amber-500', text: 'text-amber-950', dot: 'bg-amber-900', circleText: 'text-amber-600', icon: <Timer size={14}/> },
  atendiendose: { label: 'En Box', bg: 'bg-fuchsia-500', border: 'border-fuchsia-600', text: 'text-white', dot: 'bg-white', circleText: 'text-fuchsia-600', icon: <Activity size={14}/> },
  atendido: { label: 'Atendido', bg: 'bg-emerald-400', border: 'border-emerald-500', text: 'text-emerald-950', dot: 'bg-emerald-900', circleText: 'text-emerald-600', icon: <CheckCircle2 size={14}/> },
  no_asiste: { label: 'No Asistió', bg: 'bg-rose-500', border: 'border-rose-600', text: 'text-white', dot: 'bg-white', circleText: 'text-rose-600', icon: <Ban size={14}/> },
  cancelada: { label: 'Anulada', bg: 'bg-neutral-300', border: 'border-neutral-400', text: 'text-neutral-700', dot: 'bg-neutral-500', circleText: 'text-neutral-600', icon: <Trash2 size={14}/> },
  reprogramada: { label: 'Reprogramada', bg: 'bg-violet-500', border: 'border-violet-600', text: 'text-white', dot: 'bg-white', circleText: 'text-violet-600', icon: <RefreshCcw size={14}/> }
};

export const SLOTS_HORARIOS = Array.from({ length: (21 - 8) * 4 + 1 }, (_, i) => {
  const m = 8 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}); // 08:00 → 21:00 cada 15 min

export const DURACIONES_DISPONIBLES = [15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300];

export const DIRECCION_CLINICA = 'Av. Venancia Leiva 1871, La Pintana';
export const URL_CONFIRMAR = 'https://confirmar-cita-dignidad.vercel.app/confirmar';
export const URL_AGENDAR_ONLINE = 'https://confirmar-cita-dignidad.vercel.app/agendar';
export const URL_RESENA_GOOGLE = 'https://g.page/r/CTmbdo9C4oVGEBM/review';

// ─────────────────────────────────────────────────────────────
// Fechas y horas
// Las columnas inicio/fin/hora_llegada son "timestamp without time zone" (hora local de la clínica),
// por eso se trabajan como texto y no dependen de la zona horaria del navegador.
// ─────────────────────────────────────────────────────────────
export const getLocalDateISO = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
export const getDiasLunesSabado = (d: Date) => {
  const curr = new Date(d); const day = curr.getDay();
  const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
  return Array.from({ length: 6 }, (_, i) => new Date(curr.getFullYear(), curr.getMonth(), diff + i));
};
export const getLunes = (d: Date) => { const date = new Date(d); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); date.setHours(0, 0, 0, 0); return date; };
export const tToMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const minsToT = (m: number) => `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
export const getMinsFromDateStr = (dt: string) => { const timePart = dt.includes('T') ? dt.split('T')[1] : dt.split(' ')[1]; return tToMins(timePart.substring(0, 5)); };
export const horaDeStr = (dt?: string | null) => {
  if (!dt) return '';
  const t = dt.replace(' ', 'T').split('T')[1] || '';
  return t.substring(0, 5);
};
export const fechaISODeStr = (dt: string) => dt.replace(' ', 'T').split('T')[0];
export const fechaLocalDeStr = (dt: string) => new Date(fechaISODeStr(dt) + 'T00:00:00');
export const fechaLarga = (iso: string, opciones: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', opciones).replace(',', '');
export const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const duracionMinutos = (cita: any) =>
  Math.round((new Date(cita.fin.replace(' ', 'T')).getTime() - new Date(cita.inicio.replace(' ', 'T')).getTime()) / 60000);

// Próximo día hábil (la clínica atiende de lunes a sábado: si mañana es domingo, salta al lunes)
export const siguienteDiaHabil = () => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return getLocalDateISO(d);
};

// ─────────────────────────────────────────────────────────────
// Nombres y avatares
// ─────────────────────────────────────────────────────────────
export const getInitials = (n: string, a: string) => `${n?.charAt(0) || ''}${a?.charAt(0) || ''}`.toUpperCase();
export const nombrePaciente = (p: any) => `${p?.nombre || ''} ${p?.apellido || ''}`.trim();

export const formatNombreDoctor = (nombre: string = '', apellido: string = '') => {
  if (!nombre && !apellido) return 'S/A';
  const primerNombre = nombre.trim().split(' ')[0] || '';
  const dosApellidos = apellido.trim().split(' ').slice(-2).join(' ');
  return `${primerNombre} ${dosApellidos}`.trim();
};
export const buscarDoctor = (profesionales: Profesional[], userId?: string | null) => profesionales.find(p => p.user_id === userId);
export const nombreDoctorCompleto = (profesionales: Profesional[], userId?: string | null) => {
  const d = buscarDoctor(profesionales, userId);
  return d ? `Dr(a). ${d.nombre} ${d.apellido}` : 'nuestro especialista';
};

export const getAvatarColorClass = (name: string) => {
  const styles = [{ bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-500' }, { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-500' }, { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-500' }, { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-500' }, { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-500' }];
  let hash = 0; for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return styles[Math.abs(hash) % styles.length];
};

// ─────────────────────────────────────────────────────────────
// WhatsApp
// ─────────────────────────────────────────────────────────────
// Normaliza teléfonos chilenos (9 dígitos → 56XXXXXXXXX; 8 dígitos antiguos → 569XXXXXXXX)
export const telefonoWA = (tel?: string | null): string | null => {
  if (!tel) return null;
  const n = String(tel).replace(/\D/g, '');
  if (!n) return null;
  if (n.length === 9) return `56${n}`;
  if (n.length === 8) return `569${n}`;
  return n;
};
export const abrirWhatsApp = (tel: string | null | undefined, mensaje?: string) => {
  const num = telefonoWA(tel);
  if (!num) { toast.error('El paciente no tiene un teléfono válido registrado'); return false; }
  window.open(mensaje ? `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}` : `https://wa.me/${num}`, '_blank');
  return true;
};
// Formato para guardar en la ficha: +56XXXXXXXXX
export const formatearTelefonoParaGuardar = (tel: string) => {
  const t = tel.trim();
  if (!t) return null;
  const n = t.replace(/\D/g, '');
  if (n.length === 9) return `+56${n}`;
  if (n.length === 11 && n.startsWith('56')) return `+${n}`;
  return t;
};

// Mensaje de recordatorio. Si el paciente tiene varias citas el mismo día, van en un solo mensaje.
export const construirMensajeRecordatorio = (citasPac: any[], profesionales: Profesional[]) => {
  const c0 = citasPac[0];
  const fechaISO = fechaISODeStr(c0.inicio);
  const manana = new Date(); manana.setDate(manana.getDate() + 1);
  const fl = fechaLarga(fechaISO);
  const cuando = fechaISO === getLocalDateISO(new Date())
    ? `HOY ${fl}`
    : fechaISO === getLocalDateISO(manana) ? `MAÑANA ${fl}` : `el día ${capitalizar(fl)}`;

  let m = `Hola ${nombrePaciente(c0.pacientes)}, te escribimos de Clínica Dignidad para recordar `;
  if (citasPac.length === 1) {
    m += `tu cita con el/la ${nombreDoctorCompleto(profesionales, c0.profesional_id)} ${cuando} a las ${horaDeStr(c0.inicio)} hrs.\n\n`;
  } else {
    m += `tus citas de ${cuando}:\n`;
    citasPac.forEach(c => { m += `🕒 ${horaDeStr(c.inicio)} hrs con el/la ${nombreDoctorCompleto(profesionales, c.profesional_id)}\n`; });
    m += `\n`;
  }
  m += `📍 Dirección: ${DIRECCION_CLINICA}.\n\n`;
  m += `⚠️ Importante: Debido a la alta demanda de horas, si tu cita no es confirmada el bloque será asignado a otro paciente.\n\n`;
  if (citasPac.length === 1) {
    m += `Por favor confirma tu asistencia en el siguiente enlace:\n${URL_CONFIRMAR}/${c0.id}`;
  } else {
    m += `Por favor confirma tu asistencia en estos enlaces:\n`;
    citasPac.forEach(c => { m += `${horaDeStr(c.inicio)} hrs: ${URL_CONFIRMAR}/${c.id}\n`; });
  }
  return m;
};

export const construirMensajeInasistencia = (cita: any, profesionales: Profesional[]) => {
  const fechaISO = fechaISODeStr(cita.inicio);
  const cuando = fechaISO === getLocalDateISO(new Date()) ? 'Hoy' : `El ${fechaLarga(fechaISO)}`;
  return `Hola ${cita.pacientes?.nombre || ''}, te escribimos de Clínica Dignidad. ${cuando} te esperábamos a las ${horaDeStr(cita.inicio)} hrs para tu cita con el/la ${nombreDoctorCompleto(profesionales, cita.profesional_id)} y no pudiste asistir.\n\nEntendemos que pueden surgir imprevistos 🙂 ¿Te gustaría que te busquemos una nueva hora? Respóndenos este mensaje y te ayudamos a reagendar.\n\n¡Saludos! 🦷`;
};

export const construirMensajeResena = (cita: any) =>
  `Hola ${cita.pacientes?.nombre || ''}, esperamos que hayas tenido una excelente experiencia en tu atención en Clínica Dignidad.\n\nNos ayudaría muchísimo si pudieras dejarnos tu opinión o solo dejándonos las estrellas, es solo 1 clic:\n${URL_RESENA_GOOGLE}\n\n¡Muchas gracias por confiar en nosotros! 💙🦷`;

// ─────────────────────────────────────────────────────────────
// Reglas clínicas
// ─────────────────────────────────────────────────────────────
export const normalizarTexto = (s?: string | null) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Solicitud hecha por la web que aún no se valida (no ocupa hora ni se recuerda)
export const esWebPendiente = (c: any) => c?.estado_confirmacion === 'pendiente' && !!c?.motivo?.includes('Online');

// 🦷 Procedimientos que requieren control posterior (se busca en el motivo de la cita)
export const PROCEDIMIENTOS_CON_CONTROL = ['EXTRAC', 'EXODONCIA', 'ENDODONCIA', 'CIRUGIA', 'IMPLANTE', 'INJERTO', 'FRENECTOMIA', 'TERCEROS MOLARES', 'CORDAL', 'GINGIVECTOMIA', 'DESTARTRAJE SUBGINGIVAL'];
export const DIAS_HASTA_CONTROL = 7;
export const DURACION_CONTROL = 15;
export const requiereControl = (motivo?: string | null) => {
  const m = normalizarTexto(motivo);
  if (!m || m.startsWith('CONTROL')) return false;
  return PROCEDIMIENTOS_CON_CONTROL.some(p => m.includes(p));
};

// ⚠️ Palabras que se destacan como alerta médica
export const PALABRAS_ALERTA = ['ALERG', 'ANTICOAG', 'SINTROM', 'NEOSINTROM', 'WARFARIN', 'ASPIRINA', 'CLOPIDOGREL', 'DIABET', 'HIPERTENS', 'EMBARAZ', 'CARDI', 'MARCAPASO', 'EPILEP', 'CONVULS', 'ASMA', 'VIH', 'HEPATIT', 'BIFOSFONAT', 'HEMOFIL', 'RADIOTERAP', 'QUIMIOTERAP', 'INFARTO', 'TRASPLANT', 'RENAL'];
export const esAlertaMedica = (txt?: string | null) => {
  const t = normalizarTexto(txt);
  return !!t && PALABRAS_ALERTA.some(p => t.includes(p));
};
// "No", "Niega", "Ninguna"… no son alertas
export const esRespuestaNegativa = (txt?: string | null) => {
  const t = normalizarTexto(txt).trim().replace(/[.\s]+$/, '');
  return !t || ['NO', 'NIEGA', 'NINGUNA', 'NINGUNO', 'SIN', 'N/A', 'NA', '-', 'NO REFIERE', 'NO TIENE', 'NADA', 'NIEGA TODO', 'SIN ANTECEDENTES'].includes(t)
    || t.startsWith('NO ') || t.startsWith('NIEGA') || t.startsWith('SIN ANTECEDENTES');
};

export const calcularEdad = (fechaNac?: string | null) => {
  if (!fechaNac) return null;
  const n = new Date(fechaNac + 'T00:00:00'); const h = new Date();
  let e = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
  return e >= 0 && e < 130 ? e : null;
};

// 🚦 Semáforo de sala de espera (minutos desde que se marcó la llegada)
export const SEMAFORO_NARANJA_MIN = 15;
export const SEMAFORO_ROJO_MIN = 20;
export const minutosDesde = (dt: string | null | undefined, ahoraMs: number) => {
  if (!dt) return null;
  const t = new Date(dt.replace(' ', 'T').replace(/(Z|[+-]\d{2}:?\d{2})$/, '')).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((ahoraMs - t) / 60000));
};
export type NivelSemaforo = 'verde' | 'naranja' | 'rojo' | null;
export const nivelSemaforo = (min: number | null): NivelSemaforo =>
  min === null ? null : min >= SEMAFORO_ROJO_MIN ? 'rojo' : min >= SEMAFORO_NARANJA_MIN ? 'naranja' : 'verde';
export const claseBadgeSemaforo = (n: NivelSemaforo) =>
  n === 'rojo' ? 'bg-red-600 text-white animate-pulse' : n === 'naranja' ? 'bg-orange-500 text-white' : 'bg-amber-100 text-amber-800';

// 📵 Inasistencias (últimos 12 meses)
export const MESES_INASISTENCIAS = 12;
export const estiloInasistencias = (n: number) =>
  n >= 3 ? 'bg-red-600 text-white border-red-700' : n === 2 ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200';

export const escapeHtml = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Quita caracteres que rompen el filtro .or() de PostgREST
export const limpiarParaFiltro = (s: string) => s.replace(/[,()*%\\"']/g, '');

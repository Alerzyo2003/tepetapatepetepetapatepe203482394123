// Acciones sobre citas compartidas por la Agenda y la Vista Diaria,
// para que ambas páginas se comporten exactamente igual.
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { marcarRecordatorioEnviado, registrarAuditoria } from './data'
import {
  abrirWhatsApp, construirMensajeInasistencia, construirMensajeRecordatorio, DIAS_HASTA_CONTROL, duracionMinutos,
  fechaISODeStr, horaDeStr, horaLocalAhoraISO, nombrePaciente, rangoCita, requiereControl,
} from './utils'
import type { AgendarConfig, Profesional } from './types'
import { DURACION_CONTROL, fechaLocalDeStr, getLocalDateISO } from './utils'

// ── Configuraciones para abrir el modal de agendar ──

// Reprogramar: conserva la duración exacta de la cita (no la acorta)
export function configReprogramar(cita: any): Omit<AgendarConfig, 'id'> {
  const mins = duracionMinutos(cita);
  return {
    citaReprogramar: cita,
    profesionalId: cita.profesional_id || undefined,
    duracion: mins > 0 ? mins : 30,
    semanaInicio: fechaISODeStr(cita.inicio),
    motivo: cita.motivo || '',
  };
}

// Control post-procedimiento: misma especialista, 15 min, a los 7 días (si cae domingo, lunes)
export function configControl(cita: any): Omit<AgendarConfig, 'id'> {
  const base = fechaLocalDeStr(cita.inicio);
  base.setDate(base.getDate() + DIAS_HASTA_CONTROL);
  if (base.getDay() === 0) base.setDate(base.getDate() + 1);
  const fecha = getLocalDateISO(base);
  return {
    profesionalId: cita.profesional_id || undefined,
    duracion: DURACION_CONTROL,
    semanaInicio: fecha,
    diaSugerido: fecha,
    paciente: cita.pacientes,
    motivo: `CONTROL ${cita.motivo || ''}`.trim().toUpperCase(),
  };
}

interface Contexto {
  usuarioLogueado: string | null;
  profesionales: Profesional[];
  onAgendarControl?: (cita: any) => void;
}

// Estados en que el paciente ya está en la clínica (moverlo no lo deja "reprogramado")
const ESTADOS_PRESENTE = ['en_espera', 'atendiendose', 'atendido'];

/**
 * Cambia el estado de una cita: guarda horas de llegada / atención, registra auditoría,
 * avisa al doctor cuando el paciente llega y ofrece WhatsApp por inasistencia o agendar control.
 * Devuelve true si se guardó.
 */
export async function guardarEstadoCita(cita: any, nuevoEstado: string, ctx: Contexto): Promise<boolean> {
  const horaLocal = horaLocalAhoraISO();
  const update: any = { estado: nuevoEstado, modificado_por: ctx.usuarioLogueado };
  if (nuevoEstado === 'cancelada') update.cancelado_por = ctx.usuarioLogueado;
  if (nuevoEstado === 'en_espera') { update.llegada_confirmada = true; update.hora_llegada = horaLocal; }
  if (nuevoEstado === 'atendiendose') update.hora_inicio_atencion = horaLocal;
  if (nuevoEstado === 'atendido') update.hora_fin_atencion = horaLocal;

  const { error } = await supabase.from('citas').update(update).eq('id', cita.id);
  if (error) { console.error(error); toast.error('Error al actualizar el estado'); return false; }

  const nombre = nombrePaciente(cita.pacientes);
  await registrarAuditoria(ctx.usuarioLogueado, 'UPDATE / ESTADO CITA', 'citas', `Cambió estado de la cita de ${nombre} a "${nuevoEstado.toUpperCase()}".`);

  // Avisar al doctor que el paciente llegó (si no es él mismo quien lo marcó)
  if (nuevoEstado === 'en_espera' && cita.profesional_id && cita.profesional_id !== ctx.usuarioLogueado) {
    const canal = supabase.channel(`notificaciones-${cita.profesional_id}`);
    canal.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await canal.send({ type: 'broadcast', event: 'PACIENTE_EN_ESPERA', payload: { nombre } });
        supabase.removeChannel(canal);
      }
    });
  }

  toast.success('Estado actualizado');

  if (nuevoEstado === 'no_asiste' && cita.pacientes) {
    toast(`${nombre} no asistió`, {
      description: '¿Enviarle un WhatsApp para reagendar?', duration: 15000,
      action: { label: 'Enviar WhatsApp', onClick: () => abrirWhatsApp(cita.pacientes?.telefono, construirMensajeInasistencia(cita, ctx.profesionales)) },
    });
  }
  if (nuevoEstado === 'atendido' && cita.pacientes && ctx.onAgendarControl && requiereControl(cita.motivo)) {
    const agendar = ctx.onAgendarControl;
    toast(`¿Agendar control en ${DIAS_HASTA_CONTROL} días?`, {
      description: `${nombre} · ${cita.motivo}`, duration: 20000,
      action: { label: 'Agendar control', onClick: () => agendar(cita) },
    });
  }
  return true;
}

// Recordatorio individual: solo se marca "enviado" si recepción confirma que el mensaje salió
export function enviarRecordatorioIndividual(cita: any, profesionales: Profesional[]) {
  if (!abrirWhatsApp(cita.pacientes?.telefono, construirMensajeRecordatorio([cita], profesionales))) return;
  if (cita.estado_confirmacion !== 'pendiente') return;
  toast(`¿Se envió el recordatorio a ${nombrePaciente(cita.pacientes)}?`, {
    description: 'Confírmalo solo si el mensaje salió en WhatsApp.', duration: 30000,
    action: { label: 'Sí, se envió', onClick: () => { marcarRecordatorioEnviado([cita]); toast.success('Recordatorio marcado como enviado'); } },
  });
}

// Mueve una cita (arrastrar y soltar) manteniendo su duración
export async function moverCita(cita: any, destino: { fecha: string; hora: string; profesionalId: string }, usuarioLogueado: string | null, nombreDoctorDestino: string): Promise<boolean> {
  const { inicio, fin } = rangoCita(destino.fecha, destino.hora, duracionMinutos(cita));
  const update: any = { inicio, fin, profesional_id: destino.profesionalId, modificado_por: usuarioLogueado };
  if (!ESTADOS_PRESENTE.includes(cita.estado)) update.estado = 'reprogramada';

  const { error } = await supabase.from('citas').update(update).eq('id', cita.id);
  if (error) { console.error(error); toast.error('No se pudo mover la cita'); return false; }
  await registrarAuditoria(usuarioLogueado, 'UPDATE / MOVER CITA', 'citas',
    `Movió la cita de ${nombrePaciente(cita.pacientes)} de ${fechaISODeStr(cita.inicio)} ${horaDeStr(cita.inicio)} a ${destino.fecha} ${destino.hora} (Dr/a. ${nombreDoctorDestino}).`);
  return true;
}

// Deshace un movimiento dejando la cita exactamente como estaba
export async function restaurarCita(original: any, usuarioLogueado: string | null): Promise<boolean> {
  const { error } = await supabase.from('citas').update({
    inicio: original.inicio, fin: original.fin, profesional_id: original.profesional_id,
    estado: original.estado, modificado_por: usuarioLogueado,
  }).eq('id', original.id);
  if (error) { toast.error('No se pudo deshacer'); return false; }
  await registrarAuditoria(usuarioLogueado, 'UPDATE / DESHACER MOVER CITA', 'citas', `Deshizo el movimiento de la cita de ${nombrePaciente(original.pacientes)}.`);
  return true;
}

export async function eliminarBloqueo(bloqueo: any, usuarioLogueado: string | null, nombreDoctor: string): Promise<boolean> {
  const { error } = await supabase.from('bloqueos_agenda').delete().eq('id', bloqueo.id);
  if (error) { console.error(error); toast.error('No se pudo quitar el bloqueo'); return false; }
  const rango = bloqueo.hora_inicio && bloqueo.hora_fin ? `de ${bloqueo.hora_inicio.substring(0, 5)} a ${bloqueo.hora_fin.substring(0, 5)}` : 'todo el día';
  await registrarAuditoria(usuarioLogueado, 'DELETE / BLOQUEO AGENDA', 'bloqueos_agenda', `Quitó el bloqueo de Dr/a. ${nombreDoctor} del ${bloqueo.fecha} ${rango}. Motivo: ${bloqueo.motivo || '-'}.`);
  toast.success('Bloqueo eliminado');
  return true;
}

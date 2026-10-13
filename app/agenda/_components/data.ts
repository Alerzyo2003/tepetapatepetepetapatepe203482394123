// Consultas a Supabase compartidas por la agenda
import { supabase } from '@/lib/supabase'
import { esWebPendiente, getLocalDateISO, MESES_INASISTENCIAS } from './utils'
import type { FinanzasPaciente } from './types'

// Suma presupuestos aprobados por paciente: total, abonado, deuda y deuda de lo ya realizado
export async function obtenerFinanzasPacientes(pacienteIds: string[]) {
  const finanzas: Record<string, FinanzasPaciente> = {};
  pacienteIds.forEach(id => finanzas[id] = { total: 0, abonado: 0, deuda: 0, deuda_realizada: 0 });
  if (pacienteIds.length === 0) return finanzas;

  const { data: presups } = await supabase.from('presupuestos').select('id, paciente_id').in('paciente_id', pacienteIds).eq('aprobado', true);
  const presupPaciente: Record<string, string> = {};
  presups?.forEach((p: any) => { presupPaciente[p.id] = p.paciente_id; });
  const presupsIds = Object.keys(presupPaciente);
  if (presupsIds.length === 0) return finanzas;

  const { data: items } = await supabase.from('presupuesto_items').select('presupuesto_id, precio_pactado, abonado, estado').in('presupuesto_id', presupsIds).neq('estado', 'cancelada');
  items?.forEach((item: any) => {
    const pacId = presupPaciente[item.presupuesto_id];
    if (!pacId || !finanzas[pacId]) return;
    const precio = Number(item.precio_pactado || 0);
    const abono = Number(item.abonado || 0);
    const deudaItem = precio - abono;
    finanzas[pacId].total += precio;
    finanzas[pacId].abonado += abono;
    finanzas[pacId].deuda += deudaItem;
    if (item.estado === 'realizado' && deudaItem > 0) finanzas[pacId].deuda_realizada += deudaItem;
  });
  return finanzas;
}

// Cuenta las citas marcadas "No asistió" de cada paciente en los últimos 12 meses
export async function contarInasistencias(pacienteIds: string[]) {
  const mapa: Record<string, number> = {};
  if (pacienteIds.length === 0) return mapa;
  const desde = new Date(); desde.setMonth(desde.getMonth() - MESES_INASISTENCIAS);
  const { data, error } = await supabase.from('citas').select('paciente_id')
    .in('paciente_id', pacienteIds).eq('estado', 'no_asiste')
    .gte('inicio', `${getLocalDateISO(desde)}T00:00:00`)
    .range(0, 4999);
  if (error) { console.error('Error contando inasistencias', error); return mapa; }
  (data || []).forEach((c: any) => { mapa[c.paciente_id] = (mapa[c.paciente_id] || 0) + 1; });
  return mapa;
}

// Marca que el recordatorio se envió (solo 'pendiente' → 'enviado', nunca baja un 'confirmado').
// Las solicitudes web sin validar se excluyen para no "aprobarlas" por accidente.
export async function marcarRecordatorioEnviado(citas: any[]) {
  const ids = citas.filter(c => !esWebPendiente(c)).map(c => c.id);
  if (ids.length === 0) return;
  const { error } = await supabase.from('citas').update({ estado_confirmacion: 'enviado' }).in('id', ids).eq('estado_confirmacion', 'pendiente');
  if (error) console.error('No se pudo marcar el recordatorio como enviado', error);
}

export async function registrarAuditoria(usuarioId: string | null, accion: string, tabla: string, detalles: string) {
  const { error } = await supabase.from('auditoria_clinica').insert([{ usuario_id: usuarioId, accion, tabla, detalles }]);
  if (error) console.error('No se pudo registrar la auditoría', error);
}

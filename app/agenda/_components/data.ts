// Consultas a Supabase compartidas por la agenda
import { supabase } from '@/lib/supabase'
import { esWebPendiente, getLocalDateISO, MESES_INASISTENCIAS } from './utils'
import type { Continuidad, FinanzasPaciente } from './types'

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

// ─────────────────────────────────────────────────────────────
// Continuidad: ¿el paciente ya tiene su próxima hora? ¿tiene tratamiento pendiente?
// ─────────────────────────────────────────────────────────────
const ESTADOS_ITEM_REALIZADO = ['realizado', 'atendido', 'terminado', 'completado', 'finalizado'];
const DIAS_PRESUPUESTO_POR_DECIDIR = 45;
const lotes = <T,>(xs: T[], n = 150) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const nombreItem = (it: any) => String(it?.nombre_prestacion || '').split('|')[0].trim();
const itemPendiente = (it: any) => {
  const e = String(it?.estado || '').toLowerCase().trim();
  if (/cancel|anul/.test(e)) return false;
  return !ESTADOS_ITEM_REALIZADO.includes(e) && Number(it?.progreso || 0) < 100;
};
const presupuestoCerrado = (p: any) => /^finaliz|anul|cancel/.test(String(p?.estado || '').toLowerCase().trim());
const fechaPresupuesto = (p: any) => {
  const fechas = [p?.fecha_creacion, p?.created_at].map(f => (f ? new Date(String(f).replace(' ', 'T')).getTime() : NaN)).filter(n => !Number.isNaN(n));
  return fechas.length ? Math.min(...fechas) : null;
};

export async function obtenerContinuidad(pacienteIds: string[], desdeISO: string): Promise<Record<string, Continuidad>> {
  const mapa: Record<string, Continuidad> = {};
  pacienteIds.forEach(id => mapa[id] = { futuras: [], pendientes: 0, tratamiento: null, proxima: null, doctorId: null, presupuestoPorDecidir: null });
  if (pacienteIds.length === 0) return mapa;

  try {
    const [citasRes, presRes] = await Promise.all([
      Promise.all(lotes(pacienteIds).map(l => supabase.from('citas').select('id, paciente_id, inicio')
        .in('paciente_id', l).gte('inicio', `${desdeISO}T00:00:00`).not('estado', 'in', '(cancelada,no_asiste)')
        .order('inicio', { ascending: true }).range(0, 4999))),
      Promise.all(lotes(pacienteIds).map(l => supabase.from('presupuestos')
        .select('id, paciente_id, nombre_tratamiento, aprobado, total_abonado, estado, created_at, fecha_creacion')
        .in('paciente_id', l).range(0, 4999))),
    ]);
    for (const r of [...citasRes, ...presRes]) if (r.error) throw r.error;

    citasRes.flatMap(r => r.data || []).forEach((c: any) => { mapa[c.paciente_id]?.futuras.push({ id: c.id, inicio: c.inicio }); });

    // Presupuestos que importan: los aprobados o con abono (tratamiento en curso) y los recientes sin aprobar
    const limite = Date.now() - DIAS_PRESUPUESTO_POR_DECIDIR * 86_400_000;
    const presups = presRes.flatMap(r => r.data || []).filter((p: any) => !presupuestoCerrado(p));
    const enCurso = presups.filter((p: any) => p.aprobado === true || Number(p.total_abonado || 0) > 0);
    const porDecidir = presups.filter((p: any) => !(p.aprobado === true || Number(p.total_abonado || 0) > 0) && (fechaPresupuesto(p) ?? 0) >= limite);
    const porId = new Map<string, any>([...enCurso, ...porDecidir].map((p: any) => [p.id, p]));
    if (porId.size === 0) return mapa;

    const itemsRes = await Promise.all(lotes([...porId.keys()]).map(l => supabase.from('presupuesto_items')
      .select('presupuesto_id, nombre_prestacion, estado, progreso, profesional_id')
      .in('presupuesto_id', l).range(0, 9999)));
    for (const r of itemsRes) if (r.error) throw r.error;

    const conItems = new Set<string>();
    itemsRes.flatMap(r => r.data || []).forEach((it: any) => {
      const p = porId.get(it.presupuesto_id);
      const m = p && mapa[p.paciente_id];
      if (!m || !itemPendiente(it)) return;
      conItems.add(p.id);
      if (!enCurso.includes(p)) return;
      m.pendientes += 1;
      if (!m.proxima) {
        m.proxima = nombreItem(it) || null;
        m.tratamiento = p.nombre_tratamiento || null;
        m.doctorId = it.profesional_id || null;
      }
    });
    porDecidir.forEach((p: any) => {
      const m = mapa[p.paciente_id];
      if (m && !m.presupuestoPorDecidir && conItems.has(p.id)) m.presupuestoPorDecidir = p.nombre_tratamiento || 'Tratamiento';
    });
  } catch (e) {
    console.error('No se pudo revisar la próxima hora de los pacientes', e);
  }
  return mapa;
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

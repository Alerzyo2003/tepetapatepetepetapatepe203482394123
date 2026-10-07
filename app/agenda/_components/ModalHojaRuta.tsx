'use client'
// Hoja de ruta del día por doctor: pacientes, motivo, alertas médicas y saldo. Se puede imprimir.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Calendar as CalendarIcon, ClipboardList, HeartPulse, Loader2, MessageSquareText, Printer } from 'lucide-react'
import ModalShell from './ModalShell'
import { obtenerFinanzasPacientes } from './data'
import {
  buscarDoctor, calcularEdad, esAlertaMedica, escapeHtml, esRespuestaNegativa, esWebPendiente, ESTADOS_CITA,
  fechaLarga, GOLD_LIGHT, horaDeStr,
} from './utils'
import type { FinanzasPaciente, Profesional } from './types'

interface Fila {
  cita: any;
  paciente: any;
  edad: number | null;
  alertas: string[];
  otros: string[];
  finanzas?: FinanzasPaciente;
  doctor: string;
  primeraVez: boolean;
}

interface Props {
  abierto: boolean;
  onClose: () => void;
  fechaInicial: string;
  especialistaInicial: string;
  profesionales: Profesional[];
  usuarioLogueado: string | null;
  puedeVerAgendaCompleta: boolean;
}

export default function ModalHojaRuta({ abierto, onClose, fechaInicial, especialistaInicial, profesionales, usuarioLogueado, puedeVerAgendaCompleta }: Props) {
  const [fecha, setFecha] = useState(fechaInicial);
  const [profesional, setProfesional] = useState('Todos');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const prof = !puedeVerAgendaCompleta ? (usuarioLogueado || 'Todos') : especialistaInicial;
    setFecha(fechaInicial); setProfesional(prof); setFilas([]);
    cargar(fechaInicial, prof);
  }, [abierto]);

  async function cargar(f: string, prof: string) {
    if (!f) return;
    setCargando(true);
    try {
      let q = supabase.from('citas').select('*, pacientes(*)')
        .gte('inicio', `${f}T00:00:00`).lte('inicio', `${f}T23:59:59`)
        .neq('estado', 'cancelada')
        .order('inicio', { ascending: true });
      const profEfectivo = !puedeVerAgendaCompleta ? usuarioLogueado : prof;
      if (profEfectivo && profEfectivo !== 'Todos') q = q.eq('profesional_id', profEfectivo);
      const { data, error } = await q;
      if (error) throw error;

      const citas = (data || []).filter((c: any) => !esWebPendiente(c));
      const ids = [...new Set(citas.map((c: any) => c.paciente_id).filter(Boolean))] as string[];
      if (ids.length === 0) { setFilas([]); return; }

      const [finanzas, antRes, previasRes] = await Promise.all([
        obtenerFinanzasPacientes(ids),
        supabase.from('antecedentes').select('paciente_id, categoria, contenido').in('paciente_id', ids),
        supabase.from('citas').select('paciente_id').in('paciente_id', ids).eq('estado', 'atendido').lt('inicio', `${f}T00:00:00`),
      ]);
      const conVisitasPrevias = new Set((previasRes.data || []).map((c: any) => c.paciente_id));

      setFilas(citas.map((c: any) => {
        const p = c.pacientes || {};
        const alertas: string[] = [];
        const otros: string[] = [];
        (antRes.data || [])
          .filter((a: any) => a.paciente_id === c.paciente_id && !esRespuestaNegativa(a.contenido))
          .forEach((a: any) => {
            const txt = `${a.categoria ? a.categoria + ': ' : ''}${a.contenido}`;
            (esAlertaMedica(txt) ? alertas : otros).push(txt);
          });
        if (p.antecedentes_medicos && !esRespuestaNegativa(p.antecedentes_medicos)) {
          (esAlertaMedica(p.antecedentes_medicos) ? alertas : otros).push(p.antecedentes_medicos);
        }
        const doc = buscarDoctor(profesionales, c.profesional_id);
        return {
          cita: c, paciente: p, edad: calcularEdad(p.fecha_nacimiento), alertas, otros,
          finanzas: finanzas[c.paciente_id],
          doctor: doc ? `${doc.nombre} ${doc.apellido}` : 'Sin asignar',
          primeraVez: !conVisitasPrevias.has(c.paciente_id),
        };
      }));
    } catch (e) {
      console.error(e);
      toast.error('No se pudo cargar la hoja de ruta');
    } finally {
      setCargando(false);
    }
  }

  const porDoctor = useMemo(() => {
    const grupos: Record<string, Fila[]> = {};
    filas.forEach(f => { (grupos[f.doctor] = grupos[f.doctor] || []).push(f); });
    return Object.entries(grupos);
  }, [filas]);

  const imprimir = () => {
    const secciones = porDoctor.map(([doctor, fs]) => `
      <h2>Dr(a). ${escapeHtml(doctor)} <span>${fs.length} paciente${fs.length === 1 ? '' : 's'}</span></h2>
      <table>
        <thead><tr><th>Hora</th><th>Paciente</th><th>Motivo</th><th>Alertas / antecedentes</th><th>Saldo</th></tr></thead>
        <tbody>${fs.map(f => `
          <tr>
            <td class="hora">${escapeHtml(horaDeStr(f.cita.inicio))}<br><small>${escapeHtml(horaDeStr(f.cita.fin))}</small></td>
            <td><b>${escapeHtml(`${f.paciente.nombre || ''} ${f.paciente.apellido || ''}`)}</b>${f.primeraVez ? ' <span class="tag">1ª visita</span>' : ''}<br><small>${f.edad !== null ? escapeHtml(f.edad) + ' años · ' : ''}${escapeHtml(f.paciente.rut || '')}</small></td>
            <td>${escapeHtml(f.cita.motivo || '—')}</td>
            <td>${f.alertas.map(a => `<div class="alerta">⚠ ${escapeHtml(a)}</div>`).join('')}${f.otros.map(a => `<div class="otro">${escapeHtml(a)}</div>`).join('') || (f.alertas.length ? '' : '<span class="otro">Sin antecedentes registrados</span>')}</td>
            <td>${f.finanzas && f.finanzas.deuda > 0 ? `$${Number(f.finanzas.deuda).toLocaleString('es-CL')}` : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`).join('');

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de ruta ${escapeHtml(fecha)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0B1220;margin:24px;font-size:12px}
        h1{font-size:18px;margin:0 0 4px}.sub{color:#64748b;margin-bottom:18px;text-transform:capitalize}
        h2{font-size:14px;margin:22px 0 8px;border-bottom:2px solid #C9A24B;padding-bottom:4px}h2 span{font-weight:normal;color:#64748b;font-size:11px;margin-left:8px}
        table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #cbd5e1;padding:6px}
        td{vertical-align:top;border-bottom:1px solid #e2e8f0;padding:7px 6px}td.hora{font-weight:bold;white-space:nowrap}
        small{color:#64748b}.alerta{color:#b91c1c;font-weight:bold}.otro{color:#475569}.tag{background:#dbeafe;color:#1d4ed8;font-size:9px;padding:1px 5px;border-radius:4px}
        tr{page-break-inside:avoid}
      </style></head><body>
      <h1>Hoja de ruta · Clínica Dignidad</h1><div class="sub">${escapeHtml(fechaLarga(fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div>
      ${secciones || '<p>No hay citas para este día.</p>'}
      <script>window.onload=()=>{window.print()}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return toast.error('El navegador bloqueó la ventana de impresión');
    w.document.open(); w.document.write(html); w.document.close();
  };

  return (
    <ModalShell
      abierto={abierto}
      onClose={onClose}
      posicion="arriba"
      ancho="max-w-4xl"
      icono={<ClipboardList size={24} style={{ color: GOLD_LIGHT }} />}
      titulo="Hoja de ruta"
      subtitulo={<span className="capitalize">{fecha && fechaLarga(fecha)}</span>}
    >
      <div className="px-6 md:px-8 py-4 border-b border-slate-100 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-[#C9A24B]" value={fecha} onChange={e => { if (e.target.value) { setFecha(e.target.value); cargar(e.target.value, profesional); } }} />
          <select className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-[#C9A24B] disabled:opacity-70" value={profesional} disabled={!puedeVerAgendaCompleta} onChange={e => { setProfesional(e.target.value); cargar(fecha, e.target.value); }}>
            {puedeVerAgendaCompleta && <option value="Todos">Todos los especialistas</option>}
            {profesionales.filter(p => puedeVerAgendaCompleta || p.user_id === usuarioLogueado).map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
          </select>
        </div>
        <button onClick={imprimir} disabled={cargando || filas.length === 0} className="px-4 py-2.5 bg-[#0A111F] text-[#E8CD8A] rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:brightness-125 disabled:opacity-40 transition-all">
          <Printer size={14} /> Imprimir
        </button>
      </div>

      <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar">
        {cargando ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin text-[#C9A24B]" size={32} />
            <p className="text-xs font-black uppercase tracking-widest">Preparando hoja de ruta...</p>
          </div>
        ) : filas.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3 opacity-70">
            <CalendarIcon size={44} className="text-slate-300" />
            <p className="text-sm font-black uppercase tracking-widest text-slate-600">Sin citas este día</p>
          </div>
        ) : (
          <div className="space-y-8">
            {porDoctor.map(([doctor, fs]) => {
              const conAlertas = fs.filter(f => f.alertas.length > 0).length;
              const primeras = fs.filter(f => f.primeraVez).length;
              return (
                <div key={doctor}>
                  <div className="flex flex-wrap items-end justify-between gap-2 mb-3 pb-2 border-b-2 border-[#C9A24B]/40">
                    <h3 className="font-black text-base text-[#0A111F] uppercase tracking-wide">Dr(a). {doctor}</h3>
                    <div className="flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-widest">
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">{fs.length} pacientes</span>
                      {primeras > 0 && <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700">{primeras} primera vez</span>}
                      {conAlertas > 0 && <span className="px-2 py-1 rounded-full bg-red-50 text-red-600">{conAlertas} con alerta médica</span>}
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {fs.map(f => <FilaHojaRuta key={f.cita.id} f={f} onAbrirFicha={onClose} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function FilaHojaRuta({ f, onAbrirFicha }: { f: Fila; onAbrirFicha: () => void }) {
  const est = ESTADOS_CITA[f.cita.estado] || ESTADOS_CITA.programada;
  return (
    <div className={`bg-white rounded-2xl border p-4 shadow-sm flex flex-col md:flex-row gap-4 ${f.alertas.length ? 'border-red-200' : 'border-slate-200'}`}>
      <div className="flex md:flex-col items-center md:items-start gap-2 md:w-16 shrink-0">
        <span className="text-lg font-black text-[#0A111F] leading-none">{horaDeStr(f.cita.inicio)}</span>
        <span className="text-[10px] font-bold text-slate-400">{horaDeStr(f.cita.fin)}</span>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link prefetch={false} href={`/pacientes/${f.cita.paciente_id}`} onClick={onAbrirFicha} className="font-black text-sm text-slate-800 uppercase hover:text-[#8A6D2F]">
            {f.paciente.nombre} {f.paciente.apellido}
          </Link>
          {f.edad !== null && <span className="text-[10px] font-bold text-slate-500">{f.edad} años</span>}
          {f.primeraVez && <span className="text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">Primera visita</span>}
          <span className={`text-[9px] font-black uppercase tracking-widest ${est.circleText}`}>{est.label}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-600">
          <MessageSquareText size={13} className="text-[#C9A24B] shrink-0" /> {f.cita.motivo || 'Sin motivo registrado'}
        </div>
        {f.alertas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {f.alertas.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[10px] font-black bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-lg"><HeartPulse size={12} /> {a}</span>
            ))}
          </div>
        )}
        {f.otros.length > 0 && <p className="text-[11px] text-slate-500 leading-relaxed"><span className="font-bold">Antecedentes:</span> {f.otros.join(' · ')}</p>}
        {f.alertas.length === 0 && f.otros.length === 0 && <p className="text-[11px] text-slate-400 italic">Sin antecedentes médicos registrados</p>}
      </div>
      <div className="md:w-40 shrink-0 flex md:flex-col md:items-end gap-2 text-right">
        {f.finanzas && f.finanzas.deuda_realizada > 0 ? (
          <span className="text-[10px] font-black uppercase tracking-wider bg-red-500 text-white px-2.5 py-1 rounded-lg">Por cobrar ${Number(f.finanzas.deuda_realizada).toLocaleString('es-CL')}</span>
        ) : f.finanzas && f.finanzas.deuda > 0 ? (
          <span className="text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg">Saldo plan ${Number(f.finanzas.deuda).toLocaleString('es-CL')}</span>
        ) : f.finanzas && f.finanzas.total > 0 ? (
          <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg">Al día</span>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sin plan</span>
        )}
      </div>
    </div>
  );
}

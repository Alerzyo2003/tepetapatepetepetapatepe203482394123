'use client'
// Recordatorios por WhatsApp, uno tras otro. Se abre en HOY y se puede cambiar a mañana u otro día.
//  · Hoy: aparecen TODOS los pacientes que aún tienen hora hoy (también los ya confirmados, con un mensaje
//    sin pedir confirmación). Lo enviado hoy queda en el historial de contactos (lista "recordatorio_dia"),
//    así todas las recepcionistas ven a quién ya se le escribió aunque cierren la ventana.
//  · Otro día: pide confirmar la hora; la cita queda como "enviado" y el paciente confirma con su enlace.
// Una cita solo queda como "enviado" cuando recepción confirma que el mensaje salió.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { BellRing, Calendar as CalendarIcon, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, MessageCircle, Phone, RefreshCcw, Send, User, X } from 'lucide-react'
import ModalShell from './ModalShell'
import { marcarRecordatorioEnviado } from './data'
import {
  abrirWhatsApp, buscarDoctor, construirMensajeRecordatorio, esWebPendiente, fechaLarga, getLocalDateISO, horaDeStr,
  horaLocalAhoraISO, nombrePaciente, siguienteDiaHabil, telefonoWA,
} from './utils'
import type { Profesional } from './types'

const LISTA_DIA = 'recordatorio_dia'; // historial de contactos: recordatorio enviado el mismo día de la cita
const ESTADOS_FUERA = ['cancelada', 'atendido', 'no_asiste', 'reprogramada'];
const ESTADOS_YA_LLEGO = ['en_espera', 'atendiendose'];

type EstadoRecordatorio = 'pendiente' | 'enviado' | 'confirmado' | 'fallido';
interface Grupo {
  key: string;          // paciente_id
  paciente: any;
  citas: any[];
  telefono?: string;
  tieneTelefono: boolean;
  estado: EstadoRecordatorio;
  confirmado: boolean;  // el paciente ya confirmó (link o teléfono)
  yaPaso: boolean;      // solo hoy: ya pasó la hora de todas sus citas
}

interface Props {
  abierto: boolean;
  onClose: () => void;
  profesionales: Profesional[];
  usuarioLogueado: string | null;
  puedeVerAgendaCompleta: boolean;
  filtroEspecialista: string;
  realtimeTrigger: number;
}

const sumarDiasISO = (iso: string, dias: number) => {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d + dias);
  if (f.getDay() === 0) f.setDate(f.getDate() + (dias < 0 ? -1 : 1)); // domingo no se atiende
  return getLocalDateISO(f);
};

export default function ModalRecordatorios({ abierto, onClose, profesionales, usuarioLogueado, puedeVerAgendaCompleta, filtroEspecialista, realtimeTrigger }: Props) {
  const [fecha, setFecha] = useState('');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [yaLlegaron, setYaLlegaron] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  // Se guardan en refs para que el refresco en tiempo real no los vuelva a poner como pendientes
  const fallidosRef = useRef<Set<string>>(new Set());
  const enviadosHoyRef = useRef<Set<string>>(new Set());
  const reqRef = useRef(0);

  const hoyISO = getLocalDateISO(new Date());
  const mananaISO = siguienteDiaHabil();
  const esHoy = fecha === hoyISO;

  useEffect(() => {
    if (!abierto) return;
    reiniciar(getLocalDateISO(new Date()));
  }, [abierto]);

  // Si un paciente confirma con el link mientras el modal está abierto, se ve en vivo
  useEffect(() => {
    if (abierto && fecha && realtimeTrigger > 0) cargar(fecha, true);
  }, [realtimeTrigger]);

  const reiniciar = (f: string) => {
    setFecha(f); setGrupos([]); setYaLlegaron(0); setEnCurso(null);
    fallidosRef.current = new Set();
    enviadosHoyRef.current = new Set();
    cargar(f);
  };

  async function cargar(f: string, silencioso = false) {
    const n = ++reqRef.current;
    if (!silencioso) setCargando(true);
    const deHoy = f === getLocalDateISO(new Date());
    try {
      let q = supabase.from('citas').select('*, pacientes(*)')
        .gte('inicio', `${f}T00:00:00`).lte('inicio', `${f}T23:59:59`)
        .not('estado', 'in', `(${ESTADOS_FUERA.map(e => `"${e}"`).join(',')})`)
        .order('inicio', { ascending: true });
      if (!puedeVerAgendaCompleta && usuarioLogueado) q = q.eq('profesional_id', usuarioLogueado);
      else if (filtroEspecialista !== 'Todos') q = q.eq('profesional_id', filtroEspecialista);
      const { data, error } = await q;
      if (error) throw error;

      // Las solicitudes web sin validar se gestionan en "Validar Web", no aquí.
      // Hoy: los que ya están en la clínica no necesitan recordatorio.
      const citas = (data || []).filter((c: any) => c.paciente_id && !esWebPendiente(c));
      const llegaron = deHoy ? citas.filter((c: any) => ESTADOS_YA_LLEGO.includes(c.estado)) : [];
      const porPaciente: Record<string, Grupo> = {};
      citas.filter((c: any) => !llegaron.includes(c)).forEach((c: any) => {
        if (!porPaciente[c.paciente_id]) porPaciente[c.paciente_id] = { key: c.paciente_id, paciente: c.pacientes, citas: [], tieneTelefono: false, estado: 'pendiente', confirmado: false, yaPaso: false };
        porPaciente[c.paciente_id].citas.push(c);
      });

      // Hoy: a quién ya se le envió el recordatorio del día (historial compartido entre recepcionistas)
      if (deHoy) {
        const ids = Object.keys(porPaciente);
        const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
        for (let i = 0; i < ids.length; i += 150) {
          const { data: filas, error: errH } = await supabase.from('seguimiento_contactos').select('paciente_id')
            .eq('lista', LISTA_DIA).in('paciente_id', ids.slice(i, i + 150)).gte('created_at', inicioHoy.toISOString());
          if (errH) { console.error('No se pudo leer el historial de recordatorios', errH); break; }
          (filas || []).forEach((r: any) => enviadosHoyRef.current.add(String(r.paciente_id)));
        }
      }
      if (n !== reqRef.current) return;

      const ahora = horaLocalAhoraISO().slice(0, 19);
      setYaLlegaron(new Set(llegaron.map((c: any) => c.paciente_id)).size);
      setGrupos(Object.values(porPaciente).map(g => {
        const confirmado = g.citas.every(c => c.estado_confirmacion === 'confirmado' || c.estado === 'confirmado_tel');
        const fallido = fallidosRef.current.has(g.key);
        let estado: EstadoRecordatorio;
        if (deHoy) {
          estado = enviadosHoyRef.current.has(g.key) ? 'enviado' : fallido ? 'fallido' : 'pendiente';
        } else {
          const enviado = g.citas.every(c => c.estado_confirmacion && c.estado_confirmacion !== 'pendiente');
          estado = confirmado ? 'confirmado' : enviado ? 'enviado' : fallido ? 'fallido' : 'pendiente';
        }
        return {
          ...g,
          telefono: g.paciente?.telefono,
          tieneTelefono: !!telefonoWA(g.paciente?.telefono),
          estado,
          confirmado,
          yaPaso: deHoy && g.citas.every(c => String(c.inicio).replace(' ', 'T').slice(0, 19) < ahora),
        };
      }));
    } catch (e) {
      console.error(e);
      if (!silencioso) toast.error('No se pudieron cargar las citas para recordar');
    } finally {
      if (n === reqRef.current) setCargando(false);
    }
  }

  // Paso 1: abre WhatsApp (directo en el clic para que el navegador no bloquee la pestaña). No marca nada aún.
  const enviar = (g: Grupo) => {
    const mensaje = construirMensajeRecordatorio(g.citas, profesionales, { yaConfirmado: esHoy && g.confirmado });
    if (!abrirWhatsApp(g.telefono, mensaje)) { marcarFallido(g); return; }
    setEnCurso(g.key);
  };

  // Paso 2a: recepción confirma que salió → recién ahí se marca en la BD
  const confirmarEnviado = async (g: Grupo) => {
    fallidosRef.current.delete(g.key);
    setGrupos(prev => prev.map(x => x.key === g.key && (x.estado === 'pendiente' || x.estado === 'fallido') ? { ...x, estado: 'enviado' } : x));
    setEnCurso(null);
    marcarRecordatorioEnviado(g.citas);
    if (esHoy) {
      enviadosHoyRef.current.add(g.key);
      const { error } = await supabase.from('seguimiento_contactos').insert([{
        paciente_id: g.key, lista: LISTA_DIA, resultado: 'whatsapp', volver_a_contactar: null, usuario_id: usuarioLogueado,
        nota: `Recordatorio del día: ${g.citas.map(c => horaDeStr(c.inicio)).join(', ')} hrs`,
      }]);
      if (error) console.error('No se pudo guardar el recordatorio en el historial', error);
    }
  };

  // Paso 2b: no se pudo → la cita no se toca, queda aparte para corregir el teléfono o llamar
  const marcarFallido = (g: Grupo) => {
    fallidosRef.current.add(g.key);
    setGrupos(prev => prev.map(x => x.key === g.key && x.estado === 'pendiente' ? { ...x, estado: 'fallido' } : x));
    setEnCurso(null);
  };

  const vigentes = grupos.filter(g => !g.yaPaso);
  const pendientes = vigentes.filter(g => g.estado === 'pendiente' && g.tieneTelefono);
  const sinTelefono = vigentes.filter(g => g.estado === 'pendiente' && !g.tieneTelefono);
  const fallidos = vigentes.filter(g => g.estado === 'fallido');
  const enviados = vigentes.filter(g => g.estado === 'enviado');
  const confirmados = vigentes.filter(g => g.estado === 'confirmado');
  const pasados = grupos.filter(g => g.yaPaso);
  const confirmadosTotal = grupos.filter(g => g.confirmado).length;
  const grupoEnCurso = grupos.find(g => g.key === enCurso) || null;

  const etiquetaFiltro = !puedeVerAgendaCompleta
    ? ' · Mis citas'
    : filtroEspecialista !== 'Todos'
      ? ` · Dr. ${buscarDoctor(profesionales, filtroEspecialista)?.apellido || ''}`
      : ' · Todos los especialistas';

  const chipDia = (activo: boolean) => `px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${activo ? 'bg-[#0A111F] text-white border-[#0A111F]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`;

  return (
    <ModalShell
      abierto={abierto}
      onClose={onClose}
      posicion="arriba"
      ancho="max-w-3xl"
      icono={<BellRing className="text-emerald-300" size={24} />}
      colorIcono={{ bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.6)' }}
      colorSubtitulo="#6ee7b7"
      titulo={esHoy ? 'Recordatorios de hoy' : 'Recordatorios'}
      subtitulo={<span className="capitalize">{fecha && fechaLarga(fecha)}{etiquetaFiltro}</span>}
    >
      {/* Día + contadores */}
      <div className="px-6 md:px-8 py-4 border-b border-slate-100 bg-white flex flex-col gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => reiniciar(hoyISO)} className={chipDia(fecha === hoyISO)}>Hoy</button>
          <button type="button" onClick={() => reiniciar(mananaISO)} className={chipDia(fecha === mananaISO)}>
            {new Date(`${mananaISO}T12:00:00`).getDay() === 1 && new Date().getDay() === 6 ? 'Lunes' : 'Mañana'}
          </button>
          <div className="flex items-center gap-1 ml-auto">
            <button type="button" onClick={() => fecha && reiniciar(sumarDiasISO(fecha, -1))} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100" title="Día anterior"><ChevronLeft size={16} /></button>
            <input type="date" className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-[#C9A24B]" value={fecha} onChange={(e) => { if (e.target.value) reiniciar(e.target.value); }} />
            <button type="button" onClick={() => fecha && reiniciar(sumarDiasISO(fecha, 1))} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100" title="Día siguiente"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">{pendientes.length} por enviar</span>
          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{enviados.length} enviados{esHoy ? ' hoy' : ''}</span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{confirmadosTotal} confirmados</span>
          {fallidos.length > 0 && <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">{fallidos.length} no se pudo enviar</span>}
          {sinTelefono.length > 0 && <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-100">{sinTelefono.length} sin teléfono</span>}
          {esHoy && yaLlegaron > 0 && <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{yaLlegaron} ya en la clínica</span>}
          {esHoy && pasados.length > 0 && <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{pasados.length} ya pasó la hora</span>}
        </div>
      </div>

      <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-3">
        {cargando ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin" size={36} />
            <p className="text-xs font-black uppercase tracking-widest">Buscando citas...</p>
          </div>
        ) : grupos.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3 opacity-70">
            <CalendarIcon size={48} className="text-slate-300" />
            <p className="text-sm font-black uppercase tracking-widest text-slate-600">{esHoy && yaLlegaron > 0 ? 'Todos los pacientes de hoy ya llegaron' : 'Sin citas ese día'}</p>
          </div>
        ) : [...pendientes, ...fallidos, ...sinTelefono, ...enviados, ...confirmados, ...pasados].map(g => {
          const esEnCurso = enCurso === g.key;
          const esSiguiente = !enCurso && pendientes[0]?.key === g.key;
          const badge =
            esEnCurso ? { txt: 'Abierto en WhatsApp', cls: 'bg-violet-100 text-violet-700' } :
            g.yaPaso ? { txt: g.estado === 'enviado' ? 'Ya pasó la hora · enviado' : 'Ya pasó la hora', cls: 'bg-slate-100 text-slate-500' } :
            g.estado === 'confirmado' ? { txt: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700' } :
            g.estado === 'enviado' ? { txt: esHoy ? 'Enviado hoy' : 'Enviado · esperando', cls: 'bg-blue-100 text-blue-700' } :
            g.estado === 'fallido' ? { txt: 'No se pudo enviar', cls: 'bg-rose-100 text-rose-700' } :
            !g.tieneTelefono ? { txt: 'Sin teléfono', cls: 'bg-red-100 text-red-600' } :
            { txt: 'Por enviar', cls: 'bg-amber-100 text-amber-700' };
          const doctores = [...new Set(g.citas.map(c => `Dr. ${buscarDoctor(profesionales, c.profesional_id)?.apellido || 'S/A'}`))].join(', ');

          return (
            <div key={g.key} className={`bg-white p-4 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${esEnCurso ? 'border-violet-400 ring-2 ring-violet-100' : esSiguiente ? 'border-emerald-400 ring-2 ring-emerald-100' : g.estado === 'fallido' ? 'border-rose-200' : 'border-slate-200'} ${g.estado === 'confirmado' || g.yaPaso ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex flex-col gap-1 shrink-0">
                  {g.citas.map(c => <span key={c.id} className="text-[11px] font-black text-[#8A6D2F] bg-[#C9A24B]/10 px-2 py-1 rounded-md text-center">{horaDeStr(c.inicio)}</span>)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-black text-sm text-slate-800 uppercase leading-tight truncate">{nombrePaciente(g.paciente) || 'S/N'}</h4>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${badge.cls}`}>{badge.txt}</span>
                    {esHoy && (
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${g.confirmado ? 'border-emerald-200 text-emerald-700' : 'border-amber-200 text-amber-700'}`}>
                        {g.confirmado ? 'Confirmó' : 'Sin confirmar'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <span className="flex items-center gap-1"><Phone size={11} /> {g.telefono || 'Sin teléfono'}</span>
                    <span>•</span>
                    <span>{doctores}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                {esEnCurso ? (
                  <>
                    <button onClick={() => marcarFallido(g)} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center gap-1.5"><X size={14} /> No se pudo</button>
                    <button onClick={() => confirmarEnviado(g)} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm flex items-center gap-1.5"><CheckCircle2 size={14} /> Sí, se envió</button>
                  </>
                ) : g.estado === 'fallido' ? (
                  <>
                    <Link prefetch={false} href={`/pacientes/${g.key}`} onClick={onClose} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"><User size={14} /> Corregir teléfono</Link>
                    <button onClick={() => enviar(g)} disabled={!!enCurso} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-40"><RefreshCcw size={14} /> Reintentar</button>
                  </>
                ) : !g.tieneTelefono ? (
                  <Link prefetch={false} href={`/pacientes/${g.key}`} onClick={onClose} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"><User size={14} /> Agregar teléfono</Link>
                ) : g.estado === 'confirmado' ? (
                  <CheckCircle2 className="text-emerald-500" size={22} />
                ) : g.yaPaso ? (
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5"><Clock size={14} /> Llamar si no llega</span>
                ) : (
                  <button
                    onClick={() => enviar(g)}
                    disabled={!!enCurso}
                    title={enCurso ? 'Primero confirma si se envió el mensaje abierto' : undefined}
                    className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${g.estado === 'enviado' ? 'text-slate-500 border border-slate-200 hover:bg-slate-50' : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm'}`}
                  >
                    <MessageCircle size={14} /> {g.estado === 'enviado' ? 'Reenviar' : 'Enviar'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-6 md:p-8 border-t border-slate-100 bg-white shrink-0">
        {grupoEnCurso ? (
          <div className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-4">
            <p className="text-center text-xs font-black uppercase tracking-widest text-violet-800 mb-3">¿Se envió el mensaje a {nombrePaciente(grupoEnCurso.paciente)}?</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => marcarFallido(grupoEnCurso)} className="py-3.5 rounded-xl border border-rose-200 bg-white text-rose-600 font-black text-[11px] uppercase tracking-widest hover:bg-rose-50 flex items-center justify-center gap-2"><X size={16} /> No se pudo enviar</button>
              <button onClick={() => confirmarEnviado(grupoEnCurso)} className="py-3.5 rounded-xl bg-emerald-500 text-white font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 shadow-md flex items-center justify-center gap-2"><CheckCircle2 size={16} /> Sí, se envió</button>
            </div>
          </div>
        ) : pendientes.length > 0 ? (
          <button onClick={() => enviar(pendientes[0])} className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md hover:bg-emerald-600 transition-all flex items-center justify-center gap-2">
            <Send size={16} /> Enviar siguiente: {nombrePaciente(pendientes[0].paciente)}
            <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px]">{pendientes.length} restantes</span>
          </button>
        ) : (
          <div className="w-full py-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 text-center px-3">
            <CheckCircle2 size={16} className="shrink-0" />
            {grupos.length === 0 ? 'Nada por enviar' : fallidos.length > 0 ? `Listo · ${fallidos.length} no se pudieron enviar (revisa su teléfono o llámalos)` : 'Todos los recordatorios están enviados'}
          </div>
        )}
        <p className="text-[10px] font-bold text-slate-400 text-center mt-3">
          {esHoy
            ? 'Hoy aparecen todos los pacientes que aún no llegan, en orden de hora. A los que ya confirmaron se les manda un "te esperamos", sin pedir confirmación.'
            : 'Cada clic abre WhatsApp con el mensaje listo. Si salió bien, vuelve aquí y marca "Sí, se envió". Si el número está malo o no tiene WhatsApp, marca "No se pudo": la cita no se modifica.'}
        </p>
      </div>
    </ModalShell>
  );
}

'use client'
// "Pedir reseñas": envía por WhatsApp, uno tras otro, el link de reseña de Google a los pacientes atendidos.
// Cada envío confirmado queda en el historial de contactos (tabla seguimiento_contactos) para no pedirle dos veces
// la reseña al mismo paciente. Si la tabla no existe, los enviados se recuerdan solo mientras el modal esté abierto.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, MessageCircle, Phone, RefreshCcw, Send, Star, User, X } from 'lucide-react'
import ModalShell from './ModalShell'
import { abrirWhatsApp, buscarDoctor, construirMensajeResena, getLocalDateISO, horaDeStr, nombrePaciente, telefonoWA } from './utils'
import type { Profesional } from './types'

const DIAS_SIN_REPETIR = 365; // a quien ya se le pidió reseña no se le vuelve a pedir en este tiempo

type Periodo = 'hoy' | 'ayer' | '7' | '30';
const PERIODOS: { id: Periodo; texto: string }[] = [
  { id: 'hoy', texto: 'Hoy' },
  { id: 'ayer', texto: 'Ayer' },
  { id: '7', texto: 'Últimos 7 días' },
  { id: '30', texto: 'Últimos 30 días' },
];

type Estado = 'pendiente' | 'enviado' | 'fallido' | 'ya_pedida';
interface Grupo {
  key: string;            // paciente_id
  paciente: any;
  cita: any;              // última atención del período
  telefono?: string;
  tieneTelefono: boolean;
  estado: Estado;
  pedidaEl?: string;      // fecha en que ya se le pidió (historial)
}

interface Props {
  abierto: boolean;
  onClose: () => void;
  profesionales: Profesional[];
  usuarioLogueado: string | null;
  puedeVerAgendaCompleta: boolean;
  filtroEspecialista: string;
}

const rangoDe = (p: Periodo) => {
  const hoy = new Date();
  const dia = (n: number) => { const d = new Date(hoy); d.setDate(d.getDate() - n); return getLocalDateISO(d); };
  if (p === 'hoy') return { desde: dia(0), hasta: dia(0) };
  if (p === 'ayer') return { desde: dia(1), hasta: dia(1) };
  return { desde: dia(Number(p) - 1), hasta: dia(0) };
};
const fechaCorta = (iso?: string | null) => (iso ? new Date(String(iso).replace(' ', 'T')).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '');

export default function ModalResenas({ abierto, onClose, profesionales, usuarioLogueado, puedeVerAgendaCompleta, filtroEspecialista }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [conHistorial, setConHistorial] = useState(true);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!abierto) return;
    setPeriodo('hoy');
    cargar('hoy');
  }, [abierto]);

  const cambiarPeriodo = (p: Periodo) => { setPeriodo(p); cargar(p); };

  async function cargar(p: Periodo) {
    const req = ++reqRef.current;
    setCargando(true); setEnCurso(null);
    try {
      const { desde, hasta } = rangoDe(p);
      let q = supabase.from('citas')
        .select('id, inicio, motivo, profesional_id, paciente_id, pacientes(id, nombre, apellido, telefono, activo)')
        .eq('estado', 'atendido')
        .gte('inicio', `${desde}T00:00:00`).lte('inicio', `${hasta}T23:59:59`)
        .order('inicio', { ascending: false })
        .range(0, 2999);
      if (!puedeVerAgendaCompleta && usuarioLogueado) q = q.eq('profesional_id', usuarioLogueado);
      else if (filtroEspecialista !== 'Todos') q = q.eq('profesional_id', filtroEspecialista);
      const { data, error } = await q;
      if (error) throw error;

      // Un mensaje por paciente: su última atención del período
      const porPaciente = new Map<string, Grupo>();
      for (const c of data || []) {
        if (!c.paciente_id || porPaciente.has(c.paciente_id)) continue;
        const pac: any = Array.isArray(c.pacientes) ? c.pacientes[0] : c.pacientes;
        if (pac?.activo === false) continue;
        porPaciente.set(c.paciente_id, {
          key: c.paciente_id, paciente: pac, cita: c, telefono: pac?.telefono,
          tieneTelefono: !!telefonoWA(pac?.telefono), estado: 'pendiente',
        });
      }

      // A quién ya se le pidió reseña (historial de contactos)
      const ids = [...porPaciente.keys()];
      const pedidas = new Map<string, string>();
      let historial = true;
      const desdeHistorial = new Date(); desdeHistorial.setDate(desdeHistorial.getDate() - DIAS_SIN_REPETIR);
      for (let i = 0; i < ids.length && historial; i += 150) {
        const { data: filas, error: errHist } = await supabase.from('seguimiento_contactos')
          .select('paciente_id, created_at').eq('resultado', 'resena')
          .in('paciente_id', ids.slice(i, i + 150)).gte('created_at', desdeHistorial.toISOString());
        if (errHist) { historial = false; break; }
        for (const f of filas || []) {
          const actual = pedidas.get(f.paciente_id);
          if (!actual || f.created_at > actual) pedidas.set(f.paciente_id, f.created_at);
        }
      }
      if (req !== reqRef.current) return;
      setConHistorial(historial);
      setGrupos([...porPaciente.values()].map(g => (pedidas.has(g.key) ? { ...g, estado: 'ya_pedida', pedidaEl: pedidas.get(g.key) } : g)));
    } catch (e) {
      console.error(e);
      if (req === reqRef.current) toast.error('No se pudieron cargar los pacientes atendidos');
    } finally {
      if (req === reqRef.current) setCargando(false);
    }
  }

  // Paso 1: abre WhatsApp con el mensaje listo (en el mismo clic para que el navegador no lo bloquee)
  const enviar = (g: Grupo) => {
    const cita = { ...g.cita, pacientes: g.paciente };
    if (!abrirWhatsApp(g.telefono, construirMensajeResena(cita, profesionales))) { marcar(g, 'fallido'); return; }
    setEnCurso(g.key);
  };

  // Paso 2: recepción confirma si salió. Solo entonces queda en el historial.
  const marcar = (g: Grupo, estado: 'enviado' | 'fallido') => {
    setGrupos(prev => prev.map(x => (x.key === g.key ? { ...x, estado, pedidaEl: estado === 'enviado' ? new Date().toISOString() : x.pedidaEl } : x)));
    setEnCurso(null);
    if (estado === 'enviado') guardarEnHistorial(g);
  };

  async function guardarEnHistorial(g: Grupo) {
    if (!conHistorial) return;
    const volver = new Date(); volver.setDate(volver.getDate() + DIAS_SIN_REPETIR);
    const { error } = await supabase.from('seguimiento_contactos').insert([{
      paciente_id: g.key, lista: 'resena', resultado: 'resena',
      volver_a_contactar: getLocalDateISO(volver), usuario_id: usuarioLogueado,
    }]);
    if (error) {
      console.error('No se pudo guardar el envío en el historial', error);
      toast.warning('El mensaje se envió, pero no quedó en el historial', { description: 'Puede que tu usuario no tenga permiso para el historial de contactos.' });
    }
  }

  const pendientes = grupos.filter(g => g.estado === 'pendiente' && g.tieneTelefono);
  const sinTelefono = grupos.filter(g => g.estado === 'pendiente' && !g.tieneTelefono);
  const fallidos = grupos.filter(g => g.estado === 'fallido');
  const enviados = grupos.filter(g => g.estado === 'enviado');
  const yaPedidas = grupos.filter(g => g.estado === 'ya_pedida');
  const grupoEnCurso = grupos.find(g => g.key === enCurso) || null;

  const etiquetaFiltro = !puedeVerAgendaCompleta
    ? ' · Mis pacientes'
    : filtroEspecialista !== 'Todos'
      ? ` · Dr. ${buscarDoctor(profesionales, filtroEspecialista)?.apellido || ''}`
      : ' · Todos los especialistas';

  return (
    <ModalShell
      abierto={abierto}
      onClose={onClose}
      posicion="arriba"
      ancho="max-w-3xl"
      icono={<Star className="text-amber-300" size={24} />}
      colorIcono={{ bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.6)' }}
      colorSubtitulo="#fcd34d"
      titulo="Pedir reseñas en Google"
      subtitulo={<span>Pacientes atendidos{etiquetaFiltro}</span>}
    >
      {/* Período + contadores */}
      <div className="px-6 md:px-8 py-4 border-b border-slate-100 bg-white flex flex-col gap-3 shrink-0">
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map(p => (
            <button key={p.id} type="button" onClick={() => cambiarPeriodo(p.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-colors ${periodo === p.id ? 'bg-[#0A111F] border-[#0A111F] text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              {p.texto}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">{pendientes.length} por enviar</span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{enviados.length} enviados</span>
          {yaPedidas.length > 0 && <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{yaPedidas.length} ya se les pidió</span>}
          {fallidos.length > 0 && <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">{fallidos.length} no se pudo enviar</span>}
          {sinTelefono.length > 0 && <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-100">{sinTelefono.length} sin teléfono</span>}
        </div>
        {!conHistorial && (
          <p className="text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
            El historial de contactos no está activado: los envíos se recuerdan solo mientras esta ventana esté abierta (se activa con seguimiento_contactos.sql).
          </p>
        )}
      </div>

      <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-3">
        {cargando ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin" size={36} />
            <p className="text-xs font-black uppercase tracking-widest">Buscando pacientes atendidos...</p>
          </div>
        ) : grupos.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3 opacity-70">
            <Star size={48} className="text-slate-300" />
            <p className="text-sm font-black uppercase tracking-widest text-slate-600">Sin pacientes atendidos en este período</p>
            <p className="text-xs">Solo aparecen las citas marcadas como "Atendido".</p>
          </div>
        ) : [...pendientes, ...fallidos, ...sinTelefono, ...enviados, ...yaPedidas].map(g => {
          const esEnCurso = enCurso === g.key;
          const esSiguiente = !enCurso && pendientes[0]?.key === g.key;
          const badge =
            esEnCurso ? { txt: 'Abierto en WhatsApp', cls: 'bg-violet-100 text-violet-700' } :
            g.estado === 'enviado' ? { txt: 'Enviado', cls: 'bg-emerald-100 text-emerald-700' } :
            g.estado === 'ya_pedida' ? { txt: `Ya se le pidió el ${fechaCorta(g.pedidaEl)}`, cls: 'bg-slate-100 text-slate-500' } :
            g.estado === 'fallido' ? { txt: 'No se pudo enviar', cls: 'bg-rose-100 text-rose-700' } :
            !g.tieneTelefono ? { txt: 'Sin teléfono', cls: 'bg-red-100 text-red-600' } :
            { txt: 'Por enviar', cls: 'bg-amber-100 text-amber-700' };
          const doctor = buscarDoctor(profesionales, g.cita.profesional_id);

          return (
            <div key={g.key} className={`bg-white p-4 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${esEnCurso ? 'border-violet-400 ring-2 ring-violet-100' : esSiguiente ? 'border-amber-400 ring-2 ring-amber-100' : g.estado === 'fallido' ? 'border-rose-200' : 'border-slate-200'} ${g.estado === 'enviado' || g.estado === 'ya_pedida' ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex flex-col items-center shrink-0 text-[11px] font-black text-[#8A6D2F] bg-[#C9A24B]/10 px-2 py-1 rounded-md leading-tight">
                  <span>{fechaCorta(g.cita.inicio)}</span>
                  <span className="text-[10px] font-bold opacity-80">{horaDeStr(g.cita.inicio)}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-black text-sm text-slate-800 uppercase leading-tight truncate">{nombrePaciente(g.paciente) || 'S/N'}</h4>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${badge.cls}`}>{badge.txt}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <span className="flex items-center gap-1"><Phone size={11} /> {g.telefono || 'Sin teléfono'}</span>
                    <span>•</span>
                    <span>{doctor ? `Dr. ${doctor.apellido}` : 'S/A'}</span>
                    {g.cita.motivo && <><span>•</span><span className="truncate max-w-[180px]">{g.cita.motivo}</span></>}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                {esEnCurso ? (
                  <>
                    <button onClick={() => marcar(g, 'fallido')} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center gap-1.5"><X size={14} /> No se pudo</button>
                    <button onClick={() => marcar(g, 'enviado')} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm flex items-center gap-1.5"><CheckCircle2 size={14} /> Sí, se envió</button>
                  </>
                ) : !g.tieneTelefono ? (
                  <Link prefetch={false} href={`/pacientes/${g.key}/datos`} onClick={onClose} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5"><User size={14} /> Agregar teléfono</Link>
                ) : g.estado === 'enviado' ? (
                  <CheckCircle2 className="text-emerald-500" size={22} />
                ) : (
                  <button
                    onClick={() => enviar(g)}
                    disabled={!!enCurso}
                    title={enCurso ? 'Primero confirma si se envió el mensaje abierto' : undefined}
                    className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${g.estado === 'pendiente' ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm' : 'text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                  >
                    {g.estado === 'pendiente' ? <><MessageCircle size={14} /> Enviar</> : g.estado === 'fallido' ? <><RefreshCcw size={14} /> Reintentar</> : <><MessageCircle size={14} /> Enviar de nuevo</>}
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
              <button onClick={() => marcar(grupoEnCurso, 'fallido')} className="py-3.5 rounded-xl border border-rose-200 bg-white text-rose-600 font-black text-[11px] uppercase tracking-widest hover:bg-rose-50 flex items-center justify-center gap-2"><X size={16} /> No se pudo enviar</button>
              <button onClick={() => marcar(grupoEnCurso, 'enviado')} className="py-3.5 rounded-xl bg-emerald-500 text-white font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 shadow-md flex items-center justify-center gap-2"><CheckCircle2 size={16} /> Sí, se envió</button>
            </div>
          </div>
        ) : pendientes.length > 0 ? (
          <button onClick={() => enviar(pendientes[0])} className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md hover:bg-amber-600 transition-all flex items-center justify-center gap-2">
            <Send size={16} /> Enviar siguiente: {nombrePaciente(pendientes[0].paciente)}
            <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px]">{pendientes.length} restantes</span>
          </button>
        ) : (
          <div className="w-full py-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 text-center px-3">
            <CheckCircle2 size={16} className="shrink-0" />
            {grupos.length === 0 ? 'Nada por enviar' : fallidos.length > 0 ? `Listo · ${fallidos.length} no se pudieron enviar (revisa su teléfono)` : 'No quedan reseñas por pedir en este período'}
          </div>
        )}
        <p className="text-[10px] font-bold text-slate-400 text-center mt-3">
          Cada clic abre WhatsApp con el link de reseña listo. Si salió bien, vuelve aquí y marca "Sí, se envió": así no se le vuelve a pedir en {DIAS_SIN_REPETIR} días. A quien ya se le pidió aparece al final.
        </p>
      </div>
    </ModalShell>
  );
}

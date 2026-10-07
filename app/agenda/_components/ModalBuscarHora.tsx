'use client'
// "¿Cuándo hay hora?": busca los próximos huecos libres entre todos los doctores o uno específico.
// Busca en tramos de 2 semanas (evita el límite de 1000 filas de Supabase) hasta juntar suficientes.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { ArrowDown, Calendar as CalendarIcon, Loader2, MessageCircle, Plus, Search, Stethoscope } from 'lucide-react'
import ModalShell from './ModalShell'
import {
  capitalizar, DURACIONES_DISPONIBLES, esWebPendiente, fechaLarga, getLocalDateISO, getMinsFromDateStr,
  GOLD_LIGHT, minsToT, tToMins,
} from './utils'
import type { Hueco, Profesional } from './types'

const TRAMO_DIAS = 14;
const MAX_TRAMOS = 8;            // ~4 meses
const MAX_POR_DOCTOR_DIA = 3;
const PASO = 5;

type Turno = 'cualquiera' | 'manana' | 'tarde';
interface Filtro { profesional: string; duracion: number; turno: Turno; desde: string; }

interface Props {
  abierto: boolean;
  onClose: () => void;
  onElegir: (h: Hueco) => void;
  profesionales: Profesional[];
  usuarioLogueado: string | null;
  puedeVerAgendaCompleta: boolean;
  especialistaInicial: string;
}

export default function ModalBuscarHora({ abierto, onClose, onElegir, profesionales, usuarioLogueado, puedeVerAgendaCompleta, especialistaInicial }: Props) {
  const hoyISO = getLocalDateISO(new Date());
  const [filtro, setFiltro] = useState<Filtro>({ profesional: 'Todos', duracion: 30, turno: 'cualquiera', desde: hoyISO });
  const [huecos, setHuecos] = useState<Hueco[]>([]);
  const [limite, setLimite] = useState(PASO);
  const [buscando, setBuscando] = useState(false);
  const [agotada, setAgotada] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const f: Filtro = {
      profesional: !puedeVerAgendaCompleta ? (usuarioLogueado || 'Todos') : especialistaInicial,
      duracion: 30, turno: 'cualquiera', desde: hoyISO,
    };
    setFiltro(f); setHuecos([]); setLimite(PASO);
    buscar(f, PASO);
  }, [abierto]);

  async function buscar(f: Filtro, lim: number) {
    setBuscando(true);
    try {
      const desdeISO = f.desde && f.desde > hoyISO ? f.desde : hoyISO;
      let pros = profesionales.filter(p => p.user_id && (puedeVerAgendaCompleta || p.user_id === usuarioLogueado));
      if (f.profesional !== 'Todos') pros = pros.filter(p => p.user_id === f.profesional);
      if (pros.length === 0) { setHuecos([]); setAgotada(true); return; }
      const userIds = pros.map(p => p.user_id);
      const proIds = pros.map(p => p.id);

      const { data: dispo, error: errDispo } = await supabase.from('disponibilidad_profesional').select('*').in('profesional_id', userIds);
      if (errDispo) throw errDispo;

      const ahora = new Date();
      const minAhora = Math.ceil((ahora.getHours() * 60 + ahora.getMinutes() + 1) / 15) * 15;
      const encontrados: Hueco[] = [];
      let sinMas = true;

      for (let t = 0; t < MAX_TRAMOS; t++) {
        const ini = new Date(desdeISO + 'T00:00:00'); ini.setDate(ini.getDate() + t * TRAMO_DIAS);
        const fin = new Date(ini); fin.setDate(fin.getDate() + TRAMO_DIAS - 1);
        const iniISO = getLocalDateISO(ini); const finISO = getLocalDateISO(fin);

        const [bloqRes, citasRes] = await Promise.all([
          supabase.from('bloqueos_agenda').select('profesional_id, fecha, hora_inicio, hora_fin').in('profesional_id', proIds).gte('fecha', iniISO).lte('fecha', finISO),
          supabase.from('citas').select('profesional_id, inicio, fin, estado_confirmacion, motivo').in('profesional_id', userIds).gte('inicio', `${iniISO}T00:00:00`).lte('inicio', `${finISO}T23:59:59`).neq('estado', 'cancelada').range(0, 4999),
        ]);
        if (bloqRes.error) throw bloqRes.error;
        if (citasRes.error) throw citasRes.error;
        const citasTramo = (citasRes.data || []).filter((c: any) => !esWebPendiente(c));

        for (let d = 0; d < TRAMO_DIAS; d++) {
          const dia = new Date(ini); dia.setDate(dia.getDate() + d);
          const fechaISO = getLocalDateISO(dia);

          pros.forEach(pro => {
            const dispPro = (dispo || []).filter((x: any) => x.profesional_id === pro.user_id);
            const especiales = dispPro.filter((x: any) => x.fecha_especifica === fechaISO);
            const bloques = (especiales.length > 0 ? especiales : dispPro.filter((x: any) => x.dia_semana === dia.getDay() && !x.fecha_especifica))
              .sort((a: any, b: any) => a.hora_inicio.localeCompare(b.hora_inicio));
            if (bloques.length === 0) return;

            const bloqDia = (bloqRes.data || []).filter((b: any) => b.profesional_id === pro.id && b.fecha === fechaISO);
            if (bloqDia.some((b: any) => !b.hora_inicio || !b.hora_fin)) return;

            const ocupadas = citasTramo
              .filter((c: any) => c.profesional_id === pro.user_id && c.inicio.startsWith(fechaISO))
              .map((c: any) => ({ i: getMinsFromDateStr(c.inicio), f: getMinsFromDateStr(c.fin) }));

            const minimo = fechaISO === hoyISO ? minAhora : 0;
            let tomados = 0;
            let ultimoFin = -1;

            for (const bloque of bloques) {
              const e = tToMins(bloque.hora_fin.substring(0, 5));
              for (let s = tToMins(bloque.hora_inicio.substring(0, 5)); s + f.duracion <= e && tomados < MAX_POR_DOCTOR_DIA; s += 15) {
                const sFin = s + f.duracion;
                const enTurno = f.turno === 'cualquiera' || (f.turno === 'manana' ? s < 13 * 60 : s >= 13 * 60);
                const libre = !ocupadas.some(o => s < o.f && sFin > o.i)
                  && !bloqDia.some((b: any) => s < tToMins(b.hora_fin.substring(0, 5)) && sFin > tToMins(b.hora_inicio.substring(0, 5)));
                if (enTurno && libre && s >= minimo && s >= ultimoFin) {
                  encontrados.push({ fecha: fechaISO, hora: minsToT(s), duracion: f.duracion, profesional_id: pro.user_id, doctor: `${pro.nombre} ${pro.apellido}` });
                  tomados++;
                  ultimoFin = sFin; // las opciones de un mismo doctor no se solapan entre sí
                }
              }
            }
          });
        }
        if (encontrados.length >= lim) { sinMas = false; break; }
      }

      encontrados.sort((a, b) => `${a.fecha}${a.hora}${a.doctor}`.localeCompare(`${b.fecha}${b.hora}${b.doctor}`));
      setHuecos(encontrados);
      setAgotada(sinMas);
    } catch (e) {
      console.error(e);
      toast.error('No se pudo buscar horas disponibles');
    } finally {
      setBuscando(false);
    }
  }

  const cambiarFiltro = (cambios: Partial<Filtro>) => {
    const f = { ...filtro, ...cambios };
    setFiltro(f); setLimite(PASO);
    buscar(f, PASO);
  };

  const verMas = () => {
    const nuevo = limite + PASO;
    setLimite(nuevo);
    if (huecos.length < nuevo && !agotada) buscar(filtro, nuevo);
  };

  const copiarOpciones = async () => {
    const lista = huecos.slice(0, limite).map(h => `• ${capitalizar(fechaLarga(h.fecha))} a las ${h.hora} hrs con Dr(a). ${h.doctor}`).join('\n');
    try {
      await navigator.clipboard.writeText(`Estas son las próximas horas disponibles en Clínica Dignidad:\n\n${lista}\n\n¿Cuál te acomoda?`);
      toast.success('Opciones copiadas, puedes pegarlas en WhatsApp');
    } catch { toast.error('No se pudo copiar'); }
  };

  const mananaISO = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return getLocalDateISO(d); })();
  const selectCls = "w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#C9A24B] disabled:opacity-70";
  const labelCls = "text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1";

  return (
    <ModalShell
      abierto={abierto}
      onClose={onClose}
      posicion="arriba"
      icono={<Search size={24} style={{ color: GOLD_LIGHT }} />}
      titulo="Próxima hora libre"
      subtitulo="Para cuando el paciente llama"
    >
      {/* Filtros */}
      <div className="px-6 md:px-8 py-4 border-b border-slate-100 bg-white grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <div className="col-span-2 md:col-span-1 space-y-1">
          <label className={labelCls}>Especialista</label>
          <select className={selectCls} value={filtro.profesional} disabled={!puedeVerAgendaCompleta || buscando} onChange={e => cambiarFiltro({ profesional: e.target.value })}>
            {puedeVerAgendaCompleta && <option value="Todos">Cualquiera</option>}
            {profesionales.filter(p => puedeVerAgendaCompleta || p.user_id === usuarioLogueado).map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Duración</label>
          <select className={selectCls} value={filtro.duracion} disabled={buscando} onChange={e => cambiarFiltro({ duracion: Number(e.target.value) })}>
            {DURACIONES_DISPONIBLES.map(d => <option key={d} value={d}>{d} min</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Turno</label>
          <select className={selectCls} value={filtro.turno} disabled={buscando} onChange={e => cambiarFiltro({ turno: e.target.value as Turno })}>
            <option value="cualquiera">Cualquiera</option>
            <option value="manana">Mañana (antes 13:00)</option>
            <option value="tarde">Tarde (desde 13:00)</option>
          </select>
        </div>
        <div className="col-span-2 md:col-span-1 space-y-1">
          <label className={labelCls}>Desde</label>
          <input type="date" min={hoyISO} className={selectCls} value={filtro.desde} disabled={buscando} onChange={e => { if (e.target.value) cambiarFiltro({ desde: e.target.value }); }} />
        </div>
      </div>

      <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/50 custom-scrollbar space-y-2.5">
        {buscando && huecos.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin text-[#C9A24B]" size={32} />
            <p className="text-xs font-black uppercase tracking-widest">Buscando horas libres...</p>
          </div>
        ) : huecos.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3 opacity-70">
            <CalendarIcon size={44} className="text-slate-300" />
            <p className="text-sm font-black uppercase tracking-widest text-slate-600">Sin horas disponibles</p>
            <p className="text-xs text-center max-w-xs">No hay huecos en los próximos meses con estos filtros. Prueba con otro especialista, turno o una duración menor.</p>
          </div>
        ) : (
          <>
            {huecos.slice(0, limite).map((h, i) => {
              const etiqueta = h.fecha === hoyISO ? 'Hoy' : h.fecha === mananaISO ? 'Mañana' : null;
              return (
                <div key={`${h.fecha}-${h.hora}-${h.profesional_id}`} className={`bg-white p-4 rounded-2xl border shadow-sm flex items-center justify-between gap-3 ${i === 0 ? 'border-[#C9A24B] ring-2 ring-[#C9A24B]/15' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-16 h-14 rounded-xl bg-[#C9A24B]/10 text-[#8A6D2F] flex flex-col items-center justify-center shrink-0">
                      <span className="text-base font-black leading-none">{h.hora}</span>
                      <span className="text-[9px] font-bold mt-1">{h.duracion} min</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-sm text-slate-800 capitalize leading-tight">
                        {etiqueta && <span className="mr-2 text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded align-middle">{etiqueta}</span>}
                        {fechaLarga(h.fecha)}
                      </p>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mt-1 flex items-center gap-1 truncate"><Stethoscope size={12} /> Dr(a). {h.doctor}</p>
                    </div>
                  </div>
                  <button onClick={() => onElegir(h)} className="shrink-0 px-4 py-2.5 bg-[#C9A24B] hover:bg-[#B38D3A] text-[#0A111F] rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm transition-colors">
                    <Plus size={14} strokeWidth={3} /> Agendar
                  </button>
                </div>
              );
            })}
            {(huecos.length > limite || !agotada) && (
              <button onClick={verMas} disabled={buscando} className="w-full py-3 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-[#8A6D2F] border-2 border-dashed border-slate-200 hover:border-[#C9A24B]/50 rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                {buscando ? <Loader2 size={14} className="animate-spin" /> : <ArrowDown size={14} />} Ver {PASO} más
              </button>
            )}
          </>
        )}
      </div>

      {huecos.length > 0 && (
        <div className="px-6 md:px-8 py-4 border-t border-slate-100 bg-white shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[10px] font-bold text-slate-400">Máximo {MAX_POR_DOCTOR_DIA} opciones por doctor y día, sin solaparse entre sí.</p>
          <button onClick={copiarOpciones} className="px-4 py-2.5 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
            <MessageCircle size={14} /> Copiar opciones para WhatsApp
          </button>
        </div>
      )}
    </ModalShell>
  );
}

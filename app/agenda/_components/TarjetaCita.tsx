'use client'
// Tarjetas de cita: la grande para la vista día y la compacta para la vista semana.
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Activity, AlertTriangle, Ban, CalendarClock, CalendarPlus, CheckCircle2, ChevronDown, ClipboardList, Coins,
  FileText, Globe, Link as LinkIcon, MessageCircle, MessageSquareText, Phone, Star, Timer, Trash2, User,
} from 'lucide-react'
import {
  buscarDoctor, claseBadgeSemaforo, DIAS_HASTA_CONTROL, ESTADOS_CITA, estiloInasistencias, formatNombreDoctor,
  getAvatarColorClass, getInitials, horaDeStr, MESES_INASISTENCIAS, minutosDesde, nivelSemaforo, requiereControl,
  type NivelSemaforo,
} from './utils'
import type { Profesional } from './types'

export interface AccionesCita {
  onCambiarEstado: (cita: any, estado: string) => void;
  onReprogramar: (cita: any) => void;
  onPresupuesto: (cita: any) => void;
  onRecordatorio: (cita: any) => void;
  onResena: (cita: any) => void;
  onCaja: (cita: any) => void;
  onEliminar: (cita: any) => void;
  onInasistencia: (cita: any) => void;
  onControl: (cita: any) => void;
}

interface Comunes {
  cita: any;
  esSobrecupo: boolean;
  ahoraMs: number;
  puedeVerFinanzas: boolean;
  acciones: AccionesCita;
}

const semaforoDe = (c: any, ahoraMs: number) => {
  const min = c.estado === 'en_espera' ? minutosDesde(c.hora_llegada, ahoraMs) : null;
  return { min, nivel: nivelSemaforo(min) };
};

const claseFondoSemaforo = (n: NivelSemaforo) =>
  n === 'rojo' ? '!bg-red-50 !border-red-400 ring-2 ring-red-300' : n === 'naranja' ? '!bg-orange-50 !border-orange-300 ring-2 ring-orange-200' : '';

// ─────────────────────────────────────────────────────────────
// Vista día
// ─────────────────────────────────────────────────────────────
export function TarjetaCitaDia({ cita: c, index, esSobrecupo, ahoraMs, puedeVerFinanzas, acciones, profesionales, usuariosMap }: Comunes & {
  index: number;
  profesionales: Profesional[];
  usuariosMap: Record<string, string>;
}) {
  const pNombre = c.pacientes?.nombre || 'S/N';
  const pApellido = c.pacientes?.apellido || '';
  const doctor = buscarDoctor(profesionales, c.profesional_id);
  const theme = getAvatarColorClass(pNombre + pApellido);
  const estado = ESTADOS_CITA[c.estado] || ESTADOS_CITA.programada;
  const { min: minEspera, nivel } = semaforoDe(c, ahoraMs);
  const btn = "p-2.5 md:p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors";

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.05, duration: 0.3, ease: 'easeOut' }}
      className="relative mb-6 z-10 flex md:block flex-col gap-2 group"
    >
      <div className="md:absolute md:-left-[140px] md:top-4 md:w-[80px] text-left md:text-right flex md:block items-center justify-between md:justify-start gap-2 mb-2 md:mb-0 px-2 md:px-0">
        <p className="text-xl font-black text-[#0A111F] leading-none tracking-tight group-hover:text-[#C9A24B] transition-colors">{horaDeStr(c.inicio)}</p>
        <p className="text-xs font-semibold text-slate-400 mt-1">{horaDeStr(c.fin)}</p>
      </div>

      <motion.div
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ delay: Math.min(index, 10) * 0.05 + 0.2, type: 'spring' }}
        className={`hidden md:block absolute -left-[45px] top-5 w-3 h-3 rounded-full bg-white border-[3px] shadow-[0_0_0_6px_#FBF8F2] z-20 group-hover:scale-125 transition-transform ${esSobrecupo ? 'border-red-500' : 'border-[#C9A24B]'}`}
      />

      <div className={`bg-white rounded-2xl shadow-sm hover:shadow-md transition-all border border-l-4 ${theme.border} p-5 md:p-6 w-full flex flex-col gap-4 hover:-translate-y-0.5 ${esSobrecupo ? 'border-red-100 shadow-[0_4px_12px_rgba(239,68,68,0.08)]' : 'border-slate-100'} ${claseFondoSemaforo(nivel)}`}>
        <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-4 sm:gap-0">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className={`w-12 h-12 rounded-full ${theme.bg} ${theme.text} flex items-center justify-center font-bold text-lg shrink-0`}>{getInitials(pNombre, pApellido)}</div>

            <div className="relative flex-1">
              <div className="flex flex-wrap gap-2 mb-1.5 items-center">
                {minEspera !== null && (
                  <span className={`text-[10px] md:text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 w-max shadow-sm ${claseBadgeSemaforo(nivel)}`} title={`Llegó a las ${horaDeStr(c.hora_llegada)}`}>
                    <Timer size={12} /> Esperando {minEspera} min
                  </span>
                )}
                {c.inasistencias > 0 && (
                  <span className={`text-[10px] md:text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 w-max border ${estiloInasistencias(c.inasistencias)}`} title={`Citas marcadas "No asistió" en los últimos ${MESES_INASISTENCIAS} meses`}>
                    <Ban size={12} /> {c.inasistencias} inasistencia{c.inasistencias === 1 ? '' : 's'}
                  </span>
                )}
                {esSobrecupo && (
                  <span className="bg-red-500 text-white text-[10px] md:text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 w-max animate-pulse shadow-sm">
                    <AlertTriangle size={12} /> Cita de Sobrecupo
                  </span>
                )}
                {c.motivo?.includes('Online') && (
                  <span className="bg-blue-50 text-blue-600 border border-blue-100 text-[10px] md:text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 w-max shadow-sm">
                    <Globe size={12} /> Agendamiento Web
                  </span>
                )}
                {c.estado_confirmacion === 'confirmado' && (
                  <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] md:text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 w-max shadow-sm">
                    <CheckCircle2 size={12} /> Confirmó por link
                  </span>
                )}
              </div>
              <h3 className="text-base font-black text-[#0A111F] uppercase tracking-wide leading-tight">{pNombre} {pApellido}</h3>
              <div className="flex flex-col gap-1 mt-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400 uppercase">
                  <span>RUT: {c.pacientes?.rut || 'S/N'}</span>
                  <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-300"></span>
                  <span className="flex items-center gap-1"><Phone size={13} /> {c.pacientes?.telefono || 'Sin teléfono'}</span>
                  <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-300"></span>
                  <span className="flex items-center gap-1"><User size={13} /> Dr. {formatNombreDoctor(doctor?.nombre, doctor?.apellido)}</span>
                </div>
                <span className="text-[9px] font-bold text-slate-400 opacity-60 tracking-wider">
                  AGENDA: {c.creado_por && usuariosMap[c.creado_por] ? usuariosMap[c.creado_por].split(' ')[0] : 'WEB'}
                </span>
                {c.motivo && !c.motivo.includes('Online') && (
                  <div className="flex items-center gap-1.5 text-[11px] md:text-[10px] font-black uppercase tracking-widest mt-1 w-fit px-2 py-1 rounded-md bg-slate-50 text-slate-500 border border-slate-200">
                    <MessageSquareText size={12} /> <span>{c.motivo}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Estado */}
          <div className={`relative ${estado.bg} border ${estado.border} shadow-sm px-3 py-2 md:py-1.5 rounded-full flex items-center gap-2 text-xs md:text-[10px] font-black uppercase ${estado.text} transition-colors shrink-0 sm:ml-2 mt-2 sm:mt-0 self-start`}>
            <div className={`w-2 h-2 rounded-full ${estado.dot}`}></div>
            <select value={c.estado || 'programada'} onChange={(e) => acciones.onCambiarEstado(c, e.target.value)} className={`appearance-none bg-transparent outline-none cursor-pointer pr-5 font-black ${estado.text} text-base md:text-[10px]`}>
              {Object.entries(ESTADOS_CITA).map(([key, val]) => (
                <option key={key} value={key} className="text-slate-800 bg-white">
                  {key === 'en_espera' && c.hora_llegada && c.estado === 'en_espera' ? `ESPERA DESDE LAS ${horaDeStr(c.hora_llegada)}` : val.label.toUpperCase()}
                </option>
              ))}
            </select>
            <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${estado.text} opacity-60`} size={13} />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-2 pt-4 border-t border-slate-50 gap-4">
          {/* Finanzas */}
          <div>
            {puedeVerFinanzas && c.requiereCobroInmediato ? (
              <span onClick={() => acciones.onCaja(c)} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-[11px] md:text-[10px] font-black uppercase tracking-wider animate-pulse cursor-pointer inline-block">
                🔔 POR COBRAR: ${c.finanzas?.deuda_realizada.toLocaleString('es-CL')}
              </span>
            ) : puedeVerFinanzas && c.estadoFinanciero === 'deuda' ? (
              <span className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-[11px] md:text-[10px] font-black uppercase tracking-wider inline-block">DEUDA: ${c.finanzas?.deuda.toLocaleString('es-CL')}</span>
            ) : puedeVerFinanzas && c.estadoFinanciero === 'saldado' ? (
              <span className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-[11px] md:text-[10px] font-black uppercase tracking-wider inline-block">SALDADO</span>
            ) : (
              <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-[11px] md:text-[10px] font-black uppercase tracking-wider inline-block">SIN SALDO</span>
            )}
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-start sm:justify-end">
            <button onClick={() => acciones.onReprogramar(c)} className={`${btn} hover:text-[#C9A24B]`} title="Reprogramar"><CalendarClock size={16} /></button>
            <button onClick={() => acciones.onPresupuesto(c)} className={`${btn} hover:text-blue-500`} title="Enviar Presupuesto"><FileText size={16} /></button>
            <button onClick={() => acciones.onRecordatorio(c)} className={`${btn} hover:text-[#C9A24B]`} title="Enviar link de confirmación"><LinkIcon size={16} /></button>
            <button onClick={() => acciones.onResena(c)} className={`${btn} hover:text-amber-500`} title="Pedir reseña en Google Maps"><Star size={16} /></button>
            {puedeVerFinanzas && <button onClick={() => acciones.onCaja(c)} className={`${btn} hover:text-amber-500`} title="Caja/Cobrar"><Coins size={16} /></button>}
            <button onClick={() => acciones.onEliminar(c)} className={`${btn} hover:text-red-500 hover:bg-red-50`} title="Eliminar"><Trash2 size={16} /></button>

            {c.estado === 'no_asiste' && (
              <button onClick={() => acciones.onInasistencia(c)} className="px-3 py-2 border border-rose-200 bg-rose-50 rounded-lg text-rose-600 hover:bg-rose-100 transition-colors text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" title="Enviar WhatsApp para reagendar">
                <MessageCircle size={14} /> Reagendar por WhatsApp
              </button>
            )}
            {c.estado === 'atendido' && requiereControl(c.motivo) && (
              <button onClick={() => acciones.onControl(c)} className="px-3 py-2 border border-emerald-200 bg-emerald-50 rounded-lg text-emerald-700 hover:bg-emerald-100 transition-colors text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" title={`Agendar control en ${DIAS_HASTA_CONTROL} días`}>
                <CalendarPlus size={14} /> Agendar control
              </button>
            )}

            <div className="ml-auto sm:ml-2 flex items-center gap-2">
              <Link prefetch={false} href={`/pacientes/${c.paciente_id}`} className="text-xs md:text-[10px] font-black text-blue-600 px-3 py-2 uppercase tracking-widest hover:bg-blue-50 border border-blue-100 bg-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm">
                <ClipboardList size={14} /> Ficha
              </Link>
              <Link prefetch={false} href={`/pacientes/${c.paciente_id}/tratamientos`} className="text-xs md:text-[10px] font-black text-[#C9A24B] px-3 py-2 uppercase tracking-widest hover:bg-[#C9A24B]/10 border border-[#C9A24B]/30 bg-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm">
                <Activity size={14} /> Tratamientos
              </Link>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// Vista semana (compacta, acciones al pasar el mouse)
// ─────────────────────────────────────────────────────────────
export function TarjetaCitaSemana({ cita: c, delay, esSobrecupo, ahoraMs, puedeVerFinanzas, acciones }: Comunes & { delay: number }) {
  const estado = ESTADOS_CITA[c.estado] || ESTADOS_CITA.programada;
  const pNombre = c.pacientes?.nombre || 'S/N';
  const pApellido = c.pacientes?.apellido || '';
  const theme = getAvatarColorClass(pNombre + pApellido);
  const { min: minEspera, nivel } = semaforoDe(c, ahoraMs);
  const btn = "p-2 md:p-1.5 text-slate-500 rounded-md transition-all";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay }}
      className={`bg-white p-3.5 md:p-3 rounded-xl border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group border-l-4 ${theme.border} ${esSobrecupo ? 'border-t-red-100 border-r-red-100 border-b-red-100 bg-red-50/30' : 'border-slate-200'} ${claseFondoSemaforo(nivel)}`}
    >
      <div className="pl-1">
        <div className="flex flex-wrap gap-1 mb-1.5">
          {minEspera !== null && (
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest inline-flex items-center gap-1 ${claseBadgeSemaforo(nivel)}`}><Timer size={8} /> {minEspera} min</span>
          )}
          {c.inasistencias > 0 && (
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest inline-flex items-center gap-1 border ${estiloInasistencias(c.inasistencias)}`} title={`${c.inasistencias} inasistencias en ${MESES_INASISTENCIAS} meses`}><Ban size={8} /> {c.inasistencias}</span>
          )}
          {esSobrecupo && <span className="text-[8px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded uppercase tracking-widest animate-pulse inline-flex items-center">Sobrecupo</span>}
          {c.motivo?.includes('Online') && (
            <span className="text-[8px] font-black bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded uppercase tracking-widest inline-flex items-center gap-1"><Globe size={8} /> Web</span>
          )}
        </div>
        <p className="text-sm md:text-xs font-black text-slate-900 leading-tight mb-1 truncate">{pNombre} {pApellido}</p>
        <div className="flex items-center justify-between w-full mt-2">
          <span className="text-[11px] md:text-[10px] font-black text-[#8A6D2F] bg-[#C9A24B]/10 px-1.5 py-0.5 rounded-md">{horaDeStr(c.inicio)}</span>
          <span className={`text-[9px] md:text-[8px] font-black uppercase ${estado.circleText}`}>
            {c.estado === 'en_espera' && c.hora_llegada ? `ESPERA DESDE LAS ${horaDeStr(c.hora_llegada)}` : estado.label}
          </span>
        </div>
      </div>

      <div className="absolute inset-0 bg-white/95 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
        <button onClick={() => acciones.onReprogramar(c)} className={`${btn} hover:bg-[#C9A24B]/10 hover:text-[#C9A24B]`} title="Reprogramar"><CalendarClock size={15} /></button>
        <button onClick={() => acciones.onPresupuesto(c)} className={`${btn} hover:bg-[#C9A24B]/10 hover:text-[#C9A24B]`} title="Enviar Presupuesto"><FileText size={15} /></button>
        <button onClick={() => acciones.onRecordatorio(c)} className={`${btn} hover:bg-[#C9A24B]/10 hover:text-[#C9A24B]`} title="Enviar link de confirmación"><LinkIcon size={15} /></button>
        <button onClick={() => acciones.onResena(c)} className={`${btn} hover:bg-amber-100 hover:text-amber-500`} title="Pedir reseña en Google Maps"><Star size={15} /></button>
        {puedeVerFinanzas && <button onClick={() => acciones.onCaja(c)} className={`${btn} hover:bg-amber-50 hover:text-amber-600`} title="Caja/Cobrar"><Coins size={15} /></button>}
      </div>
    </motion.div>
  );
}

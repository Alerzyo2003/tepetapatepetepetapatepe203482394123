'use client'
// Una fila de oportunidad: paciente, por qué hay que contactarlo y las acciones (WhatsApp, llamar, agendar, registrar resultado)
import Link from 'next/link'
import { AlertTriangle, CalendarClock, CalendarPlus, CheckCircle2, ClipboardList, MessageCircle, Phone, Stethoscope } from 'lucide-react'
import type { Oportunidad, Tono } from '../_lib/reglas'
import type { Contacto } from '../_lib/contactos'
import { textoResultado } from '../_lib/contactos'
import { aFecha, diasDesde, fechaConHora, haceTexto, linkAgendar, money, nombrePaciente, telefonoWA } from '../_lib/util'

export const CLASE_TONO: Record<Tono, string> = {
  rojo: 'bg-rose-50 text-rose-700 border-rose-200',
  ambar: 'bg-amber-50 text-amber-800 border-amber-200',
  verde: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  azul: 'bg-sky-50 text-sky-700 border-sky-200',
  gris: 'bg-slate-100 text-slate-600 border-slate-200',
}

interface Props {
  fila: Oportunidad
  paciente: any
  proxima: any | null
  contacto: Contacto | null
  nombreUsuario: (id: string | null) => string
  nombreDoctor: string
  estadoLocal?: 'enviado' | 'fallido'
  conHistorial: boolean
  ahora: Date
  onWhatsApp: () => void
  onResultado: () => void
}

export default function Fila({ fila, paciente, proxima, contacto, nombreUsuario, nombreDoctor, estadoLocal, conHistorial, ahora, onWhatsApp, onResultado }: Props) {
  const cargandoFicha = paciente === undefined // aún no llegan nombre y teléfono
  const tel = telefonoWA(paciente?.telefono)
  const quien = contacto ? nombreUsuario(contacto.usuario_id) : ''
  return (
    <div className={`bg-white rounded-2xl border p-4 flex flex-col lg:flex-row lg:items-center gap-3 transition-all ${estadoLocal === 'enviado' ? 'border-emerald-200 opacity-60' : estadoLocal === 'fallido' ? 'border-rose-200' : 'border-slate-200 hover:border-slate-300'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link prefetch={false} href={`/pacientes/${fila.pacienteId}/tratamientos`} className="font-black text-sm text-slate-800 uppercase leading-tight hover:text-[#8A6D2F] truncate max-w-full">
            {cargandoFicha ? 'Cargando…' : nombrePaciente(paciente)}
          </Link>
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${CLASE_TONO[fila.tono]}`}>{fila.etapa}</span>
          {estadoLocal === 'enviado' && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-emerald-500 text-white">WhatsApp enviado</span>}
          {estadoLocal === 'fallido' && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-rose-500 text-white">No se pudo enviar</span>}
        </div>
        <p className="text-xs text-slate-600 mt-1 leading-snug">
          <span className="font-semibold">{fila.detalle}</span>
          {fila.fechaTexto && <span className="text-slate-400"> · {fila.fechaTexto}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px] font-bold">
          {cargandoFicha ? null : tel ? (
            <span className="flex items-center gap-1 text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-2 py-0.5"><Phone size={11} /> {paciente?.telefono}</span>
          ) : (
            <Link prefetch={false} href={`/pacientes/${fila.pacienteId}/datos`} className="flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-2 py-0.5 hover:bg-rose-100">
              <AlertTriangle size={11} /> Sin teléfono válido · agregar
            </Link>
          )}
          {nombreDoctor && <span className="flex items-center gap-1 text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-2 py-0.5"><Stethoscope size={11} /> {nombreDoctor}</span>}
          {proxima && (
            <span className="flex items-center gap-1 text-sky-700 bg-sky-50 border border-sky-100 rounded-md px-2 py-0.5">
              <CalendarClock size={11} /> Tiene hora: {fechaConHora(proxima.inicio)}
            </span>
          )}
          {contacto && (
            <span className="flex items-center gap-1 text-violet-700 bg-violet-50 border border-violet-100 rounded-md px-2 py-0.5 max-w-full" title={contacto.nota || undefined}>
              <CheckCircle2 size={11} className="shrink-0" />
              <span className="truncate">
                {textoResultado(contacto.resultado)} {haceTexto(diasDesde(aFecha(contacto.created_at), ahora))}{quien ? ` · ${quien}` : ''}{contacto.nota ? ` · "${contacto.nota}"` : ''}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-2 shrink-0">
        {fila.monto > 0 ? (
          <div className="text-left lg:text-right">
            <p className="text-base font-black text-[#8A6D2F] tabular-nums leading-none">{money(fila.monto)}</p>
            {fila.montoTexto && <p className="text-[10px] font-semibold text-slate-400 mt-1">{fila.montoTexto}</p>}
          </div>
        ) : <span />}
        <div className="flex flex-wrap gap-1.5 justify-end">
          <button type="button" onClick={onWhatsApp} disabled={!tel} title={tel ? 'Abrir WhatsApp con el mensaje listo' : 'Sin teléfono válido'}
            className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-emerald-600 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed">
            <MessageCircle size={14} /> WhatsApp
          </button>
          {tel && (
            <a href={`tel:+${tel}`} title="Llamar" className="px-2.5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center">
              <Phone size={14} />
            </a>
          )}
          <Link prefetch={false} href={linkAgendar(fila.pacienteId, fila.motivo, fila.doctores[0])} title="Abrir la agenda con el paciente listo para agendar"
            className="px-3 py-2 rounded-xl bg-[#C9A24B] text-[#0A111F] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-[#B38D3A]">
            <CalendarPlus size={14} /> Agendar
          </Link>
          {conHistorial && (
            <button type="button" onClick={onResultado} title="Anotar el resultado del contacto"
              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-slate-50">
              <ClipboardList size={14} /> Resultado
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

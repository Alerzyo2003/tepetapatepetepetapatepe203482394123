'use client'
// Aviso que aparece bajo el campo RUT al crear o editar un paciente:
// si ese RUT (escrito con o sin puntos/guion) ya pertenece a otra ficha, o si el dígito verificador no calza.
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ExternalLink, UserCheck } from 'lucide-react'
import { buscarPacientesMismoRut, calcularDv, limpiarRut, rutParaMostrar, rutValido, type PacienteMismoRut } from '@/lib/rut'

export function useRutRepetido(rut: string, activo = true, excluirId?: string | null) {
  const [repetidos, setRepetidos] = useState<PacienteMismoRut[]>([])
  const n = useRef(0)
  useEffect(() => {
    const id = ++n.current
    if (!activo || limpiarRut(rut).length < 6) { setRepetidos([]); return }
    const t = setTimeout(() => {
      buscarPacientesMismoRut(rut, excluirId).then(r => { if (id === n.current) setRepetidos(r) })
    }, 350)
    return () => clearTimeout(t)
  }, [rut, activo, excluirId])
  return repetidos
}

export default function AvisoRutRepetido({ rut, esOtroDocumento = false, excluirId, onUsarPaciente }: {
  rut: string
  esOtroDocumento?: boolean
  excluirId?: string | null
  onUsarPaciente?: (p: PacienteMismoRut) => void
}) {
  const repetidos = useRutRepetido(rut, !esOtroDocumento, excluirId)
  const limpio = limpiarRut(rut)
  const dvMalo = !esOtroDocumento && limpio.length >= 7 && /^\d+[0-9K]$/.test(limpio) && !rutValido(limpio) && repetidos.length === 0

  if (esOtroDocumento || (!repetidos.length && !dvMalo)) return null

  return (
    <div className="mt-2 space-y-2">
      {repetidos.map(p => (
        <div key={p.id} className={`rounded-xl border p-3 text-xs ${p.activo === false ? 'border-amber-300 bg-amber-50' : 'border-rose-300 bg-rose-50'}`}>
          <p className="flex items-start gap-2 font-bold text-slate-800">
            <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${p.activo === false ? 'text-amber-500' : 'text-rose-500'}`} />
            <span>
              {p.coincidencia === 'sin_dv' ? 'Parece que falta el dígito verificador: ya existe' : 'Este RUT ya está registrado:'}{' '}
              <span className="uppercase">{p.nombre} {p.apellido}</span> (RUT {rutParaMostrar(p.rut)})
              {p.activo === false && <span className="block font-semibold text-amber-700">Paciente deshabilitado{p.motivo_deshabilitado ? `: ${p.motivo_deshabilitado}` : ''}</span>}
              <span className="block font-semibold text-slate-500">No crees otra ficha: usa la que ya existe.</span>
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2 pl-6">
            {onUsarPaciente && p.activo !== false && (
              <button type="button" onClick={() => onUsarPaciente(p)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-slate-700">
                <UserCheck size={12} /> Usar este paciente
              </button>
            )}
            <a href={`/pacientes/${p.id}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50">
              <ExternalLink size={12} /> Ver ficha
            </a>
          </div>
        </div>
      ))}
      {dvMalo && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-slate-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
          <span>
            Revisa el RUT: con {rutParaMostrar(limpio.slice(0, -1) + calcularDv(limpio.slice(0, -1)))} el dígito verificador sería {calcularDv(limpio.slice(0, -1))}, no {limpio.slice(-1)}.
            <span className="block font-semibold text-slate-500">Si escribiste el RUT sin el dígito verificador, agrégalo al final.</span>
          </span>
        </p>
      )}
    </div>
  )
}

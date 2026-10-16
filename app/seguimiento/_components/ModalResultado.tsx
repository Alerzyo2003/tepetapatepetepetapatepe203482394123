'use client'
// Anotar cómo resultó el contacto con un paciente y hasta cuándo no vuelve a aparecer en las listas
import { useEffect, useState } from 'react'
import { ClipboardList, Loader2, X } from 'lucide-react'
import { RESULTADOS } from '../_lib/config'
import { fechaVolver } from '../_lib/contactos'
import type { Oportunidad } from '../_lib/reglas'
import { nombrePaciente } from '../_lib/util'

interface Props {
  fila: Oportunidad | null
  paciente: any
  ahora: Date
  onCerrar: () => void
  onGuardar: (resultado: string, nota: string, volver: string) => Promise<void>
}

export default function ModalResultado({ fila, paciente, ahora, onCerrar, onGuardar }: Props) {
  const opciones = RESULTADOS.filter(r => (fila?.lista === 'resena' ? true : r.id !== 'resena'))
  const [resultado, setResultado] = useState<string>('')
  const [nota, setNota] = useState('')
  const [volver, setVolver] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!fila) return
    const inicial = fila.lista === 'resena' ? 'resena' : 'lo_pensara'
    setResultado(inicial); setNota(''); setVolver(fechaVolver(inicial, ahora)); setGuardando(false)
  }, [fila, ahora])

  useEffect(() => {
    if (!fila) return
    const alPresionar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [fila, onCerrar])

  if (!fila) return null
  const elegir = (id: string) => { setResultado(id); setVolver(fechaVolver(id, ahora)) }
  const guardar = async () => {
    setGuardando(true)
    try { await onGuardar(resultado, nota.trim(), volver) } finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCerrar}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 bg-[#0A111F] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <ClipboardList size={20} className="text-[#C9A24B] shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#E8CD8A]">Resultado del contacto</p>
              <p className="text-sm font-bold truncate">{nombrePaciente(paciente)}</p>
            </div>
          </div>
          <button type="button" onClick={onCerrar} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {opciones.map(r => (
              <button key={r.id} type="button" onClick={() => elegir(r.id)}
                className={`px-3 py-2.5 rounded-xl border text-xs font-bold text-left transition-all ${resultado === r.id ? 'border-[#C9A24B] bg-[#C9A24B]/10 text-[#8A6D2F] ring-2 ring-[#C9A24B]/20' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {r.texto}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nota (opcional)</span>
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} maxLength={300} placeholder="Ej: llamar después de las 18:00, quiere pagar en cuotas…"
              className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-[#C9A24B] resize-none" />
          </label>
          <label className="block">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Volver a mostrarlo desde</span>
            <input type="date" value={volver} onChange={e => setVolver(e.target.value)}
              className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-[#C9A24B]" />
            <span className="block text-[10px] text-slate-400 mt-1">Hasta esa fecha el paciente no aparece en las listas de venta (los saludos van aparte).</span>
          </label>
          <button type="button" onClick={guardar} disabled={guardando || !resultado || !volver}
            className="w-full py-3.5 rounded-xl bg-[#0A111F] text-white text-xs font-black uppercase tracking-widest hover:bg-[#1a2538] disabled:opacity-50 flex items-center justify-center gap-2">
            {guardando && <Loader2 size={16} className="animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

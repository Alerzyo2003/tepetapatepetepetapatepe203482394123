'use client'
// Ventana para enviar un documento (presupuesto, receta o comprobante) al correo del paciente.
// El PDF se genera en el navegador, se sube a un espacio temporal y el servidor lo envía con la casilla de la clínica.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Loader2, Mail, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { enviarDocumentoPorCorreo } from '@/app/correo/actions'

const emailValido = (e?: string | null) => !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim())
const ETIQUETA = { presupuesto: 'presupuesto', receta: 'receta', comprobante: 'comprobante de pago' } as const

export default function EnviarCorreoModal({ abierto, onClose, tipo, pacienteId, emailPaciente, nombrePaciente, generarPdf, nombreArchivo, referenciaId, titulo, total, doctor }: {
  abierto: boolean
  onClose: () => void
  tipo: 'presupuesto' | 'receta' | 'comprobante'
  pacienteId: string
  emailPaciente?: string | null
  nombrePaciente?: string
  generarPdf: () => Promise<Blob>
  nombreArchivo: string
  referenciaId?: string | null
  titulo?: string | null
  total?: number | null
  doctor?: string | null
}) {
  const [para, setPara] = useState('')
  const [guardar, setGuardar] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [montado, setMontado] = useState(false)
  const teniaEmail = emailValido(emailPaciente)

  useEffect(() => { setMontado(true) }, [])
  useEffect(() => { if (abierto) { setPara(emailPaciente?.trim() || ''); setGuardar(true) } }, [abierto, emailPaciente])

  const enviar = async () => {
    if (!emailValido(para)) return toast.error('Escribe un correo válido')
    setEnviando(true)
    const id = toast.loading(`Preparando el ${ETIQUETA[tipo]}…`)
    try {
      const blob = await generarPdf()
      const ruta = `${pacienteId}/${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}.pdf`
      const { error: errSubida } = await supabase.storage.from('correos_adjuntos').upload(ruta, blob, { contentType: 'application/pdf', upsert: false })
      if (errSubida) throw new Error(`No se pudo subir el PDF: ${errSubida.message}`)
      toast.loading('Enviando correo…', { id })
      const r = await enviarDocumentoPorCorreo({ tipo, pacienteId, para: para.trim(), ruta, nombreArchivo, referenciaId, titulo, total, doctor, guardarEnFicha: !teniaEmail && guardar })
      if (!r.ok) throw new Error(r.error || 'No se pudo enviar')
      toast.success(`${ETIQUETA[tipo].charAt(0).toUpperCase() + ETIQUETA[tipo].slice(1)} enviado a ${para.trim()}`, { id })
      onClose()
    } catch (e: any) {
      toast.error('No se pudo enviar el correo', { id, description: e?.message })
    } finally { setEnviando(false) }
  }

  if (!abierto || !montado) return null
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0A111F]/60 p-4 backdrop-blur-sm print:hidden" onClick={() => !enviando && onClose()}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#C9A24B]">Enviar por correo</p>
            <h3 className="mt-1 text-lg font-black text-[#0A111F]">{ETIQUETA[tipo].charAt(0).toUpperCase() + ETIQUETA[tipo].slice(1)}{nombrePaciente ? ` de ${nombrePaciente}` : ''}</h3>
          </div>
          <button onClick={onClose} disabled={enviando} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Correo del paciente</label>
        <input type="email" autoFocus value={para} onChange={e => setPara(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()}
          placeholder="nombre@correo.com" className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#C9A24B]" />
        {!teniaEmail && (
          <label className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-slate-500">
            <input type="checkbox" checked={guardar} onChange={e => setGuardar(e.target.checked)} /> Guardar este correo en la ficha del paciente
          </label>
        )}
        <p className="mt-3 text-[11px] font-semibold text-slate-400">Se envía desde el correo de la clínica con el PDF adjunto.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={enviando} className="rounded-xl px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100">Cancelar</button>
          <button onClick={enviar} disabled={enviando || !para.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#0A111F] px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40">
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Enviar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

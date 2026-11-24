'use client'
// Quién abrió, editó o borró cada horario y bloqueo en Gestión de Box.
// Los datos los registra la base de datos sola (columnas creado_por/modificado_por y auditoria_clinica).
import { useEffect, useState } from 'react'
import { History, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

let cacheNombres: Promise<Record<string, string>> | null = null
export function useNombresUsuarios() {
  const [nombres, setNombres] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!cacheNombres) {
      cacheNombres = (async () => {
        const { data } = await supabase.from('perfiles').select('id, nombre_completo')
        const m: Record<string, string> = {}
        ;(data || []).forEach((p: any) => { if (p.id) m[p.id] = p.nombre_completo || 'Usuario' })
        return m
      })()
    }
    cacheNombres.then(setNombres)
  }, [])
  return nombres
}

const fechaCorta = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : ''

const nombreCorto = (n?: string) => (n || '').split(/\s+/).filter(Boolean).slice(0, 2).join(' ')

// Línea chica bajo cada horario/bloqueo
export function LineaAutoria({ fila, nombres, verbo = 'Abrió' }: { fila: any; nombres: Record<string, string>; verbo?: string }) {
  const creador = fila?.creado_por ? nombreCorto(nombres[fila.creado_por]) || 'Usuario' : null
  const editor = fila?.modificado_por ? nombreCorto(nombres[fila.modificado_por]) || 'Usuario' : null
  if (!creador && !editor) {
    return <p className="text-[9px] font-semibold text-slate-300 mt-1">Creado {fechaCorta(fila?.created_at)} · antes del registro de autor</p>
  }
  return (
    <p className="text-[9px] font-semibold text-slate-400 mt-1 leading-snug">
      {creador && <span>{verbo}: <b className="text-slate-500">{creador}</b> · {fechaCorta(fila.created_at)}</span>}
      {editor && <span className="block">Editó: <b className="text-slate-500">{editor}</b> · {fechaCorta(fila.modificado_en)}</span>}
    </p>
  )
}

// Historial de cambios del profesional (incluye lo que ya se borró)
export function HistorialBox({ userId, profesionalId, recargar }: { userId: string | null; profesionalId: string | null; recargar: number }) {
  const [filas, setFilas] = useState<any[]>([])
  const [verTodo, setVerTodo] = useState(false)

  useEffect(() => {
    if (!userId && !profesionalId) return
    const ids = [userId, profesionalId].filter(Boolean) as string[]
    const filtro = ids.flatMap(id => [`datos_nuevos->>profesional_id.eq.${id}`, `datos_anteriores->>profesional_id.eq.${id}`]).join(',')
    supabase.from('auditoria_clinica')
      .select('id, fecha, accion, detalles, nombre_usuario')
      .in('tabla', ['disponibilidad_profesional', 'bloqueos_agenda'])
      .or(filtro)
      .order('fecha', { ascending: false })
      .limit(60)
      .then(({ data }) => setFilas((data || []).filter((f: any) => /^(HORARIO|BLOQUEO) /.test(f.accion || ''))))
  }, [userId, profesionalId, recargar])

  if (!filas.length) return null
  const lista = verTodo ? filas : filas.slice(0, 8)
  const icono = (a: string) => a.endsWith('CREADO') ? <Plus size={12} className="text-emerald-500" /> : a.endsWith('ELIMINADO') ? <Trash2 size={12} className="text-red-500" /> : <Pencil size={12} className="text-blue-500" />

  return (
    <div className="space-y-4 mt-12">
      <h3 className="text-[11px] font-black text-[#0A111F] uppercase tracking-widest flex items-center gap-2 pb-4 border-b border-slate-100">
        <History size={14} className="text-[#C9A24B]" /> Historial de cambios
      </h3>
      <ul className="space-y-2">
        {lista.map(f => (
          <li key={f.id} className="flex items-start gap-3 bg-slate-50/70 border border-slate-100 rounded-xl px-4 py-2.5">
            <span className="mt-0.5">{icono(f.accion)}</span>
            <div className="min-w-0 text-left">
              <p className="text-[11px] font-bold text-slate-700">
                <span className="uppercase">{nombreCorto(f.nombre_usuario) || 'Usuario sin nombre'}</span>
                <span className="font-semibold text-slate-400"> {f.accion.toLowerCase().replace(/^(horario|bloqueo) /, (m: string) => m)} </span>
              </p>
              <p className="text-[10px] font-semibold text-slate-500 truncate">{f.detalles}</p>
            </div>
            <span className="ml-auto shrink-0 text-[9px] font-bold text-slate-400">{fechaCorta(f.fecha)}</span>
          </li>
        ))}
      </ul>
      {filas.length > 8 && (
        <button type="button" onClick={() => setVerTodo(v => !v)} className="text-[10px] font-black uppercase tracking-widest text-[#C9A24B] hover:underline">
          {verTodo ? 'Ver menos' : `Ver todo (${filas.length})`}
        </button>
      )}
    </div>
  )
}

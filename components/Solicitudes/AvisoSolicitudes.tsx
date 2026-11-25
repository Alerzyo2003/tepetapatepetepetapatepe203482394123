'use client'
// Avisos de las solicitudes internas:
// - ADMIN: suena y aparece un aviso cuando alguien crea una solicitud; además lleva la cuenta de las que faltan por resolver.
// - Quien creó la solicitud: aviso cuando administración la marca como lista o rechazada.
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { sonidoSolicitud } from '@/lib/sonidos'

const ETIQUETA: Record<string, string> = {
  abrir_agenda: 'Abrir agenda',
  bloquear_agenda: 'Bloquear agenda',
  horario_especial: 'Horario especial',
  general: 'Solicitud a administración',
}

export default function AvisoSolicitudes({ userId, rol, onPendientes }: {
  userId: string | null | undefined
  rol: string | null | undefined
  onPendientes?: (n: number, nAdmin: number) => void
}) {
  const cb = useRef(onPendientes)
  useEffect(() => { cb.current = onPendientes }, [onPendientes])

  useEffect(() => {
    if (!userId || !rol) return
    const esAdmin = rol === 'ADMIN'

    const avisadas = new Set<string>()   // para no avisar dos veces la misma (tiempo real + revisión periódica)
    let primera = true

    const avisar = (s: any) => {
      if (!esAdmin || !s?.id || avisadas.has(s.id) || s.creado_por === userId) return
      avisadas.add(s.id)
      sonidoSolicitud()
      const que = ETIQUETA[s.categoria] || 'Solicitud'
      toast.info(`Nueva solicitud: ${que}`, {
        description: [s.tipo, s.profesional_texto, s.fecha_texto, s.detalle].filter(Boolean).join(' · ').slice(0, 140) || 'Revisa el panel para resolverla.',
        duration: 12000,
        action: { label: 'Ver', onClick: () => { window.location.href = s.categoria === 'general' ? '/mi-menu/solicitudes' : '/mi-menu/solicitudes-agenda' } },
      })
    }

    // Cuenta y revisión: administración ve todas las pendientes; el resto solo las suyas.
    // Además de lo "en vivo", se revisa cada 20 s por si la conexión en vivo se cayó.
    const contar = async () => {
      let q = supabase.from('solicitudes').select('id, categoria, tipo, profesional_texto, fecha_texto, detalle, creado_por').in('estado', ['pendiente', 'en_proceso'])
      if (!esAdmin) q = q.eq('creado_por', userId)
      const { data, error } = await q
      if (error) return
      const filas = data || []
      cb.current?.(filas.length, filas.filter((x: any) => x.categoria === 'general').length)
      if (primera) { filas.forEach((x: any) => avisadas.add(x.id)); primera = false }
      else filas.forEach(avisar)
    }
    contar()
    const timer = setInterval(contar, 20000)
    const alVolver = () => { if (document.visibilityState === 'visible') contar() }
    document.addEventListener('visibilitychange', alVolver)

    const canal = supabase.channel(`solicitudes-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solicitudes' }, (payload: any) => { avisar(payload.new); contar() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'solicitudes' }, (payload: any) => {
        const s = payload.new, antes = payload.old || {}
        if (!esAdmin && s.creado_por === userId && antes.estado !== s.estado && (s.estado === 'listo' || s.estado === 'rechazado')) {
          sonidoSolicitud()
          const msg = s.estado === 'listo' ? 'Tu solicitud está lista' : 'Tu solicitud fue rechazada'
          toast[s.estado === 'listo' ? 'success' : 'warning'](msg, { description: s.respuesta || undefined, duration: 10000 })
        }
        contar()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'solicitudes' }, () => { contar() })
      .subscribe()

    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', alVolver); supabase.removeChannel(canal) }
  }, [userId, rol])

  return null
}

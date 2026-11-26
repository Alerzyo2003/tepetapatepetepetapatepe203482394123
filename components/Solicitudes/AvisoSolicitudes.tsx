'use client'
// Avisos de las solicitudes internas. Los avisos quedan guardados en la base de datos hasta que la persona abre el panel,
// así que si no estaba en la app cuando se resolvió (o llegó) una solicitud, lo ve al entrar.
// - ADMIN: aviso por cada solicitud nueva de otra persona que aún no ha visto; el número del menú son las pendientes por resolver.
// - Quien creó la solicitud: aviso cuando administración la marca como lista o rechazada; el número del menú son las respuestas sin leer.
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { sonidoSolicitud } from '@/lib/sonidos'

export const EVENTO_SOLICITUDES_VISTAS = 'solicitudes-vistas'

const ETIQUETA: Record<string, string> = {
  abrir_agenda: 'Abrir agenda',
  bloquear_agenda: 'Bloquear agenda',
  horario_especial: 'Horario especial',
  general: 'Solicitud a administración',
}
const CLAVE_AVISADAS = 'solicitudes-avisadas-v1'
const MAX_AVISOS = 4

// Para no repetir el mismo aviso cada vez que se recarga la página en la misma sesión
const leerAvisadas = (): Set<string> => {
  try { return new Set(JSON.parse(sessionStorage.getItem(CLAVE_AVISADAS) || '[]')) } catch { return new Set() }
}
const guardarAvisadas = (s: Set<string>) => { try { sessionStorage.setItem(CLAVE_AVISADAS, JSON.stringify(Array.from(s).slice(-300))) } catch { /* sin espacio */ } }

export default function AvisoSolicitudes({ userId, rol, onPendientes }: {
  userId: string | null | undefined
  rol: string | null | undefined
  onPendientes?: (n: number, nGeneral: number) => void
}) {
  const cb = useRef(onPendientes)
  useEffect(() => { cb.current = onPendientes }, [onPendientes])

  useEffect(() => {
    if (!userId || !rol) return
    const esAdmin = rol === 'ADMIN'
    const campos = 'id, categoria, tipo, profesional_texto, fecha_texto, horario_texto, detalle, respuesta, estado, creado_por'
    const avisadas = leerAvisadas()

    const revisar = async () => {
      // 1) Número del menú
      let q1 = supabase.from('solicitudes').select('id, categoria')
      q1 = esAdmin ? q1.in('estado', ['pendiente', 'en_proceso']) : q1.eq('creado_por', userId).eq('visto_por_creador', false)
      // 2) Avisos sin ver
      let q2 = supabase.from('solicitudes').select(campos).order('actualizado_en', { ascending: false }).limit(30)
      q2 = esAdmin ? q2.eq('visto_por_admin', false).neq('creado_por', userId) : q2.eq('creado_por', userId).eq('visto_por_creador', false)
      const [r1, r2] = await Promise.all([q1, q2])
      if (!r1.error) {
        const filas = r1.data || []
        cb.current?.(filas.length, filas.filter((x: any) => x.categoria === 'general').length)
      }
      if (r2.error) return
      const nuevas = (r2.data || []).filter((s: any) => !avisadas.has(`${s.id}:${s.estado}`))
      if (!nuevas.length) return
      sonidoSolicitud()
      nuevas.forEach((s: any) => avisadas.add(`${s.id}:${s.estado}`))
      guardarAvisadas(avisadas)
      nuevas.slice(0, MAX_AVISOS).forEach((s: any) => {
        const que = ETIQUETA[s.categoria] || 'Solicitud'
        const ruta = s.categoria === 'general' ? '/mi-menu/solicitudes' : '/mi-menu/solicitudes-agenda'
        const detalle = [s.tipo, s.profesional_texto, s.fecha_texto, s.horario_texto, s.detalle].filter(Boolean).join(' · ').slice(0, 120)
        if (esAdmin) {
          toast.info(`Nueva solicitud: ${que}`, { description: detalle || 'Revisa el panel para resolverla.', duration: 12000, action: { label: 'Ver', onClick: () => { window.location.href = ruta } } })
        } else if (s.estado === 'listo') {
          toast.success(`${que}: tu solicitud está lista`, { description: s.respuesta || detalle || undefined, duration: 12000, action: { label: 'Ver', onClick: () => { window.location.href = ruta } } })
        } else {
          toast.warning(`${que}: tu solicitud fue rechazada`, { description: s.respuesta || detalle || undefined, duration: 12000, action: { label: 'Ver', onClick: () => { window.location.href = ruta } } })
        }
      })
      if (nuevas.length > MAX_AVISOS) toast.info(`Y ${nuevas.length - MAX_AVISOS} aviso(s) más en tus solicitudes`, { duration: 8000 })
    }

    revisar()
    // Además de lo "en vivo", se revisa cada 20 s y al volver a la pestaña, por si la conexión en vivo se cayó
    const timer = setInterval(revisar, 20000)
    const alVolver = () => { if (document.visibilityState === 'visible') revisar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener(EVENTO_SOLICITUDES_VISTAS, revisar)

    const canal = supabase.channel(`solicitudes-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes' }, () => { revisar() })
      .subscribe()

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener(EVENTO_SOLICITUDES_VISTAS, revisar)
      supabase.removeChannel(canal)
    }
  }, [userId, rol])

  return null
}

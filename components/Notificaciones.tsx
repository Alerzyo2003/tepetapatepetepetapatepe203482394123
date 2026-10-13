'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Bell, UserCheck, X } from 'lucide-react'

export default function Notificaciones() {
  const [notificacion, setNotificacion] = useState<any>(null)

  useEffect(() => {
    // Escuchar cambios en tiempo real en la tabla 'citas'
    const canal = supabase
      .channel('cambios-citas')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'citas' },
        async (payload) => {
          // Si el estado cambia a 'atendida' (o el que definas para "llegó")
          if (payload.new.estado === 'atendida') {
            // Buscamos el nombre del paciente para que la alerta sea clara
            const { data } = await supabase
              .from('pacientes')
              .select('nombre, apellido')
              .eq('id', payload.new.paciente_id)
              .single()

            if (data) {
              setNotificacion({
                nombre: `${data.nombre} ${data.apellido}`,
                hora: new Date(payload.new.inicio).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
              })
              
              // Opcional: Sonido de notificación
              const audio = new Audio('/notification.mp3') // Debes poner un sonido en /public
              audio.play().catch(() => console.log("Sonido bloqueado por navegador"))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  if (!notificacion) return null

  return (
    <div className="fixed top-4 right-4 z-[200] animate-bounce">
      <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 border-2 border-white">
        <div className="bg-white p-2 rounded-full text-blue-600">
          <UserCheck size={24} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase opacity-80">¡Paciente en sala!</p>
          <p className="font-bold">{notificacion.nombre}</p>
          <p className="text-xs">Cita de las {notificacion.hora}</p>
        </div>
        <button onClick={() => setNotificacion(null)} className="hover:bg-blue-700 p-1 rounded">
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
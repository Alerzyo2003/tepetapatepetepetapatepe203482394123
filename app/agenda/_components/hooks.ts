'use client'
// Hooks compartidos por la Agenda y la Vista Diaria
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Escucha cambios en tiempo real y devuelve un contador que sube cada vez que algo cambia
 * (agrupado con un pequeño retraso para no recargar 10 veces seguidas).
 */
export function useAgendaRealtime(tablas: string[] = ['citas', 'bloqueos_agenda', 'presupuesto_items']) {
  const [trigger, setTrigger] = useState(0);
  useEffect(() => {
    let cancelado = false;
    let canal: any = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const avisar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setTrigger(p => p + 1), 400);
    };
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelado || !user) return;
      let ch = supabase.channel(`agenda-rt-${user.id}-${Math.random().toString(36).slice(2)}`);
      tablas.forEach(t => { ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, avisar); });
      canal = ch.subscribe();
    })();
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      if (canal) supabase.removeChannel(canal);
    };
  }, []);
  return trigger;
}

/** Recibe el aviso "paciente en sala de espera" dirigido al usuario conectado. Se oculta solo a los 2 minutos. */
export function useAvisoPacienteEspera() {
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    let cancelado = false;
    let canal: any = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelado || !user) return;
      canal = supabase.channel(`notificaciones-${user.id}`)
        .on('broadcast', { event: 'PACIENTE_EN_ESPERA' }, (payload: any) => {
          setAviso(payload.payload?.nombre || 'Un paciente');
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => setAviso(null), 120000);
        })
        .subscribe();
    })();
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      if (canal) supabase.removeChannel(canal);
    };
  }, []);
  return [aviso, () => setAviso(null)] as const;
}

/** Reloj que se actualiza cada cierto tiempo (para el semáforo de espera y la línea de "ahora"). */
export function useReloj(intervaloMs = 30000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return ahora;
}

'use client'
// Hooks compartidos por la Agenda y la Vista Diaria
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Escucha cambios en tiempo real y devuelve un contador que sube cada vez que algo cambia
 * (agrupado con un pequeño retraso para no recargar 10 veces seguidas).
 *
 * - Un canal por tabla: si una tabla no tiene Realtime habilitado, Supabase rechaza el canal
 *   completo; separados, esa tabla falla sola y las demás (ej. citas) siguen llegando.
 * - Si un canal se cae, se vuelve a suscribir.
 * - Respaldo: recarga al volver a la pestaña/ventana y cada `respaldoMs` mientras está visible,
 *   por si la conexión en vivo se cortó sin avisar (ej. el computador se suspendió).
 */
export function useAgendaRealtime(tablas: string[] = ['citas', 'bloqueos_agenda', 'presupuesto_items'], respaldoMs = 60000) {
  const [trigger, setTrigger] = useState(0);
  useEffect(() => {
    let cancelado = false;
    const canales: any[] = [];
    const reintentos: ReturnType<typeof setTimeout>[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const avisar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setTrigger(p => p + 1), 400);
    };

    const suscribir = (userId: string, tabla: string, intento = 0) => {
      if (cancelado) return;
      const ch = supabase
        .channel(`agenda-rt-${tabla}-${userId}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: tabla }, avisar);
      canales.push(ch);
      ch.subscribe((status: string, err?: Error) => {
        if (cancelado) return;
        if (status === 'SUBSCRIBED' && intento > 0) avisar(); // se reconectó: traer lo que se perdió
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[tiempo real] ${tabla}: ${status}`, err?.message || '');
          supabase.removeChannel(ch);
          if (intento < 5) reintentos.push(setTimeout(() => suscribir(userId, tabla, intento + 1), 2000 * 2 ** intento));
        }
      });
    };

    (async () => {
      // Sesión local del navegador: no llama al servidor de Auth
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (cancelado || !user) return;
      tablas.forEach(t => suscribir(user.id, t));
    })();

    const alVolver = () => { if (document.visibilityState === 'visible') avisar(); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    window.addEventListener('online', avisar);
    const respaldo = setInterval(() => { if (document.visibilityState === 'visible') avisar(); }, respaldoMs);

    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      reintentos.forEach(clearTimeout);
      clearInterval(respaldo);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
      window.removeEventListener('online', avisar);
      canales.forEach(ch => supabase.removeChannel(ch));
    };
  }, []);
  return trigger;
}

/** Sonido + notificación del navegador para el aviso de paciente en espera. */
function alertarPacienteEspera(nombre: string) {
  try {
    const audio = new Audio('/notification.mp3');
    audio.play().catch(() => { /* el navegador bloquea sonido hasta la primera interacción */ });
  } catch { /* sin audio */ }
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification('Paciente en sala de espera', { body: nombre, icon: '/logo.png', tag: `espera-${nombre}` });
    }
  } catch { /* sin notificaciones */ }
}

/**
 * Aviso "paciente en sala de espera" para el doctor conectado. Se oculta solo a los 2 minutos.
 * Llega por dos vías (la que llegue primero; no se repite):
 *  1. El cambio de la cita a "en_espera" en la base de datos (tiempo real de `citas`).
 *  2. El mensaje directo que envía recepción al marcarlo (broadcast).
 */
export function useAvisoPacienteEspera() {
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    let cancelado = false;
    const canales: any[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recientes = new Map<string, number>(); // clave -> momento del último aviso

    const mostrar = (nombre: string, clave: string) => {
      const ahora = Date.now();
      if ((recientes.get(clave) || 0) > ahora - 60000) return; // ya avisado hace menos de 1 minuto
      recientes.set(clave, ahora);
      setAviso(nombre);
      alertarPacienteEspera(nombre);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setAviso(null), 120000);
    };

    // Pide permiso de notificaciones del navegador en la primera interacción (no se puede sin un clic)
    const pedirPermiso = () => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    };
    window.addEventListener('click', pedirPermiso, { once: true });

    (async () => {
      // Sesión local del navegador: no llama al servidor de Auth
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (cancelado || !user) return;

      canales.push(supabase.channel(`notificaciones-${user.id}`)
        .on('broadcast', { event: 'PACIENTE_EN_ESPERA' }, (payload: any) => {
          const nombre = payload.payload?.nombre || 'Un paciente';
          mostrar(nombre, payload.payload?.citaId || nombre);
        })
        .subscribe());

      canales.push(supabase.channel(`espera-citas-${user.id}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'citas', filter: `profesional_id=eq.${user.id}` }, async (payload: any) => {
          const nueva = payload.new || {};
          const anterior = payload.old || {};
          if (nueva.estado !== 'en_espera' || anterior.estado === 'en_espera') return;
          if (nueva.modificado_por && nueva.modificado_por === user.id) return; // lo marcó el mismo doctor
          let nombre = 'Un paciente';
          if (nueva.paciente_id) {
            const { data } = await supabase.from('pacientes').select('nombre, apellido').eq('id', nueva.paciente_id).maybeSingle();
            if (data) nombre = `${data.nombre || ''} ${data.apellido || ''}`.trim() || nombre;
          }
          if (!cancelado) mostrar(nombre, nueva.id || nombre);
        })
        .subscribe());
    })();

    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('click', pedirPermiso);
      canales.forEach(ch => supabase.removeChannel(ch));
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

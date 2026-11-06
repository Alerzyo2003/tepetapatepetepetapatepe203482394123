'use client'
// Box de la clínica: qué box tiene cada profesional cada día.
// El sorteo lo hace la base (función asignar_box_dia): a cada profesional con citas le toca un box por el rato
// de sus citas (de la primera a la última), al azar pero rotando. Box 1 = médico; Box 2 a 5 = dentales.
// Recepción puede cambiar el box de un profesional para un día (cambiar_box); eso el sorteo no lo mueve.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getLocalDateISO } from './utils'

export interface AsignacionBox {
  profesional_id: string;
  box: number;
  desde: string | null;   // 'YYYY-MM-DDTHH:MM:SS' hora de Chile
  hasta: string | null;
  manual: boolean;
}
export interface SinBox { profesional_id: string; desde: string; hasta: string; tipo: string }
export interface BoxDia { asignaciones: AsignacionBox[]; sinBox: SinBox[] }

export const BOXES = [
  { numero: 1, nombre: 'Box 1', tipo: 'medico' as const },
  { numero: 2, nombre: 'Box 2', tipo: 'dental' as const },
  { numero: 3, nombre: 'Box 3', tipo: 'dental' as const },
  { numero: 4, nombre: 'Box 4', tipo: 'dental' as const },
  { numero: 5, nombre: 'Box 5', tipo: 'dental' as const },
];

// Solo se sortea (y se guarda) hoy y mañana: más adelante las citas cambian mucho y el box podría moverse.
// Para otros días se muestra lo que ya esté asignado.
export const seSorteaAutomatico = (fechaISO: string) => {
  const hoy = getLocalDateISO(new Date());
  const m = new Date(); m.setDate(m.getDate() + 1);
  return fechaISO === hoy || fechaISO === getLocalDateISO(m);
};

const normalizar = (s: any) => (s ? String(s).replace(' ', 'T').slice(0, 19) : null);

export async function cargarBoxDia(fechaISO: string, sortear = seSorteaAutomatico(fechaISO)): Promise<BoxDia> {
  if (sortear && fechaISO >= getLocalDateISO(new Date())) {
    const { data, error } = await supabase.rpc('asignar_box_dia', { p_fecha: fechaISO });
    if (error) throw error;
    return {
      asignaciones: (data?.asignaciones || []).map((a: any) => ({ ...a, desde: normalizar(a.desde), hasta: normalizar(a.hasta) })),
      sinBox: (data?.sin_box || []).map((s: any) => ({ ...s, desde: normalizar(s.desde), hasta: normalizar(s.hasta) })),
    };
  }
  const { data, error } = await supabase.from('box_asignaciones').select('profesional_id, box, desde, hasta, manual')
    .eq('fecha', fechaISO).order('box').order('desde');
  if (error) throw error;
  return { asignaciones: (data || []).map((a: any) => ({ ...a, desde: normalizar(a.desde), hasta: normalizar(a.hasta) })), sinBox: [] };
}

export async function cambiarBox(fechaISO: string, profesionalId: string, box: number): Promise<BoxDia> {
  const { data, error } = await supabase.rpc('cambiar_box', { p_fecha: fechaISO, p_profesional: profesionalId, p_box: box });
  if (error) throw error;
  return {
    asignaciones: (data?.asignaciones || []).map((a: any) => ({ ...a, desde: normalizar(a.desde), hasta: normalizar(a.hasta) })),
    sinBox: (data?.sin_box || []).map((s: any) => ({ ...s, desde: normalizar(s.desde), hasta: normalizar(s.hasta) })),
  };
}

// Vuelve a sortear un día (hoy o adelante): quita lo sorteado (no lo cambiado a mano) y sortea de nuevo
export async function volverASortear(fechaISO: string): Promise<BoxDia> {
  const { error } = await supabase.from('box_asignaciones').delete().eq('fecha', fechaISO).eq('manual', false);
  if (error) throw error;
  return cargarBoxDia(fechaISO, true);
}

export const boxesDe = (dia: BoxDia | null, profesionalId?: string | null) =>
  !dia || !profesionalId ? [] : dia.asignaciones.filter(a => a.profesional_id === profesionalId);

export const textoBox = (dia: BoxDia | null, profesionalId?: string | null) => {
  const xs = boxesDe(dia, profesionalId);
  if (xs.length) return [...new Set(xs.map(a => `Box ${a.box}`))].join(' / ');
  if (dia?.sinBox.some(s => s.profesional_id === profesionalId)) return 'Sin box';
  return null;
};

// Box del día con recarga: al cambiar la fecha, cada `refrescoMs` y cuando cambia `clave` (ej. tiempo real de la agenda)
export function useBoxDia(fechaISO: string, opciones: { activo?: boolean; refrescoMs?: number; clave?: any } = {}) {
  const { activo = true, refrescoMs = 120_000, clave } = opciones;
  const [dia, setDia] = useState<BoxDia | null>(null);
  const [cargando, setCargando] = useState(false);
  const recargar = useCallback(async () => {
    if (!activo || !fechaISO) return;
    setCargando(true);
    try { setDia(await cargarBoxDia(fechaISO)); }
    catch (e) { console.error('No se pudo cargar el box del día', e); }
    finally { setCargando(false); }
  }, [fechaISO, activo]);
  useEffect(() => { setDia(null); }, [fechaISO]);
  useEffect(() => { recargar(); }, [recargar, clave]);
  useEffect(() => {
    if (!activo || !refrescoMs) return;
    const t = setInterval(recargar, refrescoMs);
    return () => clearInterval(t);
  }, [recargar, refrescoMs, activo]);
  return { dia, setDia, cargando, recargar };
}

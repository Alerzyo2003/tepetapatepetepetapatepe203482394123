'use client'
// Envía por WhatsApp el resumen del plan de tratamiento del paciente.
// Si tiene varios planes activos, primero pide elegir cuál.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { ChevronRight, FileText, MessageCircle, Send } from 'lucide-react'
import ModalShell from './ModalShell'
import { abrirWhatsApp, GOLD_LIGHT, nombrePaciente, URL_AGENDAR_ONLINE } from './utils'

interface Props {
  cita: any | null;   // null = cerrado
  onClose: () => void;
}

export default function ModalEnvioPresupuesto({ cita, onClose }: Props) {
  const [fase, setFase] = useState<'cargando' | 'elegir' | 'editar'>('cargando');
  const [planes, setPlanes] = useState<any[]>([]);
  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (!cita) return;
    setFase('cargando'); setPlanes([]); setTexto('');
    (async () => {
      if (!cita.paciente_id) { toast.error('Cita sin paciente asociado'); onClose(); return; }
      const toastId = toast.loading('Buscando tratamientos...');
      const { data, error } = await supabase.from('presupuestos').select('id, nombre_tratamiento').eq('paciente_id', cita.paciente_id).neq('estado', 'finalizado');
      if (error || !data || data.length === 0) {
        toast.error(error ? 'Error al buscar tratamientos' : 'El paciente no tiene planes de tratamiento activos.', { id: toastId });
        onClose();
        return;
      }
      toast.dismiss(toastId);
      if (data.length === 1) await generarResumen(data[0].id);
      else { setPlanes(data); setFase('elegir'); }
    })();
  }, [cita]);

  async function generarResumen(presupuestoId: string) {
    const toastId = toast.loading('Generando resumen del tratamiento...');
    try {
      const { data: items } = await supabase.from('presupuesto_items')
        .select('observacion, precio_pactado, abonado, prestaciones:prestacion_id("Nombre Accion", "Nombre")')
        .eq('presupuesto_id', presupuestoId).neq('estado', 'cancelada');
      if (!items || items.length === 0) { toast.error('El plan seleccionado no contiene tratamientos activos.', { id: toastId }); onClose(); return; }

      let total = 0; let abonado = 0;
      let t = `Hola ${nombrePaciente(cita.pacientes)}, te compartimos el detalle actualizado de tu Plan de Tratamiento Dental:\n\n`;
      items.forEach((item: any) => {
        let nombre = item.prestaciones?.['Nombre Accion'] || item.prestaciones?.['Nombre'] || 'Tratamiento';
        if (item.observacion?.includes('|')) nombre = item.observacion.split('|')[0].trim();
        const precio = Number(item.precio_pactado || 0);
        total += precio; abonado += Number(item.abonado || 0);
        t += `🔸 ${nombre} - $${precio.toLocaleString('es-CL')}\n`;
      });
      t += `\n💰 *Total Plan:* $${total.toLocaleString('es-CL')}`;
      if (abonado > 0) t += `\n✅ *Abonado:* $${abonado.toLocaleString('es-CL')}`;
      if (total - abonado > 0) t += `\n🔴 *Saldo Pendiente:* $${(total - abonado).toLocaleString('es-CL')}`;
      t += `\n\n🗓️ *Agenda tus próximas sesiones online aquí:*\n${URL_AGENDAR_ONLINE}`;
      t += `\n\nCualquier consulta, estamos a tu disposición. ¡Saludos! 🦷`;

      setTexto(t);
      setFase('editar');
      toast.success('Resumen generado', { id: toastId });
    } catch {
      toast.error('Error al generar resumen', { id: toastId });
      onClose();
    }
  }

  const enviar = () => {
    if (abrirWhatsApp(cita?.pacientes?.telefono, texto)) onClose();
  };

  return (
    <ModalShell
      abierto={!!cita && fase !== 'cargando'}
      onClose={onClose}
      ancho="max-w-lg"
      icono={fase === 'elegir' ? <FileText size={20} style={{ color: GOLD_LIGHT }} /> : <Send size={20} style={{ color: GOLD_LIGHT }} />}
      titulo={fase === 'elegir' ? 'Seleccionar Tratamiento' : 'Enviar Presupuesto'}
      subtitulo={fase === 'elegir' ? 'Elige qué plan enviar' : 'Pre-armado automático'}
    >
      {fase === 'elegir' ? (
        <div className="p-6 md:p-8 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <p className="text-sm md:text-xs font-bold text-slate-500 leading-relaxed">El paciente tiene varios planes de tratamiento. Selecciona cuál deseas enviar por WhatsApp.</p>
          {planes.map(p => (
            <button key={p.id} onClick={() => generarResumen(p.id)} className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-[#C9A24B] hover:bg-[#C9A24B]/5 transition-all flex items-center justify-between group text-left">
              <span className="font-black text-sm uppercase text-slate-800 group-hover:text-[#8A6D2F]">{p.nombre_tratamiento || 'Tratamiento sin nombre'}</span>
              <ChevronRight className="text-slate-300 group-hover:text-[#C9A24B] group-hover:translate-x-1 transition-transform" size={20} />
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="p-6 md:p-8 space-y-4 overflow-y-auto">
            <p className="text-sm md:text-xs font-bold text-slate-500 leading-relaxed">
              Puedes editar el texto antes de enviarlo. Se abrirá WhatsApp con este mensaje listo para <span className="font-black text-slate-800">{nombrePaciente(cita?.pacientes)}</span>.
            </p>
            <textarea
              className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-base md:text-sm outline-none focus:border-[#C9A24B] transition-all shadow-inner resize-none custom-scrollbar"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <div className="p-6 md:p-8 border-t border-slate-100 bg-white shrink-0">
            <button onClick={enviar} className="w-full py-4 bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-md hover:bg-emerald-600 transition-all flex items-center justify-center gap-2">
              <MessageCircle size={18} /> Abrir WhatsApp y Enviar
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

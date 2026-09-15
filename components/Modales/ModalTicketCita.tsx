import { motion } from 'framer-motion'
import { CheckCircle2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'

export default function ModalTicketCita({ isOpen, data, onClose }: any) {
  if (!isOpen || !data) return null;

  const enviarWhatsApp = () => {
    const { paciente, citas, telefono, citaId, doctor } = data;

    if (!telefono) {
      toast.error("El paciente no tiene un número de teléfono registrado.");
      return;
    }

    const nombreDoctor = doctor ? `Dr(a). ${doctor}` : "nuestro especialista";
    const fechaCita = citas[0]?.fecha; // Formato YYYY-MM-DD
    const horaCita = citas[0]?.hora;   // Formato HH:MM

    // Formatear la fecha en texto (Ej: Lunes 14 de octubre)
    const fechaObj = new Date(fechaCita + 'T00:00:00');
    let fechaTexto = fechaObj.toLocaleDateString('es-CL', { 
        weekday: 'long', day: 'numeric', month: 'long' 
    }).replace(',', '');
    fechaTexto = fechaTexto.charAt(0).toUpperCase() + fechaTexto.slice(1);

    // Calcular días relativos (Hoy / Mañana)
    const hoy = new Date();
    const hoyStr = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const mananaStr = new Date(manana.getTime() - manana.getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const esHoy = fechaCita === hoyStr;
    const esManana = fechaCita === mananaStr;

    let mensaje = "";

    // Lógica inteligente de notificaciones
    if (esHoy || esManana) {
        const textoDia = esHoy ? "HOY" : "MAÑANA";
        mensaje = `Hola ${paciente}, hemos agendado tu cita con el/la ${nombreDoctor} para ${textoDia} a las ${horaCita} hrs.\n\n`;
        mensaje += `📍 Dirección: Av. Venancia Leiva 1871, La Pintana.\n\n`;
        
        if (citaId) {
            mensaje += `⚠️ Importante: Debido a la alta demanda de horas, si tu cita no es confirmada el bloque será asignado a otro paciente.\n\n`;
            mensaje += `Por favor confirma tu asistencia en el siguiente enlace:\nhttps://confirmar-cita-dignidad.vercel.app/confirmar/${citaId}\n\n`;
        }
        mensaje += `¡Te esperamos en Clínica Dignidad!`;
    } else {
        mensaje = `Hola ${paciente}, hemos agendado exitosamente tu cita con el/la ${nombreDoctor} para el día ${fechaTexto} a las ${horaCita} hrs.\n\n`;
        mensaje += `📍 Dirección: Av. Venancia Leiva 1871, La Pintana.\n\n`;
        mensaje += `¡Te esperamos en Clínica Dignidad!`;
    }

    // Formateo del número de teléfono (+56)
    const numLimpio = telefono.replace(/\D/g, '');
    const numFinal = numLimpio.length === 9 ? `56${numLimpio}` : numLimpio;

    window.open(`https://wa.me/${numFinal}?text=${encodeURIComponent(mensaje)}`, '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-[3rem] p-8 text-center max-w-sm w-full">
        <CheckCircle2 className="mx-auto text-emerald-500 mb-4" size={60} />
        <h2 className="text-2xl font-black uppercase text-slate-800 mb-6">¡Cita Lista!</h2>
        
        <div className="bg-slate-50 p-4 rounded-2xl mb-6 text-left border">
          <p className="text-[10px] font-black text-slate-400 uppercase">Paciente</p>
          <p className="font-black text-slate-800 mb-3">{data.paciente}</p>
          <p className="text-[10px] font-black text-slate-400 uppercase">Fecha y Hora</p>
          <p className="font-black text-slate-800">{data.citas[0]?.fecha} • {data.citas[0]?.hora} hrs</p>
        </div>

        <button onClick={enviarWhatsApp} className="w-full py-4 mb-2 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2">
          <MessageCircle size={16}/> Enviar Confirmación
        </button>
        <button onClick={onClose} className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase hover:bg-slate-200 transition-colors">
          Finalizar sin enviar
        </button>
      </motion.div>
    </div>
  )
}

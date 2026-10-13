import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, Activity, Pill, X, Trash2, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ModalEditarAntecedentes({ isOpen, categoria, antecedentes, pacienteId, onClose, onUpdate }: any) {
  const [nuevoTexto, setNuevoTexto] = useState('')
  const [procesando, setProcesando] = useState(false)

  if (!isOpen) return null;

  const agregarItem = async () => {
    if (!nuevoTexto.trim()) return;
    setProcesando(true);
    try {
      await supabase.from('antecedentes').insert([{ paciente_id: pacienteId, categoria, contenido: nuevoTexto.trim() }]);
      toast.success("Registro añadido");
      setNuevoTexto('');
      onUpdate();
    } catch (e) { toast.error("Error al guardar"); } 
    finally { setProcesando(false); }
  };

  const eliminarItem = async (id: string) => {
    setProcesando(true);
    try {
      await supabase.from('antecedentes').delete().eq('id', id);
      toast.success("Registro eliminado");
      onUpdate();
    } catch (e) { toast.error("Error al eliminar"); } 
    finally { setProcesando(false); }
  };

  const filtrados = antecedentes.filter((a: any) => a.categoria === categoria);
  const colorBg = categoria === 'alerta' ? 'bg-red-600' : categoria === 'enfermedad' ? 'bg-blue-600' : 'bg-purple-600';

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-sm rounded-3xl overflow-hidden flex flex-col">
        <div className={`p-5 flex justify-between items-center text-white ${colorBg}`}>
          <h3 className="font-black text-sm uppercase">Editar {categoria}s</h3>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-xl"><X size={18}/></button>
        </div>
        <div className="p-5 flex-1 max-h-[300px] overflow-y-auto bg-slate-50 space-y-2">
          {filtrados.map((item: any) => (
            <div key={item.id} className="flex justify-between items-center bg-white border p-3 rounded-xl">
              <span className="text-xs font-bold text-slate-700">{item.contenido}</span>
              <button disabled={procesando} onClick={() => eliminarItem(item.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="p-4 bg-white border-t flex gap-2">
          <input type="text" value={nuevoTexto} onChange={e => setNuevoTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregarItem()} placeholder={`Nuevo ${categoria}...`} className="flex-1 p-3 bg-slate-50 border rounded-xl text-xs outline-none" />
          <button disabled={procesando || !nuevoTexto} onClick={agregarItem} className={`p-3 text-white rounded-xl ${colorBg} disabled:opacity-50`}>
            {procesando ? <Loader2 className="animate-spin" size={16}/> : <Plus size={16}/>}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
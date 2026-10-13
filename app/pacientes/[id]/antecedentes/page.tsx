'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { 
  Plus, Trash2, Loader2, AlertTriangle, 
  Activity, Pill, Heart, CheckCircle2, X 
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function AntecedentesPage() {
  const { id } = useParams()
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [perfil, setPerfil] = useState<any>(null) // <-- Agregado para auditoría
  const [cargando, setCargando] = useState(true)
  const [items, setItems] = useState<any[]>([])
  
  const OPCIONES_PREDEFINIDAS = {
    alerta: ['Alergia Amoxicilina', 'Alergica a Penicilina', 'Alergia Primaveral', 'Problemas al corazón', 'Asma Severo', 'VIH'],
    medicamento: ['Amlodipino', 'Aspirina', 'Atenolol', 'Atorvastatina', 'Celebra', 'Enalapril', 'Fluoxetina', 'Furosemida', 'Iltuxam 20/5', 'Itulsap 25'],
    enfermedad: ['ACV', 'Diabetes Tipo 1', 'Diabetes Tipo 2', 'Fibromialgia', 'Hipertensión', 'Resistencia a la Insulina', 'Sindrome Quino', 'Tiroides'],
    habito: ['Fumador', 'Alcohol ocasional', 'Sedentarismo', 'Higiene oral deficiente', 'Bruxismo']
  }

  useEffect(() => { 
    // Obtener sesión y perfil para la auditoría SEREMI
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setSessionUserId(session.user.id);
        const { data: pData } = await supabase
          .from('perfiles')
          .select('rut, nombre_completo, rol')
          .eq('id', session.user.id)
          .maybeSingle();
        setPerfil(pData);
      }
    });

    if (id) fetchAntecedentes() 
  }, [id])

  // --- FUNCIÓN DE AUDITORÍA ENRIQUECIDA (SEREMI) ---
  const registrarAuditoria = async (accion: string, detalles: string, datos_anteriores: any = null, datos_nuevos: any = null) => {
    if (!sessionUserId || !perfil) return;
    try {
      await supabase.from('auditoria_clinica').insert([{
        usuario_id: sessionUserId,
        rut_usuario: perfil.rut,
        nombre_usuario: perfil.nombre_completo,
        rol_al_momento: perfil.rol,
        paciente_id: id,
        accion,
        tabla: 'antecedentes',
        detalles,
        datos_anteriores,
        datos_nuevos,
        user_agent: navigator.userAgent
      }]);
    } catch (e) {
      console.error("Error al registrar auditoría", e);
    }
  }

  async function fetchAntecedentes() {
    const { data } = await supabase.from('antecedentes').select('*').eq('paciente_id', id)
    if (data) setItems(data)
    setCargando(false)
  }

  const toggleItem = async (categoria: string, contenido: string) => {
    const existe = items.find(i => i.categoria === categoria && i.contenido === contenido)
    if (existe) {
      await supabase.from('antecedentes').delete().eq('id', existe.id)
      await registrarAuditoria('DELETE / ELIMINAR ANTECEDENTE', `Eliminó el antecedente "${contenido}" de la categoría ${categoria}`, { contenido_eliminado: contenido }, null);
    } else {
      await supabase.from('antecedentes').insert([{ paciente_id: id, categoria, contenido }])
      await registrarAuditoria('INSERT / CREAR ANTECEDENTE', `Añadió el antecedente "${contenido}" a la categoría ${categoria}`, null, { contenido_agregado: contenido });
    }
    fetchAntecedentes()
    window.dispatchEvent(new Event('pacienteActualizado'))
  }

  const agregarPersonalizado = async (categoria: string, contenido: string) => {
    if (!contenido) return
    await supabase.from('antecedentes').insert([{ paciente_id: id, categoria, contenido }])
    await registrarAuditoria('INSERT / CREAR ANTECEDENTE PERSONALIZADO', `Añadió antecedente personalizado "${contenido}" a la categoría ${categoria}`, null, { contenido_agregado: contenido });
    fetchAntecedentes()
    window.dispatchEvent(new Event('pacienteActualizado'))
  }

  if (cargando) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <Loader2 className="animate-spin text-blue-600" size={40} />
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 animate-pulse">Cargando Anamnesis...</p>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6 pt-4 md:pt-2 pb-20 px-4 md:px-0 text-left">
      
      {/* HEADER TIPO GLASSMORPHISM */}
      <div className="bg-white/95 backdrop-blur-md p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-100/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="relative z-10 w-full">
          <div className="flex items-center gap-3 md:gap-4 mb-2">
             <div className="bg-blue-50/80 p-2.5 md:p-3 rounded-xl md:rounded-2xl text-blue-600 shadow-sm border border-blue-100/50 shrink-0">
               <Activity size={24} className="md:w-6 md:h-6 w-5 h-5" strokeWidth={2.5} />
             </div>
             <div>
               <h3 className="text-xl md:text-2xl font-black tracking-tight text-slate-800 uppercase italic leading-none">Anamnesis Médica</h3>
               <p className="text-slate-400 text-[9px] md:text-[10px] font-bold uppercase tracking-widest md:tracking-[0.2em] mt-1">Ficha de control y riesgos sistémicos</p>
             </div>
          </div>
        </div>
      </div>

      {/* GRID DE SECCIONES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 text-left">
        <SeccionDesplegable 
          titulo="Alertas Médicas" categoria="alerta" color="red"
          icon={<AlertTriangle size={20} strokeWidth={2.5}/>}
          opciones={OPCIONES_PREDEFINIDAS.alerta}
          seleccionados={items.filter(i => i.categoria === 'alerta')}
          onToggle={toggleItem}
          onAddCustom={agregarPersonalizado}
        />

        <SeccionDesplegable 
          titulo="Enfermedades" categoria="enfermedad" color="blue"
          icon={<Activity size={20} strokeWidth={2.5}/>}
          opciones={OPCIONES_PREDEFINIDAS.enfermedad}
          seleccionados={items.filter(i => i.categoria === 'enfermedad')}
          onToggle={toggleItem}
          onAddCustom={agregarPersonalizado}
        />

        <SeccionDesplegable 
          titulo="Medicamentos" categoria="medicamento" color="purple"
          icon={<Pill size={20} strokeWidth={2.5}/>}
          opciones={OPCIONES_PREDEFINIDAS.medicamento}
          seleccionados={items.filter(i => i.categoria === 'medicamento')}
          onToggle={toggleItem}
          onAddCustom={agregarPersonalizado}
        />

        <SeccionDesplegable 
          titulo="Hábitos" categoria="habito" color="emerald"
          icon={<Heart size={20} strokeWidth={2.5}/>}
          opciones={OPCIONES_PREDEFINIDAS.habito}
          seleccionados={items.filter(i => i.categoria === 'habito')}
          onToggle={toggleItem}
          onAddCustom={agregarPersonalizado}
        />
      </div>
    </div>
  )
}

function SeccionDesplegable({ titulo, categoria, icon, color, opciones, seleccionados, onToggle, onAddCustom }: any) {
  const [abierto, setAbierto] = useState(false)
  const [inputManual, setInputManual] = useState('')

  // Paleta de colores
  const colorMap: any = {
    red: { light: 'bg-red-50 text-red-600 border-red-100', active: 'bg-red-600 text-white border-red-500', hover: 'hover:border-red-300' },
    blue: { light: 'bg-blue-50 text-blue-600 border-blue-100', active: 'bg-blue-600 text-white border-blue-500', hover: 'hover:border-blue-300' },
    purple: { light: 'bg-purple-50 text-purple-600 border-purple-100', active: 'bg-purple-600 text-white border-purple-500', hover: 'hover:border-purple-300' },
    emerald: { light: 'bg-emerald-50 text-emerald-600 border-emerald-100', active: 'bg-emerald-500 text-white border-emerald-400', hover: 'hover:border-emerald-300' }
  }

  const theme = colorMap[color];

  return (
    // SOLUCIÓN Z-INDEX: Agregamos z-50 cuando está abierto para que sobreescriba los cuadros de abajo.
    <div className={`bg-white/95 backdrop-blur-md p-5 md:p-7 lg:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100/80 shadow-sm relative flex flex-col h-full text-left transition-shadow hover:shadow-md ${abierto ? 'z-50' : 'z-10'}`}>
      
      {/* CABECERA DE LA TARJETA */}
      <div className="flex items-center justify-between mb-6 md:mb-8 text-left z-20">
        <div className="flex items-center gap-3 md:gap-4 text-left">
          <div className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-xl md:rounded-[1.2rem] border shadow-sm shrink-0 ${theme.light}`}>
            {icon}
          </div>
          <h4 className="font-black text-slate-800 uppercase italic text-[13px] md:text-[15px] tracking-tight text-left leading-none">{titulo}</h4>
        </div>
        
        <button 
          onClick={() => setAbierto(!abierto)}
          className={`flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-5 py-2 md:py-2.5 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase transition-all shadow-sm border shrink-0 ${
            abierto 
            ? 'bg-slate-800 text-white border-slate-700 shadow-md' 
            : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-white hover:text-slate-800'
          }`}
        >
          {abierto ? <X size={14} strokeWidth={2.5}/> : <Plus size={14} strokeWidth={2.5}/>}
          <span className="hidden sm:inline">{abierto ? 'Cerrar' : 'Añadir'}</span>
        </button>
      </div>

      {/* MODAL DESPLEGABLE LUMINOSO */}
      <AnimatePresence>
        {abierto && (
          <motion.div 
            initial={{ opacity: 0, y: -10, scale: 0.98 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: -5, scale: 0.98, transition: { duration: 0.15 } }}
            className="absolute top-[75px] md:top-[90px] left-2 right-2 md:left-4 md:right-4 bg-white rounded-2xl md:rounded-[2rem] p-5 md:p-7 z-30 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.2)] border border-slate-200/80 text-left"
          >
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest md:tracking-[0.2em] mb-3 md:mb-4 text-left flex items-center gap-2">
              <CheckCircle2 size={12}/> Selección Rápida
            </p>
            
            <div className="flex flex-wrap gap-1.5 md:gap-2 mb-5 md:mb-6 text-left">
              {opciones.map((opt: string) => {
                const isActive = (seleccionados as any[]).some((i: any) => i.contenido === opt)
                return (
                  <button 
                    key={opt}
                    onClick={() => onToggle(categoria, opt)}
                    className={`px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase transition-all border ${
                      isActive 
                      ? `${theme.active} shadow-sm` 
                      : `bg-slate-50 text-slate-600 border-slate-200 hover:bg-white ${theme.hover}`
                    }`}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>

            <div className="border-t border-slate-100 pt-4 md:pt-5 text-left">
               <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest md:tracking-[0.2em] mb-2 md:mb-3 text-left">Añadir Registro Personalizado</p>
               <div className="flex flex-col sm:flex-row gap-2 text-left">
                  <input 
                    type="text" 
                    placeholder="Escribir nuevo registro..."
                    className="flex-1 bg-slate-50 p-3 md:p-3.5 rounded-lg md:rounded-xl text-[11px] md:text-xs font-bold text-slate-700 outline-none border border-slate-200 focus:border-slate-400 focus:bg-white transition-all shadow-inner shadow-slate-100/50"
                    value={inputManual}
                    onChange={(e) => setInputManual(e.target.value)}
                    onKeyDown={(e) => { 
                      if(e.key === 'Enter' && inputManual.trim()) { 
                        onAddCustom(categoria, inputManual); 
                        setInputManual(''); 
                      } 
                    }}
                  />
                  <button 
                    onClick={() => { 
                      if(inputManual.trim()) {
                        onAddCustom(categoria, inputManual); 
                        setInputManual(''); 
                      }
                    }}
                    className={`text-white p-3 md:p-3.5 rounded-lg md:rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 ${theme.active.split(' ')[0]} hover:opacity-90`}
                  >
                    <Plus size={16} className="md:w-[18px] md:h-[18px]" strokeWidth={2.5}/>
                    <span className="sm:hidden text-[10px] font-black uppercase">Agregar</span>
                  </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ITEMS SELECCIONADOS (LISTA ACTUAL) */}
      <div className="space-y-2 md:space-y-2.5 text-left flex-1 relative z-10">
        {(seleccionados as any[]).length === 0 ? (
          <div className="h-full min-h-[100px] md:min-h-[120px] flex flex-col items-center justify-center gap-2 md:gap-3 border-2 border-dashed border-slate-200/60 bg-slate-50/50 rounded-2xl md:rounded-[1.5rem]">
            <div className="text-slate-300 opacity-50 scale-75 md:scale-100">{icon}</div>
            <p className="text-[8px] md:text-[9px] text-slate-400 font-black uppercase tracking-widest md:tracking-[0.2em]">No registra {titulo.toLowerCase()}</p>
          </div>
        ) : (
          (seleccionados as any[]).map((p: any) => (
            <div key={p.id} className="flex justify-between items-center bg-slate-50/80 px-4 md:px-5 py-3 md:py-3.5 rounded-xl md:rounded-2xl group border border-slate-100 hover:border-slate-200 hover:bg-white transition-all text-left shadow-sm">
              <div className="flex items-center gap-2.5 md:gap-3 text-left">
                <div className={`w-1.5 h-1.5 rounded-full ${theme.active.split(' ')[0]}`}></div>
                <span className="text-[10px] md:text-[11px] font-black text-slate-700 uppercase tracking-tight text-left leading-none mt-0.5">{p.contenido}</span>
              </div>
              <button 
                onClick={() => onToggle(categoria, p.contenido)} 
                // En móviles (sm:), mostramos la papelera siempre. En PC, aparece al pasar el cursor.
                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                title="Eliminar registro"
              >
                <Trash2 size={14} strokeWidth={2.5}/>
              </button>
            </div>
          ))
        )}
      </div>
      
    </div>
  )
}

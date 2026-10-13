'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { 
  Save, Loader2, Info, User, FileDigit, CalendarDays, 
  Building2, MapPin, Map, Smartphone, Phone, Mail, 
  Briefcase, Users, UserCircle2, ChevronDown, CheckCircle2 
} from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

export default function DatosPersonalesPage() {
  const { id } = useParams()
  
  // --- ESTADOS PARA AUDITORÍA SEREMI ---
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [datosOriginales, setDatosOriginales] = useState<any>(null) // Para registrar los datos antes del cambio

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [listaConvenios, setListaConvenios] = useState<string[]>([])
  
  const [datos, setDatos] = useState<any>({
    tipo_paciente: '',
    nombre: '',
    apellido: '',
    rut: '',
    fecha_nacimiento: '',
    nombre_social: '',
    email: '',
    prevision: 'Sin convenio',
    numero_interno: '',
    sexo: '',
    genero: '',
    ciudad: '',
    comuna: '',
    direccion: '',
    telefono_fijo: '',
    telefono: '', 
    actividad_profesion: '',
    empleador: '',
    observaciones_personales: '',
    apoderado_nombre: '',
    apoderado_rut: '',
    referencia: ''
  })

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

    if (id) {
      cargarTodo()
    }
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
        tabla: 'pacientes',
        detalles,
        datos_anteriores,
        datos_nuevos,
        user_agent: navigator.userAgent
      }]);
    } catch (e) {
      console.error("Error al registrar auditoría", e);
    }
  }

  async function cargarTodo() {
    setCargando(true)
    try {
      const { data: convs, error: errConv } = await supabase
        .from('convenios')
        .select('nombre_convenio')
        .eq('estado', 'Habilitado')
        .order('nombre_convenio', { ascending: true })

      if (errConv) throw errConv
      
      const nombresConvenios = convs?.map(c => c.nombre_convenio) || []
      setListaConvenios(['Sin convenio', ...nombresConvenios.filter(n => n !== 'Sin convenio')])

      const { data: paciente, error: errPac } = await supabase
        .from('pacientes')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (errPac) throw errPac

      if (paciente) {
        const saneados = Object.fromEntries(
          Object.entries(paciente).map(([key, val]) => [key, val === null ? '' : val])
        )
        setDatos(saneados)
        setDatosOriginales(saneados) // Guardamos snapshot original para auditoría
      }
    } catch (error: any) {
      console.error("Error en carga:", error.message)
      toast.error("Error al cargar los datos del paciente")
    } finally {
      setCargando(false)
    }
  }

  const handleGuardar = async () => {
    if (!id) return toast.error("ID de paciente no encontrado");
    
    setGuardando(true)
    const payload = {
      rut: datos.rut ? datos.rut.replace(/\./g, '').toUpperCase().trim() : null,
      nombre: datos.nombre || null,
      apellido: datos.apellido || null,
      fecha_nacimiento: datos.fecha_nacimiento === '' ? null : datos.fecha_nacimiento,
      telefono: datos.telefono || null,
      email: datos.email || null,
      prevision: datos.prevision || 'Sin convenio',
      direccion: datos.direccion || null,
      nombre_social: datos.nombre_social || null,
      tipo_paciente: datos.tipo_paciente || null,
      sexo: datos.sexo || null,
      genero: datos.genero || null,
      ciudad: datos.ciudad || null,
      comuna: datos.comuna || null,
      telefono_fijo: datos.telefono_fijo || null,
      actividad_profesion: datos.actividad_profesion || null,
      empleador: datos.empleador || null,
      observaciones_personales: datos.observaciones_personales || null,
      apoderado_nombre: datos.apoderado_nombre || null,
      apoderado_rut: datos.apoderado_rut || null,
      referencia: datos.referencia || null,
      numero_interno: datos.numero_interno || null
    }

    try {
      const { error: updateError } = await supabase
        .from('pacientes')
        .update(payload)
        .eq('id', id)

      if (updateError) throw updateError

      // REGISTRAR AUDITORÍA AL GUARDAR CAMBIOS
      await registrarAuditoria(
        'UPDATE / EDITAR DATOS PERSONALES',
        `Actualizó la ficha maestra del paciente "${payload.nombre || ''} ${payload.apellido || ''}".`,
        datosOriginales,
        payload
      );

      setDatosOriginales(payload); // Actualizamos el snapshot tras guardar con éxito
      toast.success("Datos actualizados correctamente")

    } catch (error: any) {
      toast.error(`Error: ${error.message}`)
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return (
    <div className="h-[70vh] flex flex-col items-center justify-center gap-4">
      <Loader2 className="animate-spin text-blue-600" size={45} />
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando Ficha Maestra...</p>
    </div>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-24 text-left">
      
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/90 backdrop-blur-xl p-8 rounded-[2.5rem] shadow-xl border border-white/60">
        <div className="flex items-center gap-5">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-4 rounded-[1.5rem] text-white shadow-xl shadow-slate-900/20">
            <User size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-2xl font-black tracking-tight text-slate-800 uppercase italic leading-none">Información Personal</h3>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Edición y Control de Ficha Maestra</p>
          </div>
        </div>
        <button 
          onClick={handleGuardar}
          disabled={guardando}
          className="w-full md:w-auto bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-slate-900 hover:to-slate-900 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 active:scale-95 border border-blue-500"
        >
          {guardando ? <Loader2 className="animate-spin" size={18}/> : <Save size={18} strokeWidth={2.5}/>}
          {guardando ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

      {/* SECCIÓN DATOS REQUERIDOS */}
      <section className="bg-white/90 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl border border-white/60 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-blue-400 to-blue-600"></div>
        
        <div className="flex items-center gap-3 mb-8 text-blue-600">
          <div className="bg-blue-50 p-2 rounded-xl">
            <Info size={18} strokeWidth={2.5}/>
          </div>
          <h4 className="font-black text-[11px] uppercase tracking-widest">Datos Requeridos</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <InputGroup 
            label="Tipo de Paciente *" 
            type="select" 
            value={datos.tipo_paciente} 
            onChange={(v:any) => setDatos({...datos, tipo_paciente: v})} 
            options={['discapacidad', 'embarazada', 'funcionario clinica', 'menor de edad', 'paciente adulto mayor']} 
            icon={Users}
          />
          <InputGroup label="Nombre Legal *" value={datos.nombre} onChange={(v:any) => setDatos({...datos, nombre: v})} icon={User} />
          <InputGroup label="Apellidos *" value={datos.apellido} onChange={(v:any) => setDatos({...datos, apellido: v})} icon={User} />
          <InputGroup label="RUT *" value={datos.rut} onChange={(v:any) => setDatos({...datos, rut: v})} icon={FileDigit} />
          <InputGroup label="Fecha Nacimiento *" type="date" value={datos.fecha_nacimiento} onChange={(v:any) => setDatos({...datos, fecha_nacimiento: v})} icon={CalendarDays} />
        </div>
      </section>

      {/* SECCIÓN CAMPOS OPCIONALES */}
      <section className="bg-white/90 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl border border-white/60 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-slate-400 to-slate-600"></div>
        
        <h4 className="text-slate-400 font-black text-[10px] uppercase tracking-[0.3em] mb-8">Campos Opcionales</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <InputGroup 
            label="Convenio (Previsión)" 
            type="select" 
            value={datos.prevision} 
            onChange={(v:any) => setDatos({...datos, prevision: v})} 
            options={listaConvenios} 
            icon={Building2}
          />

          <InputGroup label="Nombre Social" value={datos.nombre_social} onChange={(v:any) => setDatos({...datos, nombre_social: v})} icon={UserCircle2} />
          <InputGroup label="Email" type="email" value={datos.email} onChange={(v:any) => setDatos({...datos, email: v})} icon={Mail} />
          <InputGroup label="N° Interno" value={datos.numero_interno} onChange={(v:any) => setDatos({...datos, numero_interno: v})} icon={FileDigit} />
          <InputGroup label="Sexo" type="select" value={datos.sexo} onChange={(v:any) => setDatos({...datos, sexo: v})} options={['Masculino', 'Femenino', 'Otro']} icon={Users} />
          <InputGroup label="Ciudad" value={datos.ciudad} onChange={(v:any) => setDatos({...datos, ciudad: v})} icon={Building2} />
          <InputGroup label="Comuna" value={datos.comuna} onChange={(v:any) => setDatos({...datos, comuna: v})} icon={MapPin} />
          <InputGroup label="Dirección" value={datos.direccion} onChange={(v:any) => setDatos({...datos, direccion: v})} icon={Map} />
          <InputGroup label="WhatsApp" value={datos.telefono} onChange={(v:any) => setDatos({...datos, telefono: v})} icon={Smartphone} />
          <InputGroup label="Actividad / Profesión" value={datos.actividad_profesion} onChange={(v:any) => setDatos({...datos, actividad_profesion: v})} icon={Briefcase} />
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 pt-8 border-t border-slate-100">
          <InputGroup label="Nombre Apoderado" value={datos.apoderado_nombre} onChange={(v:any) => setDatos({...datos, apoderado_nombre: v})} icon={User} />
          <InputGroup label="RUT Apoderado" value={datos.apoderado_rut} onChange={(v:any) => setDatos({...datos, apoderado_rut: v})} icon={FileDigit} />
        </div>

        <div className="mt-8 space-y-1.5 group">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block group-focus-within:text-blue-600 transition-colors">Observaciones Internas</label>
          <textarea 
            className="w-full p-5 bg-slate-50/80 hover:bg-white focus:bg-white rounded-[2rem] font-medium text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 border border-slate-200/60 focus:border-blue-500/50 transition-all shadow-sm resize-none placeholder:text-slate-300" 
            rows={4}
            placeholder="Anotaciones médicas o detalles importantes..."
            value={datos.observaciones_personales || ''} 
            onChange={(e) => setDatos({...datos, observaciones_personales: e.target.value})} 
          />
        </div>
      </section>

    </motion.div>
  )
}

function InputGroup({ label, value, onChange, type = "text", options = [], icon: Icon }: any) {
  return (
    <div className="space-y-1.5 text-left group">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block group-focus-within:text-blue-600 transition-colors">
        {label}
      </label>
      {type === "select" ? (
        <div className="relative text-left">
          {Icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors pointer-events-none">
              <Icon size={18} strokeWidth={2.5} />
            </div>
          )}
          <select 
            className={`w-full ${Icon ? 'pl-11' : 'pl-4'} pr-10 py-4 bg-slate-50/80 hover:bg-white focus:bg-white rounded-2xl font-bold text-xs text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 border border-slate-200/60 focus:border-blue-500/50 transition-all cursor-pointer appearance-none shadow-sm`}
            value={value || ''} 
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Seleccione...</option>
            {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <ChevronDown size={16} />
          </div>
        </div>
      ) : (
        <div className="relative">
          {Icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors pointer-events-none">
              <Icon size={18} strokeWidth={2.5} />
            </div>
          )}
          <input 
            type={type}
            placeholder="Completar..."
            className={`w-full ${Icon ? 'pl-11' : 'pl-4'} pr-4 py-4 bg-slate-50/80 hover:bg-white focus:bg-white rounded-2xl font-bold text-xs text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 border border-slate-200/60 focus:border-blue-500/50 transition-all shadow-sm placeholder:text-slate-300`}
            value={value || ''} 
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}

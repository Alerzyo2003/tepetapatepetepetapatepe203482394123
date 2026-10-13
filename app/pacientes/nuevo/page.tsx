'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { 
  UserPlus, ArrowLeft, Save, Loader2, CheckCircle2, 
  AlertTriangle, MapPin, Users, User, FileDigit, 
  CalendarDays, Map, Building2, Smartphone, Phone, 
  Mail, Briefcase, UserCircle2, ChevronDown
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

export default function NuevoPaciente() {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [exito, setExito] = useState(false)
  const [listaConvenios, setListaConvenios] = useState<string[]>([])
  const [esOtroDocumento, setEsOtroDocumento] = useState(false)
  
  const [form, setForm] = useState<any>({
    tipo_paciente: '-',
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
    async function fetchConvenios() {
      const { data } = await supabase.from('convenios').select('nombre_convenio').eq('estado', 'Habilitado')
      if (data) {
        const nombres = data.map(c => c.nombre_convenio)
        setListaConvenios(['Sin convenio', ...nombres.filter(n => n !== 'Sin convenio')])
      }
    }
    fetchConvenios()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cargando) return
    
    if (!form.nombre || !form.apellido || (!form.rut && !esOtroDocumento) || !form.fecha_nacimiento) {
        toast.error("Faltan campos obligatorios", {
            description: "Por favor completa Nombre, Apellido, Documento y Fecha de Nacimiento."
        })
        return
    }

    setCargando(true)

    // 1. OBTENER EL USUARIO ACTUAL PARA LA AUDITORÍA
    const { data: { user } } = await supabase.auth.getUser();

    // 2. FORMATEO DE RUT O DOCUMENTO EXTRANJERO
    let rutFinal = form.rut.toUpperCase().trim();
    if (esOtroDocumento) {
        // Se guarda tal cual lo escribió el usuario. Si está vacío, genera uno automático.
        if (!rutFinal) rutFinal = `OTRO-DOC-${Date.now()}`;
    } else {
        // Si es RUT chileno: limpiamos todo lo que no sea número o letra K
        let cleanRut = rutFinal.replace(/[^0-9K]/g, '');
        // Insertamos el guion justo antes del último carácter
        if (cleanRut.length > 1) {
            rutFinal = cleanRut.slice(0, -1) + '-' + cleanRut.slice(-1);
        } else {
            rutFinal = cleanRut; // Por si acaso ingresó solo 1 carácter
        }
    }

    try {
      if (rutFinal) {
        const { data: existente } = await supabase
          .from('pacientes')
          .select('nombre, apellido, activo, motivo_deshabilitado')
          .eq('rut', rutFinal)
          .maybeSingle()

        if (existente) {
          if (existente.activo === false) {
              toast.warning("PACIENTE RESTRINGIDO", {
                  description: `El documento pertenece a ${existente.nombre} ${existente.apellido}, quien se encuentra deshabilitado. Motivo: ${existente.motivo_deshabilitado || 'No especificado'}.`,
                  duration: 8000,
                  icon: <AlertTriangle className="text-amber-500" />
              })
          } else {
              toast.error(`El documento ${rutFinal} ya existe`, {
                  description: `Pertenece a ${existente.nombre} ${existente.apellido}`,
                  duration: 5000
              })
          }
          setCargando(false)
          return
        }
      }

      // 3. GUARDAR PACIENTE
      const { error: errorInsert } = await supabase
        .from('pacientes')
        .insert([{ 
          ...form, 
          rut: rutFinal,
          nombre: form.nombre.toUpperCase().trim(),
          apellido: form.apellido.toUpperCase().trim(),
          extranjero: esOtroDocumento, // Marcamos si es extranjero según el checkbox
          activo: true 
        }])

      if (errorInsert) {
        if (errorInsert.code === '23505') {
            throw new Error("El RUT ya se encuentra registrado.")
        }
        throw errorInsert
      }

      // 4. REGISTRAR EN LA TABLA DE AUDITORÍA
      if (user) {
        await supabase.from('auditoria_clinica').insert([{
          usuario_id: user.id,
          accion: 'CREAR',
          tabla: 'pacientes',
          detalles: `Se creó el paciente ${form.nombre.toUpperCase().trim()} ${form.apellido.toUpperCase().trim()} con documento ${rutFinal}.`
        }])
      }

      setExito(true)
      toast.success("Paciente registrado correctamente")
      setTimeout(() => router.push('/pacientes'), 2000)

    } catch (error: any) {
      console.error("Error completo:", error)
      toast.error("Error al guardar", {
          description: error.message || "No se pudo conectar con el servidor"
      })
      setCargando(false)
    }
  }

  // ── ANIMACIONES CORREGIDAS PARA EVITAR CONFLICTOS DE TIPOS ──
  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  }
  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0 }
  }

  // ── PANTALLA DE ÉXITO ──
  if (exito) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50" style={{ backgroundImage: "url('/fondo-pacientes.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="bg-white/90 backdrop-blur-xl p-12 rounded-[2.5rem] shadow-2xl border border-white/60 text-center max-w-sm w-full">
        <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
          <CheckCircle2 className="text-emerald-500" size={50} strokeWidth={2.5} />
        </div>
        <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tight">¡Registrado!</h2>
        <p className="text-slate-400 font-bold mt-2 text-[11px] uppercase tracking-widest text-center">Ficha creada con éxito</p>
      </motion.div>
    </div>
  )

  // ── PANTALLA PRINCIPAL ──
  return (
    <div className="min-h-screen p-6 md:p-10 bg-slate-50" style={{ backgroundImage: "url('/fondo-pacientes.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <main className="max-w-5xl mx-auto text-left">
        
        <Link href="/pacientes" className="inline-flex items-center gap-2 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-blue-600 transition-all bg-white/80 backdrop-blur-md px-5 py-2.5 rounded-2xl shadow-sm border border-white mb-8 group">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Volver al Directorio
        </Link>

        <form onSubmit={handleSubmit}>
          <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-8">
            
            {/* HEADER PRINCIPAL */}
            <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4">
              <div className="flex items-center gap-5">
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-5 rounded-[1.5rem] text-white shadow-xl shadow-blue-600/20 border border-blue-500/50">
                  <UserPlus size={32} strokeWidth={2.5} />
                </div>
                <div>
                  <h1 className="text-4xl font-black text-slate-800 uppercase italic tracking-tight drop-shadow-sm">Nueva Ficha</h1>
                  <p className="text-slate-500 text-[11px] font-bold uppercase tracking-[0.2em] mt-1">Registro Integral de Paciente</p>
                </div>
              </div>
            </motion.div>

            {/* SECCIÓN 1: DATOS OBLIGATORIOS */}
            <motion.div variants={itemVariants} className="bg-white/85 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-blue-400 to-blue-600"></div>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
                  <User size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800 tracking-tight uppercase">Datos Personales</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Información Obligatoria</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="md:col-span-2 lg:col-span-4 text-left group">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block mb-1.5 group-focus-within:text-blue-600 transition-colors">Tipo de Paciente *</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-blue-600 transition-colors">
                      <Users size={18} strokeWidth={2.5} />
                    </div>
                    <select required className="w-full pl-11 pr-10 py-4 bg-white/50 hover:bg-white focus:bg-white rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 border border-slate-200/60 focus:border-blue-500/50 transition-all shadow-sm cursor-pointer appearance-none"
                    value={form.tipo_paciente} onChange={(e) => setForm({...form, tipo_paciente: e.target.value})}>
                      <option value="-">-</option>
                      <option value="discapacidad">Discapacidad</option>
                      <option value="embarazada">Embarazada</option>
                      <option value="funcionario clinica">Funcionario Clínica</option>
                      <option value="menor de edad">Menor de Edad</option>
                      <option value="paciente adulto mayor">Paciente Adulto Mayor</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <ChevronDown size={18} />
                    </div>
                  </div>
                </div>

                <InputWithIcon icon={User} label="Nombre *" value={form.nombre} onChange={(v:any) => setForm({...form, nombre: v})} required placeholder="Ej: Juan Pablo" />
                <InputWithIcon icon={User} label="Apellidos *" value={form.apellido} onChange={(v:any) => setForm({...form, apellido: v})} required placeholder="Ej: Pérez Silva" />
                
                <div className="space-y-1.5 group">
                  <div className="flex items-center justify-between ml-1 mb-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-focus-within:text-blue-600 transition-colors">
                      Documento / RUT *
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Otro Doc.</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={esOtroDocumento} onChange={(e) => {
                          setEsOtroDocumento(e.target.checked);
                          setForm((prev: any) => ({...prev, rut: ''}));
                        }}/>
                        <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-blue-600 transition-colors">
                      <FileDigit size={18} strokeWidth={2.5} />
                    </div>
                    <input 
                      required={!esOtroDocumento}
                      placeholder={esOtroDocumento ? "Pasaporte, DNI, etc." : "12.345.678-K"}
                      className="w-full pl-11 pr-4 py-4 bg-white/50 hover:bg-white focus:bg-white rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 border border-slate-200/60 focus:border-blue-500/50 transition-all shadow-sm placeholder:text-slate-300"
                      value={form.rut || ''} 
                      onChange={(e) => setForm({...form, rut: e.target.value})}
                    />
                  </div>
                </div>
                
                <InputWithIcon icon={CalendarDays} type="date" label="Fecha Nacimiento *" value={form.fecha_nacimiento} onChange={(v:any) => setForm({...form, fecha_nacimiento: v})} required />
              </div>
            </motion.div>

            {/* SECCIÓN 2: CONTACTO */}
            <motion.div variants={itemVariants} className="bg-white/85 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-emerald-400 to-emerald-600"></div>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                  <MapPin size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800 tracking-tight uppercase">Contacto y Ubicación</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Medios de comunicación</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <InputWithIcon icon={Map} label="Dirección" value={form.direccion} onChange={(v:any) => setForm({...form, direccion: v})} placeholder="Ej: Av. Principal 123" />
                <InputWithIcon icon={MapPin} label="Comuna" value={form.comuna} onChange={(v:any) => setForm({...form, comuna: v})} placeholder="Ej: Providencia" />
                <InputWithIcon icon={Building2} label="Ciudad" value={form.ciudad} onChange={(v:any) => setForm({...form, ciudad: v})} placeholder="Ej: Santiago" />
                <InputWithIcon icon={Smartphone} label="WhatsApp / Celular" value={form.telefono} onChange={(v:any) => setForm({...form, telefono: v})} placeholder="+56 9 1234 5678" />
                <InputWithIcon icon={Phone} label="Teléfono Fijo" value={form.telefono_fijo} onChange={(v:any) => setForm({...form, telefono_fijo: v})} placeholder="2 2345 6789" />
                <InputWithIcon icon={Mail} label="Email" type="email" value={form.email} onChange={(v:any) => setForm({...form, email: v})} placeholder="correo@ejemplo.com" />
              </div>
            </motion.div>

            {/* SECCIÓN 3: OTROS Y APODERADO */}
            <motion.div variants={itemVariants} className="bg-white/85 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-amber-400 to-amber-600"></div>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shadow-inner">
                  <Users size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800 tracking-tight uppercase">Datos Complementarios</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Apoderado, Previsión y Sociales</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <InputWithIcon icon={User} label="Nombre Apoderado" value={form.apoderado_nombre} onChange={(v:any) => setForm({...form, apoderado_nombre: v})} placeholder="Nombre completo" />
                <InputWithIcon icon={FileDigit} label="RUT Apoderado" value={form.apoderado_rut} onChange={(v:any) => setForm({...form, apoderado_rut: v})} placeholder="12.345.678-K" />
                <InputWithIcon icon={UserPlus} label="Referencia" value={form.referencia} onChange={(v:any) => setForm({...form, referencia: v})} placeholder="¿Cómo nos conoció?" />
                
                <div className="space-y-1.5 text-left group">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block group-focus-within:text-amber-500 transition-colors">Convenio</label>
                  <div className="relative">
                    <select className="w-full pl-4 pr-10 py-4 bg-white/50 hover:bg-white focus:bg-white rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-amber-500/10 border border-slate-200/60 focus:border-amber-500/50 transition-all shadow-sm cursor-pointer appearance-none"
                      value={form.prevision} onChange={(e) => setForm({...form, prevision: e.target.value})}>
                      {listaConvenios.map(conv => <option key={conv} value={conv}>{conv}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-amber-500">
                      <ChevronDown size={18} />
                    </div>
                  </div>
                </div>

                <InputWithIcon icon={UserCircle2} label="Nombre Social" value={form.nombre_social} onChange={(v:any) => setForm({...form, nombre_social: v})} placeholder="Opcional" />
                <InputWithIcon icon={Briefcase} label="Profesión" value={form.actividad_profesion} onChange={(v:any) => setForm({...form, actividad_profesion: v})} placeholder="Ocupación actual" />
              </div>
              
              <div className="mt-8 space-y-1.5 group">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block group-focus-within:text-amber-500 transition-colors">Observaciones Internas</label>
                <textarea className="w-full p-5 bg-white/50 hover:bg-white focus:bg-white rounded-[2rem] font-medium text-slate-700 outline-none focus:ring-4 focus:ring-amber-500/10 border border-slate-200/60 focus:border-amber-500/50 transition-all shadow-sm placeholder:text-slate-300 resize-none" rows={3} placeholder="Anotaciones médicas, alertas, etc."
                  value={form.observaciones_personales || ''} onChange={(e) => setForm({...form, observaciones_personales: e.target.value})} />
              </div>
            </motion.div>

            {/* BOTÓN GUARDAR */}
            <motion.div variants={itemVariants} className="pt-4 pb-10">
              <button 
                type="submit" 
                disabled={cargando} 
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-6 rounded-[2rem] font-black text-lg shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 transition-all active:scale-[0.98] flex justify-center items-center gap-3 disabled:opacity-50 border border-blue-500"
              >
                {cargando ? <Loader2 className="animate-spin" size={28} /> : <Save size={28} />}
                {cargando ? 'Registrando Paciente...' : 'Finalizar y Crear Ficha Clínica'}
              </button>
            </motion.div>

          </motion.div>
        </form>
      </main>
    </div>
  )
}

function InputWithIcon({ label, value, onChange, type = "text", required = false, placeholder = "", icon: Icon }: any) {
  return (
    <div className="space-y-1.5 text-left group">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block group-focus-within:text-blue-600 transition-colors">
        {label}
      </label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors pointer-events-none">
          <Icon size={18} strokeWidth={2.5} />
        </div>
        <input 
          required={required} 
          type={type} 
          placeholder={placeholder}
          className="w-full pl-11 pr-4 py-4 bg-white/50 hover:bg-white focus:bg-white rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 border border-slate-200/60 focus:border-blue-500/50 transition-all shadow-sm placeholder:text-slate-300"
          value={value || ''} 
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  )
}

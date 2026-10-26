'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { crearCuentaStaff, actualizarCuentaStaff, eliminarCuentaStaff, obtenerResumenSuscripcion } from '../actions'
import Link from 'next/link'
import { ROLES_STAFF, NOMBRE_ROL, type RolStaff } from '@/lib/planes'
// 1. IMPORTAMOS CREATEPORTAL
import { createPortal } from 'react-dom'
import { 
  Plus, Search, Lock, Trash2, Stethoscope, X, Save, 
  Loader2, UserCircle, KeyRound, UserCog, ShieldCheck, AtSign, Fingerprint, Activity,
  Mail, CreditCard, Shield, Building2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

export default function GestionStaffPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [especialidades, setEspecialidades] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [editandoUser, setEditandoUser] = useState<any>(null)
  const [busqueda, setBusqueda] = useState('')
  // Cupos del plan por rol (null = sin plan configurado / sin límites)
  const [cupos, setCupos] = useState<Record<RolStaff, { usados: number, limite: number | null }> | null>(null)

  // 2. ESTADO PARA LOS PORTALS (Asegurar que carga en el cliente)
  const [isMounted, setIsMounted] = useState(false)

  const initialState = { 
    nombre: '', 
    apellido: '', 
    rut: '',
    username: '', 
    password: '', 
    especialidad_id: '', 
    rol: 'ASISTENTE' 
  }
  const [form, setForm] = useState(initialState)

  useEffect(() => { 
    setIsMounted(true) // Indicamos que ya cargó en el navegador
    fetchData() 
  }, [])

  async function fetchData() {
    setCargando(true)
    // Los cupos se cargan aparte para no demorar la lista (contar cuentas activas es más lento)
    obtenerResumenSuscripcion().then(resumen => {
      if (!('error' in resumen) && resumen.planId) setCupos(resumen.cupos)
    })
    try {
      const { data: perfiles } = await supabase.from('perfiles').select('*').order('rol')
      const { data: esps } = await supabase.from('especialidades').select('*').order('nombre')
      const { data: profs } = await supabase.from('profesionales').select('user_id, especialidades(nombre)')
      
      if (perfiles) {
          const staffMapeado = perfiles.map(p => {
              const profData = profs?.find(pr => pr.user_id === p.id);
              const nombreEspecialidad = (profData?.especialidades as any)?.nombre;

              return {
                  ...p,
                  especialidad: nombreEspecialidad || 'Área Administrativa / Apoyo'
              }
          })
          setStaff(staffMapeado)
      }
      if (esps) setEspecialidades(esps)
    } catch (error) {
      console.error("Error al cargar datos:", error)
    } finally {
      setCargando(false)
    }
  }

  const handleGuardar = async () => {
    if (guardando) return;
    const esNuevo = !editandoUser;
    
    if (!form.nombre.trim() || !form.apellido.trim() || !form.rut.trim()) {
        return toast.error("Nombre, Apellido y RUT son obligatorios");
    }

    if (form.rol === 'DENTISTA' && !form.especialidad_id) {
        return toast.error("Debe seleccionar una especialidad para el Dentista");
    }

    if (esNuevo) {
        if (!form.username.trim()) return toast.error("El usuario es obligatorio");
        if (form.password.length < 8) return toast.error("La contraseña debe tener al menos 8 caracteres");
        const usernameRegex = /^[a-z0-9.]+$/;
        if (!usernameRegex.test(form.username)) {
            return toast.error("Usuario: solo minúsculas, números y puntos.");
        }
    }

    setGuardando(true);
    const toastId = toast.loading(esNuevo ? "Generando credenciales..." : "Actualizando...");

    try {
      const payloadForm = {
          ...form,
          especialidad_id: form.rol === 'DENTISTA' ? form.especialidad_id : null
      }

      const res = editandoUser 
        ? await actualizarCuentaStaff(editandoUser.id, editandoUser.id, payloadForm)
        : await crearCuentaStaff(payloadForm);
      
      if (res.error) throw new Error(res.error);

      toast.success(esNuevo ? "Acceso creado" : "Datos actualizados", { id: toastId });
      setModalAbierto(false); 
      fetchData(); 
      resetForm();
    } catch (error: any) { 
      toast.error("Error: " + error.message, { id: toastId });
    } finally { 
      setGuardando(false);
    }
  }

  const abrirEditor = (persona: any) => {
    setEditandoUser(persona)
    const nombres = (persona.nombre_completo || '').split(' ');
    setForm({ 
        ...initialState, 
        nombre: nombres[0] || '', 
        apellido: nombres.slice(1).join(' ') || '', 
        rut: persona.rut || '',
        rol: persona.rol || 'ASISTENTE',
        username: persona.username || '', 
        especialidad_id: '' 
    })
    setModalAbierto(true)
  }

  const resetForm = () => { 
    setEditandoUser(null); 
    setForm(initialState);
  }

  // Texto junto a cada rol del selector: cuántos cupos quedan en el plan
  const etiquetaCupo = (rol: RolStaff) => {
    const c = cupos?.[rol]
    if (!c || c.limite === null) return ''
    if (editandoUser?.rol === rol) return ''
    const libres = c.limite - c.usados
    return libres > 0 ? ` (${libres} disponible${libres === 1 ? '' : 's'})` : ' (sin cupos)'
  }

  // Utilidades para los colores de las tarjetas
  const getRoleColors = (rol: string) => {
    switch (rol) {
      case 'ADMIN': return { bg: 'bg-[#C9A24B]', text: 'text-[#C9A24B]', lightBg: 'bg-[#C9A24B]/10', paleBg: 'bg-[#fcfaf5]', border: 'border-[#C9A24B]/20' };
      case 'DENTISTA': return { bg: 'bg-blue-500', text: 'text-blue-500', lightBg: 'bg-blue-500/10', paleBg: 'bg-blue-50/50', border: 'border-blue-200' };
      case 'ASISTENTE': return { bg: 'bg-purple-500', text: 'text-purple-500', lightBg: 'bg-purple-500/10', paleBg: 'bg-purple-50/50', border: 'border-purple-200' };
      default: return { bg: 'bg-emerald-500', text: 'text-emerald-500', lightBg: 'bg-emerald-500/10', paleBg: 'bg-emerald-50/50', border: 'border-emerald-200' };
    }
  }

  const getRoleLabel = (rol: string) => {
    switch (rol) {
      case 'ADMIN': return 'ADMINISTRADOR(A)';
      case 'DENTISTA': return 'DENTISTA / ESPECIALISTA';
      case 'ASISTENTE': return 'ASISTENTE DENTAL';
      default: return 'RECEPCIONISTA';
    }
  }

  return (
    <main className="min-h-screen bg-[#FBF8F2] p-6 md:p-10 font-sans text-slate-900 relative overflow-hidden z-0">
      
      {/* IMAGEN DE FONDO GLOBAL */}
      <div 
        className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"
      ></div>

      <div className="max-w-7xl mx-auto space-y-8 relative z-10 text-left">
        
        {/* HEADER TIPO TARJETA BLANCA */}
        <header className="bg-white/90 backdrop-blur-md p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 text-left">
          <div className="flex items-center gap-5 text-left w-full md:w-auto">
            <div className="bg-[#0A111F] w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg shrink-0">
              <UserCog size={28} />
            </div>
            <div className="text-left">
              <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight text-left">
                EQUIPO CLÍNICO
              </h1>
              <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1.5 text-left">
                Seguridad y Personal
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto text-left">
            <div className="relative flex-1 md:w-64 text-left">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Filtrar por nombre..." 
                className="pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-full text-xs font-bold w-full outline-none shadow-inner text-slate-900 focus:border-[#C9A24B]/50 transition-colors"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <button 
              onClick={() => { resetForm(); setModalAbierto(true); }} 
              className="bg-[#0A111F] text-white px-6 py-3 rounded-full font-bold text-[11px] uppercase tracking-wider hover:bg-[#1a2538] transition-all shadow-md flex items-center gap-2 shrink-0 text-left"
            >
              <Plus size={16} /> Nuevo Staff
            </button>
          </div>
        </header>

        {cupos && (
          <Link href="/administracion/suscripcion" className="flex flex-wrap gap-3">
            {ROLES_STAFF.map(rol => {
              const { usados, limite } = cupos[rol]
              const lleno = limite !== null && usados >= limite
              return (
                <span key={rol} className={`px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest bg-white ${lleno ? 'border-red-200 text-red-500' : 'border-slate-200 text-slate-500'}`}>
                  {NOMBRE_ROL[rol]}: {usados} / {limite ?? '∞'}
                </span>
              )
            })}
          </Link>
        )}

        {cargando ? (
           <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#C9A24B]" size={40}/></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {staff
              .filter(p => (p.nombre_completo || '').toLowerCase().includes(busqueda.toLowerCase()))
              .map(persona => {
                const colors = getRoleColors(persona.rol);
                const roleLabel = getRoleLabel(persona.rol);
                const esAdmin = persona.rol === 'ADMIN';

                return (
                  <motion.div 
                      key={persona.id} 
                      whileHover={{ y: -4 }} 
                      onClick={() => abrirEditor(persona)} 
                      className="bg-white rounded-[2rem] shadow-sm hover:shadow-md cursor-pointer group relative overflow-hidden text-left flex flex-col justify-between border border-slate-100 transition-shadow"
                  >
                      {/* BADGE ROL TOP RIGHT */}
                      <div className={`absolute top-5 right-5 px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full text-white shadow-sm ${colors.bg}`}>
                          {persona.rol}
                      </div>

                      <div className="p-8 pb-6">
                        {/* ICONO ROL TOP LEFT */}
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-5 ${colors.lightBg} ${colors.text}`}>
                            {persona.rol === 'DENTISTA' ? <Stethoscope size={24}/> : 
                             persona.rol === 'ASISTENTE' ? <Activity size={24}/> : 
                             persona.rol === 'ADMIN' ? <ShieldCheck size={24}/> :
                             <UserCircle size={24}/>}
                        </div>
                        
                        <h3 className="text-lg font-black text-[#0A111F] uppercase leading-tight text-left mb-4 pr-16">
                          {persona.nombre_completo}
                        </h3>
                        
                        <div className="space-y-2.5 text-left">
                          <div className={`flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-wider ${colors.text}`}>
                            <Shield size={12} strokeWidth={2.5}/>
                            {roleLabel}
                          </div>

                          <div className="flex items-center gap-2.5 text-slate-500 text-xs font-medium">
                            <Mail size={12} className="text-slate-400 shrink-0"/>
                            <span className="truncate">{persona.username || 'sin_usuario'}@clinicadignidad.cl</span>
                          </div>
                          
                          <div className="flex items-center gap-2.5 text-slate-500 text-xs font-medium">
                            <CreditCard size={12} className="text-slate-400 shrink-0"/>
                            <span>RUT: {persona.rut || 'No reg.'}</span>
                          </div>
                        </div>
                      </div>

                      {/* BOTTOM BAR ÁREA */}
                      <div className={`p-4 border-t ${colors.border} ${colors.paleBg} flex items-center gap-2`}>
                        <Building2 size={14} className={colors.text} />
                        <p className={`text-[9px] font-black uppercase tracking-widest ${colors.text}`}>
                            {esAdmin ? 'Área Administrativa / Apoyo' : 'Área Clínica / Asistencial'}
                        </p>
                      </div>
                  </motion.div>
                )
              })}
          </div>
        )}
      </div>

      {/* 3. MODAL ENVOLVIDO EN CREATEPORTAL */}
      {isMounted && typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
          {modalAbierto && (
            <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[999999] flex justify-end items-start p-4 text-left">
              <div className="absolute inset-0" onClick={() => !guardando && setModalAbierto(false)} />

              <motion.div 
                initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}
                className="bg-white w-full max-w-lg mt-24 rounded-[2.5rem] shadow-2xl flex flex-col relative z-10 overflow-hidden h-[calc(100vh-140px)] text-left"
              >
                <div className="p-8 flex justify-between items-center border-b border-slate-100 bg-[#FBF8F2] text-left">
                  <h2 className="text-xl font-black text-[#0A111F] uppercase italic text-left tracking-tight">
                      {editandoUser ? 'Editar Perfil' : 'Nuevo Staff'}
                  </h2>
                  <button onClick={() => setModalAbierto(false)} className="p-3 bg-white shadow-sm border border-slate-200 rounded-full text-slate-400 hover:text-red-500 transition-all text-left">
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 p-8 space-y-6 overflow-y-auto text-left custom-scrollbar">
                  <div className="space-y-3 text-left">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2 text-left">
                      <ShieldCheck size={12} className="text-[#C9A24B]"/> Tipo de Cuenta
                    </label>
                    <select 
                      className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold border border-slate-200 shadow-sm outline-none text-slate-900 cursor-pointer text-left focus:border-[#C9A24B] transition-colors" 
                      value={form.rol} 
                      onChange={(e) => setForm({...form, rol: e.target.value})}
                    >
                      <option value="ASISTENTE">Asistente Dental{etiquetaCupo('ASISTENTE')}</option>
                      <option value="RECEPCIONISTA">Recepcionista{etiquetaCupo('RECEPCIONISTA')}</option>
                      <option value="DENTISTA">Dentista / Especialista{etiquetaCupo('DENTISTA')}</option>
                      <option value="ADMIN">Administrador General{etiquetaCupo('ADMIN')}</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-left">
                    <Input label="Nombre" value={form.nombre} onChange={(v:any) => setForm({...form, nombre: v})} icon={<UserCircle size={14}/>} />
                    <Input label="Apellido" value={form.apellido} onChange={(v:any) => setForm({...form, apellido: v})} icon={<UserCircle size={14}/>} />
                  </div>

                  <Input 
                    label="RUT del Profesional" 
                    placeholder="12.345.678-9"
                    value={form.rut} 
                    onChange={(v:any) => setForm({...form, rut: v})} 
                    icon={<Fingerprint size={14}/>} 
                  />

                  {!editandoUser && (
                    <div className="space-y-4 bg-[#FBF8F2] p-6 rounded-3xl border border-[#C9A24B]/20 shadow-sm text-left">
                      <p className="text-[10px] font-black text-[#8A6D2F] uppercase tracking-widest flex items-center gap-2 mb-1 text-left"><KeyRound size={12}/> Credenciales de Acceso</p>
                      <Input label="Usuario (Para ingresar)" value={form.username} icon={<AtSign size={14}/>} onChange={(v:any) => setForm({...form, username: v.toLowerCase().replace(/\s+/g, '')})} />
                      <Input label="Contraseña (mínimo 8 caracteres)" value={form.password} type="password" icon={<Lock size={14}/>} onChange={(v:any) => setForm({...form, password: v})} />
                    </div>
                  )}

                  {form.rol === 'DENTISTA' && (
                    <div className="space-y-3 text-left">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2 text-left">
                          <Stethoscope size={12} className="text-[#C9A24B]"/> Especialidad Clínica
                      </label>
                      <select 
                        className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold border border-slate-200 shadow-sm outline-none text-slate-900 cursor-pointer text-left focus:border-[#C9A24B] transition-colors" 
                        value={form.especialidad_id} 
                        onChange={(e) => setForm({...form, especialidad_id: e.target.value})}
                      >
                        <option value="">Seleccionar especialidad...</option>
                        {especialidades.map(esp => <option key={esp.id} value={esp.id}>{esp.nombre}</option>)}
                      </select>
                    </div>
                  )}

                  {editandoUser && (
                    <div className="pt-6 border-t border-slate-100 text-left">
                      <button onClick={() => { setModalAbierto(false); toast.promise(eliminarCuentaStaff(editandoUser.id).then((res: any) => { if (res?.error) throw new Error(res.error); return res; }), { loading: 'Eliminando...', success: (res: any) => { fetchData(); return res?.desactivado ? 'Tiene historial: se le quitó el acceso y se desactivó (su historial se conserva)' : 'Staff eliminado'; }, error: (e: any) => `No se pudo eliminar: ${e?.message || 'error'}` }); }} className="w-full p-4 bg-red-50 text-red-500 font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white rounded-2xl transition-all flex items-center justify-center gap-2 text-left border border-red-100">
                        <Trash2 size={16}/> Eliminar accesos permanentemente
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-8 border-t border-slate-100 bg-white text-left shrink-0">
                  <button onClick={handleGuardar} disabled={guardando} className="w-full bg-[#0A111F] text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 disabled:bg-slate-300 text-left">
                    {guardando ? <Loader2 className="animate-spin" /> : <Save size={18}/>}
                    {editandoUser ? 'Guardar Cambios' : 'Generar Credenciales'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      ) : null}
    </main>
  )
}

function Input({ label, value, onChange, icon, type = "text", placeholder = "" }: any) {
  return (
    <div className="space-y-2 text-left">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2 text-left">
        <span className="text-[#C9A24B]">{icon}</span> {label}
      </label>
      <input 
        type={type} 
        value={value || ''} 
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} 
        className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-200 shadow-sm focus:border-[#C9A24B] text-slate-900 text-left transition-colors placeholder:text-slate-400" 
      />
    </div>
  )
}

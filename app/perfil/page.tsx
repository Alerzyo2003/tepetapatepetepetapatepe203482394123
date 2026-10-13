'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import SignatureCanvas from 'react-signature-canvas'
import {
  User, Save, Loader2, Signature, Lock, KeyRound, Eye, EyeOff, Trash2,
  ShieldCheck, Users, RefreshCw, X, UserPlus, Ban, ShieldQuestion, ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'
import { useRole } from '@/app/hooks/useRole'

export default function PerfilPage() {
  const { user: currentUser, rol: hookRole } = useRole()
  const [datos, setDatos] = useState({ nombre_completo: '' })
  const [rolLocal, setRolLocal] = useState<string | null>(null)
  const [firmaGuardada, setFirmaGuardada] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  // Estados para Gestión de Usuarios (Solo Admin)
  const [listaUsuarios, setListaUsuarios] = useState<any[]>([])
  const [mostrarListaStaff, setMostrarListaStaff] = useState(false)
  const [usuarioAEditar, setUsuarioAEditar] = useState<{id: string, nombre: string} | null>(null)
  const [passAdminReset, setPassAdminReset] = useState('')

  // Estados para contraseña propia
  const [passwords, setPasswords] = useState({ new1: '', new2: '' })
  const [showPass, setShowPass] = useState(false)
  const sigCanvas = useRef<any>(null)

  useEffect(() => {
    const checkSession = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        fetchDatosYRol(user.id)
      } else {
        setCargando(false)
      }
    }
    checkSession()
  }, [])

  async function fetchDatosYRol(userId: string) {
    try {
      setCargando(true)
      const { data: perf } = await supabase
        .from('perfiles')
        .select('rol, nombre_completo')
        .eq('id', userId)
        .maybeSingle()

      if (perf) {
        const roleFromDB = perf.rol?.toUpperCase() || 'USUARIO'
        setRolLocal(roleFromDB)
        setDatos({ nombre_completo: perf.nombre_completo || '' })

        if (roleFromDB === 'DENTISTA') {
          const { data: prof } = await supabase.from('profesionales').select('firma_base64').eq('user_id', userId).maybeSingle()
          if (prof) setFirmaGuardada(prof.firma_base64 || null)
        }

        if (roleFromDB === 'ADMIN') {
          fetchTodosLosUsuarios()
        }
      }
    } catch (err: any) {
      console.error("Error cargando perfil:", err.message)
    } finally {
      setCargando(false)
    }
  }

  async function fetchTodosLosUsuarios() {
    const { data } = await supabase.from('perfiles').select('id, nombre_completo, rol, rut').order('nombre_completo')
    if (data) setListaUsuarios(data)
  }

  const finalRole = rolLocal || hookRole?.toUpperCase()
  const esAdmin = finalRole === 'ADMIN'
  const puedeFirmar = finalRole === 'DENTISTA'

  const totalActivos = listaUsuarios.filter(u => u.rol && u.rol.toUpperCase() !== 'PENDIENTE' && u.rol.toUpperCase() !== 'BLOQUEADO').length
  const rolesUnicos = new Set(listaUsuarios.map(u => u.rol?.toUpperCase()).filter(Boolean)).size
  const pendientes = listaUsuarios.filter(u => u.rol?.toUpperCase() === 'PENDIENTE').length
  const bloqueados = listaUsuarios.filter(u => u.rol?.toUpperCase() === 'BLOQUEADO').length

  const handleAdminResetPassword = async () => {
    if (!usuarioAEditar || !passAdminReset) return toast.error("Ingresa una contraseña")

    setGuardando(true)
    const toastId = toast.loading(`Actualizando acceso para ${usuarioAEditar.nombre}...`)

    try {
      const { error } = await supabase.functions.invoke('admin-change-password', {
        body: { userId: usuarioAEditar.id, newPassword: passAdminReset }
      })
      if (error) throw error

      toast.success("Contraseña actualizada exitosamente", { id: toastId })
      setUsuarioAEditar(null)
      setPassAdminReset('')
    } catch (err: any) {
      console.error(err)
      toast.error("Error de seguridad: No se pudo actualizar", { id: toastId })
    } finally {
      setGuardando(false)
    }
  }

  const handleUpdateOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwords.new1 !== passwords.new2) return toast.error("Las contraseñas no coinciden")
    setGuardando(true)
    const { error } = await supabase.auth.updateUser({ password: passwords.new1 })
    if (!error) {
      toast.success("Tu contraseña ha sido actualizada")
      setPasswords({ new1: '', new2: '' })
    } else {
      toast.error(error.message)
    }
    setGuardando(false)
  }

  const guardarFirma = async () => {
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) return toast.error("Dibuja tu firma")
    setGuardando(true)
    const base64 = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png')
    const { error } = await supabase.from('profesionales').update({ firma_base64: base64 }).eq('user_id', currentUser?.id)
    if (!error) {
      setFirmaGuardada(base64)
      toast.success("Firma sincronizada")
    }
    setGuardando(false)
  }

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
      <Loader2 className="animate-spin text-blue-600" size={45} />
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Cargando perfil de usuario...</p>
    </div>
  )

  const iniciales = datos.nombre_completo
    ? datos.nombre_completo.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()
    : 'US'

  return (
    <main className="min-h-screen p-6 md:p-10 pb-24 text-left font-sans" style={{ backgroundImage: "url('/fondo-pacientes.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div className="max-w-6xl mx-auto space-y-8">

        {/* HERO */}
        <section className="bg-white/90 backdrop-blur-xl rounded-[2.5rem] shadow-xl border border-white/60 p-8 md:p-10 flex flex-col md:flex-row items-center md:items-stretch gap-8 relative overflow-hidden">
          <div className="flex items-center gap-6 z-10">
            <div className="w-24 h-24 rounded-full bg-slate-900 border-4 border-blue-100 flex items-center justify-center text-white shrink-0 shadow-xl">
              <span className="text-2xl font-black tracking-widest">{iniciales}</span>
            </div>
            <div className="text-left">
              <h1 className="text-2xl md:text-3xl font-black text-slate-800 uppercase italic tracking-tight leading-none">{datos.nombre_completo || 'Usuario'}</h1>
              <div className="mt-3 inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full border border-blue-200 shadow-sm">
                <ShieldCheck size={14} strokeWidth={2.5} /> {finalRole}
              </div>
            </div>
          </div>

          <div className="hidden md:flex flex-1 relative items-center justify-end pr-6">
            <div className="absolute right-0 w-64 h-64 rounded-full border border-blue-200/50"></div>
            <ShieldCheck size={80} className="text-slate-300 relative z-10" strokeWidth={1.5} />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* MI SEGURIDAD */}
          <section className="bg-white/90 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl border border-white/60 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shrink-0 shadow-sm"><Lock size={20} strokeWidth={2.5} /></div>
              <div>
                <h2 className="text-base font-black text-slate-800 uppercase tracking-tight leading-none">Mi Seguridad</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gestiona la seguridad de tu cuenta</p>
              </div>
            </div>

            <form onSubmit={handleUpdateOwnPassword} className="space-y-4">
              <div className="p-4 bg-slate-50/80 hover:bg-white focus-within:bg-white border border-slate-200/60 rounded-2xl flex items-center gap-3 transition-all shadow-sm">
                <Lock size={16} className="text-slate-400 shrink-0" strokeWidth={2.5} />
                <input
                  type={showPass ? "text" : "password"}
                  required
                  value={passwords.new1}
                  onChange={(e) => setPasswords({...passwords, new1: e.target.value})}
                  className="w-full bg-transparent border-none font-bold text-xs text-slate-700 outline-none placeholder:text-slate-300"
                  placeholder="Nueva Contraseña"
                />
              </div>
              <div className="p-4 bg-slate-50/80 hover:bg-white focus-within:bg-white border border-slate-200/60 rounded-2xl flex items-center gap-3 transition-all shadow-sm">
                <KeyRound size={16} className="text-slate-400 shrink-0" strokeWidth={2.5} />
                <input
                  type={showPass ? "text" : "password"}
                  required
                  value={passwords.new2}
                  onChange={(e) => setPasswords({...passwords, new2: e.target.value})}
                  className="w-full bg-transparent border-none font-bold text-xs text-slate-700 outline-none placeholder:text-slate-300"
                  placeholder="Repetir Nueva Contraseña"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="text-slate-400 hover:text-blue-600 transition-colors shrink-0">
                  {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              <button type="submit" disabled={guardando} className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60 border border-blue-500">
                {guardando ? <Loader2 className="animate-spin" size={16}/> : <KeyRound size={16} strokeWidth={2.5}/>} Cambiar mi clave
              </button>
            </form>
          </section>

          {/* CONSEJOS DE SEGURIDAD */}
          <section className="bg-white/90 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl border border-white/60 flex items-center gap-8 relative overflow-hidden">
            <div className="flex-1 space-y-5 z-10">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shrink-0 shadow-sm"><ShieldCheck size={20} strokeWidth={2.5} /></div>
                <h2 className="text-base font-black text-slate-800 uppercase tracking-tight leading-none">Consejos de seguridad</h2>
              </div>
              <ul className="space-y-3.5">
                {[
                  'Usa una contraseña segura que combine letras, números y símbolos.',
                  'No compartas tu contraseña con otras personas.',
                  'Cierra sesión cuando termines de usar el sistema.'
                ].map((tip, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      <ShieldCheck size={12} strokeWidth={3} />
                    </div>
                    <p className="text-xs font-bold text-slate-600 leading-relaxed">{tip}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="hidden md:flex shrink-0 z-10">
              <div className="w-28 h-28 rounded-[2rem] bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-xl shadow-blue-600/20">
                <Lock size={40} className="text-white" strokeWidth={2} />
              </div>
            </div>
          </section>

          {/* FIRMA DIGITAL (DENTISTAS) */}
          {puedeFirmar && (
            <section className="bg-white/90 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl border border-white/60 space-y-6 lg:col-span-2">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl border border-purple-100 shrink-0 shadow-sm"><Signature size={20} strokeWidth={2.5} /></div>
                <div>
                  <h2 className="text-base font-black text-slate-800 uppercase tracking-tight leading-none">Firma Médica</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Se usa en tus documentos clínicos</p>
                </div>
              </div>

              {firmaGuardada ? (
                <div className="space-y-5 text-center">
                  <div className="bg-slate-50/80 border-2 border-dashed border-slate-200 rounded-3xl p-8 flex items-center justify-center shadow-inner">
                    <img src={firmaGuardada} alt="Firma" className="max-h-32 object-contain mix-blend-multiply" />
                  </div>
                  <button onClick={() => setFirmaGuardada(null)} className="text-red-500 text-[10px] font-black uppercase tracking-widest hover:underline flex items-center justify-center gap-2 mx-auto">
                    <Trash2 size={14} strokeWidth={2.5} /> Reemplazar firma
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dibuja tu firma abajo:</p>
                    <button onClick={() => sigCanvas.current?.clear()} className="text-[10px] font-black text-blue-600 uppercase hover:underline">Limpiar</button>
                  </div>
                  <div className="bg-slate-50/80 border-2 border-dashed border-slate-200 rounded-3xl h-56 overflow-hidden shadow-inner cursor-crosshair">
                    <SignatureCanvas ref={sigCanvas} penColor='black' canvasProps={{ className: 'w-full h-full' }} />
                  </div>
                  <button onClick={guardarFirma} disabled={guardando} className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60 border border-purple-500">
                    {guardando ? <Loader2 className="animate-spin" size={16}/> : <Save size={16} strokeWidth={2.5}/>} Guardar firma digital
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        {/* GESTIÓN DE STAFF (SOLO ADMIN) */}
        {esAdmin && (
          <section className="bg-white/90 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] shadow-xl border border-white/60 space-y-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shrink-0 shadow-sm"><Users size={20} strokeWidth={2.5} /></div>
                <div>
                  <h2 className="text-base font-black text-slate-800 uppercase tracking-tight leading-none">Gestión de Staff</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Administra los usuarios y permisos del equipo</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={fetchTodosLosUsuarios} className="p-3 bg-white border border-slate-200/80 rounded-xl text-slate-400 hover:text-blue-600 transition-all shadow-sm" title="Refrescar">
                  <RefreshCw size={16} />
                </button>
                <button
                  onClick={() => setMostrarListaStaff(!mostrarListaStaff)}
                  className="px-5 py-3 bg-white border border-slate-200/80 rounded-xl font-black text-[10px] uppercase tracking-widest text-blue-600 hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
                >
                  <Users size={14} strokeWidth={2.5} /> Ver Equipo <ChevronRight size={14} className={`transition-transform ${mostrarListaStaff ? 'rotate-90' : ''}`} />
                </button>
              </div>
            </div>

            {/* STAT CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-xl shrink-0 shadow-sm"><Users size={20} strokeWidth={2.5} /></div>
                <div>
                  <p className="text-2xl font-black text-slate-800 leading-none">{totalActivos}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Usuarios Activos</p>
                </div>
              </div>
              <div className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl shrink-0 shadow-sm"><ShieldCheck size={20} strokeWidth={2.5} /></div>
                <div>
                  <p className="text-2xl font-black text-slate-800 leading-none">{rolesUnicos}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Roles Asignados</p>
                </div>
              </div>
              <div className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-purple-100 text-purple-600 rounded-xl shrink-0 shadow-sm"><UserPlus size={20} strokeWidth={2.5} /></div>
                <div>
                  <p className="text-2xl font-black text-slate-800 leading-none">{pendientes}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Pendientes</p>
                </div>
              </div>
              <div className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-xl shrink-0 shadow-sm"><Ban size={20} strokeWidth={2.5} /></div>
                <div>
                  <p className="text-2xl font-black text-slate-800 leading-none">{bloqueados}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Bloqueados</p>
                </div>
              </div>
            </div>

            {/* LISTA DE STAFF */}
            {mostrarListaStaff && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {listaUsuarios.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-10 text-slate-300 gap-2">
                    <ShieldQuestion size={32} />
                    <p className="text-[10px] font-black uppercase tracking-widest">Sin usuarios registrados</p>
                  </div>
                ) : listaUsuarios.map(u => (
                  <div key={u.id} className="p-5 bg-white rounded-2xl border border-slate-200/80 flex flex-col justify-between gap-4 shadow-sm">
                    <div className="text-left">
                      <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest">{u.rol}</p>
                      <h3 className="font-black text-sm text-slate-800 uppercase truncate mt-0.5">{u.nombre_completo}</h3>
                      <p className="text-[10px] font-bold text-slate-400 mt-1">{u.rut || 'S/R'}</p>
                    </div>
                    <button
                      onClick={() => setUsuarioAEditar({id: u.id, nombre: u.nombre_completo})}
                      className="w-full py-3 bg-slate-50 border border-slate-200/80 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-900 hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <KeyRound size={12} strokeWidth={2.5} /> Cambiar Clave
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* MODAL PARA RESETEO DE CLAVE */}
        {usuarioAEditar && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[999] flex items-center justify-center p-4">
            <div className="bg-white/95 backdrop-blur-2xl p-8 md:p-10 rounded-[3rem] shadow-2xl w-full max-w-md space-y-6 relative border border-white/80">
              <button onClick={() => setUsuarioAEditar(null)} className="absolute right-6 top-6 p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-colors">
                <X size={18}/>
              </button>
              <div className="text-center">
                <div className="w-14 h-14 mx-auto bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center border border-blue-100 mb-4 shadow-sm">
                  <KeyRound size={22} strokeWidth={2.5} />
                </div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight italic">Nueva Contraseña</h3>
                <p className="text-[10px] font-black text-blue-600 mt-1 uppercase tracking-widest">{usuarioAEditar.nombre}</p>
              </div>
              <div className="space-y-4">
                <input
                  type="text"
                  autoFocus
                  value={passAdminReset}
                  onChange={(e) => setPassAdminReset(e.target.value)}
                  className="w-full p-4 bg-slate-50/80 border border-slate-200/60 rounded-2xl font-bold text-slate-800 text-center text-sm outline-none focus:border-blue-500 shadow-sm transition-all"
                  placeholder="Escribe la clave aquí"
                />
                <div className="flex gap-3">
                  <button onClick={() => setUsuarioAEditar(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all shadow-sm">
                    Cancelar
                  </button>
                  <button onClick={handleAdminResetPassword} disabled={guardando} className="flex-[2] py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60 border border-blue-500">
                    {guardando ? <Loader2 className="animate-spin" size={14}/> : null} Confirmar Cambio
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

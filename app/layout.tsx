'use client'
import { useEffect, useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import {
  Search, Calendar, Users, Briefcase, BarChart3, LogOut,
  LayoutGrid, Stethoscope, Package, Beaker, Calculator,
  DoorOpen, BadgeDollarSign, Library, FileSignature, Ban,
  FileText, TrendingUp, FileSpreadsheet, ChevronRight,
  Loader2, User, UserCheck, Building2, Menu, X, ChevronDown, Circle
} from 'lucide-react'
import Link from 'next/link'
import './globals.css'
import ChatGlobal from '@/components/ChatEnVivo'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  
  const isAuthPage = pathname === '/login' || pathname === '/register'
  
  const [session, setSession] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [mounted, setMounted] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [buscando, setBuscando] = useState(false)
  const [mostrarResultados, setMostrarResultados] = useState(false)
  
  // Mobile sidebar toggle
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  // Accordion states
  const [showAdminMenu, setShowAdminMenu] = useState(false)
  const [showReportMenu, setShowReportMenu] = useState(false)
  const [showMiMenu, setShowMiMenu] = useState(false)

  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  // Auto-abrir acordeones si estás en esa ruta
  useEffect(() => {
    if (pathname.startsWith('/administracion')) setShowAdminMenu(true);
    if (pathname.startsWith('/reportes')) setShowReportMenu(true);
    if (pathname.startsWith('/mi-menu')) setShowMiMenu(true);
  }, [pathname])

  // Notificaciones Supabase
  useEffect(() => {
    if (!mounted || !session?.user?.id || !perfil) return;
    const canalNotificaciones = supabase
      .channel(`dentista-${session.user.id}`)
      .on('broadcast', { event: 'PACIENTE_LLEGO' }, (payload: any) => {
        toast.info("¡PACIENTE EN ESPERA!", {
          description: `El paciente ${payload.payload.nombre} acaba de llegar.`,
          duration: 10000,
          icon: <UserCheck className="text-[#C9A24B]" />,
        });
        new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(canalNotificaciones); }
  }, [session, perfil, mounted]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setMostrarResultados(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (busqueda.length > 2) ejecutarBusqueda(busqueda)
      else { setResultados([]); setMostrarResultados(false); }
    }, 300)
    return () => clearTimeout(delayDebounceFn)
  }, [busqueda])

  useEffect(() => {
    setMostrarResultados(false);
    setBusqueda('');
  }, [pathname]);
  
  async function ejecutarBusqueda(term: string) {
    setBuscando(true)
    setMostrarResultados(true)
    const palabras = term.trim().split(/\s+/).filter(p => p.length > 0)
    // OPTIMIZACIÓN: Esta query ya estaba bastante bien, traía solo lo necesario y con límite.
    let query = supabase.from('pacientes').select('id, nombre, apellido, rut')
    palabras.forEach((palabra) => {
      query = query.or(`nombre.ilike.%${palabra}%,apellido.ilike.%${palabra}%,rut.ilike.%${palabra}%`)
    })
    const { data, error } = await query.limit(6)
    if (error) {
      toast.error('Ocurrió un error al buscar pacientes.')
      setResultados([])
    } else {
      setResultados(data || [])
    }
    setBuscando(false)
  }

  useEffect(() => {
    // Función auxiliar para traer el perfil con el ID que ya tenemos localmente
    const fetchPerfil = async (userId: string) => {
      const { data } = await supabase.from('perfiles')
        .select('id, nombre_completo, rol')
        .eq('id', userId)
        .maybeSingle()
        
      setPerfil(data)
    }

    // 1. Carga inicial usando getSession() (Sin peticiones de red innecesarias)
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession)
      if (currentSession?.user) {
        fetchPerfil(currentSession.user.id)
      }
    })

    // 2. Listener para detectar cuando el usuario se loguea o cierra sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Ignoramos INITIAL_SESSION para no duplicar la llamada que ya hicimos arriba
      if (event !== 'INITIAL_SESSION') {
        setSession(newSession)
        if (newSession?.user) {
          fetchPerfil(newSession.user.id)
        } else {
          setPerfil(null)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const modulosBasicos = [
    { href: '/agenda', label: 'Agenda', icon: <Calendar size={20}/>, roles: ['ADMIN', 'RECEPCIONISTA', 'DENTISTA', 'ASISTENTE'] },
    { href: '/pacientes', label: 'Pacientes', icon: <Users size={20}/>, roles: ['ADMIN', 'RECEPCIONISTA', 'DENTISTA', 'ASISTENTE'] },
    { href: '/cajas', label: 'Cajas', icon: <Briefcase size={20}/>, roles: ['ADMIN', 'RECEPCIONISTA'] },
    { href: '/perfil', label: 'Perfil', icon: <User size={20}/>, roles: ['ADMIN', 'RECEPCIONISTA', 'DENTISTA', 'ASISTENTE'] },
  ]

  if (!mounted) return <html lang="es"><body></body></html>

  return (
    <html lang="es">
      <head>
        <title>AureoDent</title>
      </head>
      <body className="bg-[#FBF8F2] h-screen w-screen font-sans antialiased text-slate-800 overflow-hidden flex">
        <Toaster richColors position="top-right" />
        
        {!isAuthPage && session && (
          <>
            {/* --- SIDEBAR OSCURO --- */}
            <aside 
              className={`fixed md:relative inset-y-0 left-0 z-50 md:z-0 w-[280px] min-w-[280px] bg-[#0A111F] flex flex-col justify-between shrink-0 h-full transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none border-r border-white/5 ${
                mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
              }`}
            >
              <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
                
                {/* Logo Area */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="px-6 py-8 flex items-center justify-between md:justify-start gap-4 text-white shrink-0">
                  <Link href="/" className="flex items-center gap-4 group transition-all" onClick={() => setMobileMenuOpen(false)}>
                    <div className="relative shrink-0 w-11 h-11 rounded-2xl overflow-hidden border border-white/10 shadow-lg group-hover:scale-105 transition-transform duration-300">
                      <img 
                        src="https://yqdpmaopnvrgdqbfaiok.supabase.co/storage/v1/object/public/documentos_imagenes/440749454_122171956712064634_7168698893214813270_n.jpg" 
                        alt="Logo" 
                        referrerPolicy="no-referrer" 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-[#8A96A8] uppercase tracking-[0.2em] leading-none mb-1">Centro Médico</span>
                      <span className="text-2xl font-black tracking-tight uppercase leading-none text-white group-hover:text-[#C9A24B] transition-colors">Dignidad</span>
                    </div>
                  </Link>
                  <button className="md:hidden text-white/60 hover:text-white transition-colors p-1" onClick={() => setMobileMenuOpen(false)}><X size={24}/></button>
                </motion.div>

                {/* Enlaces y Acordeones */}
                <nav className="flex-1 px-4 space-y-1.5 pb-10">
                  
                  {/* Enlaces Principales */}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                    {modulosBasicos.filter(m => m.roles.includes(perfil?.rol)).map((m) => {
                      const isActive = pathname.startsWith(m.href);
                      return (
                        <Link 
                            key={m.href} 
                            href={m.href} 
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all relative group ${
                              isActive 
                                ? 'bg-white/10 text-white shadow-inner' 
                                : 'text-[#8A96A8] hover:text-white hover:bg-white/5'
                            }`}
                        >
                          <div className={`transition-transform duration-300 ${isActive ? 'text-[#C9A24B]' : 'group-hover:text-[#C9A24B] group-hover:scale-110'}`}>
                              {m.icon}
                          </div>
                          <span className={`text-[14px] tracking-wide ${isActive ? 'font-bold' : 'font-semibold'}`}>{m.label}</span>
                          
                          {isActive && <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-[#C9A24B] shadow-[0_0_8px_#C9A24B]" />}
                        </Link>
                      )
                    })}
                  </motion.div>

                  <div className="h-4 border-b border-white/5 mx-2 my-2"></div>

                 {/* Acordeón: Mi Menú (Dentistas, Recepcionistas y Admin) */}
                  {['DENTISTA', 'RECEPCIONISTA', 'ADMIN'].includes(perfil?.rol) && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex flex-col">
                      <button onClick={() => setShowMiMenu(!showMiMenu)} className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${showMiMenu ? 'text-white bg-white/5' : 'text-[#8A96A8] hover:text-white hover:bg-white/5'}`}>
                        <div className="flex items-center gap-3.5">
                          <span className={`transition-transform duration-300 ${showMiMenu ? 'text-[#C9A24B]' : 'group-hover:text-[#C9A24B] group-hover:scale-110'}`}><Stethoscope size={20}/></span>
                          <span className={`text-[14px] tracking-wide ${showMiMenu ? 'font-bold' : 'font-semibold'}`}>Mi menú</span>
                        </div>
                        <ChevronDown size={16} className={`transition-transform duration-300 ${showMiMenu ? 'rotate-180 text-[#C9A24B]' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {showMiMenu && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="flex flex-col border-l border-white/10 ml-[26px] mt-1 mb-2 space-y-1">
                              
                              {/* Solo Dentistas y Admins ven estas opciones */}
                              {['DENTISTA', 'ADMIN'].includes(perfil?.rol) && (
                                <>
                                  <SidebarSubLink href="/mi-menu/plantillas" label="Plantillas" onClick={() => setMobileMenuOpen(false)} />
                                  <SidebarSubLink href="/mi-menu/liquidacion" label="Liquidaciones" onClick={() => setMobileMenuOpen(false)} />
                                </>
                              )}

                              {/* Recepcionistas, Dentistas y Admins ven los Aranceles */}
                              {['RECEPCIONISTA', 'DENTISTA', 'ADMIN'].includes(perfil?.rol) && (
                                <SidebarSubLink href="/mi-menu/aranceles" label="Ver Aranceles" onClick={() => setMobileMenuOpen(false)} />
                              )}
                              
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {/* Acordeón: Reportes */}
                  {perfil?.rol === 'ADMIN' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="flex flex-col">
                      <button onClick={() => setShowReportMenu(!showReportMenu)} className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${showReportMenu ? 'text-white bg-white/5' : 'text-[#8A96A8] hover:text-white hover:bg-white/5'}`}>
                        <div className="flex items-center gap-3.5">
                          <span className={`transition-transform duration-300 ${showReportMenu ? 'text-[#C9A24B]' : 'group-hover:text-[#C9A24B] group-hover:scale-110'}`}><BarChart3 size={20}/></span>
                          <span className={`text-[14px] tracking-wide ${showReportMenu ? 'font-bold' : 'font-semibold'}`}>Reportes</span>
                        </div>
                        <ChevronDown size={16} className={`transition-transform duration-300 ${showReportMenu ? 'rotate-180 text-[#C9A24B]' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {showReportMenu && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="flex flex-col border-l border-white/10 ml-[26px] mt-1 mb-2 space-y-1">
                              <SidebarSubLink href="/reportes/desempeno" label="Desempeño" onClick={() => setMobileMenuOpen(false)} />
                              <SidebarSubLink href="/reportes/excel" label="Exportar Excel" onClick={() => setMobileMenuOpen(false)} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {/* Acordeón: Administración */}
                  {perfil?.rol === 'ADMIN' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="flex flex-col">
                      <button onClick={() => setShowAdminMenu(!showAdminMenu)} className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${showAdminMenu ? 'text-white bg-white/5' : 'text-[#8A96A8] hover:text-white hover:bg-white/5'}`}>
                        <div className="flex items-center gap-3.5">
                          <span className={`transition-transform duration-300 ${showAdminMenu ? 'text-[#C9A24B]' : 'group-hover:text-[#C9A24B] group-hover:scale-110'}`}><LayoutGrid size={20}/></span>
                          <span className={`text-[14px] tracking-wide ${showAdminMenu ? 'font-bold' : 'font-semibold'}`}>Administración</span>
                        </div>
                        <ChevronDown size={16} className={`transition-transform duration-300 ${showAdminMenu ? 'rotate-180 text-[#C9A24B]' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {showAdminMenu && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="flex flex-col border-l border-white/10 ml-[26px] mt-2 mb-2 pb-2">
                              
                              <GroupTitle title="Clínica" />
                              <SidebarSubLink href="/administracion/profesionales" label="Personal" onClick={() => setMobileMenuOpen(false)} />
                              <SidebarSubLink href="/administracion/especialidades" label="Especialidades" onClick={() => setMobileMenuOpen(false)} />
                              <SidebarSubLink href="/administracion/convenios" label="Convenios" onClick={() => setMobileMenuOpen(false)} />
                              <SidebarSubLink href="/administracion/box" label="Gestión de Box" onClick={() => setMobileMenuOpen(false)} />

                              <GroupTitle title="Operaciones" />
                              <SidebarSubLink href="/administracion/laboratorios" label="Laboratorios" onClick={() => setMobileMenuOpen(false)} />
                              <SidebarSubLink href="/administracion/liquidaciones" label="Liquidaciones" onClick={() => setMobileMenuOpen(false)} />
                              <SidebarSubLink href="/administracion/configuracion/pagos-pendientes" label="Pagos Pendientes" onClick={() => setMobileMenuOpen(false)} />

                              <GroupTitle title="Configuración" />
                              <SidebarSubLink href="/administracion/configuracion/aranceles" label="Aranceles Precios" onClick={() => setMobileMenuOpen(false)} />
                              <SidebarSubLink href="/administracion/configuracion/aranceles/plantillas" label="Plantillas" onClick={() => setMobileMenuOpen(false)} />
                              <SidebarSubLink href="/administracion/configuracion/bancos" label="Bancos" onClick={() => setMobileMenuOpen(false)} />
                              <SidebarSubLink href="/administracion/configuracion/documentos" label="Docs Clínicos" onClick={() => setMobileMenuOpen(false)} />
                              <SidebarSubLink href="/administracion/configuracion/consentimientos" label="Consentimientos" onClick={() => setMobileMenuOpen(false)} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </nav>

                {/* Footer Sidebar */}
                <div className="p-8 shrink-0 relative overflow-hidden mt-auto">
                  <div className="absolute inset-0 bg-gradient-to-t from-[#101A2C] to-transparent pointer-events-none rounded-t-[3rem]"></div>
                  <div className="relative z-10 flex flex-col items-center text-center opacity-80">
                     <div className="text-[#C9A24B] mb-4">
                        <svg width="24" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 20.5C12 20.5 15 19 16 16C17.3333 12 18 8 16 5C15 3 13 3 12 5C11 3 9 3 8 5C6 8 6.66667 12 8 16C9 19 12 20.5 12 20.5Z"/></svg>
                     </div>
                     <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.15em] leading-relaxed max-w-[160px]">Cuidamos tu salud, cuidamos tu sonrisa.</p>
                  </div>
                </div>
              </div>
            </aside>
            
            {/* Backdrop Móvil */}
            <AnimatePresence>
              {mobileMenuOpen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-[#0A111F]/80 backdrop-blur-sm z-40 md:hidden" onClick={() => setMobileMenuOpen(false)} />
              )}
            </AnimatePresence>
            
            {/* --- CONTENEDOR PRINCIPAL --- */}
            <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#FBF8F2] relative z-10">
              
              {/* TOPBAR CON Z-INDEX ELEVADO PARA EL BUSCADOR */}
              <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }} className="h-[88px] min-h-[88px] bg-white flex items-center justify-between px-6 md:px-10 shrink-0 border-b border-slate-200 relative z-50 shadow-sm">
                <div className="flex items-center gap-4 w-full">
                  <button className="md:hidden text-slate-500 hover:text-slate-900 transition-colors bg-slate-100 p-2 rounded-xl" onClick={() => setMobileMenuOpen(true)}>
                    <Menu size={20}/>
                  </button>
                  
                  {/* Buscador Superior con Contenedor Z-50 y Posicionamiento Seguro */}
                  <div ref={searchRef} className="relative w-full max-w-[450px] hidden md:block z-50">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        {buscando ? <Loader2 size={16} className="animate-spin text-[#C9A24B]" /> : <Search size={16} className="transition-colors group-focus-within:text-[#C9A24B]" />}
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar paciente por nombre o RUT..."
                        className="w-full bg-slate-50 border border-slate-200 h-[44px] pl-11 pr-4 rounded-full text-sm text-slate-800 outline-none focus:border-[#C9A24B]/50 focus:bg-white placeholder:text-slate-400 transition-all shadow-inner group"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        onFocus={() => busqueda.length > 2 && setMostrarResultados(true)}
                    />
                    <AnimatePresence>
                        {mostrarResultados && (
                            <motion.div initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }} className="absolute top-full mt-3 w-full bg-white rounded-3xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] border border-slate-100 overflow-hidden text-slate-900 z-[9999]">
                                {resultados.length > 0 ? (
                                    resultados.map(p => (
                                        <Link key={p.id} href={`/pacientes/${p.id}`} onClick={() => { setBusqueda(''); setMostrarResultados(false); }} className="flex items-center gap-4 p-4 hover:bg-[#FBF8F2] transition-colors border-b border-slate-50 last:border-b-0 group">
                                            <div className="w-10 h-10 bg-[#C9A24B]/10 text-[#C9A24B] group-hover:bg-[#C9A24B] group-hover:text-white transition-colors rounded-full flex items-center justify-center font-black text-sm">{p.nombre[0]}{p.apellido[0]}</div>
                                            <div>
                                                <p className="font-bold text-[15px] text-slate-800 leading-tight group-hover:text-[#8A6D2F] transition-colors">{p.nombre} {p.apellido}</p>
                                                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{p.rut}</p>
                                            </div>
                                            <ChevronRight className="ml-auto text-slate-300 group-hover:text-[#C9A24B] transition-colors group-hover:translate-x-1" size={16} />
                                        </Link>
                                    ))
                                ) : (
                                    <div className="p-6 text-center text-sm text-slate-500 font-medium">No se encontraron resultados.</div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Perfil (Fondo Claro) */}
                <div className="flex items-center gap-4 cursor-pointer group shrink-0" onClick={handleSignOut} title="Cerrar Sesión">
                  <div className="flex flex-col items-end text-right hidden sm:flex">
                    <span className="text-[13px] font-bold text-slate-800 tracking-wide group-hover:text-[#C9A24B] transition-colors">{perfil?.nombre_completo || 'Usuario'}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{perfil?.rol || ''}</span>
                  </div>
                  <div className="w-11 h-11 rounded-full bg-[#C9A24B] flex items-center justify-center font-black text-[#0A111F] shadow-md group-hover:scale-105 transition-transform text-lg border-[3px] border-white relative">
                    {perfil?.nombre_completo?.[0] || 'U'}
                    <div className="absolute -bottom-1 -right-1 bg-emerald-500 w-3.5 h-3.5 rounded-full border-2 border-white" />
                  </div>
                </div>
              </motion.header>

              {/* CONTENIDO PRINCIPAL DE LAS PÁGINAS */}
              <motion.main initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="flex-1 w-full h-full overflow-y-auto overflow-x-hidden relative bg-[#FBF8F2] custom-scrollbar block">
                {children}
              </motion.main>

            </div>
          </>
        )}

        {isAuthPage && <main className="flex-1 w-full bg-[#FBF8F2]">{children}</main>}
        
        {!isAuthPage && session && <ChatGlobal session={session} />}
      </body>
    </html>
  )
}

function SidebarSubLink({ href, label, onClick }: { href: string, label: string, onClick: () => void }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  
  return (
    <Link 
      href={href} 
      onClick={onClick}
      className={`relative flex items-center gap-3 px-4 py-2 text-[13px] font-medium transition-all rounded-r-xl ${
        isActive 
          ? 'text-[#C9A24B] bg-gradient-to-r from-white/5 to-transparent' 
          : 'text-[#8A96A8] hover:text-white hover:bg-white/5'
      }`}
    >
      <div className={`absolute -left-[5px] w-2 h-2 rounded-full border-2 border-[#0A111F] transition-colors ${isActive ? 'bg-[#C9A24B]' : 'bg-transparent border-transparent'}`} />
      
      {!isActive && <Circle size={4} className="text-white/20 ml-1" />}
      <span className={isActive ? 'font-bold ml-1' : ''}>{label}</span>
    </Link>
  )
}

function GroupTitle({ title }: { title: string }) {
  return (
    <div className="mt-4 mb-1.5 px-4 flex items-center gap-2">
      <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.15em]">{title}</span>
      <div className="flex-1 border-t border-white/5"></div>
    </div>
  )
}

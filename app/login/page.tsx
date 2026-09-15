'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { UserCircle, Lock, Eye, EyeOff, Shield, TrendingUp, ArrowRight, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Paleta de marca AureoDent ──────────────────────────────
const NAVY_DEEP = '#060B12'
const NAVY = '#0A1420'
const NAVY_LIGHT = '#0D1A2B'
const GOLD = '#D4A34E'
const GOLD_LIGHT = '#F3D9A0'
const GOLD_DEEP = '#9C7A34'
const CREAM = '#F5F1E7'
const MUTED = '#7C8699'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  // Estado puramente visual
  const [showPassword, setShowPassword] = useState(false)

  // Ruta del logo en Supabase
  const LOGO_URL = "https://yqdpmaopnvrgdqbfaiok.supabase.co/storage/v1/object/public/documentos_imagenes/icon.png";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cargando) return

    setCargando(true)
    setError('')

    try {
      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9.]/g, "");

      if (!cleanUsername) {
        setError('Ingrese un nombre de usuario válido')
        setCargando(false)
        return
      }

      const virtualEmail = `${cleanUsername}@dentapro.com`;

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: virtualEmail,
        password
      })

      if (authError) {
        setError('Credenciales inválidas o cuenta inexistente')
        setCargando(false)
        return
      }

      if (data?.session) {
        window.location.replace('/agenda')
      }
    } catch (err) {
      setError('Error de comunicación con el servidor')
      setCargando(false)
    }
  }

  return (
    <main className="min-h-screen w-full flex flex-col lg:flex-row font-body" style={{ backgroundColor: NAVY }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <style>{`
        .font-display { font-family: 'Fraunces', ui-serif, Georgia, serif; }
        .font-body { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
        }
      `}</style>

      {/* ── PANEL IZQUIERDO — identidad de marca ── */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between px-16 py-14 overflow-hidden">
        {/* Imagen de fondo */}
        <img
          src="https://yqdpmaopnvrgdqbfaiok.supabase.co/storage/v1/object/public/documentos_imagenes/fondo-login.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: '20% center' }}
        />
        {/* Overlay oscuro para legibilidad */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(160deg, rgba(6,11,18,0.55) 0%, rgba(6,11,18,0.85) 100%)`,
          }}
        />
        <OrbitField />

        {/* Emblema circular con logo de Supabase */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 flex justify-center pt-6"
        >
          <div className="relative">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden bg-white"
              style={{ border: `1.5px solid ${GOLD}`, boxShadow: `0 0 0 1px rgba(212,163,78,0.15), 0 0 40px rgba(212,163,78,0.08)` }}
            >
              <img src={LOGO_URL} alt="AureoDent Logo" className="w-[75%] h-[75%] object-contain" />
            </div>
            <Spark className="absolute -top-1 -right-1 w-4 h-4" delay={0.6} />
          </div>
        </motion.div>

        {/* Wordmark */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative z-10 text-center mt-6"
        >
          <h1 className="font-display font-bold text-[2.6rem] tracking-[0.12em]" style={{ color: CREAM }}>
            AUREO<span style={{ color: GOLD_LIGHT }}>DENT</span>
          </h1>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.45em]" style={{ color: GOLD }}>
            Panel clínico
          </p>

          <div className="flex items-center justify-center gap-3 mt-6">
            <span className="w-1 h-1 rotate-45" style={{ backgroundColor: GOLD }} />
          </div>

          <p className="mt-6 text-[15px] leading-relaxed max-w-[320px] mx-auto" style={{ color: '#B9C2D0' }}>
            El estándar <span style={{ color: GOLD_LIGHT }}>dorado</span> en gestión de clínicas dentales.
          </p>
        </motion.div>

        {/* Swoosh dorado */}
        <div className="relative z-10 -mb-2">
          <BottomSwoosh />
        </div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="relative z-10 grid grid-cols-3 gap-6"
        >
          <Feature icon={<Shield size={18} style={{ color: GOLD }} />} title="Seguro" desc="Protegemos tu información" />
          <Feature icon={<TrendingUp size={18} style={{ color: GOLD }} />} title="Eficiente" desc="Todo tu negocio en un solo lugar" />
          <Feature icon={<ToothIcon size={18} style={{ color: GOLD }} />} title="Especializado" desc="Diseñado para clínicas dentales" />
        </motion.div>
      </div>

      {/* ── PANEL DERECHO — formulario ── */}
      <div
        className="flex-1 flex items-center justify-center p-6 sm:p-12 relative"
        style={{ background: `linear-gradient(160deg, ${NAVY_LIGHT} 0%, ${NAVY} 100%)` }}
      >
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="w-full max-w-[380px]"
        >
          {/* Encabezado móvil */}
          <div className="flex lg:hidden justify-center mb-8">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden bg-white"
              style={{ border: `1.5px solid ${GOLD}` }}
            >
              <img
                src={LOGO_URL}
                alt="Logo AureoDent"
                className="w-[75%] h-[75%] object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          </div>

          {/* Ícono + halo (Con el halo subido y el círculo centrado) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="flex flex-col items-center mb-8"
          >
            <div className="relative w-38 mb-5 mt-1">
              <div className="-translate-y-6"> 
              <TopHalo />
            </div>
              
              {/* El contenedor ancla el círculo del diente al centro absoluto */}
              <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-0 flex items-center justify-center">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ 
                    backgroundColor: NAVY, // Oculta la línea de atrás
                    border: `1px solid rgba(212,163,78,0.4)`
                  }}
                >
                  <div 
                    className="w-full h-full rounded-full flex items-center justify-center" 
                    style={{ backgroundColor: 'rgba(212,163,78,0.1)' }}
                  >
                    <ToothIcon size={20} style={{ color: GOLD_LIGHT }} />
                  </div>
                </div>
              </div>
              
              <Spark className="absolute -top-1 right-2 w-4 h-4" delay={0.9} />
            </div>

            <p className="text-[11px] font-semibold uppercase tracking-[0.35em]" style={{ color: GOLD }}>
              Bienvenido de nuevo
            </p>
            <h2 className="font-display text-[2rem] leading-tight mt-2 text-center" style={{ color: CREAM }}>
              Ingresa <span className="italic" style={{ color: GOLD_LIGHT }}>a tu</span> clínica
            </h2>
            <div className="w-10 h-px mt-4" style={{ backgroundColor: GOLD_DEEP }} />
          </motion.div>

          <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            onSubmit={handleLogin}
            className="space-y-6 text-left"
          >
            {/* Campo: Identificador */}
            <div className="space-y-2">
              <label htmlFor="username" className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}>
                <UserCircle size={13} /> Usuario del sistema
              </label>
              <div className="relative">
                <input
                  id="username"
                  type="text"
                  placeholder="ej: dr.vargas"
                  className="w-full pl-5 pr-12 py-4 rounded-2xl outline-none font-medium transition-all"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1.5px solid rgba(212,163,78,0.18)',
                    color: CREAM,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(212,163,78,0.18)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)' }}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <UserCircle size={17} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: GOLD_DEEP }} />
              </div>
            </div>

            {/* Campo: Contraseña */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}>
                <Lock size={13} /> Clave de acceso
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="w-full pl-5 pr-12 py-4 rounded-2xl outline-none font-medium transition-all"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1.5px solid rgba(212,163,78,0.18)',
                    color: CREAM,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(212,163,78,0.18)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)' }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={{ color: GOLD_DEEP }}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="text-[11px] font-semibold text-center px-4 py-3 rounded-xl"
                  style={{ color: '#E9A79C', backgroundColor: 'rgba(179,66,58,0.15)', border: '1px solid rgba(179,66,58,0.3)' }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={cargando}
              whileHover={{ scale: cargando ? 1 : 1.01 }}
              whileTap={{ scale: cargando ? 1 : 0.98 }}
              className="w-full py-4 rounded-2xl font-bold text-xs uppercase tracking-[0.2em] flex justify-center items-center gap-3 disabled:opacity-50 mt-2"
              style={{
                background: `linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD} 55%, ${GOLD_DEEP} 100%)`,
                color: NAVY_DEEP,
                boxShadow: '0 12px 28px -8px rgba(212,163,78,0.45)',
              }}
            >
              {cargando ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <ArrowRight size={16} />
                  <span>Entrar al sistema</span>
                </>
              )}
            </motion.button>
          </motion.form>

          {/* Protección */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-8"
          >
            <div className="flex items-center gap-3">
              <div className="h-px flex-1" style={{ backgroundColor: 'rgba(212,163,78,0.18)' }} />
              <Shield size={14} style={{ color: GOLD_DEEP }} />
              <div className="h-px flex-1" style={{ backgroundColor: 'rgba(212,163,78,0.18)' }} />
            </div>
            <p className="text-center text-[12px] mt-4" style={{ color: MUTED }}>
              Tu información está protegida
            </p>
          </motion.div>

          <p className="text-center text-[11px] mt-10" style={{ color: '#4E586B' }}>
            © {new Date().getFullYear()} <span className="font-semibold" style={{ color: GOLD_DEEP }}>AUREODENT</span> • Todos los derechos reservados
          </p>
        </motion.div>
      </div>
    </main>
  )
}

// ── Subcomponentes decorativos ─────────────────────────────

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ border: '1px solid rgba(212,163,78,0.3)', backgroundColor: 'rgba(212,163,78,0.05)' }}
      >
        {icon}
      </div>
      <p className="text-[12px] font-semibold" style={{ color: CREAM }}>{title}</p>
      <p className="text-[11px] leading-snug" style={{ color: MUTED }}>{desc}</p>
    </div>
  )
}

function Spark({ className = '', delay = 0 }: { className?: string; delay?: number }) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      className={className}
      fill={GOLD_LIGHT}
      initial={{ opacity: 0.3, scale: 0.8 }}
      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
      transition={{ duration: 2.4, repeat: Infinity, delay, ease: 'easeInOut' }}
    >
      <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
    </motion.svg>
  )
}

function ToothIcon({ size = 18, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path
        d="M12 3.2c-2.6 0-4.7 1.7-4.7 4.4 0 1.3.4 2.1.7 3.4.3 1.3.3 2.6.1 3.9-.1.9-.4 1.9-.6 2.8-.1.6.1 1.3.7 1.5.6.2 1.2-.2 1.4-1 .3-1 .4-2.2 1-2.2s.7 1.2 1 2.2c.2.8.8 1.2 1.4 1 .6-.2.8-.9.7-1.5-.2-.9-.5-1.9-.6-2.8-.2-1.3-.2-2.6.1-3.9.3-1.3.7-2.1.7-3.4 0-2.7-2.1-4.4-4.6-4.4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function OrbitField() {
  return (
    <svg className="absolute -top-16 -right-24 w-[420px] h-[420px] opacity-40 pointer-events-none" viewBox="0 0 420 420" fill="none">
      <circle cx="210" cy="210" r="120" stroke="rgba(212,163,78,0.35)" strokeWidth="1" />
      <circle cx="210" cy="210" r="170" stroke="rgba(212,163,78,0.18)" strokeWidth="1" />
      <circle cx="160" cy="150" r="60" stroke="rgba(212,163,78,0.25)" strokeWidth="1" />
    </svg>
  )
}

function BottomSwoosh() {
  return (
    <svg viewBox="0 0 600 120" className="w-full h-16" fill="none" preserveAspectRatio="none">
      <motion.path
        d="M-20,90 C150,10 400,140 640,40"
        stroke="url(#swooshGrad)"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.8, ease: 'easeInOut', delay: 0.4 }}
      />
      <defs>
        <linearGradient id="swooshGrad" x1="0" y1="0" x2="600" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={GOLD_LIGHT} />
          <stop offset="1" stopColor={GOLD} stopOpacity="0.2" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function TopHalo() {
  return (
    <svg viewBox="0 0 200 80" className="w-full" fill="none">
      <motion.path
        d="M20,70 Q100,-10 180,70"
        stroke={GOLD}
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.8 }}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
      />
    </svg>
  )
}

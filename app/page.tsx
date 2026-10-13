'use client'
import { useState, useEffect, ReactNode } from 'react'
import { useRole } from '@/app/hooks/useRole'
import { supabase } from '@/lib/supabase' // Asegúrate de que esta ruta sea correcta
import {
  Loader2, Users, Wallet, Stethoscope, BarChart3, ArrowUpRight,
  Clock, CalendarDays, LayoutGrid, CheckCircle2, TrendingUp, TrendingDown,
  BellRing, ChevronRight, Award, Search, History
} from 'lucide-react'
import { motion } from 'framer-motion'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Emblema: corona de laurel + diente + destellos (como en la referencia)
// ---------------------------------------------------------------------------
function LaurelWreath({ cx = 100, cy = 100, r = 62 }: { cx?: number; cy?: number; r?: number }) {
  // Cobertura de 40° a 320° (deja un hueco arriba, donde van los destellos)
  const count = 16
  const startDeg = 42
  const endDeg = 318
  const leaves = Array.from({ length: count })

  return (
    <g>
      {leaves.map((_, i) => {
        const deg = startDeg + (i / (count - 1)) * (endDeg - startDeg)
        const rad = (deg * Math.PI) / 180
        const x = cx + r * Math.sin(rad)
        const y = cy - r * Math.cos(rad)
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx="9.5"
            ry="4"
            fill="none"
            stroke={GOLD}
            strokeWidth="1.3"
            transform={`rotate(${deg} ${x} ${y})`}
          />
        )
      })}
    </g>
  )
}

function Sparkle({ x, y, s = 6 }: { x: number; y: number; s?: number }) {
  return (
    <path
      d={`M${x} ${y - s} L${x + s * 0.3} ${y - s * 0.3} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.3} L${x} ${y + s} L${x - s * 0.3} ${y + s * 0.3} L${x - s} ${y} L${x - s * 0.3} ${y - s * 0.3} Z`}
      fill={GOLD}
    />
  )
}

function LaurelEmblem({ size = 190 }: { size?: number }) {
  const cx = 100, cy = 100, r = 62
  const toothScale = 2.3
  const toothOffset = 100 - 12 * toothScale
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <circle cx={cx} cy={cy} r={88} stroke={GOLD} strokeOpacity="0.25" strokeDasharray="2 6" />
      <LaurelWreath cx={cx} cy={cy} r={r} />
      <g transform={`translate(${toothOffset} ${toothOffset}) scale(${toothScale})`} style={{ color: GOLD }}>
        <ToothIconPath />
      </g>
      <Sparkle x={142} y={40} s={7} />
      <Sparkle x={162} y={58} s={4} />
      <Sparkle x={120} y={24} s={4} />
    </svg>
  )
}

function ToothIconPath() {
  return (
    <path
      d="M12 3c-1.7 0-2.6.9-3.8.9C6.6 3.9 5 3 3.9 4.4 2.7 6 3 8.4 3.4 10.4c.4 2 1 4.6 2.1 6.6.7 1.3 1.6 2.6 2.7 2.6.9 0 1-1.4 1.2-2.6.2-1.2.4-2.6 1.4-2.6.9 0 1.1 1.4 1.3 2.6.2 1.2.4 2.6 1.3 2.6 1.1 0 2-1.3 2.7-2.6 1.1-2 1.7-4.6 2.1-6.6.4-2 .7-4.4-.5-6-1.1-1.4-2.7-.5-4.3-.5C14.6 3.9 13.7 3 12 3Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      fill="none"
    />
  )
}

const GOLD = '#B8935A'

type CitaHoy = {
  id: string
  inicio: string
  fin: string
  motivo: string | null
  estado: string
  estado_confirmacion: string
  llegada_confirmada: boolean
  hora_inicio_atencion: string | null
  hora_fin_atencion: string | null
  profesional_id: string | null
  pacientes: { id: string; nombre: string; apellido: string } | null
}

type Notificacion = {
  id: string
  tipo: 'pago' | 'cita' | 'stock' | 'cumpleanos'
  texto: string
  detalle: string
}

const PALETA_DOCTORES = ['#3B82F6', '#10B981', '#8B5CF6', '#94A3B8', '#F59E0B', '#EC4899']

export default function WelcomeDashboard() {
  const { rol, isAdmin, isRecepcionista, isDentista, cargando } = useRole()
  const [mounted, setMounted] = useState(false)
  const [fechaHora, setFechaHora] = useState(new Date())
  const [datosListos, setDatosListos] = useState(false)
  const [imgCargada, setImgCargada] = useState(false)
  const ESTADOS_CONFIRMADOS = ['confirmado_tel', 'en_espera', 'atendiendose', 'atendido']
  const [nombreUsuario, setNombreUsuario] = useState<string>('')
  const [pacienteReciente, setPacienteReciente] = useState<any>(null)
  const [agendaHoy, setAgendaHoy] = useState<CitaHoy[]>([])
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [pendientes, setPendientes] = useState(0)
  const [resumenTurno, setResumenTurno] = useState({ total: 0, atendidos: 0, restantes: 0 })
  const [stats, setStats] = useState({
    pacientes: 0, pacientesVar: 0,
    ingresos: 0, ingresosVar: 0,
    horas: 0, horasVar: 0,
    confirmadas: 0, confirmadasVar: 0,
  })

  useEffect(() => {
    setMounted(true)
    const timer = setInterval(() => setFechaHora(new Date()), 60000)
    if (!cargando) fetchWidgetData()

    // Precarga la imagen de fondo para evitar el "pop-in" tardío
    const img = new window.Image()
    img.src = '/fondo-main.png'
    if (img.complete) setImgCargada(true)
    else img.onload = () => setImgCargada(true)

    return () => clearInterval(timer)
  }, [cargando])

  function pctChange(actual: number, anterior: number) {
    if (!anterior) return actual > 0 ? 100 : 0
    return Math.round(((actual - anterior) / anterior) * 100)
  }

  async function fetchWidgetData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: perfil } = await supabase
        .from('perfiles')
        .select('nombre_completo')
        .eq('id', user.id)
        .single()
      if (perfil?.nombre_completo) setNombreUsuario(perfil.nombre_completo)

      const hoy = new Date()
      const ayer = new Date(hoy)
      ayer.setDate(ayer.getDate() - 1)

      const rango = (d: Date) => ({
        inicio: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString(),
        fin: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString(),
      })
      const rHoy = rango(hoy)
      const rAyer = rango(ayer)

      // ---- Última ficha visitada -------------------------------------
      const { data: citaReciente } = await supabase
        .from('citas')
        .select('paciente_id, pacientes(id, nombre, apellido, rut)')
        .eq('creado_por', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (citaReciente && citaReciente.pacientes) setPacienteReciente(citaReciente.pacientes)

      // ---- Citas de hoy (agenda) --------------------------------------
      let queryHoy = supabase
        .from('citas')
        .select('id, inicio, fin, motivo, estado, estado_confirmacion, llegada_confirmada, hora_inicio_atencion, hora_fin_atencion, profesional_id, pacientes(id, nombre, apellido)')
        .gte('inicio', rHoy.inicio)
        .lte('inicio', rHoy.fin)
        .neq('estado', 'cancelada')
        .order('inicio', { ascending: true })

      if (isDentista && !isAdmin) queryHoy = queryHoy.eq('profesional_id', user.id)

      const { data: citasHoyData } = await queryHoy
      const citasHoy = (citasHoyData || []).map((c: any) => ({
        ...c,
        pacientes: Array.isArray(c.pacientes) ? c.pacientes[0] : c.pacientes,
      })) as CitaHoy[]
      setAgendaHoy(citasHoy)

      const confirmadasHoy = citasHoy.filter(c => ESTADOS_CONFIRMADOS.includes(c.estado)).length
const pendientesHoy = citasHoy.filter(c => c.estado === 'programada').length
      const horasHoy = citasHoy.reduce((acc, c) => acc + (new Date(c.fin).getTime() - new Date(c.inicio).getTime()) / 3600000, 0)
      setPendientes(pendientesHoy)

      if (isDentista) {
        const atendidos = citasHoy.filter(c => c.estado === 'atendido' || c.hora_fin_atencion).length
        setResumenTurno({ total: citasHoy.length, atendidos, restantes: citasHoy.length - atendidos })
      }

      // ---- Comparativo de ayer (solo métricas clínica-wide) -----------
      if (isAdmin || isRecepcionista) {
        const { data: citasAyerData } = await supabase
          .from('citas')
          .select('inicio, fin, estado_confirmacion, estado') // <-- Agregado
          .gte('inicio', rAyer.inicio)
          .lte('inicio', rAyer.fin)
          .neq('estado', 'cancelada')
        const citasAyer = citasAyerData || []
        const confirmadasAyer = citasAyer.filter(c => ESTADOS_CONFIRMADOS.includes(c.estado)).length
        const horasAyer = citasAyer.reduce((acc, c) => acc + (new Date(c.fin).getTime() - new Date(c.inicio).getTime()) / 3600000, 0)

        const { data: pagosHoyData } = await supabase
          .from('pagos').select('monto')
          .gte('fecha_pago', rHoy.inicio).lte('fecha_pago', rHoy.fin).or('estado.is.null,estado.neq.Anulado').neq('metodo_pago', 'Saldo a Favor')
        const { data: pagosAyerData } = await supabase
          .from('pagos').select('monto')
          .gte('fecha_pago', rAyer.inicio).lte('fecha_pago', rAyer.fin).or('estado.is.null,estado.neq.Anulado').neq('metodo_pago', 'Saldo a Favor')

        const ingresosHoy = (pagosHoyData || []).reduce((a, p) => a + Number(p.monto || 0), 0)
        const ingresosAyer = (pagosAyerData || []).reduce((a, p) => a + Number(p.monto || 0), 0)

        setStats({
          pacientes: citasHoy.length,
          pacientesVar: pctChange(citasHoy.length, citasAyer.length),
          ingresos: ingresosHoy,
          ingresosVar: pctChange(ingresosHoy, ingresosAyer),
          horas: Math.round(horasHoy),
          horasVar: pctChange(horasHoy, horasAyer),
          confirmadas: confirmadasHoy,
          confirmadasVar: pctChange(confirmadasHoy, confirmadasAyer),
        })

        // ---- Notificaciones -------------------------------------------
        const notifs: Notificacion[] = []

        const { data: ultimoPago } = await supabase
          .from('pagos').select('monto, fecha_pago')
          .order('fecha_pago', { ascending: false }).limit(1).single()
        if (ultimoPago) {
          notifs.push({
            id: 'pago', tipo: 'pago',
            texto: 'Pago recibido',
            detalle: `$${Number(ultimoPago.monto).toLocaleString('es-CL')}`,
          })
        }

        const ultimaConfirmada = citasHoy
            .filter(c => ESTADOS_CONFIRMADOS.includes(c.estado))
          .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime())[0]
        if (ultimaConfirmada && ultimaConfirmada.pacientes) {
          notifs.push({
            id: 'cita', tipo: 'cita',
            texto: 'Cita confirmada',
            detalle: `${ultimaConfirmada.pacientes.nombre} ${ultimaConfirmada.pacientes.apellido} · ${new Date(ultimaConfirmada.inicio).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`,
          })
        }

        const { data: stockBajo } = await supabase
          .from('inventario_productos')
          .select('nombre, stock_actual, stock_seguridad')
          .lte('stock_actual', 5)
          .order('stock_actual', { ascending: true })
          .limit(1)
        if (stockBajo && stockBajo.length > 0) {
          notifs.push({
            id: 'stock', tipo: 'stock',
            texto: 'Inventario bajo',
            detalle: `${stockBajo[0].nombre} · quedan ${stockBajo[0].stock_actual}`,
          })
        }

        setNotificaciones(notifs)
      }
    } catch (error) {
      console.error('Error cargando widgets:', error)
    } finally {
      setDatosListos(true)
    }
  }

  function capitalizar(texto: string) {
    if (!texto) return texto
    return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase()
  }

  const getSaludo = () => {
    const hora = fechaHora.getHours()
    if (hora < 12) return 'Buenos días'
    if (hora < 19) return 'Buenas tardes'
    return 'Buenas noches'
  }

  const getRolTitle = () => {
    if (isAdmin) return 'Administrador General'
    if (isDentista) return 'Especialista'
    if (isRecepcionista) return 'Recepción'
    return rol || 'Usuario'
  }

  const getAccesosRapidos = () => {
    const accesos: { titulo: string; desc: string; icono: ReactNode; href: string }[] = []

    if (isAdmin || isRecepcionista) {
      accesos.push({ titulo: 'Nuevo Paciente', desc: 'Registrar ficha clínica', icono: <Users size={22} />, href: '/pacientes/nuevo' })
      accesos.push({ titulo: 'Nueva Cita', desc: 'Agendar paciente', icono: <CalendarDays size={22} />, href: '/semana' })
      accesos.push({ titulo: 'Caja y Pagos', desc: 'Gestión de ingresos', icono: <Wallet size={22} />, href: '/caja' })
      accesos.push({ titulo: isAdmin ? 'Reportes' : 'Diario Global', desc: isAdmin ? 'Estadísticas y análisis' : 'Disponibilidad de doctores', icono: isAdmin ? <BarChart3 size={22} /> : <LayoutGrid size={22} />, href: isAdmin ? '/reportes/desempeno' : '/semana' })
    } else if (isDentista) {
      accesos.push({ titulo: 'Mi Agenda', desc: 'Citas y pacientes del día', icono: <CalendarDays size={22} />, href: '/agenda' })
      accesos.push({ titulo: 'Buscar Ficha', desc: 'Historial y evolución', icono: <Search size={22} />, href: '/pacientes' })
    }

    return accesos
  }

  const getBadge = (c: CitaHoy) => {
    if (c.hora_fin_atencion || c.estado === 'atendido')
      return { label: 'ATENDIDA', className: 'text-emerald-700 bg-emerald-50 border-emerald-100' }
    if (c.hora_inicio_atencion)
      return { label: 'EN CURSO', className: 'text-blue-700 bg-blue-50 border-blue-100' }
    if (c.llegada_confirmada)
      return { label: 'EN ESPERA', className: 'text-amber-700 bg-amber-50 border-amber-100' }
    if (c.estado === 'confirmado_tel')
          return { label: 'CONFIRMADA', className: 'text-blue-700 bg-blue-50 border-blue-100' }
    if (c.estado === 'no_asiste')
      return { label: 'NO ASISTIÓ', className: 'text-red-700 bg-red-50 border-red-100' }
    return { label: 'PENDIENTE', className: 'text-slate-500 bg-slate-50 border-slate-200' }
  }

  const colorDoctor = (id: string | null) => {
    if (!id) return PALETA_DOCTORES[3]
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
    return PALETA_DOCTORES[Math.abs(hash) % PALETA_DOCTORES.length]
  }

  if (!mounted || cargando || !datosListos) return (
    <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-[#FDFBF7]">
      <Loader2 className="animate-spin" style={{ color: GOLD }} size={44} />
      <p className="font-semibold text-xs uppercase tracking-widest text-slate-400">Preparando entorno…</p>
    </div>
  )

  const accesos = getAccesosRapidos()
  const proximas = agendaHoy.filter(c => new Date(c.fin) >= fechaHora).slice(0, 4)

  const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
  const itemVariants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 110 } } }

  return (
    <main className="min-h-screen bg-[#FDFBF7] p-4 md:p-8 pb-24">
      <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">

        {/* ================= COLUMNA PRINCIPAL ================= */}
        <div className="space-y-6 min-w-0">

          {/* HERO */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-[2.5rem] bg-white border border-[#EDE3D3] shadow-[0_2px_30px_rgba(184,147,90,0.08)] p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8"
          >
            {/* Imagen de fondo (columnas) — fade suave al cargar, sin "pop-in" */}
            <div
              className="absolute inset-0 z-0 transition-opacity duration-700 ease-out"
              style={{
                backgroundImage: "url('/fondo-main.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'right center',
                backgroundRepeat: 'no-repeat',
                opacity: imgCargada ? 1 : 0,
              }}
            />
            {/* Degradado para asegurar legibilidad del texto sobre la imagen */}
            <div
              className="absolute inset-0 z-0"
              style={{
                background: 'linear-gradient(90deg, #FFFFFF 15%, rgba(255,255,255,0.75) 45%, rgba(255,255,255,0.15) 75%, rgba(255,255,255,0) 100%)',
              }}
            />

            {/* Emblema laurel + diente (superpuesto sobre la imagen) */}
            <div className="absolute right-10 top-1/2 -translate-y-1/2 z-[1] hidden lg:block pointer-events-none">
              <LaurelEmblem />
            </div>

            <div className="relative z-10 text-center md:text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] mb-3" style={{ color: GOLD }}>
                Bienvenido nuevamente
              </p>
              <h1 className="text-4xl md:text-6xl font-serif tracking-tight leading-none text-slate-900 mb-1">
                {getSaludo()},
              </h1>
              <h1 className="text-4xl md:text-6xl font-serif tracking-tight leading-none italic mb-4" style={{ color: GOLD }}>
                {nombreUsuario ? capitalizar(nombreUsuario.split(' ')[0]) : getRolTitle()}
              </h1>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">{getRolTitle()}</p>
              <div className="w-16 h-[2px] mx-auto md:mx-0 mb-4" style={{ backgroundColor: GOLD }} />
              <p className="text-slate-500 text-sm max-w-md leading-relaxed">
                Todo el sistema está preparado para comenzar la jornada.
              </p>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] flex items-center justify-center md:justify-start gap-2" style={{ color: GOLD }}>
                <Award size={14} /> El estándar dorado en gestión clínica
              </p>
            </div>
          </motion.div>

          {/* STATS */}
          {(isAdmin || isRecepcionista) && (
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard icon={<Users size={20} />} label="Pacientes Hoy" value={stats.pacientes.toString()} delta={stats.pacientesVar} variants={itemVariants} />
              <StatCard icon={<Wallet size={20} />} label="Ingresos Hoy" value={`$${stats.ingresos.toLocaleString('es-CL')}`} delta={stats.ingresosVar} variants={itemVariants} />
              <StatCard icon={<Clock size={20} />} label="Horas Agendadas" value={stats.horas.toString()} delta={stats.horasVar} variants={itemVariants} />
              <StatCard icon={<CheckCircle2 size={20} />} label="Citas Confirmadas" value={stats.confirmadas.toString()} delta={stats.confirmadasVar} variants={itemVariants} />
            </motion.div>
          )}

          {isDentista && !isAdmin && (
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-3 gap-5">
              <StatCard icon={<CalendarDays size={20} />} label="Citas Hoy" value={resumenTurno.total.toString()} variants={itemVariants} />
              <StatCard icon={<CheckCircle2 size={20} />} label="Atendidos" value={resumenTurno.atendidos.toString()} variants={itemVariants} />
              <StatCard icon={<Clock size={20} />} label="Restantes" value={resumenTurno.restantes.toString()} variants={itemVariants} />
            </motion.div>
          )}

          {/* AGENDA + ACCESOS RÁPIDOS */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

            {/* Agenda del día */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-3 bg-white rounded-[2.5rem] border border-[#EDE3D3] shadow-sm p-7 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-serif font-semibold text-slate-800 flex items-center gap-2">
                  <CalendarDays size={18} style={{ color: GOLD }} /> Agenda del día
                </h3>
                <Link href="/semana" className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: GOLD }}>
                  Ver calendario <ChevronRight size={14} />
                </Link>
              </div>

              {agendaHoy.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">No hay citas agendadas para hoy.</p>
              ) : (
                <div className="space-y-1">
                  {agendaHoy.map((c) => {
                    const badge = getBadge(c)
                    return (
                      <div key={c.id} className="flex items-center gap-4 py-3 border-b border-slate-50 last:border-0">
                        <span className="text-xs font-bold text-slate-500 w-12 shrink-0">
                          {new Date(c.inicio).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorDoctor(c.profesional_id) }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {c.pacientes ? `${c.pacientes.nombre} ${c.pacientes.apellido}` : 'Paciente sin asignar'}
                          </p>
                          <p className="text-xs text-slate-400 truncate">{c.motivo || 'Consulta general'}</p>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border shrink-0 ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </motion.div>

            {/* Accesos rápidos 2x2 */}
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="lg:col-span-2 grid grid-cols-2 gap-4 h-full">
              {accesos.map((item, i) => (
                <motion.div key={i} variants={itemVariants}>
                  <Link href={item.href} className="group block h-full">
                    <div className="h-full bg-white rounded-[2rem] border border-[#EDE3D3] shadow-sm p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-lg hover:border-transparent" style={{}}>
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center border transition-colors" style={{ borderColor: '#EADFC7', color: GOLD, backgroundColor: '#FBF7EF' }}>
                        {item.icono}
                      </div>
                      <div className="mt-4">
                        <h4 className="text-sm font-bold text-slate-800 leading-tight">{item.titulo}</h4>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-1">{item.desc}</p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}

              {pacienteReciente && (
                <motion.div variants={itemVariants} className="col-span-2">
                  <Link href={`/pacientes/${pacienteReciente.id}`} className="group block">
                    <div className="bg-white rounded-[2rem] border border-[#EDE3D3] shadow-sm p-5 flex items-center gap-4 transition-all hover:shadow-lg">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center border shrink-0" style={{ borderColor: '#EADFC7', color: GOLD, backgroundColor: '#FBF7EF' }}>
                        <History size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Acceso reciente</p>
                        <p className="text-sm font-bold text-slate-800 truncate">{pacienteReciente.nombre} {pacienteReciente.apellido}</p>
                      </div>
                      <ArrowUpRight size={18} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                    </div>
                  </Link>
                </motion.div>
              )}
            </motion.div>
          </div>
        </div>

        {/* ================= COLUMNA LATERAL ================= */}
        <aside className="space-y-6">

          {/* Reloj */}
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-[2rem] border border-[#EDE3D3] shadow-sm p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: '#FBF7EF', color: GOLD }}>
              <Clock size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate">
                {fechaHora.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-lg font-serif font-semibold text-slate-800">
                {fechaHora.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </motion.div>

          {/* Hoy */}
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }} className="bg-white rounded-[2rem] border border-[#EDE3D3] shadow-sm p-6">
            <h4 className="text-sm font-serif font-semibold text-slate-800 mb-4">Hoy</h4>
            {proximas.length === 0 ? (
              <p className="text-xs text-slate-400">No quedan citas por venir.</p>
            ) : (
              <div className="space-y-4">
                {proximas.map((c) => (
                  <div key={c.id} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border" style={{ borderColor: '#EADFC7', color: GOLD, backgroundColor: '#FBF7EF' }}>
                      <Users size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-700">
                        {new Date(c.inicio).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {c.pacientes ? `${c.pacientes.nombre} ${c.pacientes.apellido}` : 'Sin asignar'}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{c.motivo || 'Consulta general'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link href="/semana" className="mt-5 block text-center text-[11px] font-bold uppercase tracking-widest py-2.5 rounded-2xl border transition-colors" style={{ color: GOLD, borderColor: '#EADFC7' }}>
              Ver agenda completa
            </Link>
          </motion.div>

          {/* Pendientes */}
          {(isAdmin || isRecepcionista) && (
            <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-[2rem] border border-[#EDE3D3] shadow-sm p-6 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-serif font-semibold text-slate-800">Pendientes</h4>
                <p className="text-xs text-slate-400 mt-1">{pendientes} cita{pendientes !== 1 ? 's' : ''} por confirmar</p>
              </div>
              <ChevronRight size={18} className="text-slate-300" />
            </motion.div>
          )}

          {/* Notificaciones */}
          {(isAdmin || isRecepcionista) && (
            <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-[2rem] border border-[#EDE3D3] shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-serif font-semibold text-slate-800">Notificaciones</h4>
                {notificaciones.length > 0 && (
                  <span className="text-[10px] font-bold text-white rounded-full w-5 h-5 flex items-center justify-center" style={{ backgroundColor: GOLD }}>
                    {notificaciones.length}
                  </span>
                )}
              </div>
              {notificaciones.length === 0 ? (
                <p className="text-xs text-slate-400">Sin novedades por ahora.</p>
              ) : (
                <div className="space-y-4">
                  {notificaciones.map((n) => (
                    <div key={n.id} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#FBF7EF', color: GOLD }}>
                        <BellRing size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-700">{n.texto}</p>
                        <p className="text-[11px] text-slate-400 truncate">{n.detalle}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </aside>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
function StatCard({ icon, label, value, delta, variants }: { icon: ReactNode; label: string; value: string; delta?: number; variants?: any }) {
  const up = (delta ?? 0) >= 0
  return (
    <motion.div variants={variants} className="bg-white rounded-[2rem] border border-[#EDE3D3] shadow-sm p-6">
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center border mb-5" style={{ borderColor: '#EADFC7', color: GOLD, backgroundColor: '#FBF7EF' }}>
        {icon}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-2xl md:text-3xl font-serif font-semibold text-slate-800 mt-1">{value}</p>
      {delta !== undefined && (
        <p className={`text-[11px] font-bold mt-2 flex items-center gap-1 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
          {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {Math.abs(delta)}%
          <span className="text-slate-300 font-medium normal-case ml-1">vs ayer</span>
        </p>
      )}
    </motion.div>
  )
}

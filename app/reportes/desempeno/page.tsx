'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Activity, AlertTriangle, Calendar, Clock, DollarSign, Download, FileText, Info, Layers, Lock, Package, PieChart as PieIcon,
  Lightbulb, RefreshCw, ShieldCheck, Stethoscope, Target, TrendingUp, UserPlus, Users, Wallet, X,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  cargarFijos, cargarHistorial, cargarPacientes, cargarPeriodo, guardarFijosCache, leerFijosCache, type DatosFijos, type DatosPeriodo,
} from './_lib/consultas'
import { calcularMetricas, historialMensual } from './_lib/metricas'
import { generarDecisiones } from './_lib/decisiones'
import {
  CONFIG, MESES, MESES_LARGOS, corteEquivalente, descargarCSV, diasHabiles, rangoMesHasta, fechaLocal, horas, limpiarNombrePrestacion, mesAnterior, money, moneyCorto,
  nombreCompleto, porcentaje, rangoMes, ratio, variacion,
} from './_lib/util'
import {
  BarList, Card, EmptyState, Kpi, LegendItem, ListaContactos, MetaVentas, MiniStat, Modal, PanelDecisiones, PulseSpinner, SectionTitle, Seccion, TextoComparacion,
  type FilaContacto,
} from './_components/ui'

const COLORES_REPARTO = ['#0d9488', '#b45309', '#38bdf8']
const TOOLTIP_STYLE = { borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px' }

export default function PanelDesempenoNegocio() {
  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [filtroDoc, setFiltroDoc] = useState<string | null>(null)
  const [showLegend, setShowLegend] = useState(false)
  const [showDecisiones, setShowDecisiones] = useState(false)

  const [acceso, setAcceso] = useState<'verificando' | 'si' | 'no'>('verificando')
  const [fijos, setFijos] = useState<DatosFijos | null>(null)
  const [actual, setActual] = useState<DatosPeriodo | null>(null)
  const [previo, setPrevio] = useState<DatosPeriodo | null>(null)
  // Mes en curso: el mes anterior se corta en el mismo día y hora para comparar lo comparable
  const [cortePrevio, setCortePrevio] = useState<Date | null>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [pacientes, setPacientes] = useState<Record<string, any>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => new Date())

  const reqRef = useRef(0)
  const fijosRef = useRef<DatosFijos | null>(null)
  const pacientesRef = useRef<Record<string, any>>({})

  // ── Acceso solo para administradores ──
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setAcceso('no'); return }
      const { data: perfil } = await supabase.from('perfiles').select('rol, es_admin').eq('id', session.user.id).maybeSingle()
      setAcceso(perfil && (CONFIG.ROLES_PERMITIDOS.includes(perfil.rol) || perfil.es_admin) ? 'si' : 'no')
    })()
  }, [])


  const cargar = useCallback(async (recargarFijos = false) => {
    const id = ++reqRef.current
    setCargando(true)
    setError(null)
    try {
      const ahoraCarga = new Date()
      const r = rangoMes(anio, mes)
      const p = mesAnterior(anio, mes)
      const enCurso = anio === ahoraCarga.getFullYear() && mes === ahoraCarga.getMonth() + 1
      const corte = enCurso ? corteEquivalente(p.anio, p.mes, ahoraCarga) : null
      const cache = recargarFijos ? null : (fijosRef.current || leerFijosCache())
      const [f, act, prev, hist] = await Promise.all([
        cache ? Promise.resolve(cache) : cargarFijos(new Date()),
        cargarPeriodo(r),
        cargarPeriodo(corte ? rangoMesHasta(p.anio, p.mes, corte) : rangoMes(p.anio, p.mes)),
        cargarHistorial(r),
      ])
      if (!cache) guardarFijosCache(f)

      // Pacientes: se pide solo lo necesario para cada uso (menos transferencia de datos)
      const conocidos = pacientesRef.current
      const limpio = (ids: any[], falta: (pac: any) => boolean) => [...new Set(ids.filter(Boolean))].filter(x => !conocidos[x] || falta(conocidos[x]))
      const lim = CONFIG.MAX_FILAS_LISTA
      const idsContacto = limpio([
        ...f.porCerrar.map(x => x.paciente_id),
        ...[...f.porCobrar].sort((a, b) => b.saldo - a.saldo).slice(0, lim).map(x => x.paciente_id),
        ...f.recontactar.slice(0, lim).map(x => x.paciente_id),
      ], pac => !('telefono' in pac))
      const idsNombre = limpio([...act.pagos, ...prev.pagos].map(x => x.paciente_id), pac => !('nombre' in pac))
        .filter(x => !idsContacto.includes(x))
      const idsLivianos = limpio([...act.atenciones, ...act.citas, ...prev.atenciones, ...prev.citas].map(x => x.paciente_id), () => false)
        .filter(x => !idsContacto.includes(x) && !idsNombre.includes(x))
      const [pc, pn, pl] = await Promise.all([
        cargarPacientes(idsContacto, 'completo'), cargarPacientes(idsNombre, 'nombre'), cargarPacientes(idsLivianos, 'liviano'),
      ])
      const nuevos = [...pl, ...pn, ...pc]
      if (id !== reqRef.current) return // llegó una respuesta de un mes que ya no está seleccionado
      const mapa = { ...pacientesRef.current }
      for (const pac of nuevos) mapa[pac.id] = { ...mapa[pac.id], ...pac }
      pacientesRef.current = mapa
      fijosRef.current = f
      setPacientes(mapa)
      setFijos(f)
      setActual(act)
      setPrevio(prev)
      setHistorial(hist)
      setCortePrevio(corte)
      setAhora(ahoraCarga)
    } catch (e) {
      if (id !== reqRef.current) return
      const msg = e instanceof Error ? e.message : 'No se pudieron cargar las métricas.'
      console.error('Error cargando panel de desempeño:', msg)
      setError(msg)
    } finally {
      if (id === reqRef.current) setCargando(false)
    }
  }, [anio, mes])

  useEffect(() => { if (acceso === 'si') cargar() }, [acceso, cargar])

  // ── Cálculos ──
  const m = useMemo(() => (actual && fijos ? calcularMetricas(actual, fijos, pacientes, filtroDoc, ahora) : null), [actual, fijos, pacientes, filtroDoc, ahora])
  const mp = useMemo(() => (previo && fijos ? calcularMetricas(previo, fijos, pacientes, filtroDoc, cortePrevio || ahora) : null), [previo, fijos, pacientes, filtroDoc, cortePrevio, ahora])
  const hist = useMemo(() => historialMensual(historial, anio, mes, filtroDoc, cortePrevio ? corteEquivalente(anio - 1, mes, ahora) : null),
    [historial, anio, mes, filtroDoc, cortePrevio, ahora])

  const profesionales = useMemo(() => (fijos?.profesionales || [])
    .filter(p => p.user_id)
    .sort((a, b) => Number(b.activo !== false) - Number(a.activo !== false) || nombreCompleto(a).localeCompare(nombreCompleto(b))), [fijos])
  const profFiltro = profesionales.find(p => p.user_id === filtroDoc) || null

  const rango = rangoMes(anio, mes)
  const esMesActual = anio === ahora.getFullYear() && mes === ahora.getMonth() + 1
  const esFuturo = new Date(anio, mes - 1, 1) > ahora
  const dh = diasHabiles(rango, ahora)
  const proyeccion = !m || esFuturo ? null : esMesActual ? (dh.transcurridos ? (m.dinero.recaudacion / dh.transcurridos) * dh.total : 0) : m.dinero.recaudacion

  const listas = useMemo(() => {
    if (!fijos) return { porCerrar: [], porCobrar: [], recontactar: [], totalPorCerrar: 0, totalPorCobrar: 0 }
    const delDoctor = (p: any) => !profFiltro || p.especialista_id === profFiltro.id
    const porCerrar = fijos.porCerrar.filter(delDoctor).sort((a, b) => Number(b.total) - Number(a.total))
    // Con filtro de doctor: solo el saldo de las prestaciones que realizó ese doctor
    const porCobrar = (filtroDoc
      ? fijos.porCobrar.map(p => ({ ...p, saldo: p.items.filter(i => i.profesional_id === filtroDoc).reduce((s, i) => s + i.saldo, 0) })).filter(p => p.saldo >= 1000)
      : fijos.porCobrar).sort((a, b) => b.saldo - a.saldo)
    const recontactar = fijos.recontactar
      .filter(x => !filtroDoc || x.profesional_id === filtroDoc)
      .filter(x => pacientes[x.paciente_id]?.activo !== false)
    return {
      porCerrar, porCobrar, recontactar,
      totalPorCerrar: porCerrar.reduce((s, p) => s + Number(p.total || 0), 0),
      totalPorCobrar: porCobrar.reduce((s, p) => s + p.saldo, 0),
    }
  }, [fijos, profFiltro, filtroDoc, pacientes])

  // Meta de ventas (siempre de toda la clínica)
  const ventaMeta = m ? (CONFIG.BASE_META_VENTAS === 'produccion' ? m.dinero.produccion : m.dinero.recaudacion) : 0
  const proyeccionMeta = !m || esFuturo ? null : esMesActual ? (dh.transcurridos ? (ventaMeta / dh.transcurridos) * dh.total : 0) : ventaMeta

  const decisiones = useMemo(() => (m ? generarDecisiones({
    m, prev: mp, esMesActual, hoy: ahora, metas: CONFIG.METAS_VENTAS, venta: ventaMeta, proyeccion: proyeccionMeta,
    diasHabilesRestantes: Math.max(0, dh.total - dh.transcurridos),
    porCerrar: { n: listas.porCerrar.length, monto: listas.totalPorCerrar },
    porCobrar: { n: listas.porCobrar.length, monto: listas.totalPorCobrar },
    recontactar: listas.recontactar.length,
    recaudacionAnioAnterior: hist.anioAnterior,
  }) : []), [m, mp, esMesActual, ahora, ventaMeta, proyeccionMeta, dh.total, dh.transcurridos, listas, hist.anioAnterior])

  const irA = (ancla: string) => {
    setShowDecisiones(false)
    setTimeout(() => document.getElementById(ancla)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const pendientes = decisiones.filter(x => x.nivel !== 'bien')
  const urgentes = decisiones.filter(x => x.nivel === 'urgente').length

  // ── Exportar a Excel (CSV) ──
  const exportar = () => {
    if (!m) return
    const fila = (label: string, v: number, p?: number) => [label, Math.round(v), p === undefined ? '' : Math.round(p)]
    const filas: (string | number)[][] = [
      ['Panel de desempeño', `${MESES_LARGOS[mes - 1]} ${anio}`, profFiltro ? nombreCompleto(profFiltro) : 'Toda la clínica'],
      [],
      ['Indicador', 'Mes', cortePrevio ? `Mes anterior al día ${cortePrevio.getDate()}` : 'Mes anterior'],
      fila('Recaudación', m.dinero.recaudacion, mp?.dinero.recaudacion),
      fila('Producción', m.dinero.produccion, mp?.dinero.produccion),
      fila('Honorarios doctores', m.dinero.honorarios, mp?.dinero.honorarios),
      fila('Costo laboratorio', m.dinero.lab, mp?.dinero.lab),
      fila('Margen clínica', m.dinero.margenClinica, mp?.dinero.margenClinica),
      fila('Egresos', m.dinero.egresos, mp?.dinero.egresos),
      fila('Utilidad estimada', m.dinero.utilidad, mp?.dinero.utilidad),
      fila('Ticket promedio', m.dinero.ticketPromedio, mp?.dinero.ticketPromedio),
      fila('Pacientes atendidos', m.pacientes.atendidos, mp?.pacientes.atendidos),
      fila('Pacientes nuevos', m.pacientes.nuevos, mp?.pacientes.nuevos),
      fila('Citas', m.agenda.citas, mp?.agenda.citas),
      ['Tasa de ausencia %', Math.round(m.agenda.tasaAusencia * 1000) / 10, mp ? Math.round(mp.agenda.tasaAusencia * 1000) / 10 : ''],
      ['Ocupación %', m.agenda.ocupacion === null ? '' : Math.round(m.agenda.ocupacion * 100), mp?.agenda.ocupacion == null ? '' : Math.round(mp.agenda.ocupacion * 100)],
      ['Conversión presupuestos %', Math.round(m.comercial.conversion * 100), mp ? Math.round(mp.comercial.conversion * 100) : ''],
      fila('Por cobrar (total)', listas.totalPorCobrar),
      fila('Presupuestos por cerrar (90 días)', listas.totalPorCerrar),
      [],
      ['Meta de ventas', 'Monto', 'Bono', 'Estado'],
      ...CONFIG.METAS_VENTAS.map((x, i) => [`Meta ${i + 1}`, x.monto, x.bono, ventaMeta >= x.monto ? 'Lograda' : `Faltan ${Math.round(x.monto - ventaMeta)}`]),
      [],
      ['Doctor', 'Producción', 'Honorarios', 'Laboratorio', 'Margen clínica', 'Pacientes', 'Ocupación %', 'Horas libres (pasadas)', 'Horas libres (quedan)', 'Valor hora', 'Ausencias', 'Espera (min)'],
      ...m.doctores.map(d => [d.nombre, Math.round(d.produccion), Math.round(d.honorarios), Math.round(d.lab), Math.round(d.clinica), d.pacientes,
        d.ocupacion === null ? '' : Math.round(d.ocupacion * 100), Math.round(d.minLibresPasados / 6) / 10, Math.round(d.minLibresFuturos / 6) / 10,
        d.valorHora === null ? '' : Math.round(d.valorHora), d.noAsiste, d.espera === null ? '' : Math.round(d.espera)]),
      [],
      ['Categoría', 'Ventas'], ...m.ventas.categorias.map(c => [c.name, Math.round(c.value)]),
      [],
      ['Tratamiento', 'Ventas', 'Cantidad'], ...m.ventas.tratamientos.map(t => [t.name, Math.round(t.value), t.cantidad]),
      [],
      ['Recomendación', 'Prioridad', 'Potencial estimado'], ...decisiones.map(d => [d.titulo, d.nivel, d.impacto ? Math.round(d.impacto) : '']),
    ]
    descargarCSV(`desempeno-${anio}-${String(mes).padStart(2, '0')}.csv`, filas)
  }

  // ── Estados de carga / acceso ──
  if (acceso === 'no') return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <Lock size={28} className="text-slate-300" />
      <p className="mt-3 text-sm font-bold text-slate-600">Este panel es solo para administradores.</p>
    </div>
  )
  if (!m) {
    if (error) return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <div className="max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-rose-500">No se pudo cargar el panel</p>
          <p className="mt-3 text-sm font-medium text-slate-600">{error}</p>
          <button onClick={() => cargar(true)} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700">Reintentar</button>
        </div>
      </div>
    )
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <PulseSpinner />
        <p className="text-xs uppercase tracking-widest font-bold mt-4">Analizando métricas de negocio…</p>
      </div>
    )
  }

  const d = m.dinero
  const a = m.agenda
  const pm = mesAnterior(anio, mes)
  const textoDelta = cortePrevio ? `vs. 1–${cortePrevio.getDate()} ${MESES[pm.mes - 1].toLowerCase()}` : `vs. ${MESES[pm.mes - 1].toLowerCase()}`
  const v = (actualV: number, prevV: number | undefined) => (mp ? variacion(actualV, prevV || 0) : null)
  const anios = Array.from({ length: hoy.getFullYear() - 2024 + 1 }, (_, i) => 2024 + i)
  const reparto = [
    { name: 'Honorarios médicos', value: d.honorarios },
    { name: 'Costo laboratorio', value: d.lab },
    { name: 'Margen clínica', value: d.margenClinica },
  ].filter(x => x.value > 0)
  const doctoresGrafico = m.doctores.filter(x => x.produccion > 0)

  const contactosPorCerrar: FilaContacto[] = listas.porCerrar.map(p => {
    const pac = pacientes[p.paciente_id]
    const trat = p.nombre_tratamiento || 'tratamiento'
    return {
      id: p.id, nombre: nombreCompleto(pac), monto: Number(p.total || 0), telefono: pac?.telefono,
      detalle: `${trat} · ${Math.max(0, Math.round((ahora.getTime() - new Date(p.created_at).getTime()) / 86400000))} días`,
      mensaje: `Hola ${pac?.nombre || ''}, te saludamos de Clínica Dignidad. Queríamos saber si tienes alguna duda sobre tu presupuesto de ${trat}. Tenemos facilidades de pago y podemos agendar tu primera sesión cuando te acomode. ¡Quedamos atentos!`,
    }
  })
  const contactosPorCobrar: FilaContacto[] = listas.porCobrar.slice(0, CONFIG.MAX_FILAS_LISTA).map(p => {
    const pac = pacientes[p.paciente_id]
    const trat = p.nombre_tratamiento || 'tu tratamiento'
    return {
      id: p.id, nombre: nombreCompleto(pac), monto: p.saldo, telefono: pac?.telefono,
      detalle: `${trat} · realizado ${money(p.realizado)}, pagado ${money(p.pagado)}`,
      mensaje: `Hola ${pac?.nombre || ''}, te saludamos de Clínica Dignidad. Te recordamos que ${trat} tiene un saldo pendiente de ${money(p.saldo)}. Puedes pagarlo en tu próxima visita o coordinar con nosotros por este medio. ¡Gracias!`,
    }
  })
  const contactosRecontactar: FilaContacto[] = listas.recontactar.slice(0, CONFIG.MAX_FILAS_LISTA).map(x => {
    const pac = pacientes[x.paciente_id]
    const meses = Math.round((ahora.getTime() - fechaLocal(x.ultima).getTime()) / (30 * 86400000))
    return {
      id: x.paciente_id, nombre: nombreCompleto(pac), telefono: pac?.telefono,
      detalle: `Última atención hace ${meses} meses`,
      mensaje: `Hola ${pac?.nombre || ''}, te saludamos de Clínica Dignidad. Ya pasaron unos meses desde tu última visita y es un buen momento para tu control y limpieza. ¿Te agendamos una hora?`,
    }
  })

  return (
    <TextoComparacion.Provider value={textoDelta}>
    <div className="w-full min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 space-y-10">

        {/* ── ENCABEZADO Y FILTROS ── */}
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-6 sm:p-8 shadow-sm">
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '18px 18px' }} />
          <div className="relative flex flex-col lg:flex-row justify-between lg:items-end gap-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck size={16} className="text-teal-400" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-400">Inteligencia de Negocio</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Desempeño Clínico</h1>
              <p className="text-xs text-slate-400 mt-1">
                {MESES_LARGOS[mes - 1]} {anio} · {profFiltro ? `Dr/a. ${nombreCompleto(profFiltro)}` : 'Toda la clínica'}
                {cortePrevio && <span className="ml-2 text-teal-300">· comparado con el 1–{cortePrevio.getDate()} de {MESES_LARGOS[pm.mes - 1].toLowerCase()} a la misma hora</span>}
                {cargando && <span className="ml-2 inline-flex items-center gap-1 text-teal-300"><RefreshCw size={11} className="animate-spin" /> actualizando…</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <select value={mes} onChange={e => setMes(Number(e.target.value))} className="bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-xs font-bold uppercase text-white outline-none cursor-pointer hover:bg-white/20">
                {MESES.map((x, i) => <option key={x} value={i + 1} className="text-slate-900">{x}</option>)}
              </select>
              <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer hover:bg-white/20">
                {anios.map(x => <option key={x} value={x} className="text-slate-900">{x}</option>)}
              </select>
              <select value={filtroDoc || ''} onChange={e => setFiltroDoc(e.target.value || null)} className="max-w-[200px] bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer hover:bg-white/20">
                <option value="" className="text-slate-900">Toda la clínica</option>
                {profesionales.map(p => <option key={p.user_id} value={p.user_id} className="text-slate-900">{nombreCompleto(p)}{p.activo === false ? ' (inactivo)' : ''}</option>)}
              </select>
              <button type="button" onClick={() => setShowDecisiones(true)}
                className="relative inline-flex items-center gap-2 rounded-lg bg-teal-500 px-3 py-2 text-xs font-black text-white hover:bg-teal-400 shadow-sm" title="Recomendaciones para aumentar los ingresos">
                <Lightbulb size={14} /> Qué hacer este mes
                {pendientes.length > 0 && <span className={`rounded-full px-1.5 text-[10px] ${urgentes ? 'bg-rose-500' : 'bg-white/25'}`}>{pendientes.length}</span>}
              </button>
              <button type="button" onClick={exportar} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20" title="Descargar resumen para Excel">
                <Download size={14} /> Exportar
              </button>
              <button type="button" onClick={() => setShowLegend(true)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20" title="Qué significa cada dato">
                <Info size={14} /> Leyenda
              </button>
            </div>
          </div>
          {error && <p className="relative mt-4 rounded-lg bg-rose-500/20 px-3 py-2 text-xs font-bold text-rose-200">No se pudo actualizar: {error}</p>}
        </div>

        <div className={`space-y-10 transition-opacity ${cargando ? 'opacity-60 pointer-events-none' : ''}`}>

          {/* ── 01 RESUMEN ── */}
          <Seccion id="resumen" numero={1} titulo="Resumen del mes" subtitulo="Lo esencial: cuánto entró, cuánto se produjo y cuánto le queda a la clínica.">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              <Kpi icon={Wallet} label="Recaudación" value={money(d.recaudacion)} delta={v(d.recaudacion, mp?.dinero.recaudacion)} accent="#0d9488"
                sub={d.saldoAFavorUsado > 0 ? `+ ${money(d.saldoAFavorUsado)} pagado con saldo a favor` : 'Dinero que entró (sin saldo a favor)'} />
              <Kpi icon={Stethoscope} label="Producción" value={money(d.produccion)} delta={v(d.produccion, mp?.dinero.produccion)} accent="#38bdf8"
                sub="Pagos de prestaciones + atenciones" />
              <Kpi icon={PieIcon} label="Margen clínica" value={money(d.margenClinica)} delta={v(d.margenClinica, mp?.dinero.margenClinica)} accent="#1e293b"
                sub={`${porcentaje(d.margenPct, 0)} de la producción`} />
              {m.filtrado ? (
                <Kpi icon={Users} label="Honorarios" value={money(d.honorarios)} delta={v(d.honorarios, mp?.dinero.honorarios)} accent="#7c3aed" sub="Estimado según su % de comisión" />
              ) : (
                <Kpi icon={TrendingUp} label="Utilidad estimada" value={money(d.utilidad)} delta={v(d.utilidad, mp?.dinero.utilidad)} accent="#059669"
                  valorClase={d.utilidad < 0 ? 'text-rose-600' : 'text-emerald-700'}
                  sub={CONFIG.HONORARIOS_INCLUIDOS_EN_EGRESOS ? 'Recaudación − laboratorio − egresos' : 'Recaudación − honorarios − laboratorio − egresos'} />
              )}
              <Kpi icon={DollarSign} label="Por cobrar" value={money(listas.totalPorCobrar)} accent="#b45309" sub={`Realizado y no pagado · ${listas.porCobrar.length} pacientes/planes`} />
            </div>

            {m.filtrado ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">La meta de ventas es de toda la clínica: quita el filtro de doctor para verla.</p>
            ) : (
              <MetaVentas venta={ventaMeta} proyeccion={proyeccionMeta} metas={CONFIG.METAS_VENTAS} esMesActual={esMesActual}
                diasRestantes={Math.max(0, dh.total - dh.transcurridos)}
                baseLabel={`${CONFIG.BASE_META_VENTAS === 'produccion' ? 'Producción' : 'Recaudación'} de ${MESES_LARGOS[mes - 1].toLowerCase()}${esMesActual && proyeccionMeta !== null ? ` · proyección al cierre ${money(proyeccionMeta)}` : ''}`} />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <Card className="lg:col-span-4 space-y-4">
                <SectionTitle icon={Target} label="Ritmo y comparación" />
                <div>
                  {esMesActual && proyeccion !== null && (
                    <MiniStat label="Proyección al cierre" value={money(proyeccion)} hint={`Ritmo de ${dh.transcurridos} de ${dh.total} días hábiles (lun–sáb)`} />
                  )}
                  {esMesActual && (
                    <MiniStat label="Promedio por día hábil" value={money(ratio(d.recaudacion, dh.transcurridos))} />
                  )}
                  <MiniStat label={cortePrevio ? `${MESES[pm.mes - 1]} al día ${cortePrevio.getDate()}` : `${MESES[pm.mes - 1]} ${pm.anio}`} value={money(mp?.dinero.recaudacion || 0)}
                    delta={v(d.recaudacion, mp?.dinero.recaudacion)} />
                  {cortePrevio && <MiniStat label={`${MESES[pm.mes - 1]} completo`} value={money(hist.mesAnteriorCompleto)} />}
                  <MiniStat label={`${MESES[mes - 1]} ${anio - 1}${cortePrevio ? ` al día ${cortePrevio.getDate()}` : ''}`} value={hist.anioAnterior ? money(hist.anioAnterior) : '—'}
                    delta={hist.anioAnterior ? variacion(d.recaudacion, hist.anioAnterior) : null} texto={`vs. ${anio - 1}`} />
                  <MiniStat label="Ticket promedio" value={money(d.ticketPromedio)} delta={v(d.ticketPromedio, mp?.dinero.ticketPromedio)} hint="Producción ÷ pacientes atendidos" />
                </div>
              </Card>

              <Card className="lg:col-span-8">
                <SectionTitle icon={Activity} label="Recaudación últimos 12 meses" />
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hist.serie}>
                      <defs>
                        <linearGradient id="gradHistorial" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} width={64} tickFormatter={(x: number) => moneyCorto(x)} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip formatter={(val: any) => [money(Number(val)), 'Recaudación']} contentStyle={TOOLTIP_STYLE} />
                      {!m.filtrado && CONFIG.BASE_META_VENTAS === 'recaudacion' && CONFIG.METAS_VENTAS.map((x, i) => (
                        <ReferenceLine key={x.monto} y={x.monto} stroke={['#f59e0b', '#f97316', '#e11d48'][i] || '#f59e0b'} strokeDasharray="4 4" ifOverflow="extendDomain"
                          label={{ value: `Meta ${i + 1}`, position: 'insideTopRight', fontSize: 9, fill: '#94a3b8' }} />
                      ))}
                      <Area type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={3} fill="url(#gradHistorial)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </Seccion>

          {/* ── 02 DINERO ── */}
          <Seccion id="dinero" numero={2} titulo="Dinero: de dónde viene y a dónde va" subtitulo="Medios de pago, reparto entre doctores, laboratorio y clínica, y gastos.">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {([['Efectivo', d.medios.efectivo], ['Tarjeta', d.medios.tarjeta], ['Transferencia', d.medios.transferencia], ['Otros', d.medios.otro]] as [string, number][])
                .filter(([label, val]) => label !== 'Otros' || val > 0)
                .map(([label, val]) => (
                  <div key={label} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
                    <p className="text-lg font-black text-slate-800 mt-1 tabular-nums">{money(val)}</p>
                    <p className="text-[10px] font-bold text-teal-600 mt-1">{porcentaje(ratio(val, d.recaudacion), 0)} del total</p>
                  </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="flex flex-col">
                <SectionTitle icon={PieIcon} label="Reparto de la producción" />
                {reparto.length === 0 ? <EmptyState text="Sin producción este mes." /> : (
                  <>
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={reparto} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value" stroke="none">
                            {reparto.map((x, i) => <Cell key={x.name} fill={COLORES_REPARTO[['Honorarios médicos', 'Costo laboratorio', 'Margen clínica'].indexOf(x.name)] || COLORES_REPARTO[i]} />)}
                          </Pie>
                          <Tooltip formatter={(val: any) => money(Number(val))} contentStyle={TOOLTIP_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 space-y-2">
                      {reparto.map(x => (
                        <div key={x.name} className="flex justify-between items-center text-xs font-bold text-slate-600">
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORES_REPARTO[['Honorarios médicos', 'Costo laboratorio', 'Margen clínica'].indexOf(x.name)] }} />
                            {x.name}
                          </span>
                          <span className="text-slate-800 tabular-nums">{money(x.value)} · {porcentaje(ratio(x.value, d.produccion), 0)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[10px] text-slate-400">Estimado con el % de comisión de cada doctor y el tipo de reparto de cada prestación.</p>
                  </>
                )}
              </Card>

              <Card>
                <SectionTitle icon={Package} label="Honorarios, laboratorio y saldo a favor" />
                <MiniStat label="Honorarios generados" value={money(d.honorarios)} delta={v(d.honorarios, mp?.dinero.honorarios)} invertido />
                <MiniStat label="…de tratamientos sin terminar" value={money(d.honorariosPendientesTerminar)} hint="Se pagan al doctor cuando termine el tratamiento" />
                <MiniStat label="Liquidaciones pagadas en el mes" value={money(d.liquidacionesPagadas)} />
                <MiniStat label="Cobrado en tratamientos con lab." value={money(d.ventaConLab)} />
                <MiniStat label="Costo laboratorio" value={money(d.lab)} delta={v(d.lab, mp?.dinero.lab)} invertido />
                {d.reembolsoLabDoctores > 0 && <MiniStat label="…pagado por doctores (a reembolsar)" value={money(d.reembolsoLabDoctores)} />}
                {d.anticipos > 0 && <MiniStat label="Ingresado a saldo a favor" value={`${money(d.anticipos)} (${d.anticiposN})`} hint="Entra a caja hoy; cuenta como producción cuando se usa en una prestación" />}
                {d.saldoAFavorUsado > 0 && <MiniStat label="Saldo a favor usado en prestaciones" value={money(d.saldoAFavorUsado)} />}
              </Card>

              <Card>
                <SectionTitle icon={FileText} label="Egresos y gastos" extra={<span className="text-base font-black text-rose-600 tabular-nums">{money(d.egresos)}</span>} />
                {m.filtrado ? <EmptyState text="Los gastos son de toda la clínica; quita el filtro de doctor para verlos." /> : (
                  <>
                    <BarList items={d.egresosPorCategoria} color="bg-rose-400" vacio="No hay egresos registrados este mes." />
                    {d.recaudacion > 0 && d.egresos > 0 && (
                      <p className="mt-4 text-[10px] text-slate-400">Los gastos equivalen al {porcentaje(ratio(d.egresos, d.recaudacion), 0)} de lo recaudado.</p>
                    )}
                  </>
                )}
              </Card>
            </div>

            {!m.filtrado && (
              <div id="cajas" className="scroll-mt-6">
                <Card>
                  <SectionTitle icon={Wallet} label="Conciliación de cajas"
                    extra={<span className={`text-sm font-black tabular-nums ${Math.abs(m.cajas.diferenciaTotal) < 1000 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {Math.abs(m.cajas.diferenciaTotal) < 1000 ? 'Todo cuadra' : `Diferencia ${money(m.cajas.diferenciaTotal)}`}
                    </span>} />
                  <p className="text-[11px] text-slate-500 mb-4">Lo declarado al cerrar (sin el fondo de apertura) comparado con los pagos registrados en esa caja.</p>
                  {m.cajas.conciliacion.length === 0 ? <EmptyState text="No hubo cajas este mes." /> : (
                    <div className="overflow-x-auto -mx-2">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                            <th className="px-2 py-2">Fecha</th><th className="px-2 py-2">Responsable</th>
                            <th className="px-2 py-2 text-right">Declarado</th><th className="px-2 py-2 text-right">Pagos registrados</th><th className="px-2 py-2 text-right">Diferencia</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {m.cajas.conciliacion.filter(c => c.diferencia === null || Math.abs(c.diferencia) >= 1000).map(c => (
                            <tr key={c.id}>
                              <td className="px-2 py-2 font-bold text-slate-700">{new Date(c.fecha).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                              <td className="px-2 py-2 text-slate-600">{c.responsable}</td>
                              <td className="px-2 py-2 text-right tabular-nums">{c.declarado === null ? <span className="text-amber-600 font-bold">Sin cerrar</span> : money(c.declarado)}</td>
                              <td className="px-2 py-2 text-right tabular-nums">{money(c.pagos)}</td>
                              <td className={`px-2 py-2 text-right font-black tabular-nums ${c.diferencia === null ? 'text-slate-300' : c.diferencia < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                                {c.diferencia === null ? '—' : `${c.diferencia > 0 ? '+' : ''}${money(c.diferencia)}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="px-2 pt-3 text-[10px] text-slate-400">
                        {m.cajas.conciliacion.filter(c => c.diferencia !== null && Math.abs(c.diferencia) < 1000).length} cajas cuadradas no se muestran.
                        {m.cajas.pagosFueraDeCaja > 0 && ` Pagos registrados sin caja: ${money(m.cajas.pagosFueraDeCaja)}.`}
                      </p>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </Seccion>

          {/* ── 03 DOCTORES ── */}
          <Seccion id="doctores" numero={3} titulo="Doctores" subtitulo="Producción, reparto y uso de agenda de cada profesional. Toca un doctor para ver solo sus números.">
            <Card>
              <SectionTitle icon={Stethoscope} label="Composición de la producción por doctor" />
              {doctoresGrafico.length === 0 ? <EmptyState text="Sin producción registrada este mes." /> : (
                <div className="w-full" style={{ height: 70 + doctoresGrafico.length * 44 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={doctoresGrafico} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis type="number" tickFormatter={(x: number) => moneyCorto(x)} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis dataKey="nombre" type="category" axisLine={false} tickLine={false} width={130} tick={{ fontSize: 10, fontWeight: 700, fill: '#334155' }} />
                      <Tooltip formatter={(val: any) => money(Number(val))} cursor={{ fill: '#f8fafc' }} contentStyle={TOOLTIP_STYLE} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '10px' }} />
                      <Bar dataKey="honorarios" name="Honorarios doctor" stackId="a" fill="#0d9488" maxBarSize={28} />
                      <Bar dataKey="lab" name="Laboratorio" stackId="a" fill="#b45309" maxBarSize={28} />
                      <Bar dataKey="clinica" name="Margen clínica" stackId="a" fill="#38bdf8" radius={[0, 4, 4, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card>
              <SectionTitle icon={Users} label="Comparación por doctor" extra={filtroDoc && (
                <button type="button" onClick={() => setFiltroDoc(null)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200"><X size={12} /> Quitar filtro</button>
              )} />
              {m.doctores.length === 0 ? <EmptyState text="Sin datos de doctores este mes." /> : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full min-w-[920px] text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                        <th className="px-2 py-2">Doctor</th>
                        <th className="px-2 py-2 text-right">Producción</th>
                        <th className="px-2 py-2 text-right">Honorarios</th>
                        <th className="px-2 py-2 text-right">Margen clínica</th>
                        <th className="px-2 py-2 text-right">Pacientes</th>
                        <th className="px-2 py-2 text-right" title="Horas agendadas ÷ horas disponibles">Ocupación</th>
                        <th className="px-2 py-2 text-right" title="Horas disponibles sin pacientes que todavía se pueden llenar">Libres (quedan)</th>
                        <th className="px-2 py-2 text-right" title="Producción por hora de sillón usada">Valor hora</th>
                        <th className="px-2 py-2 text-right">No asistió</th>
                        <th className="px-2 py-2 text-right">Espera</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {m.doctores.map(x => (
                        <tr key={x.userId} onClick={() => x.userId !== 'sin-asignar' && setFiltroDoc(filtroDoc === x.userId ? null : x.userId)}
                          className={`${x.userId !== 'sin-asignar' ? 'cursor-pointer hover:bg-slate-50' : ''} ${filtroDoc === x.userId ? 'bg-teal-50' : ''}`}>
                          <td className="px-2 py-2.5">
                            <p className="font-bold text-slate-800">{x.nombre}{!x.activo && <span className="ml-1 text-[10px] text-slate-400">(inactivo)</span>}</p>
                            <p className="text-[10px] text-slate-400">{x.especialidad}</p>
                          </td>
                          <td className="px-2 py-2.5 text-right font-black tabular-nums">{money(x.produccion)}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{money(x.honorarios)}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{money(x.clinica)}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{x.pacientes}</td>
                          <td className="px-2 py-2.5 text-right">
                            {x.ocupacion === null ? <span className="text-slate-300">—</span> : (
                              <span className={`font-black tabular-nums ${x.ocupacion < 0.6 ? 'text-rose-500' : x.ocupacion >= 0.9 ? 'text-emerald-600' : 'text-slate-700'}`}>{porcentaje(x.ocupacion, 0)}</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{x.minLibresFuturos > 0 ? horas(x.minLibresFuturos) : '—'}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{x.valorHora === null ? '—' : money(x.valorHora)}</td>
                          <td className={`px-2 py-2.5 text-right tabular-nums ${x.noAsiste > 0 ? 'text-rose-500 font-bold' : ''}`}>{x.noAsiste}{x.citasPasadas ? <span className="text-[10px] text-slate-400"> / {x.citasPasadas}</span> : null}</td>
                          <td className={`px-2 py-2.5 text-right tabular-nums ${x.espera !== null && x.espera > 15 ? 'text-amber-600 font-bold' : ''}`}>{x.espera === null ? '—' : `${Math.round(x.espera)} min`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </Seccion>

          {/* ── 04 VENTAS ── */}
          <Seccion id="ventas" numero={4} titulo="Qué se vende" subtitulo="Categorías, tratamientos y pacientes que más aportan.">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card><SectionTitle icon={Layers} label="Ventas por categoría" /><BarList items={m.ventas.categorias} /></Card>
              <Card>
                <SectionTitle icon={Activity} label="Tratamientos con más ingresos" />
                <BarList items={m.ventas.tratamientos.map(t => ({ name: limpiarNombrePrestacion(t.name), value: t.value, sub: `${t.cantidad} ${t.cantidad === 1 ? 'prestación' : 'prestaciones'}` }))} />
              </Card>
              <Card><SectionTitle icon={Stethoscope} label="Producción por especialidad" /><BarList items={m.ventas.especialidades} color="bg-sky-500" /></Card>
              <Card><SectionTitle icon={Users} label="Pacientes con mayor facturación" /><BarList items={m.ventas.topPacientes} color="bg-slate-700" /></Card>
            </div>
          </Seccion>

          {/* ── 05 COMERCIAL Y PACIENTES ── */}
          <Seccion id="comercial" numero={5} titulo="Ventas por cerrar y pacientes" subtitulo="Dónde está la plata que todavía no entra. Usa el botón de WhatsApp para contactar.">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <SectionTitle icon={FileText} label="Presupuestos del mes" />
                <MiniStat label="Creados" value={m.comercial.creados} delta={v(m.comercial.creados, mp?.comercial.creados)} />
                <MiniStat label="Aprobados o con abono" value={m.comercial.aprobados} delta={v(m.comercial.aprobados, mp?.comercial.aprobados)} />
                <MiniStat label="Conversión" value={porcentaje(m.comercial.conversion, 0)} negativo={m.comercial.creados >= 5 && m.comercial.conversion < 0.4} />
                <MiniStat label="Monto cotizado" value={money(m.comercial.montoCotizado)} />
                <MiniStat label="Monto aprobado" value={money(m.comercial.montoAprobado)} />
                <MiniStat label="Días hasta el primer pago" value={m.comercial.diasAprobacion === null ? '—' : `${Math.round(m.comercial.diasAprobacion * 10) / 10} días`} />
              </Card>
              <Card>
                <SectionTitle icon={AlertTriangle} label="Presupuestos por cerrar" extra={<span className="text-sm font-black text-amber-600 tabular-nums">{money(listas.totalPorCerrar)}</span>} />
                <p className="text-[11px] text-slate-500 mb-3">Últimos {CONFIG.DIAS_PRESUPUESTO_POR_CERRAR} días, desde {money(CONFIG.MONTO_MIN_POR_CERRAR)}, sin aprobar ni abonar (sin radiografías ni evaluaciones). Ordenados por valor.</p>
                <ListaContactos filas={contactosPorCerrar} vacio="No hay presupuestos pendientes." />
              </Card>
              <Card>
                <SectionTitle icon={DollarSign} label="Saldos por cobrar" extra={<span className="text-sm font-black text-amber-600 tabular-nums">{money(listas.totalPorCobrar)}</span>} />
                <p className="text-[11px] text-slate-500 mb-3">Prestaciones ya realizadas que no están pagadas completas. Lo planificado y no hecho no cuenta como deuda.</p>
                <ListaContactos filas={contactosPorCobrar} vacio="No hay saldos pendientes." />
              </Card>
            </div>

            <div id="pacientes" className="grid grid-cols-1 lg:grid-cols-3 gap-6 scroll-mt-6">
              <Card>
                <SectionTitle icon={UserPlus} label="Pacientes" />
                <MiniStat label="Atendidos" value={m.pacientes.atendidos} delta={v(m.pacientes.atendidos, mp?.pacientes.atendidos)} hint="Pacientes con atención o pago en el mes" />
                <MiniStat label="Fichas nuevas creadas" value={m.pacientes.nuevos} delta={v(m.pacientes.nuevos, mp?.pacientes.nuevos)} />
                <MiniStat label="Nuevos atendidos" value={m.pacientes.nuevosAtendidos} />
                <MiniStat label="Recurrentes" value={m.pacientes.recurrentes} />
                <MiniStat label="Tasa de retorno" value={porcentaje(m.pacientes.tasaRetorno, 0)} hint="Atendidos que ya eran pacientes antes de este mes" />
                <MiniStat label="Costo por paciente nuevo" value={m.pacientes.costoPorNuevo === null ? '—' : money(m.pacientes.costoPorNuevo)} hint="Egresos de Marketing ÷ fichas nuevas" />
              </Card>
              <Card className="lg:col-span-2">
                <SectionTitle icon={Users} label="Pacientes para recontactar" extra={<span className="text-sm font-black text-teal-700 tabular-nums">{listas.recontactar.length}</span>} />
                <p className="text-[11px] text-slate-500 mb-3">
                  Atendidos hace {CONFIG.MESES_INACTIVO_DESDE}–{CONFIG.MESES_INACTIVO_HASTA} meses, sin cita agendada desde entonces. Los más recientes primero (más fáciles de recuperar).
                </p>
                <ListaContactos filas={contactosRecontactar} vacio="No hay pacientes inactivos en ese rango." total={contactosRecontactar.length} />
              </Card>
            </div>
          </Seccion>

          {/* ── 06 AGENDA ── */}
          <Seccion id="agenda" numero={6} titulo="Agenda y operación" subtitulo="Uso del tiempo de sillón, ausencias y espera.">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <SectionTitle icon={Clock} label="Rendimiento de agenda" />
                <MiniStat label="Ocupación" value={a.ocupacion === null ? '—' : porcentaje(a.ocupacion, 0)} delta={mp?.agenda.ocupacion != null && a.ocupacion !== null ? variacion(a.ocupacion, mp.agenda.ocupacion) : null}
                  hint="Horas agendadas ÷ horas disponibles (disponibilidad − bloqueos)" />
                <MiniStat label="Horas libres sin usar" value={horas(a.minLibresPasados)} negativo={a.minLibresPasados > 0} hint="Días que ya pasaron" />
                {a.minLibresFuturos > 0 && <MiniStat label="Horas libres que quedan" value={horas(a.minLibresFuturos)} hint="Desde hoy hasta fin de mes" />}
                <MiniStat label="Valor de una hora de sillón" value={a.valorHora === null ? '—' : money(a.valorHora)} />
                <MiniStat label={cortePrevio ? 'Citas a la fecha' : 'Citas'} value={a.citas} delta={v(a.citas, mp?.agenda.citas)} />
                {a.citasFuturas > 0 && <MiniStat label="Citas agendadas que quedan" value={a.citasFuturas} />}
                <MiniStat label="No asistieron" value={`${a.noAsiste} (${porcentaje(a.tasaAusencia)})`} negativo={a.tasaAusencia >= 0.08}
                  delta={mp ? variacion(a.tasaAusencia, mp.agenda.tasaAusencia) : null} invertido />
                <MiniStat label="Horas perdidas por ausencias" value={horas(a.minPerdidosAusencia)} negativo={a.minPerdidosAusencia > 0} />
                <MiniStat label="Anuladas" value={`${a.canceladas} (${porcentaje(a.tasaCancelacion)})`} />
                <MiniStat label="Espera promedio" value={a.espera === null ? '—' : `${Math.round(a.espera)} min`} negativo={a.espera !== null && a.espera > 15} />
                <MiniStat label="Citas por la web" value={`${a.citasWeb} (${porcentaje(ratio(a.citasWeb, a.citas), 0)})`} />
                {a.webPendientes > 0 && <MiniStat label="Citas web sin confirmar" value={a.webPendientes} negativo />}
              </Card>
              <Card className="lg:col-span-2 space-y-8">
                <div>
                  <SectionTitle icon={Clock} label="Demanda por hora" />
                  {a.demandaPorHora.length === 0 ? <EmptyState text="Sin citas este mes." /> : (
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={a.demandaPorHora}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                          <YAxis axisLine={false} tickLine={false} width={30} allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <Tooltip formatter={(val: any) => [val, 'Citas']} cursor={{ fill: '#f8fafc' }} contentStyle={TOOLTIP_STYLE} />
                          <Bar dataKey="value" fill="#0d9488" radius={[4, 4, 0, 0]} maxBarSize={36} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div><SectionTitle icon={Calendar} label="Citas por día de la semana" /><BarList items={a.citasPorDia} formato="count" color="bg-sky-500" /></div>
                  <div><SectionTitle icon={TrendingUp} label="Producción por día de la semana" /><BarList items={m.ventas.produccionPorDia} /></div>
                </div>
              </Card>
            </div>
          </Seccion>
        </div>
      </div>

      {/* ── QUÉ HACER ESTE MES (modal) ── */}
      <Modal abierto={showDecisiones} onCerrar={() => setShowDecisiones(false)}>
        <PanelDecisiones key={`${anio}-${mes}-${filtroDoc}`} decisiones={decisiones} onIr={irA} onCerrar={() => setShowDecisiones(false)} />
      </Modal>

      {/* ── LEYENDA ── */}
      {showLegend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="leyenda-panel" onClick={() => setShowLegend(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 id="leyenda-panel" className="text-lg font-black text-slate-900">Leyenda del panel</h2>
                <p className="mt-1 text-xs text-slate-500">Qué significa cada indicador y de dónde sale.</p>
              </div>
              <button type="button" onClick={() => setShowLegend(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar leyenda"><X size={18} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <LegendItem title="Recaudación" text="Todos los pagos vigentes del mes (efectivo, tarjeta, transferencia), incluidos los ingresos a saldo a favor. No incluye el fondo de apertura de caja ni lo pagado usando saldo a favor (ese dinero ya se contó cuando entró)." />
              <LegendItem title="Producción" text="Pagos asociados a prestaciones más atenciones realizadas. Es lo que generaron los doctores, aunque se haya pagado con saldo a favor." />
              <LegendItem title="Honorarios" text="Parte del doctor según su % de comisión o el reparto de la prestación (100% doctor, 100% clínica o % forzado), calculada sobre lo pagado menos laboratorio." />
              <LegendItem title="Margen clínica" text="Producción − honorarios − laboratorio." />
              <LegendItem title="Utilidad estimada" text={CONFIG.HONORARIOS_INCLUIDOS_EN_EGRESOS ? 'Recaudación − laboratorio − egresos (los honorarios ya están en egresos).' : 'Recaudación − honorarios − laboratorio − egresos.'} />
              <LegendItem title="Por cobrar" text="Prestaciones ya realizadas (o con avance) cuyo precio pactado no está pagado completo. Mismo cálculo que la 'deuda realizada' de la ficha de tratamiento." />
              <LegendItem title="Proyección" text="Recaudación dividida por los días hábiles transcurridos (lunes a sábado), multiplicada por los días hábiles del mes." />
              <LegendItem title="Conciliación de cajas" text="Monto de cierre menos fondo de apertura, comparado con los pagos registrados en esa caja. Una diferencia indica cobros sin registrar o errores de cierre." />
              <LegendItem title="Comparaciones" text="En el mes en curso, todo se compara con el mes anterior cortado en el mismo día y hora (ej. 1–8 de octubre vs. 1–8 de septiembre). En meses cerrados, mes completo vs. mes completo." />
              <LegendItem title="Ocupación" text="Minutos agendados ÷ minutos disponibles (disponibilidad − bloqueos) de los días ya transcurridos. No cuenta citas anuladas ni citas web sin confirmar." />
              <LegendItem title="Valor de una hora de sillón" text="Producción ÷ horas agendadas ya transcurridas (sin contar ausencias). Sirve para estimar cuánto vale llenar una hora libre." />
              <LegendItem title="Tasa de ausencia" text="Citas marcadas como 'No asistió' ÷ citas que ya debían ocurrir (sin anuladas)." />
              <LegendItem title="Conversión" text="Presupuestos creados en el mes que ya fueron aprobados o tienen abonos." />
              <LegendItem title="Presupuestos por cerrar" text={`Presupuestos de los últimos ${CONFIG.DIAS_PRESUPUESTO_POR_CERRAR} días sin aprobar ni abonar.`} />
              <LegendItem title="Pacientes para recontactar" text={`Atendidos hace ${CONFIG.MESES_INACTIVO_DESDE} a ${CONFIG.MESES_INACTIVO_HASTA} meses sin ninguna cita posterior.`} />
              <LegendItem title="Tasa de retorno" text="Pacientes atendidos este mes cuya ficha se creó antes del mes." />
              <LegendItem title="Qué hacer este mes" text="Recomendaciones automáticas. El potencial es una estimación para priorizar, no una promesa." />
            </div>
          </div>
        </div>
      )}
    </div>
    </TextoComparacion.Provider>
  )
}


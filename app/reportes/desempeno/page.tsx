'use client'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { RUTA_SIN_PERMISO } from '@/lib/permisos'
import { Download, Info, Layers, Lock, Package, RefreshCw, ScanLine, ShieldCheck, Wallet, X } from 'lucide-react'
import { calcularRecibido, cargarProfesionales, cargarRecibido, exportarRecibido, type DatosRecibido } from './_lib/recibido'
import {
  CONFIG, MESES, MESES_LARGOS, corteEquivalente, mesAnterior, money, nombreCompleto, porcentaje, rangoMes, rangoMesHasta, ratio, variacion,
} from './_lib/util'
import { Kpi, LegendItem, PulseSpinner, TextoComparacion } from './_components/ui'

const COLOR = { total: '#0d9488', lab: '#b45309', rx: '#6366f1', resto: '#94a3b8' }

export default function PanelDesempenoNegocio() {
  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [filtroDoc, setFiltroDoc] = useState<string | null>(null)
  const [showLegend, setShowLegend] = useState(false)

  const [acceso, setAcceso] = useState<'verificando' | 'si' | 'no'>('verificando')
  const [profesionalesTodos, setProfesionales] = useState<any[]>([])
  const [actual, setActual] = useState<DatosRecibido | null>(null)
  const [previo, setPrevio] = useState<DatosRecibido | null>(null)
  // Mes en curso: el mes anterior se corta en el mismo día y hora para comparar lo comparable
  const [cortePrevio, setCortePrevio] = useState<Date | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)

  const reqRef = useRef(0)
  const profRef = useRef<any[] | null>(null)

  // ── Acceso solo para administradores (sin permiso: a la agenda) ──
  const router = useRouter()
  useEffect(() => { if (acceso === 'no') router.replace(RUTA_SIN_PERMISO) }, [acceso, router])
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setAcceso('no'); return }
      const { data: perfil } = await supabase.from('perfiles').select('rol, es_admin').eq('id', session.user.id).maybeSingle()
      setAcceso(perfil && (CONFIG.ROLES_PERMITIDOS.includes(perfil.rol) || perfil.es_admin) ? 'si' : 'no')
    })()
  }, [])

  // Solo se traen los pagos del mes (y del mes anterior para comparar): es lo único que muestra el panel
  const cargar = useCallback(async () => {
    const id = ++reqRef.current
    setCargando(true)
    setError(null)
    try {
      const ahora = new Date()
      const p = mesAnterior(anio, mes)
      const enCurso = anio === ahora.getFullYear() && mes === ahora.getMonth() + 1
      const corte = enCurso ? corteEquivalente(p.anio, p.mes, ahora) : null
      const [prof, act, prev] = await Promise.all([
        profRef.current ? Promise.resolve(profRef.current) : cargarProfesionales(),
        cargarRecibido(rangoMes(anio, mes)),
        cargarRecibido(corte ? rangoMesHasta(p.anio, p.mes, corte) : rangoMes(p.anio, p.mes)),
      ])
      if (id !== reqRef.current) return // llegó una respuesta de un mes que ya no está seleccionado
      profRef.current = prof
      setProfesionales(prof)
      setActual(act)
      setPrevio(prev)
      setCortePrevio(corte)
    } catch (e) {
      if (id !== reqRef.current) return
      const msg = e instanceof Error ? e.message : 'No se pudieron cargar los datos.'
      console.error('Error cargando panel de desempeño:', msg)
      setError(msg)
    } finally {
      if (id === reqRef.current) setCargando(false)
    }
  }, [anio, mes])

  useEffect(() => { if (acceso === 'si') cargar() }, [acceso, cargar])

  // ── Cálculos ──
  const m = useMemo(() => (actual ? calcularRecibido(actual, filtroDoc) : null), [actual, filtroDoc])
  const mp = useMemo(() => (previo ? calcularRecibido(previo, filtroDoc) : null), [previo, filtroDoc])

  const profesionales = useMemo(() => profesionalesTodos
    .filter(p => p.user_id)
    .sort((a, b) => Number(b.activo !== false) - Number(a.activo !== false) || nombreCompleto(a).localeCompare(nombreCompleto(b))), [profesionalesTodos])
  const profFiltro = profesionales.find(p => p.user_id === filtroDoc) || null
  const pm = mesAnterior(anio, mes)

  // ── Exportar a Excel (resumen + detalle de lo recibido, laboratorio y RX) ──
  const exportar = async () => {
    if (!m || exportando) return
    setExportando(true)
    try {
      await exportarRecibido({
        nombreArchivo: `desempeno-${anio}-${String(mes).padStart(2, '0')}${profFiltro ? `-${nombreCompleto(profFiltro).replace(/\s+/g, '_')}` : ''}.xlsx`,
        titulo: `Dinero recibido ${MESES_LARGOS[mes - 1]} ${anio} · ${profFiltro ? nombreCompleto(profFiltro) : 'Toda la clínica'}`,
        columnaActual: `${MESES_LARGOS[mes - 1]} ${anio}`,
        columnaPrevia: cortePrevio ? `${MESES_LARGOS[pm.mes - 1]} al día ${cortePrevio.getDate()}` : `${MESES_LARGOS[pm.mes - 1]} ${pm.anio}`,
        actual: m, previo: mp, profesionales,
      })
    } catch (e) {
      console.error(e)
      alert('No se pudo generar el Excel.')
    } finally {
      setExportando(false)
    }
  }

  // ── Estados de carga / acceso ──
  if (acceso === 'no') return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50">
      <Lock size={28} className="text-slate-300" />
    </div>
  )
  if (!m) {
    if (error) return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <div className="max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-rose-500">No se pudo cargar el panel</p>
          <p className="mt-3 text-sm font-medium text-slate-600">{error}</p>
          <button onClick={() => cargar()} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700">Reintentar</button>
        </div>
      </div>
    )
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <PulseSpinner />
        <p className="text-xs uppercase tracking-widest font-bold mt-4">Cargando…</p>
      </div>
    )
  }

  const textoDelta = cortePrevio ? `vs. 1–${cortePrevio.getDate()} ${MESES[pm.mes - 1].toLowerCase()}` : `vs. ${MESES[pm.mes - 1].toLowerCase()}`
  const v = (actualV: number, prevV: number | undefined) => (mp ? variacion(actualV, prevV || 0) : null)
  const deLoRecibido = (x: number) => `${porcentaje(ratio(x, m.total), 0)} de lo recibido`
  const anios = Array.from({ length: hoy.getFullYear() - 2024 + 1 }, (_, i) => 2024 + i)
  const partes = [
    { label: 'Laboratorio', valor: m.lab, color: COLOR.lab },
    { label: 'RX', valor: m.rx, color: COLOR.rx },
    { label: 'Resto', valor: m.resto, color: COLOR.resto },
  ]

  return (
    <TextoComparacion.Provider value={textoDelta}>
    <div className="w-full min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">

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
              <button type="button" onClick={exportar} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20" title="Descargar Excel: resumen y detalle de lo recibido, laboratorio y RX">
                {exportando ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />} {exportando ? 'Generando…' : 'Excel'}
              </button>
              <button type="button" onClick={() => setShowLegend(true)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20" title="Qué significa cada dato">
                <Info size={14} /> Leyenda
              </button>
            </div>
          </div>
          {error && <p className="relative mt-4 rounded-lg bg-rose-500/20 px-3 py-2 text-xs font-bold text-rose-200">No se pudo actualizar: {error}</p>}
        </div>

        {/* ── DINERO RECIBIDO Y SU REPARTO ── */}
        <div className={`space-y-4 transition-opacity ${cargando ? 'opacity-60 pointer-events-none' : ''}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Kpi icon={Wallet} label="Dinero recibido" value={money(m.total)} delta={v(m.total, mp?.total)} accent={COLOR.total}
              sub="Lo que entró a caja en el mes (efectivo, tarjeta, transferencia)" />
            <Kpi icon={Package} label="Para laboratorio" value={money(m.lab)} delta={v(m.lab, mp?.lab)} invertido accent={COLOR.lab}
              sub={m.ventaConLab > 0 ? `${deLoRecibido(m.lab)} · costo de lab. de ${money(m.ventaConLab)} cobrados en trabajos con laboratorio` : 'Sin trabajos de laboratorio cobrados'} />
            <Kpi icon={ScanLine} label="Radiografías (RX)" value={money(m.rx)} delta={v(m.rx, mp?.rx)} accent={COLOR.rx}
              sub={`${m.rxN} RX · ${deLoRecibido(m.rx)}`} />
            <Kpi icon={Layers} label="Resto" value={money(m.resto)} delta={v(m.resto, mp?.resto)} accent="#475569"
              sub={`${deLoRecibido(m.resto)} · otros tratamientos${m.abonosSaldo > 0 ? ` y ${money(m.abonosSaldo)} abonados a saldo a favor` : ''}`} />
          </div>

          {m.total > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                {partes.map(x => (
                  <div key={x.label} style={{ width: `${Math.max(0, ratio(x.valor, m.total) * 100)}%`, backgroundColor: x.color }} title={`${x.label}: ${money(x.valor)}`} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-slate-600 tabular-nums">
                {partes.map((x, i) => (
                  <Fragment key={x.label}>
                    {i > 0 && <span className="text-slate-300">+</span>}
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: x.color }} /> {x.label} {money(x.valor)}
                    </span>
                  </Fragment>
                ))}
                <span className="text-slate-300">=</span>
                <span className="font-black text-slate-900">Dinero recibido {money(m.total)}</span>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">No hay pagos registrados en este mes.</p>
          )}
        </div>
      </div>

      {/* ── LEYENDA ── */}
      {showLegend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="leyenda-panel" onClick={() => setShowLegend(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 id="leyenda-panel" className="text-lg font-black text-slate-900">Leyenda del panel</h2>
                <p className="mt-1 text-xs text-slate-500">Laboratorio + RX + Resto = Dinero recibido.</p>
              </div>
              <button type="button" onClick={() => setShowLegend(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar leyenda"><X size={18} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <LegendItem title="Dinero recibido" text="Todos los pagos vigentes del mes (efectivo, tarjeta, transferencia), incluidos los abonos a saldo a favor. No cuenta lo pagado usando saldo a favor: ese dinero ya se contó el día que el paciente lo abonó." />
              <LegendItem title="Para laboratorio" text="Parte de lo recibido que corresponde al costo de laboratorio, proporcional a lo pagado: si se paga el 50% de la prestación, se cuenta el 50% de su costo de laboratorio." />
              <LegendItem title="Radiografías (RX)" text="Parte de lo recibido que se pagó en prestaciones de la carpeta RADIOGRAFIAS. Las promociones que incluyen una RX (ej. limpieza + bite wing) no se cuentan aquí." />
              <LegendItem title="Resto" text="Todo lo demás: Dinero recibido − laboratorio − RX. Son los demás tratamientos y los abonos a saldo a favor que todavía no se usan." />
              <LegendItem title="Comparaciones" text="En el mes en curso se compara con el mes anterior cortado en el mismo día y hora (ej. 1–14 de octubre vs. 1–14 de septiembre). En meses cerrados, mes completo vs. mes completo." />
              <LegendItem title="Filtro por doctor" text="Muestra solo los pagos asignados a ese doctor (el doctor del pago o, si no tiene, el de la prestación)." />
            </div>
          </div>
        </div>
      )}
    </div>
    </TextoComparacion.Provider>
  )
}

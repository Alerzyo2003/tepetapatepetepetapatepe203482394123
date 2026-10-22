'use client'
// Evaluaciones de implantes: todas las evaluaciones del período, en qué quedó cada paciente y acciones de seguimiento
// (WhatsApp, agendar, anotar resultado). Está en Mi menú; usa las reglas e historial de contactos del Panel de Seguimiento.
// Qué cuenta como evaluación se ajusta en app/seguimiento/_lib/config.ts → EVAL_IMPLANTES.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, Anchor, CheckCircle2, Download, Info, Loader2, MessageCircle, RefreshCcw, Search, Send, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { RUTA_SIN_PERMISO } from '@/lib/permisos'
import { descargarXlsx } from '@/app/reportes/desempeno/_lib/xlsx'
import { CONFIG } from '@/app/seguimiento/_lib/config'
import { borrarContacto, cargarContactos, cargarPacientes, registrarContacto } from '@/app/seguimiento/_lib/datos'
import { contactoVigente, fechaVolver, indexarContactos, textoResultado, ultimoContacto, type Contacto } from '@/app/seguimiento/_lib/contactos'
import { ETAPAS_EVAL, LISTA_EVAL, aOportunidad, cargarEvaluaciones, etapaEval, type DatosEval, type EtapaEval, type FilaEval } from '@/app/seguimiento/_lib/evalImplantes'
import type { Oportunidad } from '@/app/seguimiento/_lib/reglas'
import { abrirWhatsApp, fechaConHora, fechaISO, money, nombrePaciente, normalizar, sumarMeses, telefonoWA } from '@/app/seguimiento/_lib/util'
import Fila, { CLASE_TONO } from '@/app/seguimiento/_components/Fila'
import ModalResultado from '@/app/seguimiento/_components/ModalResultado'

const PERIODOS = [
  { id: '1', texto: 'Último mes', meses: 1 },
  { id: '3', texto: '3 meses', meses: 3 },
  { id: '6', texto: '6 meses', meses: 6 },
  { id: '12', texto: '12 meses', meses: 12 },
  { id: 'todo', texto: 'Todo', meses: null },
] as const
type Periodo = typeof PERIODOS[number]['id']
type FiltroEtapa = 'seguir' | 'todas' | EtapaEval
type Orden = 'prioridad' | 'reciente' | 'monto' | 'nombre'

const moneyCorto = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M` : v >= 10_000 ? `$${Math.round(v / 1000)}k` : money(v)

export default function EvaluacionesImplantesPage() {
  const router = useRouter()
  const [acceso, setAcceso] = useState<'cargando' | 'si' | 'no'>('cargando')
  const [usuario, setUsuario] = useState<{ id: string; rol: string } | null>(null)

  const [periodo, setPeriodo] = useState<Periodo>(String(CONFIG.EVAL_IMPLANTES.mesesPorDefecto) as Periodo)
  const [ahora, setAhora] = useState(() => new Date())
  const [datos, setDatos] = useState<DatosEval | null>(null)
  const [contactos, setContactos] = useState<Contacto[] | null>(null)
  const [usuarios, setUsuarios] = useState<Record<string, string>>({})
  const [pacientes, setPacientes] = useState<Record<string, any>>({})
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqRef = useRef(0)

  const [etapa, setEtapa] = useState<FiltroEtapa>('seguir')
  const [busqueda, setBusqueda] = useState('')
  const [doctor, setDoctor] = useState('')
  const [orden, setOrden] = useState<Orden>('prioridad')
  const [ocultarContactados, setOcultarContactados] = useState(true)
  const [mostrar, setMostrar] = useState(CONFIG.FILAS_POR_PAGINA)
  const [locales, setLocales] = useState<Record<string, 'enviado' | 'fallido'>>({})
  const [enCurso, setEnCurso] = useState<Oportunidad | null>(null)
  const [paraResultado, setParaResultado] = useState<Oportunidad | null>(null)

  useEffect(() => { if (acceso === 'no') router.replace(RUTA_SIN_PERMISO) }, [acceso, router])
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setAcceso('no'); return }
      const { data: perfil } = await supabase.from('perfiles').select('rol, es_admin').eq('id', session.user.id).maybeSingle()
      setUsuario({ id: session.user.id, rol: perfil?.rol || '' })
      setAcceso(perfil && (CONFIG.ROLES_PERMITIDOS.includes(perfil.rol) || perfil.es_admin) ? 'si' : 'no')
    })()
  }, [])

  const cargar = useCallback(async () => {
    const req = ++reqRef.current
    const momento = new Date()
    const meses = PERIODOS.find(p => p.id === periodo)?.meses ?? null
    setCargando(true); setError(null)
    try {
      const [d, c] = await Promise.all([
        cargarEvaluaciones(meses ? sumarMeses(momento, -meses) : null, momento),
        cargarContactos(momento),
      ])
      if (req !== reqRef.current) return
      const fichas = await cargarPacientes(d.filas.map(f => f.pacienteId))
      if (req !== reqRef.current) return
      setAhora(momento); setDatos(d); setContactos(c); setPacientes(prev => ({ ...prev, ...fichas }))
      if (d.errores.length) toast.warning('Parte de la información no se pudo cargar', { description: d.errores.join(' · ') })
    } catch (e: any) {
      if (req === reqRef.current) setError(e?.message || 'No se pudieron cargar las evaluaciones')
    } finally {
      if (req === reqRef.current) setCargando(false)
    }
  }, [periodo])

  useEffect(() => { if (acceso === 'si') cargar() }, [acceso, cargar])
  useEffect(() => { setMostrar(CONFIG.FILAS_POR_PAGINA) }, [etapa, busqueda, doctor, orden, ocultarContactados, periodo])
  // Nombres de quien anotó cada contacto (si el permiso lo permite)
  useEffect(() => {
    if (acceso !== 'si') return
    supabase.from('perfiles').select('id, nombre_completo').then(({ data }) => {
      if (data) setUsuarios(Object.fromEntries(data.map((u: any) => [u.id, u.nombre_completo || ''])))
    })
  }, [acceso])

  // ── Filas ──
  const porPaciente = useMemo(() => indexarContactos(contactos), [contactos])
  const hoyISO = fechaISO(ahora)
  const profPorUser = useMemo(() => new Map((datos?.profesionales || []).filter(p => p.user_id).map(p => [p.user_id, p])), [datos])
  const doctoresActivos = useMemo(() => (datos?.profesionales || []).filter(p => p.activo !== false && p.user_id)
    .sort((a, b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`)), [datos])
  const nombreDoctor = useCallback((ids: string[]) => {
    const p = ids.map(id => profPorUser.get(id)).find(Boolean)
    return p ? `Dr(a). ${String(p.nombre || '').split(' ')[0]} ${String(p.apellido || '').split(' ')[0]}`.trim() : ''
  }, [profPorUser])
  const nombreUsuario = useCallback((id: string | null) => String((id && usuarios[id]) || '').split(' ').slice(0, 2).join(' '), [usuarios])

  const todas = useMemo(() => (datos?.filas || []).map(f => ({ f, o: aOportunidad(f, ahora) })), [datos, ahora])

  // Doctor y búsqueda (sirven para los indicadores y los contadores)
  const base = useMemo(() => {
    const termino = normalizar(busqueda)
    const digitos = busqueda.replace(/\D/g, '')
    return todas.filter(({ o }) => {
      const p = pacientes[o.pacienteId]
      if (p === null || p?.activo === false) return false // ficha borrada o paciente deshabilitado
      if (doctor && !o.doctores.includes(doctor)) return false
      if (termino) {
        const texto = normalizar(`${p?.nombre || ''} ${p?.apellido || ''} ${p?.rut || ''}`)
        const numeros = `${String(p?.rut || '').replace(/\D/g, '')} ${String(p?.telefono || '').replace(/\D/g, '')}`
        if (!texto.includes(termino) && !(digitos.length >= 4 && numeros.includes(digitos))) return false
      }
      return true
    })
  }, [todas, pacientes, doctor, busqueda])

  const contactado = useCallback((o: Oportunidad) => contactos !== null && !!contactoVigente(LISTA_EVAL, porPaciente.get(o.pacienteId), hoyISO), [contactos, porPaciente, hoyISO])
  const sinContactados = useMemo(() => base.filter(({ o }) => !(ocultarContactados && contactado(o))), [base, ocultarContactados, contactado])
  const enEtapa = (e: FiltroEtapa, f: FilaEval) => e === 'todas' || (e === 'seguir' ? etapaEval(f.etapa).seguir : f.etapa === e)
  const cuenta = (e: FiltroEtapa) => sinContactados.filter(({ f }) => enEtapa(e, f)).length
  const ocultosContactados = base.filter(({ f, o }) => enEtapa(etapa, f) && contactado(o)).length

  const filas = useMemo(() => {
    const nombre = (o: Oportunidad) => nombrePaciente(pacientes[o.pacienteId])
    return sinContactados.filter(({ f }) => enEtapa(etapa, f))
      .sort((a, b) =>
        orden === 'reciente' ? b.f.principal.fecha.getTime() - a.f.principal.fecha.getTime()
          : orden === 'monto' ? b.o.monto - a.o.monto || b.o.prioridad - a.o.prioridad
            : orden === 'nombre' ? nombre(a.o).localeCompare(nombre(b.o))
              : b.o.prioridad - a.o.prioridad || b.f.principal.fecha.getTime() - a.f.principal.fecha.getTime())
      .sort((a, b) => (locales[a.o.clave] === 'enviado' ? 1 : 0) - (locales[b.o.clave] === 'enviado' ? 1 : 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinContactados, etapa, orden, pacientes, locales])
  const visibles = filas.slice(0, mostrar)
  const siguiente = filas.find(({ o }) => !locales[o.clave] && telefonoWA(pacientes[o.pacienteId]?.telefono))

  // ── Indicadores (todas las etapas, con el filtro de doctor y búsqueda) ──
  const n = (e: EtapaEval) => base.filter(x => x.f.etapa === e).length
  const evaluados = base.filter(x => x.f.eventos.some(ev => ev.estado === 'vino')).length
  const cerraron = n('cerrado') + n('en_tratamiento')
  const montoPresupuestado = base.filter(x => x.f.etapa === 'presupuestado').reduce((s, x) => s + x.f.presupuesto, 0)
  const kpis: { id: FiltroEtapa; titulo: string; valor: string; sub: string; color: string }[] = [
    { id: 'todas', titulo: 'Pacientes evaluados', valor: String(evaluados), sub: `${base.length} con evaluación registrada`, color: 'text-slate-800' },
    { id: 'sin_presupuesto', titulo: 'Sin presupuesto', valor: String(n('sin_presupuesto')), sub: 'se evaluaron y no tienen presupuesto', color: 'text-rose-600' },
    { id: 'presupuestado', titulo: 'Presupuesto sin cerrar', valor: moneyCorto(montoPresupuestado), sub: `${n('presupuestado')} ${n('presupuestado') === 1 ? 'paciente' : 'pacientes'}`, color: 'text-[#8A6D2F]' },
    { id: 'cerrado', titulo: 'Cerraron', valor: evaluados ? `${Math.round((cerraron / evaluados) * 100)}%` : '—', sub: `${cerraron} aprobaron, abonaron o empezaron`, color: 'text-emerald-600' },
    { id: 'no_vino', titulo: 'No vinieron', valor: String(n('no_vino')), sub: 'faltaron o anularon la evaluación', color: 'text-amber-600' },
    { id: 'agendada', titulo: 'Agendadas', valor: String(n('agendada')), sub: 'evaluaciones por venir', color: 'text-sky-600' },
  ]

  // ── Acciones ──
  const guardarResultado = async (o: Oportunidad, resultado: string, nota: string, volver: string) => {
    if (!usuario) return
    try {
      const fila = await registrarContacto({ paciente_id: o.pacienteId, lista: LISTA_EVAL, resultado, nota: nota || null, volver_a_contactar: volver, usuario_id: usuario.id }) as Contacto
      setContactos(prev => [...(prev || []), fila])
      toast.success(`${textoResultado(resultado)} · ${nombrePaciente(pacientes[o.pacienteId])}`, {
        action: {
          label: 'Deshacer',
          onClick: async () => {
            try { await borrarContacto(fila.id); setContactos(prev => (prev || []).filter(c => c.id !== fila.id)) }
            catch (e: any) { toast.error('No se pudo deshacer', { description: e?.message }) }
          },
        },
      })
    } catch (e: any) {
      toast.error('No se pudo guardar el resultado', { description: e?.message })
    }
  }
  const enviarWhatsApp = (o: Oportunidad) => {
    const p = pacientes[o.pacienteId]
    if (!abrirWhatsApp(p?.telefono, o.mensaje(p))) { toast.error('El paciente no tiene un teléfono válido'); return }
    setEnCurso(o)
  }
  const confirmarEnvio = (ok: boolean) => {
    const o = enCurso
    if (!o) return
    setEnCurso(null)
    setLocales(prev => ({ ...prev, [o.clave]: ok ? 'enviado' : 'fallido' }))
    if (ok && contactos !== null) guardarResultado(o, 'whatsapp', '', fechaVolver('whatsapp', ahora))
  }

  const exportar = () => {
    const titulo = etapa === 'todas' ? 'Todas' : etapa === 'seguir' ? 'Por seguir' : etapaEval(etapa).texto
    descargarXlsx(`evaluaciones-implantes-${hoyISO}.xlsx`, [{
      nombre: 'Evaluaciones de implantes', columnasPesos: [9, 10], anchos: [14, 16, 18, 40, 30, 13, 15, 22, 24, 14, 14, 22, 32, 60],
      filas: [
        [`Evaluaciones de implantes · ${PERIODOS.find(p => p.id === periodo)?.texto} · ${titulo}${doctor ? ` · ${nombreDoctor([doctor])}` : ''}`],
        ['Fecha evaluación', 'Estado', 'Origen', 'Detalle', 'Paciente', 'RUT', 'Teléfono', 'Doctor', 'En qué quedó', 'Presupuesto implantes', 'Abonado', 'Próxima hora', 'Último contacto', 'Mensaje sugerido'],
        ...filas.map(({ f, o }) => {
          const p = pacientes[o.pacienteId]
          const c = ultimoContacto(LISTA_EVAL, porPaciente.get(o.pacienteId))
          const prox = datos?.proximas.get(o.pacienteId)
          return [
            f.principal.fecha.toLocaleDateString('es-CL'), f.principal.estado === 'vino' ? 'Vino' : f.principal.estado === 'agendada' ? 'Agendada' : f.principal.estado === 'anulo' ? 'Anuló' : 'No vino',
            f.principal.origen === 'cita' ? 'Cita' : f.principal.origen === 'prestacion' ? 'Prestación' : 'Atención directa',
            o.detalle, nombrePaciente(p), p?.rut || '', p?.telefono || '', nombreDoctor(o.doctores), o.etapa,
            f.presupuesto || '', f.abonado || '', prox ? fechaConHora(prox.inicio) : '',
            c ? `${textoResultado(c.resultado)} ${String(c.created_at).slice(0, 10)}${c.nota ? ` · ${c.nota}` : ''}` : '', o.mensaje(p),
          ]
        }),
      ],
    }])
  }

  // ── Render ──
  if (acceso !== 'si') {
    return <div className="w-full min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-300" size={36} /></div>
  }

  const chipsEtapa: { id: FiltroEtapa; texto: string }[] = [
    { id: 'seguir', texto: 'Por seguir' }, { id: 'todas', texto: 'Todas' },
    ...ETAPAS_EVAL.map(e => ({ id: e.id as FiltroEtapa, texto: e.texto })),
  ]

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-900 pb-28">
      <div className="max-w-[1200px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">

        {/* Encabezado */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[#0A111F] flex items-center justify-center shadow-lg shrink-0"><Anchor className="text-[#C9A24B]" size={24} /></div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Evaluaciones de implantes</h1>
              <p className="text-xs md:text-sm text-slate-500 font-medium">Quién se evaluó, en qué quedó y a quién escribirle</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={cargar} disabled={cargando}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCcw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
            </button>
            <button type="button" onClick={exportar} disabled={!datos || !filas.length}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50">
              <Download size={14} /> Excel
            </button>
          </div>
        </div>

        {/* Período */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1">Período</span>
          {PERIODOS.map(p => (
            <button key={p.id} type="button" onClick={() => setPeriodo(p.id)} disabled={cargando}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-colors disabled:opacity-60 ${periodo === p.id ? 'bg-[#0A111F] border-[#0A111F] text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              {p.texto}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex gap-3 text-sm text-rose-800">
            <AlertTriangle size={18} className="shrink-0" /> <p>{error}</p>
          </div>
        )}

        {!datos ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin" size={40} />
            <p className="text-xs font-black uppercase tracking-widest">Buscando evaluaciones de implantes…</p>
          </div>
        ) : (
          <>
            {/* Indicadores */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {kpis.map(k => (
                <button key={k.titulo} type="button" onClick={() => setEtapa(k.id)}
                  className={`text-left bg-white rounded-2xl border shadow-sm p-4 hover:border-[#C9A24B]/60 hover:shadow transition-all ${etapa === k.id ? 'border-[#C9A24B] ring-2 ring-[#C9A24B]/20' : 'border-slate-200'}`}>
                  <span className="text-[10px] font-black uppercase tracking-widest leading-tight text-slate-400">{k.titulo}</span>
                  <p className={`text-2xl font-black mt-2 tabular-nums ${k.color}`}>{k.valor}</p>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5 leading-tight">{k.sub}</p>
                </button>
              ))}
            </div>

            <section className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <p className="text-xs text-slate-500 flex gap-2">
                    <Info size={14} className="shrink-0 mt-0.5 text-slate-400" />
                    <span>Cuenta las citas cuyo motivo dice <b>implante</b> y <b>evaluación</b> (o valoración, primera consulta, diagnóstico, planificación) y las prestaciones de evaluación de implantes cargadas. &quot;Por seguir&quot; deja fuera las evaluaciones agendadas y a quienes ya empezaron el implante.</span>
                  </p>
                  {siguiente && (
                    <button type="button" onClick={() => enviarWhatsApp(siguiente.o)} disabled={!!enCurso}
                      className="shrink-0 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-600 shadow-sm disabled:opacity-40">
                      <Send size={14} /> WhatsApp al siguiente
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {chipsEtapa.map(c => {
                    const activo = etapa === c.id
                    const tono = c.id !== 'seguir' && c.id !== 'todas' ? etapaEval(c.id).tono : null
                    return (
                      <button key={c.id} type="button" onClick={() => setEtapa(c.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${activo ? 'bg-[#0A111F] border-[#0A111F] text-white' : tono ? `${CLASE_TONO[tono]} hover:brightness-95` : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {c.texto} <span className={activo ? 'text-slate-300' : 'opacity-70'}>{cuenta(c.id)}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex flex-col xl:flex-row gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar paciente, RUT o teléfono…"
                      className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-[#C9A24B]" />
                    {busqueda && <button type="button" onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600" aria-label="Limpiar"><X size={14} /></button>}
                  </div>
                  <select value={doctor} onChange={e => setDoctor(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-[#C9A24B]">
                    <option value="">Todos los doctores</option>
                    {doctoresActivos.map(p => <option key={p.user_id} value={p.user_id}>{`${p.nombre} ${p.apellido}`}</option>)}
                  </select>
                  <select value={orden} onChange={e => setOrden(e.target.value as Orden)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-[#C9A24B]">
                    <option value="prioridad">Primero a quién escribir</option>
                    <option value="reciente">Más recientes primero</option>
                    <option value="monto">Mayor presupuesto primero</option>
                    <option value="nombre">Por nombre</option>
                  </select>
                </div>
                {contactos !== null && (
                  <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                    <button type="button" onClick={() => setOcultarContactados(v => !v)}
                      className={`px-3 py-1.5 rounded-lg border ${ocultarContactados ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                      {ocultarContactados ? `Ocultando ${ocultosContactados} ya contactados` : 'Mostrando también los ya contactados'}
                    </button>
                  </div>
                )}
              </div>

              {cargando && (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 px-1">
                  <Loader2 size={14} className="animate-spin" /> Actualizando…
                </div>
              )}

              {filas.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 py-14 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <CheckCircle2 size={40} className="text-emerald-300" />
                  <p className="text-sm font-black uppercase tracking-widest text-slate-500">Sin evaluaciones aquí</p>
                  <p className="text-xs text-center px-6">{busqueda || doctor ? 'Prueba quitando los filtros.' : 'Prueba con otra etapa o un período más largo.'}</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {visibles.map(({ o }) => (
                    <Fila key={o.clave} fila={o} paciente={pacientes[o.pacienteId]} proxima={datos.proximas.get(o.pacienteId) || null}
                      contacto={ultimoContacto(LISTA_EVAL, porPaciente.get(o.pacienteId))} nombreUsuario={nombreUsuario}
                      nombreDoctor={nombreDoctor(o.doctores)} estadoLocal={locales[o.clave]} conHistorial={contactos !== null} ahora={ahora}
                      onWhatsApp={() => enviarWhatsApp(o)} onResultado={() => setParaResultado(o)} />
                  ))}
                  {filas.length > visibles.length && (
                    <button type="button" onClick={() => setMostrar(m => m + CONFIG.FILAS_POR_PAGINA)}
                      className="w-full py-3 rounded-2xl border border-dashed border-slate-300 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-white">
                      Ver más ({filas.length - visibles.length} restantes)
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Confirmación de WhatsApp */}
      {enCurso && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-2rem)] max-w-xl bg-white border-2 border-violet-200 rounded-2xl shadow-2xl p-4">
          <p className="text-center text-xs font-black uppercase tracking-widest text-violet-800 mb-3 flex items-center justify-center gap-2">
            <MessageCircle size={16} /> ¿Se envió el WhatsApp a {nombrePaciente(pacientes[enCurso.pacienteId])}?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => confirmarEnvio(false)} className="py-3 rounded-xl border border-rose-200 text-rose-600 text-[11px] font-black uppercase tracking-widest hover:bg-rose-50 flex items-center justify-center gap-2"><X size={15} /> No se pudo</button>
            <button type="button" onClick={() => confirmarEnvio(true)} className="py-3 rounded-xl bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 shadow-md flex items-center justify-center gap-2"><CheckCircle2 size={15} /> Sí, se envió</button>
          </div>
        </div>
      )}

      <ModalResultado fila={paraResultado} paciente={paraResultado ? pacientes[paraResultado.pacienteId] : null} ahora={ahora}
        onCerrar={() => setParaResultado(null)}
        onGuardar={async (resultado, nota, volver) => { if (paraResultado) await guardarResultado(paraResultado, resultado, nota, volver); setParaResultado(null) }} />
    </div>
  )
}

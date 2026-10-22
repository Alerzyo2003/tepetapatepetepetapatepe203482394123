'use client'
// Presupuestos sin aprobar: todos los presupuestos que el paciente no ha aprobado ni abonado (y que no se empezaron),
// con su antigüedad, si el paciente ya tiene hora y acciones de seguimiento (WhatsApp, agendar, anotar resultado).
// Está en Mi menú; usa las reglas e historial de contactos del Panel de Seguimiento (app/seguimiento/_lib).
// Para que cargue rápido y con la fecha original de Dentalink: ejecutar presupuestos_sin_aprobar.sql en Supabase.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Database, Download, FileText, Info, Loader2, MessageCircle, RefreshCcw, Search, Send, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { RUTA_SIN_PERMISO } from '@/lib/permisos'
import { descargarXlsx } from '@/app/reportes/desempeno/_lib/xlsx'
import { CONFIG } from '@/app/seguimiento/_lib/config'
import { borrarContacto, cargarContactos, cargarPacientes, registrarContacto } from '@/app/seguimiento/_lib/datos'
import { contactoVigente, fechaVolver, indexarContactos, textoResultado, ultimoContacto, type Contacto } from '@/app/seguimiento/_lib/contactos'
import { ETAPAS_SA, LISTA_SIN_APROBAR, aOportunidad, cargarSinAprobar, etapaSA, nombrePresupuesto, type DatosSA, type EtapaSA, type FilaSA } from '@/app/seguimiento/_lib/sinAprobar'
import type { Oportunidad } from '@/app/seguimiento/_lib/reglas'
import { abrirWhatsApp, fechaConHora, fechaISO, money, nombrePaciente, normalizar, sumarMeses, telefonoWA } from '@/app/seguimiento/_lib/util'
import Fila, { CLASE_TONO } from '@/app/seguimiento/_components/Fila'
import ModalResultado from '@/app/seguimiento/_components/ModalResultado'

const S = CONFIG.SIN_APROBAR
const PERIODOS = [
  { id: '1', texto: 'Último mes', meses: 1 },
  { id: '3', texto: '3 meses', meses: 3 },
  { id: '6', texto: '6 meses', meses: 6 },
  { id: '12', texto: '12 meses', meses: 12 },
  { id: 'todo', texto: 'Todo', meses: null },
] as const
type Periodo = typeof PERIODOS[number]['id']
const MONTOS = [
  { valor: 0, texto: 'Cualquier monto' },
  { valor: 50_000, texto: 'Desde $50.000' },
  { valor: 150_000, texto: 'Desde $150.000' },
  { valor: 500_000, texto: 'Desde $500.000' },
  { valor: 1_000_000, texto: 'Desde $1.000.000' },
]
type FiltroEtapa = 'seguir' | 'todas' | EtapaSA
type Orden = 'prioridad' | 'reciente' | 'monto' | 'nombre'

const moneyCorto = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M` : v >= 10_000 ? `$${Math.round(v / 1000)}k` : money(v)

export default function PresupuestosSinAprobarPage() {
  const router = useRouter()
  const [acceso, setAcceso] = useState<'cargando' | 'si' | 'no'>('cargando')
  const [usuario, setUsuario] = useState<{ id: string; rol: string } | null>(null)

  const [periodo, setPeriodo] = useState<Periodo>(String(S.mesesPorDefecto) as Periodo)
  const [montoMin, setMontoMin] = useState<number>(S.montoMinimoPorDefecto)
  const [ahora, setAhora] = useState(() => new Date())
  const [datos, setDatos] = useState<DatosSA | null>(null)
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
  const [ocultarConHora, setOcultarConHora] = useState(true)
  const [ocultarAlternativa, setOcultarAlternativa] = useState(true)
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
        cargarSinAprobar(meses ? sumarMeses(momento, -meses) : null, montoMin, momento),
        cargarContactos(momento),
      ])
      if (req !== reqRef.current) return
      const fichas = await cargarPacientes(d.filas.map(f => f.pacienteId))
      if (req !== reqRef.current) return
      setAhora(momento); setDatos(d); setContactos(c); setPacientes(prev => ({ ...prev, ...fichas }))
      if (d.errores.length) toast.warning('Parte de la información no se pudo cargar', { description: d.errores.join(' · ') })
    } catch (e: any) {
      if (req === reqRef.current) setError(e?.message || 'No se pudieron cargar los presupuestos')
    } finally {
      if (req === reqRef.current) setCargando(false)
    }
  }, [periodo, montoMin])

  useEffect(() => { if (acceso === 'si') cargar() }, [acceso, cargar])
  useEffect(() => { setMostrar(CONFIG.FILAS_POR_PAGINA) }, [etapa, busqueda, doctor, orden, ocultarContactados, ocultarConHora, ocultarAlternativa, periodo, montoMin])
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
  const userDeProfesional = useMemo(() => new Map<string, string>((datos?.profesionales || []).filter(p => p.user_id).map(p => [p.id, p.user_id])), [datos])
  const doctoresActivos = useMemo(() => (datos?.profesionales || []).filter(p => p.activo !== false && p.user_id)
    .sort((a, b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`)), [datos])
  const nombreDoctor = useCallback((ids: string[]) => {
    const p = ids.map(id => profPorUser.get(id)).find(Boolean)
    return p ? `Dr(a). ${String(p.nombre || '').split(' ')[0]} ${String(p.apellido || '').split(' ')[0]}`.trim() : ''
  }, [profPorUser])
  const nombreUsuario = useCallback((id: string | null) => String((id && usuarios[id]) || '').split(' ').slice(0, 2).join(' '), [usuarios])

  const todas = useMemo(() => (datos?.filas || []).map(f => ({ f, o: aOportunidad(f, ahora, userDeProfesional) })), [datos, ahora, userDeProfesional])

  // Doctor y búsqueda (sirven para los indicadores)
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

  const contactado = useCallback((o: Oportunidad) => contactos !== null && !!contactoVigente(LISTA_SIN_APROBAR, porPaciente.get(o.pacienteId), hoyISO), [contactos, porPaciente, hoyISO])
  const conHora = useCallback((o: Oportunidad) => !!datos?.proximas.get(o.pacienteId), [datos])
  // Lo que se oculta con los botones (contactados, con hora, eligió otra alternativa)
  const visiblesBase = useMemo(() => base.filter(({ f, o }) =>
    !(ocultarContactados && contactado(o)) && !(ocultarConHora && conHora(o)) && !(ocultarAlternativa && f.alternativa)),
  [base, ocultarContactados, ocultarConHora, ocultarAlternativa, contactado, conHora])
  const enEtapa = (e: FiltroEtapa, f: FilaSA) => e === 'todas' || (e === 'seguir' ? etapaSA(f.etapa).seguir : f.etapa === e)
  const cuenta = (e: FiltroEtapa) => visiblesBase.filter(({ f }) => enEtapa(e, f)).length
  const enEtapaActual = base.filter(({ f }) => enEtapa(etapa, f))
  const ocultos = {
    contactados: enEtapaActual.filter(({ o }) => contactado(o)).length,
    conHora: enEtapaActual.filter(({ o }) => conHora(o)).length,
    alternativa: enEtapaActual.filter(({ f }) => f.alternativa).length,
  }

  const filas = useMemo(() => {
    const nombre = (o: Oportunidad) => nombrePaciente(pacientes[o.pacienteId])
    const fecha = (f: FilaSA) => f.principal.fecha?.getTime() || 0
    return visiblesBase.filter(({ f }) => enEtapa(etapa, f))
      .sort((a, b) =>
        orden === 'reciente' ? fecha(b.f) - fecha(a.f)
          : orden === 'monto' ? b.o.monto - a.o.monto || b.o.prioridad - a.o.prioridad
            : orden === 'nombre' ? nombre(a.o).localeCompare(nombre(b.o))
              : b.o.prioridad - a.o.prioridad || b.o.monto - a.o.monto)
      .sort((a, b) => (locales[a.o.clave] === 'enviado' ? 1 : 0) - (locales[b.o.clave] === 'enviado' ? 1 : 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblesBase, etapa, orden, pacientes, locales])
  const visibles = filas.slice(0, mostrar)
  const siguiente = filas.find(({ o }) => !locales[o.clave] && telefonoWA(pacientes[o.pacienteId]?.telefono))

  // ── Indicadores (con el filtro de doctor y búsqueda; sin contar a quien aprobó otra alternativa) ──
  const vigentes = base.filter(x => !x.f.alternativa)
  const grupo = (ids: EtapaSA[]) => vigentes.filter(x => ids.includes(x.f.etapa))
  const suma = (xs: typeof base) => xs.reduce((s, x) => s + x.f.principal.total, 0)
  const sub = (xs: typeof base) => `${xs.length} ${xs.length === 1 ? 'paciente' : 'pacientes'}`
  const kpis: { id: FiltroEtapa; titulo: string; valor: string; sub: string; color: string }[] = [
    { id: 'todas', titulo: 'Sin aprobar', valor: moneyCorto(suma(vigentes)), sub: sub(vigentes), color: 'text-slate-800' },
    { id: 'nuevo', titulo: 'Recién (7 días)', valor: moneyCorto(suma(grupo(['nuevo']))), sub: sub(grupo(['nuevo'])), color: 'text-emerald-600' },
    { id: 'seguimiento', titulo: 'En seguimiento', valor: moneyCorto(suma(grupo(['seguimiento']))), sub: `${sub(grupo(['seguimiento']))} · 8 a 30 días`, color: 'text-amber-600' },
    { id: 'recuperar', titulo: 'Por recuperar', valor: moneyCorto(suma(grupo(['recuperar']))), sub: `${sub(grupo(['recuperar']))} · 1 a 3 meses`, color: 'text-rose-600' },
    { id: 'antiguo', titulo: 'Más antiguos', valor: moneyCorto(suma(grupo(['antiguo', 'mas_anio', 'anterior']))), sub: `${sub(grupo(['antiguo', 'mas_anio', 'anterior']))} · más de 3 meses`, color: 'text-slate-500' },
    { id: 'todas', titulo: 'Ya tienen hora', valor: String(vigentes.filter(x => conHora(x.o)).length), sub: 'pacientes con cita agendada', color: 'text-sky-600' },
  ]

  // ── Acciones ──
  const guardarResultado = async (o: Oportunidad, resultado: string, nota: string, volver: string) => {
    if (!usuario) return
    try {
      const fila = await registrarContacto({ paciente_id: o.pacienteId, lista: LISTA_SIN_APROBAR, resultado, nota: nota || null, volver_a_contactar: volver, usuario_id: usuario.id }) as Contacto
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

  // Excel: una fila por presupuesto
  const exportar = () => {
    const titulo = etapa === 'todas' ? 'Todos' : etapa === 'seguir' ? 'Por seguir' : etapaSA(etapa).texto
    const filasXls: (string | number)[][] = []
    for (const { f, o } of filas) {
      const p = pacientes[o.pacienteId]
      const c = ultimoContacto(LISTA_SIN_APROBAR, porPaciente.get(o.pacienteId))
      const prox = datos?.proximas.get(o.pacienteId)
      for (const ps of f.presupuestos) {
        filasXls.push([
          ps.fecha ? ps.fecha.toLocaleDateString('es-CL') : '', ps.sinFechaReal ? 'Día de la carga (sin fecha original)' : ps.fechaOriginal ? 'Original de Dentalink' : '',
          nombrePaciente(p), p?.rut || '', p?.telefono || '', nombrePresupuesto(ps), ps.prestaciones.join(', '), ps.total,
          nombreDoctor([ps.especialistaId ? userDeProfesional.get(ps.especialistaId) || '' : '', ...ps.profesionales].filter(Boolean)),
          ps === f.principal ? o.etapa : 'Otro presupuesto del paciente',
          f.ultimaVisita ? f.ultimaVisita.toLocaleDateString('es-CL') : '', prox ? fechaConHora(prox.inicio) : '',
          f.alternativa ? f.alternativa.toLocaleDateString('es-CL') : '',
          c ? `${textoResultado(c.resultado)} ${String(c.created_at).slice(0, 10)}${c.nota ? ` · ${c.nota}` : ''}` : '',
          ps === f.principal ? o.mensaje(p) : '',
        ])
      }
    }
    descargarXlsx(`presupuestos-sin-aprobar-${hoyISO}.xlsx`, [{
      nombre: 'Presupuestos sin aprobar', columnasPesos: [7], anchos: [12, 22, 30, 13, 15, 30, 50, 14, 22, 30, 13, 22, 14, 32, 60],
      filas: [
        [`Presupuestos sin aprobar · ${PERIODOS.find(p => p.id === periodo)?.texto} · ${MONTOS.find(m => m.valor === montoMin)?.texto} · ${titulo}${doctor ? ` · ${nombreDoctor([doctor])}` : ''}`],
        ['Fecha', 'Origen de la fecha', 'Paciente', 'RUT', 'Teléfono', 'Presupuesto', 'Prestaciones', 'Monto', 'Doctor', 'Etapa', 'Última visita', 'Próxima hora', 'Aprobó otro el', 'Último contacto', 'Mensaje sugerido'],
        ...filasXls,
      ],
    }])
  }

  // ── Render ──
  if (acceso !== 'si') {
    return <div className="w-full min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-300" size={36} /></div>
  }

  const chipsEtapa: { id: FiltroEtapa; texto: string; titulo?: string }[] = [
    { id: 'seguir', texto: 'Por seguir', titulo: 'Hasta 3 meses' }, { id: 'todas', texto: 'Todos' },
    ...ETAPAS_SA.map(e => ({ id: e.id as FiltroEtapa, texto: e.texto, titulo: e.rango })),
  ]
  const botonOcultar = (activo: boolean, n: number, textoOcultando: string, textoMostrando: string, cambiar: () => void, clase: string) => (
    <button type="button" onClick={cambiar}
      className={`px-3 py-1.5 rounded-lg border ${activo ? clase : 'bg-white border-slate-200 text-slate-500'}`}>
      {activo ? `Ocultando ${n} ${textoOcultando}` : textoMostrando}
    </button>
  )

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-900 pb-28">
      <div className="max-w-[1200px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">

        {/* Encabezado */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[#0A111F] flex items-center justify-center shadow-lg shrink-0"><FileText className="text-[#C9A24B]" size={24} /></div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Presupuestos sin aprobar</h1>
              <p className="text-xs md:text-sm text-slate-500 font-medium">Lo que el paciente no ha aprobado ni abonado, y a quién escribirle primero</p>
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

        {/* Período y monto */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1">Presupuestados en</span>
            {PERIODOS.map(p => (
              <button key={p.id} type="button" onClick={() => setPeriodo(p.id)} disabled={cargando}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-colors disabled:opacity-60 ${periodo === p.id ? 'bg-[#0A111F] border-[#0A111F] text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {p.texto}
              </button>
            ))}
          </div>
          <select value={montoMin} onChange={e => setMontoMin(Number(e.target.value))} disabled={cargando}
            className="md:ml-auto px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-[#C9A24B] disabled:opacity-60">
            {MONTOS.map(m => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
          </select>
        </div>

        {datos && !datos.modoRapido && usuario?.rol === 'ADMIN' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-sm text-amber-900">
            <Database size={20} className="shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-bold">La página está usando la carga lenta.</p>
              <p className="text-xs mt-0.5 text-amber-800">Ejecuta presupuestos_sin_aprobar.sql en Supabase (SQL Editor): carga más rápido, descarga menos datos y muestra la fecha original de los presupuestos traídos de Dentalink.</p>
            </div>
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex gap-3 text-sm text-rose-800">
            <AlertTriangle size={18} className="shrink-0" /> <p>{error}</p>
          </div>
        )}

        {!datos ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin" size={40} />
            <p className="text-xs font-black uppercase tracking-widest">Buscando presupuestos sin aprobar…</p>
          </div>
        ) : (
          <>
            {/* Indicadores */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {kpis.map(k => (
                <button key={k.titulo} type="button" onClick={() => { setEtapa(k.id); if (k.titulo === 'Ya tienen hora') setOcultarConHora(false) }}
                  className={`text-left bg-white rounded-2xl border shadow-sm p-4 hover:border-[#C9A24B]/60 hover:shadow transition-all ${etapa === k.id && k.titulo !== 'Ya tienen hora' ? 'border-[#C9A24B] ring-2 ring-[#C9A24B]/20' : 'border-slate-200'}`}>
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
                    <span>Presupuestos <b>sin aprobar ni abonar</b> y sin ninguna prestación realizada (no aparecen los que son solo radiografías o evaluaciones). Una fila por paciente: se muestra su presupuesto más reciente y cuántos más tiene. &quot;Por seguir&quot; son los de hasta 3 meses, que es cuando más se cierran.</span>
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
                    const tono = c.id !== 'seguir' && c.id !== 'todas' ? etapaSA(c.id).tono : null
                    return (
                      <button key={c.id} type="button" onClick={() => setEtapa(c.id)} title={c.titulo}
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
                    <option value="monto">Mayor monto primero</option>
                    <option value="nombre">Por nombre</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                  {botonOcultar(ocultarConHora, ocultos.conHora, 'con hora agendada', 'Mostrando también los que tienen hora', () => setOcultarConHora(v => !v), 'bg-sky-50 border-sky-200 text-sky-700')}
                  {contactos !== null && botonOcultar(ocultarContactados, ocultos.contactados, 'ya contactados', 'Mostrando también los ya contactados', () => setOcultarContactados(v => !v), 'bg-violet-50 border-violet-200 text-violet-700')}
                  {botonOcultar(ocultarAlternativa, ocultos.alternativa, 'que después aprobaron otro presupuesto', 'Mostrando también los que aprobaron otro', () => setOcultarAlternativa(v => !v), 'bg-slate-100 border-slate-200 text-slate-600')}
                </div>
              </div>

              {cargando && (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 px-1">
                  <Loader2 size={14} className="animate-spin" /> Actualizando…
                </div>
              )}

              {filas.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 py-14 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <CheckCircle2 size={40} className="text-emerald-300" />
                  <p className="text-sm font-black uppercase tracking-widest text-slate-500">Nada pendiente aquí</p>
                  <p className="text-xs text-center px-6">{busqueda || doctor ? 'Prueba quitando los filtros.' : 'Prueba con otra etapa, un período más largo o un monto menor.'}</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {visibles.map(({ o }) => (
                    <Fila key={o.clave} fila={o} paciente={pacientes[o.pacienteId]} proxima={datos.proximas.get(o.pacienteId) || null}
                      contacto={ultimoContacto(LISTA_SIN_APROBAR, porPaciente.get(o.pacienteId))} nombreUsuario={nombreUsuario}
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

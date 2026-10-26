'use client'
// Panel de Seguimiento (recepción y administración): pacientes a contactar para llenar la agenda y aumentar los ingresos.
// Las reglas de cada lista se ajustan en ./_lib/config.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle, Anchor, Cake, CalendarOff, CalendarX, CheckCircle2, ChevronDown, ClipboardList, Crown, Database, Download,
  FileText, HandCoins, Hourglass, Lightbulb, Loader2, MessageCircle, PiggyBank, Puzzle, RefreshCcw, Search, Send, Smile,
  Sparkles, Star, Stethoscope, Target, TrendingUp, UserMinus, Users, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { RUTA_SIN_PERMISO } from '@/lib/permisos'
import { CONFIG, GRUPOS, LISTAS, type IdLista } from './_lib/config'
import { baseEnCache, borrarContacto, cargarBase, cargarPacientes, cargarVivos, pacientesEnMemoria, registrarContacto, type DatosBase, type DatosVivos } from './_lib/datos'
import { armarContexto, calcularListas, cumpleanos, DATOS_DE_LISTA, idsCumpleanos, type Oportunidad } from './_lib/reglas'
import { calcularOcupacion } from './_lib/agenda'
import { contactoVigente, fechaVolver, indexarContactos, textoResultado, ultimoContacto, type Contacto } from './_lib/contactos'
import { exportarSeguimiento } from './_lib/exportar'
import { abrirWhatsApp, aFecha, fechaConHora, fechaISO, money, nombrePaciente, normalizar, telefonoWA } from './_lib/util'
import { variarMensaje } from '@/lib/mensajes'
import Fila from './_components/Fila'
import ModalResultado from './_components/ModalResultado'
import PanelAgenda from './_components/PanelAgenda'

const ICONOS: Record<IdLista, any> = {
  implantes: Anchor, endodoncias: Crown, extracciones: Puzzle, ortodoncia: Smile, higiene: Sparkles,
  detenidos: Hourglass, por_cerrar: FileText, evaluados: ClipboardList, saldo_favor: PiggyBank,
  por_cobrar: HandCoins, no_asistio: CalendarX, anulo: CalendarOff, inactivos: UserMinus, cumpleanos: Cake, resena: Star,
}
const CLINICAS: IdLista[] = ['implantes', 'endodoncias', 'extracciones', 'ortodoncia', 'higiene']
const RECUPERAR: IdLista[] = ['no_asistio', 'anulo', 'inactivos', 'evaluados']

type Orden = 'prioridad' | 'monto' | 'nombre'

const moneyCorto = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M` : v >= 10_000 ? `$${Math.round(v / 1000)}k` : money(v)

export default function SeguimientoPage() {
  const router = useRouter()
  const [acceso, setAcceso] = useState<'cargando' | 'si' | 'no'>('cargando')
  const [usuario, setUsuario] = useState<{ id: string; rol: string } | null>(null)

  // ── Datos ──
  const [ahora, setAhora] = useState(() => new Date())
  const [base, setBase] = useState<DatosBase | null>(null)
  const [vivos, setVivos] = useState<DatosVivos | null>(null)
  const [contactos, setContactos] = useState<Contacto[] | null>(null)
  const [pacientes, setPacientes] = useState<Record<string, any>>({}) // fichas ya pedidas (null = ficha borrada)
  const [cargandoFichas, setCargandoFichas] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqRef = useRef(0)
  const listaElegida = useRef(false)

  // ── Filtros y estado de trabajo ──
  const [listaActiva, setListaActiva] = useState<IdLista>('implantes')
  const [busqueda, setBusqueda] = useState('')
  const [doctor, setDoctor] = useState('')
  const [orden, setOrden] = useState<Orden>('prioridad')
  const [ocultarConHora, setOcultarConHora] = useState(true)
  const [ocultarContactados, setOcultarContactados] = useState(true)
  const [mostrar, setMostrar] = useState(CONFIG.FILAS_POR_PAGINA)
  const [locales, setLocales] = useState<Record<string, 'enviado' | 'fallido'>>({}) // WhatsApp de esta sesión
  const [enCurso, setEnCurso] = useState<Oportunidad | null>(null)
  const [paraResultado, setParaResultado] = useState<Oportunidad | null>(null)
  const [verRutina, setVerRutina] = useState(false)
  const [exportando, setExportando] = useState(false)

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

  const cargar = useCallback(async (forzar = false) => {
    const req = ++reqRef.current
    const momento = new Date()
    setCargando(true); setError(null)
    try {
      const enCache = forzar ? null : baseEnCache()
      const [b, v] = await Promise.all([enCache ? Promise.resolve(enCache) : cargarBase(momento), cargarVivos(momento)])
      if (req !== reqRef.current) return
      // Las fichas (nombre, teléfono) se piden después, solo de la lista que se está viendo
      setAhora(momento); setBase(b); setVivos(v); setContactos(v.contactos); setPacientes(pacientesEnMemoria())
      if (!listaElegida.current) {
        const listas = calcularListas(armarContexto(b, v, momento))
        listaElegida.current = true
        if (!listas.implantes.length) setListaActiva(LISTAS.find(l => listas[l.id].length)?.id || 'implantes')
      }
    } catch (e: any) {
      if (req === reqRef.current) setError(e?.message || 'No se pudo cargar el panel')
    } finally {
      if (req === reqRef.current) setCargando(false)
    }
  }, [])

  useEffect(() => { if (acceso === 'si') cargar() }, [acceso, cargar])
  useEffect(() => { setMostrar(CONFIG.FILAS_POR_PAGINA) }, [listaActiva, busqueda, doctor, orden, ocultarConHora, ocultarContactados])

  // ── Listas ──
  const ctx = useMemo(() => (base && vivos ? armarContexto(base, vivos, ahora) : null), [base, vivos, ahora])
  const listasBase = useMemo(() => (ctx ? calcularListas(ctx) : null), [ctx])
  const listaCumpleanos = useMemo(() => (ctx ? cumpleanos(ctx, pacientes) : []), [ctx, pacientes])
  const listas = useMemo(() => (listasBase ? { ...listasBase, cumpleanos: listaCumpleanos } : null), [listasBase, listaCumpleanos])

  // Fichas de los pacientes de la lista abierta (las demás se piden al abrirlas o al exportar)
  const idsDeLista = useCallback((id: IdLista): string[] => {
    if (!ctx || !listasBase) return []
    if (id === 'cumpleanos' && !ctx.base.cumpleanos) return idsCumpleanos(ctx)
    return (listasBase[id] || []).map(f => f.pacienteId)
  }, [ctx, listasBase])
  const sumarFichas = useCallback((p: Record<string, any>) => {
    setPacientes(prev => (Object.keys(p).some(k => !(k in prev)) ? { ...prev, ...p } : prev))
  }, [])
  useEffect(() => {
    const ids = idsDeLista(listaActiva)
    if (!ids.length) return
    let vigente = true
    setCargandoFichas(true)
    cargarPacientes(ids)
      .then(p => { if (vigente) sumarFichas(p) })
      .catch(e => toast.error('No se pudieron cargar los datos de los pacientes', { description: e?.message }))
      .finally(() => { if (vigente) setCargandoFichas(false) })
    return () => { vigente = false }
  }, [listaActiva, idsDeLista, sumarFichas])
  const porPaciente = useMemo(() => indexarContactos(contactos), [contactos])
  const hoyISO = fechaISO(ahora)
  const profPorUser = useMemo(() => new Map((base?.profesionales || []).filter(p => p.user_id).map(p => [p.user_id, p])), [base])
  const doctoresActivos = useMemo(() => (base?.profesionales || []).filter(p => p.activo !== false && p.user_id)
    .sort((a, b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`)), [base])

  const nombreDoctor = useCallback((ids: string[]) => {
    const p = ids.map(id => profPorUser.get(id)).find(Boolean)
    return p ? `Dr(a). ${String(p.nombre || '').split(' ')[0]} ${String(p.apellido || '').split(' ')[0]}`.trim() : ''
  }, [profPorUser])
  const nombreUsuario = useCallback((id: string | null) => String((id && base?.usuarios[id]) || '').split(' ').slice(0, 2).join(' '), [base])

  const { filtradas, ocultos } = useMemo(() => {
    const filtradas = {} as Record<IdLista, Oportunidad[]>
    const ocultos = {} as Record<IdLista, { conHora: number; contactados: number }>
    if (!listas || !ctx) return { filtradas, ocultos }
    const termino = normalizar(busqueda)
    const digitos = busqueda.replace(/\D/g, '')
    for (const def of LISTAS) {
      const o = { conHora: 0, contactados: 0 }
      const filas = (listas[def.id] || []).filter(f => {
        const p = pacientes[f.pacienteId]
        if (p === null || p?.activo === false) return false // ficha borrada o paciente deshabilitado
        if (doctor && !f.doctores.includes(doctor)) return false
        if (termino) {
          const texto = normalizar(`${p?.nombre || ''} ${p?.apellido || ''} ${p?.rut || ''}`)
          const numeros = `${String(p?.rut || '').replace(/\D/g, '')} ${String(p?.telefono || '').replace(/\D/g, '')}`
          if (!texto.includes(termino) && !(digitos.length >= 4 && numeros.includes(digitos))) return false
        }
        if (def.ocultarConHora && ctx.horaFutura.has(f.pacienteId)) { o.conHora++; if (ocultarConHora) return false }
        if (contactos && contactoVigente(def.id, porPaciente.get(f.pacienteId), hoyISO)) { o.contactados++; if (ocultarContactados) return false }
        return true
      })
      const nombre = (f: Oportunidad) => nombrePaciente(pacientes[f.pacienteId])
      filas.sort((a, b) =>
        orden === 'monto' ? b.monto - a.monto || b.prioridad - a.prioridad
          : orden === 'nombre' ? nombre(a).localeCompare(nombre(b))
            : b.prioridad - a.prioridad || b.monto - a.monto || nombre(a).localeCompare(nombre(b)))
      filtradas[def.id] = filas
      ocultos[def.id] = o
    }
    return { filtradas, ocultos }
  }, [listas, ctx, pacientes, doctor, busqueda, ocultarConHora, ocultarContactados, contactos, porPaciente, hoyISO, orden])

  const ocupacion = useMemo(() => (base && vivos ? calcularOcupacion(base.profesionales, base.disponibilidad, vivos.bloqueos, vivos.citasFuturas, ahora) : null), [base, vivos, ahora])

  // ── Indicadores ──
  const n = (id: IdLista) => (filtradas[id] || []).length
  const suma = (id: IdLista) => (filtradas[id] || []).reduce((s, f) => s + f.monto, 0)
  const urgentes = CLINICAS.flatMap(id => filtradas[id] || []).filter(f => f.tono === 'rojo').length
  const porRecuperar = new Set(RECUPERAR.flatMap(id => (filtradas[id] || []).map(f => f.pacienteId))).size
  const abonadoDetenidos = (filtradas.detenidos || []).reduce((s, f) => s + (f.abonado || 0), 0)
  const conversion = base?.conversion
  const contactosHoy = (contactos || []).filter(c => { const f = aFecha(c.created_at); return f && fechaISO(f) === hoyISO })
  const agendaronHoy = contactosHoy.filter(c => c.resultado === 'agendo').length

  // ── Acciones ──
  const guardarResultado = async (f: Oportunidad, resultado: string, nota: string, volver: string) => {
    if (!usuario) return
    try {
      const fila = await registrarContacto({ paciente_id: f.pacienteId, lista: f.lista, resultado, nota: nota || null, volver_a_contactar: volver, usuario_id: usuario.id }) as Contacto
      setContactos(prev => [...(prev || []), fila])
      toast.success(`${textoResultado(resultado)} · ${nombrePaciente(pacientes[f.pacienteId])}`, {
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

  const enviarWhatsApp = (f: Oportunidad) => {
    const p = pacientes[f.pacienteId]
    if (!abrirWhatsApp(p?.telefono, variarMensaje(f.mensaje(p)))) { toast.error('El paciente no tiene un teléfono válido'); return }
    setEnCurso(f)
  }
  const confirmarEnvio = (ok: boolean) => {
    const f = enCurso
    if (!f) return
    setEnCurso(null)
    setLocales(prev => ({ ...prev, [f.clave]: ok ? 'enviado' : 'fallido' }))
    if (ok && contactos !== null) {
      const resultado = f.lista === 'resena' ? 'resena' : 'whatsapp'
      guardarResultado(f, resultado, '', fechaVolver(resultado, ahora))
    }
  }

  // Excel: primero se piden las fichas que falten de todas las listas
  const exportar = async () => {
    setExportando(true)
    let todas: Record<string, any>
    try {
      todas = { ...pacientes, ...(await cargarPacientes(LISTAS.flatMap(l => idsDeLista(l.id)))) }
      sumarFichas(todas)
    } catch (e: any) {
      toast.error('No se pudo preparar el Excel', { description: e?.message })
      return
    } finally {
      setExportando(false)
    }
    const vigente = (f: Oportunidad) => todas[f.pacienteId] !== null && todas[f.pacienteId]?.activo !== false
    exportarSeguimiento({
      nombreArchivo: `seguimiento-pacientes-${hoyISO}.xlsx`,
      listas: LISTAS.map(def => ({ def, filas: (filtradas[def.id] || []).filter(vigente) })),
      pacientes: todas,
      proximaHora: id => { const c = ctx?.horaFutura.get(id); return c ? fechaConHora(c.inicio) : '' },
      doctor: f => nombreDoctor(f.doctores),
      contacto: f => {
        const c = ultimoContacto(f.lista, porPaciente.get(f.pacienteId))
        return c ? `${textoResultado(c.resultado)} ${String(c.created_at).slice(0, 10)}${nombreUsuario(c.usuario_id) ? ` · ${nombreUsuario(c.usuario_id)}` : ''}${c.nota ? ` · ${c.nota}` : ''}` : ''
      },
    })
  }

  // ── Render ──
  if (acceso !== 'si') {
    return <div className="w-full min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-300" size={36} /></div>
  }

  const def = LISTAS.find(l => l.id === listaActiva)!
  const filas = [...(filtradas[listaActiva] || [])].sort((a, b) => (locales[a.clave] === 'enviado' ? 1 : 0) - (locales[b.clave] === 'enviado' ? 1 : 0))
  const visibles = filas.slice(0, mostrar)
  const siguiente = filas.find(f => !locales[f.clave] && telefonoWA(pacientes[f.pacienteId]?.telefono))
  const erroresLista = [...new Set(DATOS_DE_LISTA[listaActiva].map(k => base?.errores[k]).filter(Boolean))] as string[]
  const hayErrores = !!base && Object.keys(base.errores).length > 0
  const minutosDatos = base ? Math.max(0, Math.round((Date.now() - base.cargadoEn) / 60000)) : 0
  const IconoLista = ICONOS[listaActiva]

  const kpis = [
    { id: 'por_cerrar' as IdLista, icon: FileText, titulo: 'Presupuestos por cerrar', valor: moneyCorto(suma('por_cerrar')), sub: `${n('por_cerrar')} pacientes`, color: 'text-[#8A6D2F]' },
    { id: 'detenidos' as IdLista, icon: Hourglass, titulo: 'Tratamientos detenidos', valor: moneyCorto(suma('detenidos')), sub: `${n('detenidos')} pacientes${abonadoDetenidos ? ` · ${moneyCorto(abonadoDetenidos)} ya abonado` : ''}`, color: 'text-rose-600' },
    { id: 'por_cobrar' as IdLista, icon: HandCoins, titulo: 'Saldos por cobrar', valor: moneyCorto(suma('por_cobrar')), sub: `${n('por_cobrar')} pacientes`, color: 'text-amber-600' },
    { id: 'implantes' as IdLista, icon: Stethoscope, titulo: 'Seguimiento clínico', valor: String(CLINICAS.reduce((s, id) => s + n(id), 0)), sub: `${urgentes} urgentes (en rojo)`, color: 'text-slate-800' },
    { id: 'inactivos' as IdLista, icon: Users, titulo: 'Pacientes por recuperar', valor: String(porRecuperar), sub: 'inactivos, faltas, anulaciones y evaluados', color: 'text-slate-800' },
    {
      id: 'por_cerrar' as IdLista, icon: TrendingUp, titulo: 'Cierre de presupuestos',
      valor: conversion && conversion.creados ? `${Math.round((conversion.cerrados / conversion.creados) * 100)}%` : '—',
      sub: conversion ? `${conversion.cerrados} de ${conversion.creados} (90 días, desde ${moneyCorto(CONFIG.POR_CERRAR.montoMinimo)})` : 'sin datos', color: 'text-emerald-600',
    },
  ]

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-900 pb-28">
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">

        {/* Encabezado */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#0A111F] flex items-center justify-center shadow-lg shrink-0"><Target className="text-[#C9A24B]" size={24} /></div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Seguimiento de pacientes</h1>
              <p className="text-xs md:text-sm text-slate-500 font-medium">A quién contactar hoy para llenar la agenda y aumentar los ingresos</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {contactos !== null && (
              <span className="px-3 py-2 rounded-xl bg-violet-50 border border-violet-100 text-violet-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
                title="Contactos anotados hoy por todo el equipo">
                <CheckCircle2 size={14} /> Hoy: {contactosHoy.length} contacto{contactosHoy.length === 1 ? '' : 's'} · {agendaronHoy} agend{agendaronHoy === 1 ? 'ó' : 'aron'}
              </span>
            )}
            <button type="button" onClick={() => cargar(true)} disabled={cargando} title={base ? `Datos de hace ${minutosDatos} min` : undefined}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCcw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar
            </button>
            <button type="button" onClick={exportar} disabled={!listas || exportando}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50">
              {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Excel
            </button>
          </div>
        </div>

        {contactos === null && vivos && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 flex gap-3 text-sm text-sky-900">
            <Database size={20} className="shrink-0 text-sky-600 mt-0.5" />
            <div>
              <p className="font-bold">El historial de contactos no está activado.</p>
              <p className="text-xs mt-0.5 text-sky-800">
                {usuario?.rol === 'ADMIN'
                  ? 'Ejecuta el archivo seguimiento_contactos.sql en Supabase (SQL Editor) para que recepción pueda anotar el resultado de cada contacto, ver quién ya fue contactado y no repetir mensajes. Mientras tanto el panel funciona igual.'
                  : 'Pide a administración que lo active. Mientras tanto puedes usar el panel: los WhatsApp enviados quedan marcados solo en esta pantalla.'}
              </p>
            </div>
          </div>
        )}
        {base && !base.modoRapido && usuario?.rol === 'ADMIN' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-sm text-amber-900">
            <Database size={20} className="shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-bold">El panel está usando la carga lenta.</p>
              <p className="text-xs mt-0.5 text-amber-800">Ejecuta seguimiento_rapido.sql en Supabase (SQL Editor): las búsquedas pesadas se hacen dentro de Supabase y el panel carga en pocos segundos y descarga mucho menos.</p>
            </div>
          </div>
        )}
        {hayErrores && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-xs text-amber-900">
            <AlertTriangle size={18} className="shrink-0 text-amber-600" />
            <p><span className="font-bold">Algunas listas no se pudieron cargar</span> ({Object.keys(base!.errores).join(', ')}). El resto del panel funciona. Prueba con Actualizar; si se repite, envía este aviso a soporte.</p>
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex gap-3 text-sm text-rose-800">
            <AlertTriangle size={18} className="shrink-0" /> <p>{error}</p>
          </div>
        )}

        {!listas ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin" size={40} />
            <p className="text-xs font-black uppercase tracking-widest">Revisando planes, prestaciones y citas…</p>
            <p className="text-[11px] text-slate-400">La primera vez tarda unos segundos; después queda guardado {CONFIG.MINUTOS_CACHE} minutos.</p>
          </div>
        ) : (
          <>
            {/* Indicadores */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {kpis.map(k => (
                <button key={k.titulo} type="button" onClick={() => setListaActiva(k.id)}
                  className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:border-[#C9A24B]/60 hover:shadow transition-all">
                  <div className="flex items-center gap-2 text-slate-400">
                    <k.icon size={15} />
                    <span className="text-[10px] font-black uppercase tracking-widest leading-tight">{k.titulo}</span>
                  </div>
                  <p className={`text-2xl font-black mt-2 tabular-nums ${k.color}`}>{k.valor}</p>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5 leading-tight">{k.sub}</p>
                </button>
              ))}
            </div>

            {ocupacion && <PanelAgenda ocupacion={ocupacion} />}

            <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-6 items-start">
              {/* Listas */}
              <nav className="lg:sticky lg:top-4">
                <div className="flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
                  {GRUPOS.map(g => (
                    <div key={g} className="contents lg:block lg:space-y-1 lg:mb-3">
                      <p className="hidden lg:block text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 mb-1">{g}</p>
                      {LISTAS.filter(l => l.grupo === g).map(l => {
                        const Icono = ICONOS[l.id]
                        const activa = l.id === listaActiva
                        const rojos = (filtradas[l.id] || []).filter(f => f.tono === 'rojo').length
                        return (
                          <button key={l.id} type="button" onClick={() => setListaActiva(l.id)}
                            className={`shrink-0 lg:w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${activa ? 'bg-[#0A111F] border-[#0A111F] text-white shadow-md' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                            <Icono size={16} className={activa ? 'text-[#C9A24B] shrink-0' : 'text-slate-400 shrink-0'} />
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-bold truncate">{l.titulo}</span>
                              {suma(l.id) > 0 && <span className={`block text-[10px] font-bold ${activa ? 'text-[#E8CD8A]' : 'text-[#8A6D2F]'}`}>{moneyCorto(suma(l.id))}</span>}
                            </span>
                            {rojos > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" title={`${rojos} urgentes`} />}
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 tabular-nums ${activa ? 'bg-white/15 text-white' : n(l.id) ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-300'}`}>{n(l.id)}</span>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </nav>

              {/* Lista elegida */}
              <section className="min-w-0 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#C9A24B]/15 text-[#8A6D2F] flex items-center justify-center shrink-0"><IconoLista size={20} /></div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{def.grupo}</p>
                        <h2 className="text-lg font-black text-slate-900 leading-tight">{def.titulo} <span className="text-slate-400 font-bold">· {filas.length}</span></h2>
                        <p className="text-xs text-slate-500 mt-1">{def.descripcion}</p>
                      </div>
                    </div>
                    {siguiente && (
                      <button type="button" onClick={() => enviarWhatsApp(siguiente)} disabled={!!enCurso}
                        className="shrink-0 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-600 shadow-sm disabled:opacity-40">
                        <Send size={14} /> WhatsApp al siguiente
                      </button>
                    )}
                  </div>
                  <div className="mt-3 rounded-xl bg-amber-50/70 border border-amber-100 px-3 py-2 text-xs text-amber-900 flex gap-2">
                    <Lightbulb size={14} className="shrink-0 mt-0.5 text-amber-500" /> <span>{def.consejo}</span>
                  </div>

                  {/* Filtros */}
                  <div className="mt-4 flex flex-col xl:flex-row gap-2">
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
                      <option value="prioridad">Más urgentes primero</option>
                      <option value="monto">Mayor monto primero</option>
                      <option value="nombre">Por nombre</option>
                    </select>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold">
                    {def.ocultarConHora ? (
                      <button type="button" onClick={() => setOcultarConHora(v => !v)}
                        className={`px-3 py-1.5 rounded-lg border ${ocultarConHora ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                        {ocultarConHora ? `Ocultando ${ocultos[listaActiva]?.conHora || 0} con hora agendada` : 'Mostrando también los que tienen hora'}
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-slate-400">Aparecen aunque tengan hora agendada</span>
                    )}
                    {contactos !== null && (
                      <button type="button" onClick={() => setOcultarContactados(v => !v)}
                        className={`px-3 py-1.5 rounded-lg border ${ocultarContactados ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                        {ocultarContactados ? `Ocultando ${ocultos[listaActiva]?.contactados || 0} ya contactados` : 'Mostrando también los ya contactados'}
                      </button>
                    )}
                  </div>
                </div>

                {erroresLista.length > 0 && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex gap-2">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span>Esta lista no se pudo cargar completa: {erroresLista.join(' · ')}</span>
                  </div>
                )}

                {(cargando || cargandoFichas) && (
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 px-1">
                    <Loader2 size={14} className="animate-spin" /> {cargando ? 'Actualizando…' : 'Cargando datos de los pacientes…'}
                  </div>
                )}

                {filas.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 py-14 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <CheckCircle2 size={40} className="text-emerald-300" />
                    <p className="text-sm font-black uppercase tracking-widest text-slate-500">Nada pendiente aquí</p>
                    <p className="text-xs">{busqueda || doctor ? 'Prueba quitando los filtros.' : 'No hay pacientes para contactar en esta lista.'}</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {visibles.map(f => (
                      <Fila key={f.clave} fila={f} paciente={pacientes[f.pacienteId]} proxima={ctx?.horaFutura.get(f.pacienteId) || null}
                        contacto={ultimoContacto(f.lista, porPaciente.get(f.pacienteId))} nombreUsuario={nombreUsuario}
                        nombreDoctor={nombreDoctor(f.doctores)} estadoLocal={locales[f.clave]} conHistorial={contactos !== null} ahora={ahora}
                        onWhatsApp={() => enviarWhatsApp(f)} onResultado={() => setParaResultado(f)} />
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
            </div>

            {/* Cómo usar el panel */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <button type="button" onClick={() => setVerRutina(v => !v)} className="w-full flex items-center justify-between gap-3 p-5 text-left">
                <span className="flex items-center gap-2 text-sm font-black text-slate-800"><Lightbulb size={18} className="text-[#C9A24B]" /> Rutina sugerida para recepción</span>
                <ChevronDown size={18} className={`text-slate-400 transition-transform ${verRutina ? 'rotate-180' : ''}`} />
              </button>
              {verRutina && (
                <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
                  {[
                    ['Cada mañana (15 min)', 'Lo que está en rojo: controles post-operatorios de implantes, endodoncias sin terminar y tratamientos que ya están pagados pero detenidos.'],
                    ['Antes del mediodía', 'Presupuestos recién hechos (menos de 7 días) y evaluados sin presupuesto: es cuando más se cierran.'],
                    ['Cuando la agenda tenga horas libres', 'Mira el gráfico de la agenda y llena los huecos con Limpieza y mantención, Pacientes inactivos y No asistió.'],
                    ['Lunes', 'Cumpleaños de la semana y saldos por cobrar de pacientes que no tienen hora.'],
                    ['Todos los días', 'Pide reseña a los atendidos ayer: más reseñas en Google traen más pacientes nuevos.'],
                    ['Siempre', 'Anota el resultado de cada contacto. Así nadie recibe dos mensajes y se puede medir cuántos agendan.'],
                  ].map(([t, d]) => (
                    <div key={t} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                      <p className="font-black text-slate-800 mb-0.5">{t}</p>
                      <p>{d}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
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

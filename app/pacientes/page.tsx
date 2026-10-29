'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { filtroPalabraPaciente } from '@/lib/busquedaPacientes'
import { 
  Search, UserPlus, Loader2, Edit3, UserCheck, UserX, 
  ChevronDown, ChevronUp, Activity, Wallet, ShieldCheck, 
  Coins, ReceiptText, CheckCircle2, X, ShieldAlert, AlertTriangle, 
  ChevronRight, Fingerprint, Phone, Mail, Stethoscope, User, ClipboardList, SlidersHorizontal
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import Link from 'next/link'

const GOLD = '#C9A24B'
const NAVY = '#0E1B2E'
const GOLD_LIGHT = '#E8CD8A'

// Pacientes por página en el listado (se pueden cargar más)
const PAGINA = 50
// Valores especiales del filtro de convenio (el convenio del paciente se guarda en pacientes.prevision)
const CONVENIO_ALGUNO = '__con_convenio__'
const CONVENIO_NINGUNO = '__sin_convenio__'
const normalizarConvenio = (v: any) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const esSinConvenio = (v: any) => { const n = normalizarConvenio(v); return !n || n === 'sin convenio' || n.startsWith('particular') }

export default function ClientesPage() {
  const [pacientes, setPacientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [verDeshabilitados, setVerDeshabilitados] = useState(false)
  const [pacienteExpandido, setPacienteExpandido] = useState<string | null>(null)
  
  // 🔥 ESTADO DEL PERFIL PARA SABER EL ROL 🔥
  const [perfil, setPerfil] = useState<any>(null)
  const puedeVerFinanzas = perfil?.rol === 'ADMIN' || perfil?.rol === 'RECEPCIONISTA' || perfil?.rol === 'DENTISTA';

  const [refreshKey, setRefreshKey] = useState(0)

  // ==========================================
  // ESTADOS MÓDULO CAJA (PAGOS)
  // ==========================================
  const [modalPagoAbierto, setModalPagoAbierto] = useState(false)
  const [pacientePago, setPacientePago] = useState<any>(null)
  const [deudasPaciente, setDeudasPaciente] = useState<any[]>([])
  const [cargandoDeudas, setCargandoDeudas] = useState(false)
  const [montoIngresado, setMontoIngresado] = useState<number | ''>('')
  const [metodoPago, setMetodoPago] = useState('Tarjeta')
  const [codigoTransaccion, setCodigoTransaccion] = useState('')
  const [cargandoAccion, setCargandoAccion] = useState(false)
  
  // 🔥 ESTADO DE SALDO A FAVOR 🔥
  const [saldoAFavor, setSaldoAFavor] = useState(0)

  // ==========================================
  // ESTADOS MÓDULO ESTADO (BLOQUEO PACIENTE)
  // ==========================================
  const [modalEstadoAbierto, setModalEstadoAbierto] = useState(false)
  const [pacienteEstado, setPacienteEstado] = useState<any>(null)
  const [motivoBloqueo, setMotivoBloqueo] = useState('')
  const [cargandoEstado, setCargandoEstado] = useState(false)

  // ==========================================
  // ESTADOS MÓDULO FILTROS
  // ==========================================
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [filtros, setFiltros] = useState({
    convenio: '',
    sexo: '',
    tipoPaciente: '',
    soloConvenio: false,
    edadMin: '',
    edadMax: '',
  })
  // Cada convenio con todas las formas en que está escrito en las fichas (mayúsculas, espacios, etc.)
  const [opcionesConvenio, setOpcionesConvenio] = useState<{ nombre: string; valores: string[]; deshabilitado: boolean }[]>([])
  const [opcionesTipoPaciente, setOpcionesTipoPaciente] = useState<string[]>([])

  // Búsqueda aplicada (con espera para no consultar en cada tecla), total encontrado y paginación
  const [terminoBuscado, setTerminoBuscado] = useState('')
  const [total, setTotal] = useState<number | null>(null)
  const [limite, setLimite] = useState(PAGINA)
  const [cargandoMas, setCargandoMas] = useState(false)
  const reqRef = useRef(0)

  const cantidadFiltrosActivos = Object.entries(filtros).filter(([key, val]) => {
    if (typeof val === 'boolean') return val === true
    return String(val).trim() !== ''
  }).length

  const limpiarFiltros = () => setFiltros({
    convenio: '', sexo: '', tipoPaciente: '',
    soloConvenio: false, edadMin: '', edadMax: '',
  })

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const getUserProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data } = await supabase.from('perfiles').select('rol').eq('id', session.user.id).single()
        setPerfil(data)
      }
    }
    getUserProfile()
  }, [])

  // Carga las opciones reales para los selects de filtro: convenios creados en Administración + los que tienen las fichas
  useEffect(() => {
    const fetchOpcionesFiltro = async () => {
      // Por páginas: Supabase entrega máximo 1.000 filas (antes faltaban opciones de los pacientes restantes)
      const data: any[] = []
      for (let desde = 0; ; desde += 1000) {
        const { data: pag, error } = await supabase.from('pacientes').select('id, prevision, tipo_paciente').order('id').range(desde, desde + 999)
        if (error || !pag?.length) break
        data.push(...pag)
        if (pag.length < 1000) break
      }
      const { data: convs } = await supabase.from('convenios').select('nombre_convenio, estado')

      const mapa = new Map<string, { nombre: string; valores: Set<string>; deshabilitado: boolean }>()
      const agregar = (valor: any, nombre: string, deshabilitado: boolean) => {
        if (esSinConvenio(valor)) return
        const clave = normalizarConvenio(valor)
        const actual = mapa.get(clave)
        if (actual) { actual.valores.add(String(valor)); return }
        mapa.set(clave, { nombre, valores: new Set([String(valor), nombre]), deshabilitado })
      }
      for (const c of convs || []) {
        if (c.nombre_convenio) agregar(c.nombre_convenio, String(c.nombre_convenio).trim(), c.estado !== 'Habilitado')
      }
      for (const d of data) {
        if (d.prevision) agregar(d.prevision, String(d.prevision).trim(), false)
      }
      setOpcionesConvenio([...mapa.values()]
        .map(x => ({ nombre: x.nombre, valores: [...x.valores], deshabilitado: x.deshabilitado }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      if (data.length) setOpcionesTipoPaciente([...new Set(data.map((d: any) => d.tipo_paciente).filter(Boolean))].sort())
    }
    fetchOpcionesFiltro()
  }, [refreshKey])

  // El texto se aplica 600 ms después de dejar de escribir (mínimo 2 letras)
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    const t = busqueda.trim()
    if (t === '') { setTerminoBuscado(''); setBuscando(false); return }
    if (t.length < 2) { setBuscando(false); return }
    setBuscando(true)
    searchTimeoutRef.current = setTimeout(() => setTerminoBuscado(t), 600)
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [busqueda])

  // Al cambiar la búsqueda o los filtros se vuelve a la primera página
  useEffect(() => { setLimite(PAGINA) }, [verDeshabilitados, filtros, terminoBuscado])

  // Texto y filtros se combinan (antes, al cambiar un filtro se perdía lo escrito en el buscador)
  useEffect(() => { cargarPacientes() }, [verDeshabilitados, refreshKey, filtros, terminoBuscado, limite])

  const calcularFechaDesdeEdad = (edad: number) => {
    const hoy = new Date()
    const fecha = new Date(hoy.getFullYear() - edad, hoy.getMonth(), hoy.getDate())
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
  }

  async function cargarPacientes() {
    const id = ++reqRef.current
    const term = terminoBuscado
    const buscandoTexto = term.length >= 2
    if (buscandoTexto) setBuscando(true); else if (!cargandoMas) setLoading(true)

    try {
      let query = supabase.from('pacientes').select('*', { count: 'exact' }).eq('activo', !verDeshabilitados)

      if (buscandoTexto) {
        // Se quitan caracteres que rompen la consulta (comas, paréntesis, comodines)
        const palabras = term.split(/\s+/).map(p => p.replace(/[,()*%\\]/g, '')).filter(p => p.length > 0)
        // Sin importar tildes, diéresis ni ñ y RUT con o sin puntos
        palabras.forEach((palabra) => {
          const filtro = filtroPalabraPaciente(palabra)
          if (filtro) query = query.or(filtro)
        })
      }

      // 🔥 FILTROS 🔥
      // Convenio (se guarda en pacientes.prevision)
      if (filtros.convenio === CONVENIO_NINGUNO) {
        query = query.or('prevision.is.null,prevision.eq.,prevision.ilike.sin*convenio*,prevision.ilike.particular*')
      } else if (filtros.convenio === CONVENIO_ALGUNO) {
        query = query.not('prevision', 'is', null).neq('prevision', '')
          .not('prevision', 'ilike', 'sin%convenio%').not('prevision', 'ilike', 'particular%')
      } else if (filtros.convenio) {
        const opcion = opcionesConvenio.find(o => o.nombre === filtros.convenio)
        query = query.in('prevision', opcion ? opcion.valores : [filtros.convenio])
      }
      if (filtros.sexo) query = query.eq('sexo', filtros.sexo)
      if (filtros.tipoPaciente) query = query.eq('tipo_paciente', filtros.tipoPaciente)
      if (filtros.soloConvenio) query = query.eq('tarjeta_comunidad', true)
      // Edad mínima: nació hace al menos X años -> fecha_nacimiento <= hoy-X
      if (filtros.edadMin) query = query.lte('fecha_nacimiento', calcularFechaDesdeEdad(Number(filtros.edadMin)))
      // Edad máxima: nació hace como mucho X+1 años -> fecha_nacimiento >= hoy-(X+1)
      if (filtros.edadMax) query = query.gte('fecha_nacimiento', calcularFechaDesdeEdad(Number(filtros.edadMax) + 1))

      const { data, count, error } = await query.order('nombre', { ascending: true }).order('id').range(0, limite - 1)
      if (id !== reqRef.current) return // llegó la respuesta de una búsqueda anterior
      if (error) { toast.error('No se pudieron cargar los pacientes'); return }
      setPacientes(data || [])
      setTotal(count ?? null)
    } finally {
      if (id === reqRef.current) {
        setLoading(false)
        setBuscando(false)
        setCargandoMas(false)
      }
    }
  }

  // ==========================================
  // LÓGICA DE RECAUDACIÓN UNIFICADA
  // ==========================================
  const abrirCaja = async (paciente: any) => {
    setPacientePago(paciente);
    setMontoIngresado('');
    setMetodoPago('Tarjeta');
    setCodigoTransaccion('');
    setModalPagoAbierto(true);
    setCargandoDeudas(true);

    try {
        // 🔥 NUEVO: Traer el saldo a favor del paciente
        const { data: pacData } = await supabase.from('pacientes').select('saldo_a_favor').eq('id', paciente.id).single();
        setSaldoAFavor(Number(pacData?.saldo_a_favor || 0));

        const rutLimpio = paciente.rut.trim();
        const rutFuzzy = `%${rutLimpio.replaceAll('.', '').split('').join('%')}%`;

        // 1. Buscar Planes Oficiales (Aprobados explícita o implícitamente por pago)
        const { data: todosLosPresupuestos, error: errPres } = await supabase
            .from('presupuestos').select('id, id_dentalink, aprobado, total_abonado').eq('paciente_id', paciente.id);
        if (errPres) throw errPres;

        const presupuestosAprobados = todosLosPresupuestos?.filter(p => p.aprobado === true || (p.total_abonado && p.total_abonado > 0)) || [];

        // 2. Buscar Planes Temporales (Dentalink)
        const { data: presTemporales } = await supabase
            .from('temp_presupuestos').select('id_dentalink').or(`rut.eq.${rutLimpio},rut.ilike.${rutFuzzy}`);

        const idsSupabase = presupuestosAprobados?.map(p => p.id) || [];
        const idsDentalinkOficiales = presupuestosAprobados?.filter(p => p.id_dentalink).map(p => String(p.id_dentalink)) || [];
        const idsSoloTemporales = presTemporales?.map(p => String(p.id_dentalink)) || [];
        
        // Unimos todos los IDs de Dentalink sin repetir
        const todosIdsDentalink = [...new Set([...idsDentalinkOficiales, ...idsSoloTemporales])];
        
        let itemsData: any[] = [];
        
        // 3. Traer ítems LOCALES
        if (idsSupabase.length > 0) {
            const { data, error } = await supabase
                .from('presupuesto_items')
                .select(`id, observacion, precio_pactado, abonado, estado, profesional_id, prestaciones:prestacion_id("Nombre Accion", "Nombre")`)
                .in('presupuesto_id', idsSupabase)
                .not('estado', 'eq', 'cancelada');

            if (!error && data) {
                itemsData = [...itemsData, ...data.map(d => ({ ...d, isTemp: false }))];
            }
        }

        // 4. Traer ítems DENTALINK
        if (todosIdsDentalink.length > 0) {
            const { data, error } = await supabase
                .from('temp_items')
                .select(`id, nombre_prestacion, precio_pactado, abonado, estado`)
                .in('id_dentalink', todosIdsDentalink)
                .not('estado', 'eq', 'cancelada');

            if (!error && data) {
                itemsData = [...itemsData, ...data.map((d: any) => ({
                    id: d.id,
                    observacion: d.nombre_prestacion,
                    precio_pactado: d.precio_pactado,
                    abonado: d.abonado,
                    estado: d.estado,
                    isTemp: true,
                    profesional_id: null
                }))];
            }
        }

        const itemsConDeuda = itemsData.map(item => {
            const precio = Number(item.precio_pactado || 0);
            const abonado = Number(item.abonado || 0);
            const deuda = precio - abonado;
            
            let nombreDisplay = item.observacion || "Tratamiento";
            if (item.prestaciones) {
                nombreDisplay = item.prestaciones["Nombre Accion"] || item.prestaciones["Nombre"] || nombreDisplay;
            } else if (item.observacion && item.observacion.includes('|')) {
                nombreDisplay = item.observacion.split('|')[0].trim();
            }

            let estadoNormalizado = String(item.estado || 'pendiente').toLowerCase().trim();
            if (['atendido', 'realizado', 'terminado', 'completado', 'finalizado'].includes(estadoNormalizado)) {
                estadoNormalizado = 'realizado';
            }

            return { ...item, estado: estadoNormalizado, deuda, nombreDisplay };
        }).filter(item => item.deuda > 0)
          .sort((a, b) => {
              if (a.estado === 'realizado' && b.estado !== 'realizado') return -1;
              if (a.estado !== 'realizado' && b.estado === 'realizado') return 1;
              return 0;
          });

        setDeudasPaciente(itemsConDeuda);
    } catch (e) {
        console.error(e);
        toast.error("Error al cargar las deudas del paciente");
        setModalPagoAbierto(false);
    } finally {
        setCargandoDeudas(false);
    }
  }

  const procesarPagoCaja = async () => {
    if (!montoIngresado || Number(montoIngresado) <= 0) return toast.error("Ingrese un monto válido a recaudar");
    if ((metodoPago === 'Tarjeta' || metodoPago === 'Transferencia' || metodoPago === 'Efectivo') && !codigoTransaccion.trim()) return toast.error("Ingrese el N° de boleta o código de transacción");

    // 🔥 NUEVO: Validar y descontar Billetera Virtual
    if (metodoPago === 'Saldo a Favor') {
       if (Number(montoIngresado) > saldoAFavor) return toast.error("El monto supera el saldo disponible en la billetera.");
       await supabase.from('pacientes').update({ saldo_a_favor: saldoAFavor - Number(montoIngresado) }).eq('id', pacientePago.id);
    }

    setCargandoAccion(true);
    let montoRestante = Number(montoIngresado);
    
    try {
        for (const item of deudasPaciente) {
            if (montoRestante <= 0) break;
            const aAbonar = Math.min(item.deuda, montoRestante);
            
            // Registramos en la tabla pagos
            await supabase.from('pagos').insert([{
                paciente_id: pacientePago.id,
                monto: aAbonar,
                metodo_pago: metodoPago,
                numero_referencia: codigoTransaccion.trim() || null,
                fecha_pago: new Date().toISOString(),
                item_id: item.isTemp ? null : item.id, 
                profesional_id: item.profesional_id || null
            }]);
            
            // Actualizamos el abono en la tabla correspondiente
            if (item.isTemp) {
                await supabase.from('temp_items').update({ abonado: Number(item.abonado) + aAbonar }).eq('id', item.id);
            } else {
                await supabase.from('presupuesto_items').update({ abonado: Number(item.abonado) + aAbonar }).eq('id', item.id);
            }
            montoRestante -= aAbonar;
        }

        toast.success(`Pago de $${Number(montoIngresado).toLocaleString('es-CL')} procesado con éxito.`);
        setModalPagoAbierto(false);
        setMontoIngresado('');
        setCodigoTransaccion('');
        setRefreshKey(prev => prev + 1);
    } catch (e) {
        toast.error("Ocurrió un error al procesar el pago");
    } finally {
        setCargandoAccion(false);
    }
  }

  const calcularDeudaTotalCaja = () => deudasPaciente.reduce((acc, curr) => acc + curr.deuda, 0);

  // ==========================================
  // LÓGICA DE BLOQUEO / DESBLOQUEO
  // ==========================================
  const abrirModalBloqueo = (paciente: any) => {
    setPacienteEstado(paciente);
    setMotivoBloqueo('');
    setModalEstadoAbierto(true);
  }

  const cambiarEstadoPaciente = async () => {
    if (!pacienteEstado) return;
    setCargandoEstado(true);
    const nuevoEstado = !pacienteEstado.activo;

    try {
      if (!nuevoEstado && !motivoBloqueo.trim()) {
        toast.error("Debe ingresar el motivo de la inhabilitación.");
        setCargandoEstado(false);
        return;
      }

      await supabase.from('pacientes').update({
        activo: nuevoEstado,
        motivo_deshabilitado: nuevoEstado ? null : motivoBloqueo.trim()
      }).eq('id', pacienteEstado.id);

      toast.success(nuevoEstado ? "Paciente reactivado exitosamente" : "Paciente inhabilitado con éxito");
      setModalEstadoAbierto(false);
      setMotivoBloqueo('');
      setRefreshKey(prev => prev + 1);

    } catch (error) {
      toast.error("Error al actualizar el estado del paciente");
    } finally {
      setCargandoEstado(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 bg-[#FBF8F2] min-h-screen text-left text-slate-800 font-sans pb-24">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
          <div className="text-left">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0A111F]">
              Pacientes
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Base de datos maestra</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setVerDeshabilitados(!verDeshabilitados)} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm border ${verDeshabilitados ? 'text-[#0A111F]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`} style={verDeshabilitados ? { backgroundColor: GOLD, borderColor: GOLD } : undefined}>
              {verDeshabilitados ? <UserCheck size={14} /> : <UserX size={14} />} {verDeshabilitados ? 'Ver Activos' : 'Ver Inactivos'}
            </button>
            <Link href="/pacientes/nuevo" className="flex-1 sm:flex-none px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 text-[#0A111F] bg-[#C9A24B] hover:bg-[#B38D3A]">
              <UserPlus size={16} /> Nuevo Ingreso
            </Link>
          </div>
        </div>

        {/* BUSCADOR + FILTROS */}
        <div className="relative">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative w-full group">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#C9A24B] transition-colors">
                {buscando ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              </div>
              <input type="text" placeholder="Filtrar por nombre, RUT o identificación..." className="w-full bg-white border border-slate-200 py-3.5 pl-14 pr-4 rounded-full shadow-sm outline-none font-bold text-sm text-slate-700 focus:border-[#C9A24B] focus:ring-4 focus:ring-[#C9A24B]/10 transition-all" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <button
              onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}
              className={`flex items-center justify-center gap-2 px-5 py-3 rounded-full shadow-sm text-[11px] font-black uppercase tracking-wider shrink-0 border transition-all ${
                filtrosAbiertos || cantidadFiltrosActivos > 0
                  ? 'text-[#0A111F] border-transparent'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
              style={filtrosAbiertos || cantidadFiltrosActivos > 0 ? { backgroundColor: GOLD } : undefined}
            >
              <SlidersHorizontal size={14} />
              Filtros
              {cantidadFiltrosActivos > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#0A111F] text-white text-[9px] flex items-center justify-center">{cantidadFiltrosActivos}</span>
              )}
              <ChevronDown size={13} className={`transition-transform ${filtrosAbiertos ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* PANEL DE FILTROS */}
          <AnimatePresence>
            {filtrosAbiertos && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="mt-3 bg-white border border-slate-200 rounded-[2rem] shadow-lg p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Convenio</label>
                      <select
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-[#C9A24B] transition-all cursor-pointer"
                        value={filtros.convenio}
                        onChange={(e) => setFiltros(prev => ({ ...prev, convenio: e.target.value }))}
                      >
                        <option value="">Todos</option>
                        <option value={CONVENIO_ALGUNO}>Con cualquier convenio</option>
                        <option value={CONVENIO_NINGUNO}>Sin convenio / Particular</option>
                        <optgroup label="Convenio específico">
                          {opcionesConvenio.map(op => (
                            <option key={op.nombre} value={op.nombre}>{op.nombre}{op.deshabilitado ? ' (deshabilitado)' : ''}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Sexo</label>
                      <select
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-[#C9A24B] transition-all cursor-pointer"
                        value={filtros.sexo}
                        onChange={(e) => setFiltros(prev => ({ ...prev, sexo: e.target.value }))}
                      >
                        <option value="">Todos</option>
                        <option value="Masculino">Masculino</option>
                        <option value="Femenino">Femenino</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>

                    {opcionesTipoPaciente.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Tipo de paciente</label>
                        <select
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-[#C9A24B] transition-all cursor-pointer"
                          value={filtros.tipoPaciente}
                          onChange={(e) => setFiltros(prev => ({ ...prev, tipoPaciente: e.target.value }))}
                        >
                          <option value="">Todos</option>
                          {opcionesTipoPaciente.map(op => <option key={op} value={op}>{op}</option>)}
                        </select>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Edad mínima</label>
                      <input
                        type="number" min={0} placeholder="Ej: 18"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-[#C9A24B] transition-all"
                        value={filtros.edadMin}
                        onChange={(e) => setFiltros(prev => ({ ...prev, edadMin: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Edad máxima</label>
                      <input
                        type="number" min={0} placeholder="Ej: 65"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-[#C9A24B] transition-all"
                        value={filtros.edadMax}
                        onChange={(e) => setFiltros(prev => ({ ...prev, edadMax: e.target.value }))}
                      />
                    </div>

                    <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-[#C9A24B] cursor-pointer"
                        checked={filtros.soloConvenio}
                        onChange={(e) => setFiltros(prev => ({ ...prev, soloConvenio: e.target.checked }))}
                      />
                      <span className="text-[11px] font-bold text-slate-600">Solo con tarjeta comunidad</span>
                    </label>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <button
                      onClick={limpiarFiltros}
                      disabled={cantidadFiltrosActivos === 0}
                      className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Limpiar filtros
                    </button>
                    <button
                      onClick={() => setFiltrosAbiertos(false)}
                      className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#0A111F] shadow-sm hover:brightness-105 transition-all"
                      style={{ backgroundColor: GOLD }}
                    >
                      Listo
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* CANTIDAD ENCONTRADA */}
        {!loading && total !== null && (
          <p className="text-[11px] font-bold text-slate-500 pl-2 -mb-2">
            {total.toLocaleString('es-CL')} paciente{total === 1 ? '' : 's'}{total > pacientes.length ? ` · mostrando ${pacientes.length.toLocaleString('es-CL')}` : ''}
          </p>
        )}

        {/* LISTADO DE PACIENTES */}
        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#C9A24B]" size={36} /></div>
        ) : pacientes.length === 0 ? (
          <div className="py-20 text-center text-slate-400 font-bold text-sm bg-white rounded-[2rem] border border-slate-100 shadow-sm">
            No se encontraron pacientes.
          </div>
        ) : (
          <div className="space-y-4">
            {pacientes.map((p) => (
              <FilaPaciente
                key={p.id}
                p={p}
                isExpanded={pacienteExpandido === p.id}
                onExpand={() => setPacienteExpandido(pacienteExpandido === p.id ? null : p.id)}
                onPagar={() => abrirCaja(p)}
                onCambiarEstado={() => abrirModalBloqueo(p)}
                refreshKey={refreshKey}
                perfil={perfil}
              />
            ))}
            {total !== null && total > pacientes.length && (
              <button
                onClick={() => { setCargandoMas(true); setLimite(l => l + PAGINA) }}
                disabled={cargandoMas}
                className="w-full py-3.5 rounded-2xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-[#C9A24B] hover:text-[#0A111F] transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {cargandoMas ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
                Cargar {Math.min(PAGINA, total - pacientes.length)} más
              </button>
            )}
          </div>
        )}
      </div>

      {/* MODAL CAMBIO DE ESTADO (DESHABILITAR / REACTIVAR) */}
      <AnimatePresence>
        {modalEstadoAbierto && pacienteEstado && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
             <motion.div
               initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
               className="bg-white max-w-md w-full rounded-[2.5rem] p-8 sm:p-10 shadow-2xl text-center"
             >
                <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 border-[8px] ${pacienteEstado.activo ? 'bg-red-50 text-red-500 border-red-500/10' : 'bg-emerald-50 text-emerald-500 border-emerald-500/10'}`}>
                  {pacienteEstado.activo ? <AlertTriangle size={32}/> : <ShieldCheck size={32}/>}
                </div>
                
                <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tighter text-[#0A111F] mb-2">
                  {pacienteEstado.activo ? 'Inhabilitar Paciente' : 'Reactivar Paciente'}
                </h3>
                
                <p className="text-xs font-medium text-slate-500 mb-8 leading-relaxed">
                  {pacienteEstado.activo
                    ? `Al inhabilitar a ${pacienteEstado.nombre}, se bloqueará el acceso a su ficha y no se le podrán agendar nuevas citas. Por favor, indique el motivo.`
                    : `El paciente ${pacienteEstado.nombre} volverá a tener acceso normal a la clínica y se podrán gestionar sus tratamientos y citas.`}
                </p>

                {pacienteEstado.activo && (
                  <div className="text-left mb-8">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2 mb-2 block">Motivo del bloqueo</label>
                    <textarea
                      placeholder="Ej: Deuda pendiente prolongada, Comportamiento inadecuado, etc."
                      className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-50 transition-all resize-none"
                      rows={3}
                      value={motivoBloqueo}
                      onChange={(e) => setMotivoBloqueo(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex items-center gap-3">
                   <button onClick={() => setModalEstadoAbierto(false)} disabled={cargandoEstado} className="flex-1 p-4 rounded-2xl font-black text-[10px] uppercase text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all">
                     Cancelar
                   </button>
                   <button onClick={cambiarEstadoPaciente} disabled={cargandoEstado || (pacienteEstado.activo && !motivoBloqueo.trim())} className={`flex-1 p-4 rounded-2xl font-black text-[10px] uppercase text-white shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${pacienteEstado.activo ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'}`}>
                     {cargandoEstado ? <Loader2 size={16} className="animate-spin"/> : pacienteEstado.activo ? 'Bloquear Ficha' : 'Reactivar'}
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE CAJA (RECAUDACIÓN DE PAGOS) */}
      <AnimatePresence>
        {modalPagoAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden text-left">
                <div className="p-6 sm:p-8 border-b border-slate-100 flex justify-between items-center shrink-0 text-left" style={{ background: `linear-gradient(135deg, ${NAVY}, #081420)` }}>
                   <div className="flex items-center gap-4 text-left">
                      <div className="p-3 rounded-2xl shadow-sm" style={{ backgroundColor: 'rgba(201,162,75,0.15)', border: `1px solid ${GOLD}` }}><ReceiptText size={24} style={{ color: GOLD_LIGHT }}/></div>
                      <div>
                        <h2 className="font-display text-lg sm:text-xl tracking-tight text-white leading-none">Caja y Pagos</h2>
                        <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest mt-1" style={{ color: GOLD }}>Paciente: {pacientePago?.nombre} {pacientePago?.apellido}</p>
                      </div>
                   </div>
                   <button onClick={() => setModalPagoAbierto(false)} className="p-2 text-white/60 hover:bg-white/10 rounded-full transition-colors shrink-0"><X size={22}/></button>
                </div>

                <div className="p-6 sm:p-8 bg-slate-50 flex-1 overflow-y-auto custom-scrollbar">
                    {cargandoDeudas ? (
                        <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={40}/></div>
                    ) : deudasPaciente.length === 0 ? (
                        <div className="py-12 text-center text-slate-400">
                           <CheckCircle2 size={60} className="mx-auto text-emerald-400 mb-4 opacity-50"/>
                           <p className="text-sm font-black uppercase tracking-widest text-slate-600">Al día</p>
                           <p className="text-xs mt-1">El paciente no tiene tratamientos aprobados con deuda pendiente.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                           <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm text-center md:text-left flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div>
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Deuda Pendiente Total</h4>
                                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter">${calcularDeudaTotalCaja().toLocaleString('es-CL')}</p>
                              </div>
                              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto md:mx-0"><AlertTriangle size={24}/></div>
                           </div>

                           <div>
                              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 pl-2">Detalle de Tratamientos Aprobados</h4>
                              <div className="space-y-2">
                                 {deudasPaciente.map(d => (
                                     <div key={d.id} className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:border-[#C9A24B]/40 gap-3">
                                         <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-xs font-black uppercase text-slate-800 leading-tight">{d.nombreDisplay}</p>
                                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${d.estado === 'realizado' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                                                    {d.estado}
                                                </span>
                                            </div>
                                            <p className="text-[9px] font-bold text-slate-400 mt-1 tracking-widest">Pactado: ${Number(d.precio_pactado).toLocaleString('es-CL')} | Pagado: ${Number(d.abonado).toLocaleString('es-CL')}</p>
                                         </div>
                                         <p className="text-sm font-black text-red-500 shrink-0">${d.deuda.toLocaleString('es-CL')}</p>
                                     </div>
                                 ))}
                              </div>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                              <div className="space-y-2">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Método de Pago</label>
                                 <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] focus:ring-4 focus:ring-[#C9A24B]/10 transition-all cursor-pointer shadow-sm" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                                     <option value="Tarjeta">Tarjeta (Débito/Crédito)</option>
                                     <option value="Efectivo">Efectivo</option>
                                     <option value="Transferencia">Transferencia</option>
                                     {/* 🔥 NUEVA OPCIÓN DE SALDO A FAVOR 🔥 */}
                                     {saldoAFavor > 0 && (
                                        <option value="Saldo a Favor">💰 Saldo a Favor (${saldoAFavor.toLocaleString('es-CL')})</option>
                                     )}
                                 </select>
                              </div>
                              <div className="space-y-2 text-left">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Monto a Recaudar ($)</label>
                                 <input type="number" placeholder="Ej: 50000" className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-lg text-emerald-600 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-sm placeholder:text-slate-300" value={montoIngresado} onChange={(e) => setMontoIngresado(Number(e.target.value))} />
                              </div>
                              
                              {metodoPago !== 'Saldo a Favor' && (
                                <div className="space-y-2 md:col-span-2">
                                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">
                                     {metodoPago === 'Efectivo' ? 'N° Boleta' : 'Cód. Transacción'} (*)
                                   </label>
                                   <input 
                                     type="text" 
                                     placeholder={metodoPago === 'Efectivo' ? 'Ej: 12345' : 'Ej: TX-98765'} 
                                     className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-[#C9A24B] placeholder:text-slate-300 uppercase transition-all shadow-sm" value={codigoTransaccion} onChange={(e) => setCodigoTransaccion(e.target.value)} />
                                </div>
                              )}
                           </div>
                        </div>
                    )}
                </div>

                <div className="p-6 sm:p-8 border-t border-slate-100 bg-white shrink-0">
                   <button
                      onClick={procesarPagoCaja}
                      disabled={cargandoAccion || deudasPaciente.length === 0 || !montoIngresado}
                      className="w-full py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:brightness-110"
                      style={{ background: NAVY, color: GOLD_LIGHT }}
                   >
                      {cargandoAccion ? <Loader2 className="animate-spin" size={18}/> : <Coins size={18}/>}
                      Registrar Pago Seguro
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  )
}

// --- COMPONENTE FILA CON DATOS REALES DE BD (FUSIÓN NUEVO + DENTALINK + ANTECEDENTES) ---
function FilaPaciente({ p, isExpanded, onExpand, onPagar, onCambiarEstado, refreshKey, perfil }: any) {
  const [stats, setStats] = useState({ activos: 0, finalizados: 0, totalP: 0, abonado: 0, realizado: 0, saldoAFavor: 0, loading: false });
  const [antecedentesBD, setAntecedentesBD] = useState<any[]>([]);
  
  // 🔥 ESTADOS PARA EL BOTÓN "VER MÁS" 🔥
  const [mostrarTodosAntecedentes, setMostrarTodosAntecedentes] = useState(false);
  const MAX_ANT = 3;

  const esAsistente = perfil?.rol === 'ASISTENTE';

  useEffect(() => {
    if (isExpanded) {
      fetchPacienteStats();
    }
  }, [isExpanded, refreshKey]);

  async function fetchPacienteStats() {
    setStats(prev => ({ ...prev, loading: true }));
    try {
      const { data: antData } = await supabase
          .from('antecedentes')
          .select('categoria, contenido')
          .eq('paciente_id', p.id);
      
      if (antData) setAntecedentesBD(antData);

      // Traer el saldo actualizado
      const { data: pacActual } = await supabase.from('pacientes').select('saldo_a_favor').eq('id', p.id).single();
      const saldoReal = Number(pacActual?.saldo_a_favor || 0);

      const rutLimpio = p.rut.trim();
      const rutFuzzy = `%${rutLimpio.replaceAll('.', '').split('').join('%')}%`;

      // 🔥 CORREGIDO: Traer total_abonado para detectar planes aprobados implícitamente
      const { data: presOficiales } = await supabase.from('presupuestos').select('id, estado, aprobado, id_dentalink, total_abonado').eq('paciente_id', p.id);
      const { data: presTemporales } = await supabase.from('temp_presupuestos').select('id_dentalink').or(`rut.eq.${rutLimpio},rut.ilike.${rutFuzzy}`);
      
      const activos = presOficiales?.filter(x => x.estado !== 'finalizado' && x.estado !== 'cancelado').length || 0;
      const finalizados = presOficiales?.filter(x => x.estado === 'finalizado').length || 0;
      // 🔥 CORREGIDO: Un plan se considera aprobado si tiene la marca O si ya se le ha abonado dinero.
      const presAprobados = presOficiales?.filter(x => x.aprobado === true || (x.total_abonado && x.total_abonado > 0)) || [];
      
      let totalPresupuestado = 0; let totalAbonado = 0; let totalRealizado = 0;

      if (presAprobados.length > 0) {
          const idsSupabase = presAprobados.filter(x => !x.id_dentalink).map(x => x.id);
          if (idsSupabase.length > 0) {
              const { data: itemsLocal } = await supabase.from('presupuesto_items').select('precio_pactado, abonado, estado').in('presupuesto_id', idsSupabase).not('estado', 'eq', 'cancelada');
              itemsLocal?.forEach(item => {
                  totalPresupuestado += Number(item.precio_pactado || 0);
                  totalAbonado += Number(item.abonado || 0);
                  if (item.estado === 'realizado') totalRealizado += Number(item.precio_pactado || 0);
              });
          }
      }

      const idsDentalinkOficiales = presAprobados.filter(x => x.id_dentalink).map(x => String(x.id_dentalink));
      const idsSoloTemporales = presTemporales?.map(x => String(x.id_dentalink)) || [];
      const todosIdsDentalink = [...new Set([...idsDentalinkOficiales, ...idsSoloTemporales])];

      if (todosIdsDentalink.length > 0) {
          const { data: itemsDentalink } = await supabase.from('temp_items').select('precio_pactado, abonado, estado').in('id_dentalink', todosIdsDentalink).not('estado', 'eq', 'cancelada');
          itemsDentalink?.forEach(item => {
              totalPresupuestado += Number(item.precio_pactado || 0);
              totalAbonado += Number(item.abonado || 0);
              const st = String(item.estado).toLowerCase().trim();
              if (['atendido', 'realizado', 'terminado', 'completado', 'finalizado'].includes(st)) totalRealizado += Number(item.precio_pactado || 0);
          });
      }

      setStats({ activos, finalizados, totalP: totalPresupuestado, abonado: totalAbonado, realizado: totalRealizado, saldoAFavor: saldoReal, loading: false });
    } catch (e) {
      console.error(e);
      setStats(prev => ({ ...prev, loading: false }));
    }
  }

  const calcularEdad = (fechaNacimiento: string) => {
    if (!fechaNacimiento) return '--';
    const hoy = new Date(); const nac = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad;
  }

  const saldoPendiente = stats.totalP - stats.abonado;
  const tieneAntecedentes = antecedentesBD.length > 0;

  return (
    <div className={`bg-white rounded-[2rem] border shadow-sm overflow-hidden transition-all ${isExpanded ? 'border-[#C9A24B]/50 shadow-md' : 'border-slate-100'}`}>
      
      {/* FILA PRINCIPAL (COLAPSADA) */}
      <div onClick={onExpand} className={`cursor-pointer transition-all relative ${isExpanded ? 'bg-[#C9A24B]/5' : 'hover:bg-slate-50/60'} ${isExpanded ? 'border-l-4' : 'border-l-4 border-transparent'}`} style={isExpanded ? { borderLeftColor: GOLD } : undefined}>
        <div className="flex items-center justify-between gap-3 p-4 sm:p-6">
          <div className="flex items-center gap-3 sm:gap-5 min-w-0">
            <div className={`w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center font-black text-xs sm:text-sm shrink-0 transition-all relative ${!p.activo ? 'bg-red-50 text-red-400' : 'text-white'}`} style={p.activo ? { backgroundColor: NAVY } : undefined}>
              {p.nombre?.[0]}{p.apellido?.[0]}
              {p.activo && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />}
            </div>
            <div className="min-w-0 text-left">
              <p className={`font-black uppercase text-xs sm:text-sm leading-tight mb-1 truncate ${!p.activo ? 'text-slate-400 line-through' : 'text-[#0A111F]'}`}>{p.nombre} {p.apellido}</p>
              <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${p.activo ? 'text-emerald-500' : 'text-red-500'}`}>
                {p.activo ? <><CheckCircle2 size={10}/> Paciente Vigente</> : <><AlertTriangle size={10}/> Archivo Bloqueado</>}
              </span>
              <span className="sm:hidden text-[10px] font-bold text-slate-400 mt-1 block">{p.rut}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline-block text-[11px] font-black text-slate-600 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl tracking-wide">{p.rut}</span>
            <div className={`p-2.5 sm:p-3 rounded-2xl transition-all shadow-sm ${isExpanded ? 'text-white' : 'bg-white border border-slate-200 text-slate-400'}`} style={isExpanded ? { backgroundColor: NAVY } : undefined}>
               {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
        </div>
      </div>

      {/* CONTENIDO EXPANDIDO */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 sm:px-6 pb-6">
              <div className="flex items-center justify-between mb-4 pt-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identificación</span>
                <span className="text-[11px] font-black text-slate-700 bg-white border border-slate-200 px-4 py-1.5 rounded-lg">{p.rut}</span>
              </div>

              {stats.loading ? (
                 <div className="p-16 flex flex-col items-center justify-center gap-3 bg-slate-50/50 rounded-[1.5rem] border border-slate-100">
                     <Loader2 className="animate-spin" style={{ color: GOLD }} size={32} />
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando Historial...</p>
                 </div>
              ) : (
                 <div className={`grid grid-cols-1 ${esAsistente ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
                     
                     {/* COLUMNA 1: DATOS PERSONALES */}
                     <div className="p-6 flex flex-col h-full bg-slate-50/60 rounded-[1.5rem] border border-slate-100">
                        <div className="flex-1 space-y-4">
                           <div>
                              <p className="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest flex items-center gap-1.5">
                                  <User size={12} className="text-[#C9A24B]"/> Ficha Personal
                              </p>
                              <h3 className="text-base sm:text-lg font-black text-[#0A111F] leading-tight mt-2 uppercase">{p.nombre} {p.apellido}</h3>
                              <p className="text-xs font-bold text-slate-500 mt-1">{calcularEdad(p.fecha_nacimiento)} años</p>
                           </div>
                           
                           {/* CAJA DE ANTECEDENTES CON LÓGICA DE VER MÁS */}
                           <div className={`p-4 rounded-2xl text-[11px] font-bold flex gap-3 items-start border shadow-sm ${tieneAntecedentes ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                              {tieneAntecedentes ? <AlertTriangle size={18} className="shrink-0 text-red-500" /> : <ShieldCheck size={18} className="shrink-0 text-emerald-500" />}
                              
                              {tieneAntecedentes ? (
                                  <div className="flex flex-col w-full items-start min-w-0">
                                      <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1.5">Antecedentes Médicos</span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {antecedentesBD.slice(0, mostrarTodosAntecedentes ? antecedentesBD.length : MAX_ANT).map((ant, idx) => (
                                          <span key={idx} className="bg-white/80 border border-red-200 text-red-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase leading-tight shadow-sm">
                                            {ant.categoria}: {ant.contenido}
                                          </span>
                                        ))}
                                        
                                        {!mostrarTodosAntecedentes && antecedentesBD.length > MAX_ANT && (
                                           <button 
                                              onClick={(e) => { e.stopPropagation(); setMostrarTodosAntecedentes(true); }} 
                                              className="bg-red-500 text-white px-2 py-1 rounded-lg text-[9px] font-black uppercase hover:bg-red-600 transition-all shadow-sm"
                                           >
                                              +{antecedentesBD.length - MAX_ANT} más
                                           </button>
                                        )}
                                      </div>
                                      
                                      {mostrarTodosAntecedentes && antecedentesBD.length > MAX_ANT && (
                                           <button 
                                              onClick={(e) => { e.stopPropagation(); setMostrarTodosAntecedentes(false); }} 
                                              className="text-[9px] font-black text-red-500 uppercase mt-2 hover:underline tracking-widest"
                                           >
                                              Mostrar menos
                                           </button>
                                      )}
                                  </div>
                              ) : (
                                  <div className="flex flex-col">
                                      <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5">Antecedentes Médicos</span>
                                      <span>Paciente Sano. Sin antecedentes registrados.</span>
                                  </div>
                              )}
                           </div>
                           
                           <div className="space-y-2 text-[11px] font-bold text-slate-600 pt-2 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                              <p className="flex items-center gap-2"><Fingerprint size={14} className="text-slate-400 shrink-0"/> {p.rut}</p>
                              <p className="flex items-center gap-2 truncate"><Mail size={14} className="text-slate-400 shrink-0"/> <span className="truncate">{p.email || 'Sin correo'}</span></p>
                              <p className="flex items-center gap-2"><Phone size={14} className="text-slate-400 shrink-0"/> {p.telefono || 'Sin teléfono'}</p>
                              <p className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-50" style={{ color: '#8A6D2F' }}><ShieldCheck size={14} style={{ color: GOLD }}/> {p.prevision || 'Particular'}</p>
                           </div>
                        </div>
                        <Link href={`/pacientes/${p.id}/datos`} className="w-full mt-5 py-3.5 text-white text-[10px] font-black uppercase hover:brightness-125 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md" style={{ backgroundColor: NAVY }}>
                           Actualizar Datos <ChevronRight size={14}/>
                        </Link>
                     </div>

                     {/* COLUMNA 2: TRATAMIENTOS */}
                     <div className="p-6 flex flex-col h-full bg-slate-50/60 rounded-[1.5rem] border border-slate-100">
                        <div className="flex-1 space-y-5">
                           <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-200 pb-3">
                               <Stethoscope size={14} style={{ color: GOLD }}/> Resumen Clínico
                           </h4>
                           
                           <div className="grid grid-cols-2 gap-3">
                               <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center shadow-sm">
                                   <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-blue-50 flex items-center justify-center">
                                     <ClipboardList size={18} className="text-blue-500" />
                                   </div>
                                   <p className="text-2xl sm:text-3xl font-black text-slate-800 mb-1">{stats.activos}</p>
                                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Planes Activos</p>
                               </div>
                               <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center shadow-sm">
                                   <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-emerald-50 flex items-center justify-center">
                                     <CheckCircle2 size={18} className="text-emerald-500" />
                                   </div>
                                   <p className="text-2xl sm:text-3xl font-black text-slate-800 mb-1">{stats.finalizados}</p>
                                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Finalizados</p>
                               </div>
                           </div>
                        </div>
                        <Link href={`/pacientes/${p.id}`} className="w-full mt-5 py-3.5 text-white text-[10px] font-black uppercase hover:brightness-125 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md" style={{ backgroundColor: NAVY }}>
                           Abrir Ficha Clínica <ChevronRight size={14}/>
                        </Link>
                     </div>

                     {/* COLUMNA 3: RECAUDACIÓN */}
                     {!esAsistente && (
                       <div className="p-6 flex flex-col h-full bg-slate-50/60 rounded-[1.5rem] border border-slate-100">
                          <div className="flex-1 space-y-4">
                             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-200 pb-3">
                                 <Wallet size={14} style={{ color: GOLD }}/> Estado Financiero
                             </h4>
                             
                             {stats.saldoAFavor > 0 && (
                               <div className="flex justify-between items-center bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20 shadow-sm">
                                   <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Saldo a Favor</span>
                                   <span className="text-sm font-black text-emerald-600">+${stats.saldoAFavor.toLocaleString('es-CL')}</span>
                               </div>
                             )}

                             <div className="space-y-3">
                                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Pactado</span>
                                    <span className="text-sm font-black text-slate-900">${stats.totalP.toLocaleString('es-CL')}</span>
                                </div>
                                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Abonado</span>
                                    <span className="text-sm font-black text-emerald-600">${stats.abonado.toLocaleString('es-CL')}</span>
                                </div>
                                
                                <div className={`flex justify-between items-center p-4 rounded-2xl border shadow-sm ${saldoPendiente > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${saldoPendiente > 0 ? 'text-red-800' : 'text-emerald-800'}`}>Saldo por abonar</span>
                                    <span className={`text-lg sm:text-xl font-black ${saldoPendiente > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        ${saldoPendiente > 0 ? saldoPendiente.toLocaleString('es-CL') : '0'}
                                    </span>
                                </div>
                             </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); onPagar(); }} className="w-full mt-5 py-3.5 text-[#0A111F] text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2 shadow-md hover:brightness-105" style={{ backgroundColor: GOLD }}>
                             <Coins size={14}/> Ir a Recaudación
                          </button>
                       </div>
                     )}

                 </div>
              )}
              
              {['ADMIN', 'RECEPCIONISTA'].includes(perfil?.rol) && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4 p-4 sm:p-5 bg-slate-50/60 rounded-[1.5rem] border border-slate-100">
                    <div className="flex items-start gap-2 text-left">
                      <ShieldCheck size={16} className="text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-black text-slate-700">{p.activo ? '¿Deseas inhabilitar esta ficha?' : '¿Deseas reactivar esta ficha?'}</p>
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5">{p.activo ? 'Inhabilitar la ficha de paciente impide su uso en nuevas atenciones.' : 'Reactivar la ficha permite volver a agendar y atender al paciente.'}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onCambiarEstado(); }}
                      className={`w-full sm:w-auto shrink-0 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border shadow-sm ${
                        p.activo ? 'text-red-500 border-red-200 bg-white hover:bg-red-50' : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      {p.activo ? <ShieldAlert size={14}/> : <ShieldCheck size={14}/>}
                      {p.activo ? 'Inhabilitar Ficha de Paciente' : 'Reactivar Paciente'}
                    </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

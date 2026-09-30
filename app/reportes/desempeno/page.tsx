'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Calendar, DollarSign, Clock, Activity, ArrowUpRight, ArrowDownRight,
  FileText, Stethoscope, Package, Wallet, Users, Layers, AlertTriangle, Info, X,
  UserPlus, ShieldCheck, Minus, PieChart as PieIcon, TrendingUp
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell,
  PieChart, Pie, ComposedChart, Line, Legend
} from 'recharts'

const COLORS_PIE = ['#0d9488', '#38bdf8', '#b45309', '#1e293b', '#94a3b8']
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

function pct(curr: number, prev: number) {
  if (!prev) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}
function money(v: number) {
  return `$${Math.round(v || 0).toLocaleString('es-CL')}`
}
function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`
}
function calculatePaidLabCost(payment: any, item: any) {
  const amount = Number(payment?.monto || 0)
  const agreedPrice = Number(item?.precio_pactado || amount || 0)
  const laboratoryCost = Number(item?.costo_laboratorio || 0)
  if (!agreedPrice || !laboratoryCost || amount <= 0) return 0
  return laboratoryCost * Math.min(1, amount / agreedPrice)
}
function normalizeCategory(value: any) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}
function isLaboratoryCategory(value: any) {
  const category = normalizeCategory(value)
  return category.includes('laborator') || category.includes('kit quirurg') || category.includes('sedacion') || category.includes('radiograf')
}
function recordedCashSessionTotal(session: any) {
  if (session?.estado === 'cerrada' && session.monto_cierre !== null && session.monto_cierre !== undefined) return Number(session.monto_cierre || 0)
  return Number(session?.monto_apertura || 0) + Number(session?.total_efectivo_esperado || 0) + Number(session?.total_tarjeta_esperado || 0) + Number(session?.total_transferencia_esperado || 0)
}

export default function PanelDesempenoNegocio() {
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [showLegend, setShowLegend] = useState(false)

  useEffect(() => {
    setMounted(true)
    fetchMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, anio])

  async function fetchMetrics() {
    setLoading(true)
    setData(null) 
    setErrorMessage(null)
    
    try {
      const inicioMes = new Date(anio, mes - 1, 1).toISOString()
      const finMes = new Date(anio, mes, 0, 23, 59, 59).toISOString()
      const inicioMesAnt = new Date(anio, mes - 2, 1).toISOString()
      const finMesAnt = new Date(anio, mes - 1, 0, 23, 59, 59).toISOString()
      const fechaHistorialInicio = new Date(anio, mes - 6, 1).toISOString()
      const periodoInicio = `${anio}-${String(mes).padStart(2, '0')}-01`
      const ultimoDiaPeriodo = new Date(anio, mes, 0).getDate()
      const periodoFin = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDiaPeriodo).padStart(2, '0')}`
      const inicioRango = `${periodoInicio} 00:00:00`
      const finRango = `${periodoFin} 23:59:59`
      const pagosSelect = 'monto, fecha_pago, profesional_id, paciente_id, item_id, caja_id, presupuesto_id, estado'
      const comparacionInicio = new Date(anio - 1, mes - 1, 1).toISOString()

      const results = await Promise.all([
        supabase.from('sesiones_caja').select('*, pagos(monto, metodo_pago, estado)').gte('fecha_apertura', inicioMes).lte('fecha_apertura', finMes),
        supabase.from('sesiones_caja').select('fecha_apertura, estado, monto_cierre, monto_apertura, total_efectivo_esperado, total_tarjeta_esperado, total_transferencia_esperado').gte('fecha_apertura', fechaHistorialInicio).lte('fecha_apertura', finMes),
        supabase.from('sesiones_caja').select('fecha_apertura, estado, monto_cierre, monto_apertura, total_efectivo_esperado, total_tarjeta_esperado, total_transferencia_esperado').gte('fecha_apertura', comparacionInicio).lte('fecha_apertura', finMes),
        supabase.from('liquidaciones').select('profesional_id, monto_total, periodo_desde, periodo_hasta, fecha_pago, profesionales(nombre, apellido)').gte('periodo_desde', periodoInicio).lte('periodo_desde', periodoFin),
        supabase.from('profesionales').select('id, user_id, nombre, apellido, porcentaje_comision, especialidad_id, especialidades(nombre)').eq('activo', true),
        supabase.from('atenciones_realizadas').select('monto_cobrado, fecha, paciente_id, profesional_id, prestaciones:prestacion_id("Nombre Accion", "Nombre")').gte('fecha', inicioRango).lte('fecha', finRango),
        supabase.from('atenciones_realizadas').select('paciente_id, fecha').lt('fecha', inicioRango),
        supabase.from('citas').select('inicio, estado, estado_confirmacion, hora_llegada, hora_inicio_atencion, profesional_id, paciente_id').gte('inicio', inicioMes).lte('inicio', finMes),
        supabase.from('egresos').select('categoria, monto').gte('fecha', inicioMes).lte('fecha', finMes),
        supabase.from('pacientes').select('id, nombre, apellido, created_at'),
        supabase.from('presupuestos').select('id, paciente_id, total, total_abonado, aprobado, created_at, nombre_tratamiento, especialista_id').gte('created_at', inicioRango).lte('created_at', finRango)
      ])

      const failedIndex = results.findIndex(result => result.error)
      if (failedIndex >= 0) {
        const failed = results[failedIndex].error
        throw new Error(`Consulta ${failedIndex + 1}: ${failed?.message || failed?.details || 'Error desconocido de Supabase'}`)
      }
      const [cajaResult, cajaHistorialResult, cajasComparacionResult, liquidacionesResult, profesionalesResult, atencionesResult, historialAtencionesResult, citasResult, egresosResult, pacientesResult, presupuestosResult] = results
      const cajaData = cajaResult.data || []
      const cajaHistorial = cajaHistorialResult.data || []
      const cajasComparacion = cajasComparacionResult.data || []
      const liquidacionesData = liquidacionesResult.data || []
      const profesionalesData = profesionalesResult.data || []
      const atencionesData = atencionesResult.data || []
      const historialAtencionesData: any[] = [...(historialAtencionesResult.data || [])]
      const citasData = citasResult.data || []
      const egresosData = egresosResult.data || []
      const pacientesData = pacientesResult.data || []
      const presupuestosData = presupuestosResult.data || []
      const pagosData: any[] = []
      for (let from = 0; ; from += 1000) {
        const { data: pagosPagina, error: pagosError } = await supabase
          .from('pagos')
          .select(pagosSelect)
          .gte('fecha_pago', inicioRango)
          .lte('fecha_pago', finRango)
          .neq('estado', 'Anulado')
          .range(from, from + 999)
        if (pagosError) throw pagosError
        pagosData.push(...(pagosPagina || []))
        if (!pagosPagina || pagosPagina.length < 1000) break
      }
      for (let from = 1000; historialAtencionesData.length >= from; from += 1000) {
        const { data: atencionesPagina, error: historialError } = await supabase
          .from('atenciones_realizadas')
          .select('paciente_id, fecha')
          .lt('fecha', inicioRango)
          .range(from, from + 999)
        if (historialError) throw historialError
        historialAtencionesData.push(...(atencionesPagina || []))
        if (!atencionesPagina || atencionesPagina.length < 1000) break
      }
      const itemIds = [...new Set(pagosData.map(pago => pago.item_id).filter(Boolean))]
      const itemsById: Record<string, any> = {}
      for (let from = 0; from < itemIds.length; from += 500) {
        const ids = itemIds.slice(from, from + 500)
        const { data: itemsPagina, error: itemsError } = await supabase
          .from('presupuesto_items')
          .select('id, profesional_id, prestacion_id, nombre_prestacion, precio_pactado, costo_laboratorio, lab_pagado_por_dr, estado, tipo_reparto, porcentaje_forzado')
          .in('id', ids)
        if (itemsError) throw itemsError
        ;(itemsPagina || []).forEach(item => { itemsById[item.id] = item })
      }
      const prestacionIds = [...new Set(Object.values(itemsById).map(item => item.prestacion_id).filter(Boolean))]
      const prestacionesById: Record<string, any> = {}
      for (let from = 0; from < prestacionIds.length; from += 500) {
        const ids = prestacionIds.slice(from, from + 500)
        const { data: prestacionesPagina, error: prestacionesError } = await supabase
          .from('prestaciones')
          .select('id, "Nombre Categoria"')
          .in('id', ids)
        if (prestacionesError) throw prestacionesError
        ;(prestacionesPagina || []).forEach(prestacion => { prestacionesById[prestacion.id] = prestacion })
      }
      const patientIds = [...new Set([
        ...pagosData.map(pago => pago.paciente_id),
        ...presupuestosData.map((presupuesto: any) => presupuesto.paciente_id)
      ].filter(Boolean))]
      const pacientesById: Record<string, any> = {}
      for (let from = 0; from < patientIds.length; from += 500) {
        const ids = patientIds.slice(from, from + 500)
        const { data: pacientesPagina, error: pacientesError } = await supabase
          .from('pacientes')
          .select('id, nombre, apellido, created_at')
          .in('id', ids)
        if (pacientesError) throw pacientesError
        ;(pacientesPagina || []).forEach(paciente => { pacientesById[paciente.id] = paciente })
      }

      // ── 1. CAJAS (Ingresos reales) ───────────────────────────
      let efectivo = 0, tarjeta = 0, transferencia = 0, totalIngresosCaja = 0
      ;(cajaData || []).forEach((c: any) => {
        const pagosCaja = (c.pagos || []).filter((p: any) => p.estado !== 'Anulado' && String(p.metodo_pago || '').toLowerCase() !== 'saldo a favor')
        const cierreRegistrado = c.estado === 'cerrada' && c.monto_cierre !== null && c.monto_cierre !== undefined
        const efectivoEsperado = Number(c.total_efectivo_esperado || 0)
        const tarjetaEsperada = Number(c.total_tarjeta_esperado || 0)
        const transferenciaEsperada = Number(c.total_transferencia_esperado || 0)
        const tieneDesgloseEsperado = efectivoEsperado + tarjetaEsperada + transferenciaEsperada > 0

        if (tieneDesgloseEsperado) {
          efectivo += efectivoEsperado
          tarjeta += tarjetaEsperada
          transferencia += transferenciaEsperada
        } else if (pagosCaja.length) {
          pagosCaja.forEach((p: any) => {
            const metodo = String(p.metodo_pago || '').toLowerCase()
            const monto = Number(p.monto || 0)
            if (metodo.includes('efectivo')) efectivo += monto
            else if (metodo.includes('transfer')) transferencia += monto
            else tarjeta += monto
          })
        }
        const pagosTotales = pagosCaja.reduce((sum: number, pago: any) => sum + Number(pago.monto || 0), 0)
        const totalCajaAbierta = Number(c.monto_apertura || 0) + (tieneDesgloseEsperado ? efectivoEsperado + tarjetaEsperada + transferenciaEsperada : pagosTotales)
        totalIngresosCaja += cierreRegistrado ? Number(c.monto_cierre || 0) : totalCajaAbierta
      })

      // ── 2. DESEMPEÑO MÉDICO Y REPARTO (Liquidaciones) ────────
      let ventaLaboratorio = 0, totalLab = 0, totalHonorarios = 0, totalMargenClinica = 0, produccionDetalle = 0
      const profStats: Record<string, any> = {}

      const profByUserId = Object.fromEntries(profesionalesData.map((p: any) => [p.user_id, p]))
      const profById = Object.fromEntries(profesionalesData.map((p: any) => [p.id, p]))
      const ensureDoctor = (profesionalId: string | null, fallbackName?: string) => {
        const prof = profByUserId[profesionalId || ''] || profById[profesionalId || '']
        const name = prof ? `${prof.nombre} ${prof.apellido}` : (fallbackName || 'Sin Asignar')
        if (!profStats[name]) profStats[name] = { produccion: 0, honorarios: 0, lab: 0, clinica: 0, atenciones: 0 }
        return { stats: profStats[name], prof }
      }

      ;(atencionesData || []).forEach((at: any) => {
        const monto = Number(at.monto_cobrado || 0)
        const prof = profByUserId[at.profesional_id || '']
        if (!prof) return
        const { stats } = ensureDoctor(prof.id)
        const porcentaje = Number(prof?.porcentaje_comision || 40) / 100
        const honorario = monto * porcentaje
        stats.produccion += monto
        stats.honorarios += honorario
        stats.clinica += Math.max(0, monto - honorario)
        stats.atenciones += 1
        produccionDetalle += monto
        totalHonorarios += honorario
        totalMargenClinica += Math.max(0, monto - honorario)
      })

      ;(pagosData || []).forEach((pago: any) => {
        const item = itemsById[pago.item_id]
        if (!item) return
        const profesionalId = pago.profesional_id || item?.profesional_id || null
        const monto = Number(pago.monto || 0)
        const categoria = prestacionesById[item?.prestacion_id]?.['Nombre Categoria']
        const lab = isLaboratoryCategory(categoria) ? calculatePaidLabCost(pago, item) : 0
        if (isLaboratoryCategory(categoria)) {
          ventaLaboratorio += monto
          totalLab += lab
        }
        const prof = profByUserId[profesionalId || '']
        if (!prof) return
        const { stats } = ensureDoctor(prof.id)
        const terminado = ['realizado', 'atendido', 'terminado', 'finalizado', 'completado'].includes(String(item?.estado || '').toLowerCase())
        const porcentajeBase = Number(prof?.porcentaje_comision || 40) / 100
        let porcentajeDoctor = porcentajeBase
        if (item?.tipo_reparto === 'doctor') porcentajeDoctor = 1
        if (item?.tipo_reparto === 'clinica') porcentajeDoctor = 0
        if (item?.tipo_reparto === 'forzado') porcentajeDoctor = Number(item?.porcentaje_forzado || 0) / 100
        const honorario = terminado ? monto * porcentajeDoctor + (item?.lab_pagado_por_dr ? lab : 0) : 0
        const clinica = Math.max(0, monto - lab - (terminado ? monto * porcentajeDoctor : 0))
        stats.produccion += monto
        stats.honorarios += honorario
        stats.lab += lab
        stats.clinica += clinica
        stats.atenciones += 1
        produccionDetalle += monto
        totalHonorarios += honorario
        totalMargenClinica += clinica
      })

      const chartRepartoGlobal = [
        { name: 'Honorarios Médicos', value: totalHonorarios },
        { name: 'Margen Clínica', value: totalMargenClinica },
        { name: 'Costos Laboratorio', value: totalLab }
      ].filter(x => x.value > 0)

      const chartProfesionales = Object.entries(profStats)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.produccion - a.produccion)
      const produccionDoctores = chartProfesionales.reduce((total: number, doctor: any) => total + Number(doctor.produccion || 0), 0)

      const categoriaStats: Record<string, number> = {}
      const pacienteStats: Record<string, number> = {}
      ;(pagosData || []).forEach((pago: any) => {
        const item = itemsById[pago.item_id]
        if (!item) return
        const categoria = prestacionesById[item?.prestacion_id]?.['Nombre Categoria'] || 'Sin categoría'
        const monto = Number(pago.monto || 0)
        categoriaStats[categoria] = (categoriaStats[categoria] || 0) + monto
        if (pago.paciente_id) pacienteStats[pago.paciente_id] = (pacienteStats[pago.paciente_id] || 0) + monto
      })
      const chartCategorias = Object.entries(categoriaStats)
        .map(([name, ingresos]) => ({ name, ingresos }))
        .sort((a, b) => b.ingresos - a.ingresos)
      const chartPacientes = Object.entries(pacienteStats)
        .map(([id, ingresos]) => ({
          name: pacientesById[id] ? `${pacientesById[id].nombre} ${pacientesById[id].apellido}` : 'Paciente sin ficha',
          ingresos
        }))
        .sort((a, b) => b.ingresos - a.ingresos)
        .slice(0, 10)
      const citasTotales = citasData?.length || 0
      const pacientesNuevos = pacientesData.filter((paciente: any) => {
        const fecha = new Date(paciente.created_at).getTime()
        return fecha >= new Date(inicioRango).getTime() && fecha <= new Date(finRango).getTime()
      }).length
      const presupuestosNoAprobados = presupuestosData
        .filter((presupuesto: any) => !presupuesto.aprobado && Number(presupuesto.total || 0) > 0)
        .map((presupuesto: any) => ({
          ...presupuesto,
          paciente: pacientesById[presupuesto.paciente_id] ? `${pacientesById[presupuesto.paciente_id].nombre} ${pacientesById[presupuesto.paciente_id].apellido}` : 'Paciente sin ficha'
        }))
        .sort((a: any, b: any) => Number(b.total || 0) - Number(a.total || 0))
        .slice(0, 8)
      const citasCanceladas = (citasData || []).filter((cita: any) => /cancel|anulad/i.test(String(cita.estado || ''))).length
      const citasAusentes = (citasData || []).filter((cita: any) => /ausent|no.?show|inasist/i.test(`${cita.estado || ''} ${cita.estado_confirmacion || ''}`)).length
      const tasaCancelacion = citasTotales ? Math.round((citasCanceladas / citasTotales) * 1000) / 10 : 0
      const tasaAusencia = citasTotales ? Math.round((citasAusentes / citasTotales) * 1000) / 10 : 0
      const especialidadStats: Record<string, number> = {}
      const profesionalesActivos: any[] = profesionalesData as any[]
      chartProfesionales.forEach((doctor: any) => {
        const profesional = profesionalesActivos.find((item: any) => `${item.nombre} ${item.apellido}` === doctor.name)
        const especialidades: any = profesional?.especialidades
        const especialidad = Array.isArray(especialidades) ? especialidades[0]?.nombre : especialidades?.nombre
        const nombre = especialidad || 'Sin especialidad'
        especialidadStats[nombre] = (especialidadStats[nombre] || 0) + Number(doctor.produccion || 0)
      })
      const chartEspecialidades = Object.entries(especialidadStats)
        .map(([name, produccion]) => ({ name, produccion }))
        .sort((a, b) => b.produccion - a.produccion)

      // Total liquidado en el mes (según cierres formales)
      const liquidacionesTotal = (liquidacionesData || []).reduce((a: number, l: any) => a + Number(l.monto_total || 0), 0)

      // ── 3. TRATAMIENTOS MÁS VENDIDOS ─────────────────────────
      const tratStats: Record<string, { cantidad: number, ingresos: number }> = {}
      let atencionesRealizadasMes = 0
      ;(atencionesData || []).forEach((at: any) => {
        atencionesRealizadasMes++
        const prestacion = Array.isArray(at.prestaciones) ? at.prestaciones[0] : at.prestaciones
        const nombreTrat = prestacion?.['Nombre Accion'] || prestacion?.Nombre || 'Atención directa'
        const monto = Number(at.monto_cobrado || 0)
        
        if (!tratStats[nombreTrat]) tratStats[nombreTrat] = { cantidad: 0, ingresos: 0 }
        tratStats[nombreTrat].cantidad += 1
        tratStats[nombreTrat].ingresos += monto
      })
      ;(pagosData || []).forEach((pago: any) => {
        const item = itemsById[pago.item_id]
        if (!item) return
        const nombreTrat = item?.nombre_prestacion || 'Abono sin tratamiento'
        const monto = Number(pago.monto || 0)
        if (!tratStats[nombreTrat]) tratStats[nombreTrat] = { cantidad: 0, ingresos: 0 }
        tratStats[nombreTrat].cantidad += 1
        tratStats[nombreTrat].ingresos += monto
      })
      const chartTratamientos = Object.entries(tratStats)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.ingresos - a.ingresos)
        .slice(0, 10) // Top 10
      if (atencionesRealizadasMes === 0) {
        atencionesRealizadasMes = citasData.filter((cita: any) => cita.hora_inicio_atencion || /atendid|realizad|finalizad|completad/i.test(String(cita.estado || ''))).length
      }

      // ── 4. EGRESOS FIJOS ─────────────────────────────────────
      const egresosTotal = (egresosData || []).reduce((a: number, e: any) => a + Number(e.monto || 0), 0)
      const egresosPorCategoria = Object.entries(
        (egresosData || []).reduce((acc: any, e: any) => {
          const cat = e.categoria || 'Otros'
          acc[cat] = (acc[cat] || 0) + Number(e.monto || 0)
          return acc
        }, {})
      ).map(([categoria, monto]) => ({ categoria, monto: monto as number })).sort((a, b) => b.monto - a.monto)

      // ── 5. OPERACIÓN Y AGENDA ────────────────────────────────
      const citasAnuladas = (citasData || []).filter((c: any) => /cancel|anulad/i.test(String(c.estado || ''))).length
      const ocupacion = citasTotales > 0 ? Math.round(((citasTotales - citasAnuladas) / citasTotales) * 100) : 0

      // Tiempos de espera
      const esperas = (citasData || [])
        .filter((c: any) => c.hora_llegada && c.hora_inicio_atencion)
        .map((c: any) => (new Date(c.hora_inicio_atencion).getTime() - new Date(c.hora_llegada).getTime()) / 60000)
        .filter((m: number) => m >= 0 && m < 240)
      const esperaPromedio = esperas.length ? Math.round((esperas.reduce((a: number, b: number) => a + b, 0) / esperas.length) * 10) / 10 : null

      // ── 6. HISTORIAL DE CAJAS (Últimos 6 meses) ──────────────
      const mapCajas: Record<string, number> = {}
      for (const c of (cajaHistorial || [])) {
        const key = monthKey(new Date(c.fecha_apertura))
        const esperado = Number(c.total_efectivo_esperado || 0) + Number(c.total_tarjeta_esperado || 0) + Number(c.total_transferencia_esperado || 0)
        const sum = c.estado === 'cerrada' && c.monto_cierre !== null && c.monto_cierre !== undefined
          ? Number(c.monto_cierre || 0)
          : Number(c.monto_apertura || 0) + esperado
        mapCajas[key] = (mapCajas[key] || 0) + sum
      }
      
      const chartHistory = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(anio, mes - 1 - i, 1)
        const key = monthKey(d)
        chartHistory.push({
          name: MESES[d.getMonth()],
          Recaudacion: mapCajas[key] || 0,
        })
      }

      const pagosEnCaja = pagosData.filter((pago: any) => pago.caja_id).reduce((total, pago: any) => total + Number(pago.monto || 0), 0)
      const utilidadNeta = totalIngresosCaja - totalLab - egresosTotal
      const cajasPorMes: Record<string, number> = {}
      cajasComparacion.forEach((caja: any) => {
        const fecha = new Date(caja.fecha_apertura)
        const key = `${fecha.getFullYear()}-${fecha.getMonth() + 1}`
        cajasPorMes[key] = (cajasPorMes[key] || 0) + recordedCashSessionTotal(caja)
      })
      const currentMonthKey = `${anio}-${mes}`
      const previousDate = new Date(anio, mes - 2, 1)
      const previousMonthKey = `${previousDate.getFullYear()}-${previousDate.getMonth() + 1}`
      const previousYearKey = `${anio - 1}-${mes}`
      const comparacionMensual = {
        actual: totalIngresosCaja,
        mesAnterior: cajasPorMes[previousMonthKey] || 0,
        mismoMesAnterior: cajasPorMes[previousYearKey] || 0
      }
      const pacientesDelPeriodo = new Set<string>([
        ...pagosData.map((pago: any) => pago.paciente_id),
        ...atencionesData.map((atencion: any) => atencion.paciente_id),
        ...citasData.map((cita: any) => cita.paciente_id)
      ].filter(Boolean))
      const pacientesNuevosIds = new Set(Object.values(pacientesById)
        .filter((paciente: any) => pacientesDelPeriodo.has(paciente.id) && new Date(paciente.created_at).getTime() >= new Date(inicioRango).getTime() && new Date(paciente.created_at).getTime() <= new Date(finRango).getTime())
        .map((paciente: any) => paciente.id))
      const pacientesConHistorial = new Set(historialAtencionesData.map((atencion: any) => atencion.paciente_id).filter(Boolean))
      const pacientesQueRetornan = [...pacientesDelPeriodo].filter(id => {
        const paciente = pacientesById[id]
        const fichaAnterior = paciente?.created_at && new Date(paciente.created_at).getTime() < new Date(inicioRango).getTime()
        return pacientesConHistorial.has(id) || fichaAnterior
      }).length
      const pacientesRecurrentes = pacientesQueRetornan
      const tasaRetorno = pacientesDelPeriodo.size ? Math.round((pacientesQueRetornan / pacientesDelPeriodo.size) * 1000) / 10 : 0
      const presupuestosAprobados = presupuestosData.filter((presupuesto: any) => presupuesto.aprobado || Number(presupuesto.total_abonado || 0) > 0)
      const tasaConversion = presupuestosData.length ? Math.round((presupuestosAprobados.length / presupuestosData.length) * 1000) / 10 : 0
      const primeraFechaPagoPorPresupuesto: Record<string, number> = {}
      pagosData.forEach((pago: any) => {
        if (!pago.presupuesto_id) return
        const fechaPago = new Date(pago.fecha_pago).getTime()
        if (!primeraFechaPagoPorPresupuesto[pago.presupuesto_id] || fechaPago < primeraFechaPagoPorPresupuesto[pago.presupuesto_id]) primeraFechaPagoPorPresupuesto[pago.presupuesto_id] = fechaPago
      })
      const tiemposAprobacion = presupuestosAprobados.map((presupuesto: any) => {
        const fechaPago = primeraFechaPagoPorPresupuesto[presupuesto.id]
        return fechaPago ? (fechaPago - new Date(presupuesto.created_at).getTime()) / 86400000 : null
      }).filter((dias: number | null): dias is number => dias !== null && dias >= 0)
      const tiempoPromedioAprobacion = tiemposAprobacion.length ? Math.round((tiemposAprobacion.reduce((a, b) => a + b, 0) / tiemposAprobacion.length) * 10) / 10 : null
      const cotizadosStats: Record<string, number> = {}
      presupuestosData.forEach((presupuesto: any) => {
        const nombre = presupuesto.nombre_tratamiento || 'Plan sin nombre'
        cotizadosStats[nombre] = (cotizadosStats[nombre] || 0) + Number(presupuesto.total || 0)
      })
      const chartCotizados = Object.entries(cotizadosStats).map(([name, ingresos]) => ({ name, ingresos })).sort((a, b) => b.ingresos - a.ingresos).slice(0, 10)
      const produccionPorDia: Record<string, number> = {}
      atencionesData.forEach((atencion: any) => {
        const fecha = new Date(atencion.fecha)
        const key = fecha.toLocaleDateString('es-CL', { weekday: 'long' })
        produccionPorDia[key] = (produccionPorDia[key] || 0) + Number(atencion.monto_cobrado || 0)
      })
      const chartProduccionPorDia = Object.entries(produccionPorDia).map(([name, produccion]) => ({ name, produccion })).sort((a, b) => b.produccion - a.produccion)
      const demandaPorHora: Record<string, number> = {}
      citasData.forEach((cita: any) => {
        if (!cita.inicio) return
        const hora = `${String(new Date(cita.inicio).getHours()).padStart(2, '0')}:00`
        demandaPorHora[hora] = (demandaPorHora[hora] || 0) + 1
      })
      const chartDemandaPorHora = Object.entries(demandaPorHora).map(([name, citas]) => ({ name, citas })).sort((a, b) => b.citas - a.citas)
      const pacientesPorDoctor: Record<string, Set<string>> = {}
      chartProfesionales.forEach((doctor: any) => { pacientesPorDoctor[doctor.name] = new Set() })
      atencionesData.forEach((atencion: any) => {
        const profesional = profByUserId[atencion.profesional_id]
        if (!profesional) return
        const nombre = `${profesional.nombre} ${profesional.apellido}`
        if (!pacientesPorDoctor[nombre]) pacientesPorDoctor[nombre] = new Set()
        if (atencion.paciente_id) pacientesPorDoctor[nombre].add(atencion.paciente_id)
      })
      const comparacionDoctores = chartProfesionales.map((doctor: any) => ({ ...doctor, pacientes: pacientesPorDoctor[doctor.name]?.size || 0 }))
      const esperaPorDoctor: Record<string, { total: number, cantidad: number }> = {}
      citasData.forEach((cita: any) => {
        if (!cita.hora_llegada || !cita.hora_inicio_atencion || !cita.profesional_id) return
        const minutos = (new Date(cita.hora_inicio_atencion).getTime() - new Date(cita.hora_llegada).getTime()) / 60000
        if (minutos < 0 || minutos >= 240) return
        const profesional = profByUserId[cita.profesional_id]
        if (!profesional) return
        const nombre = `${profesional.nombre} ${profesional.apellido}`
        if (!esperaPorDoctor[nombre]) esperaPorDoctor[nombre] = { total: 0, cantidad: 0 }
        esperaPorDoctor[nombre].total += minutos
        esperaPorDoctor[nombre].cantidad += 1
      })
      const chartEsperaPorDoctor = Object.entries(esperaPorDoctor).map(([name, value]) => ({ name, espera: Math.round((value.total / value.cantidad) * 10) / 10 })).sort((a, b) => b.espera - a.espera)

      setData({
        finanzas: {
          totalIngresosCaja, efectivo, tarjeta, transferencia,
          totalLab, totalHonorarios, totalMargenClinica, produccionDetalle,
          ventaLaboratorio,
          produccionDoctores,
          utilidadNeta,
          pagosEnCaja,
          diferenciaPagosCajas: totalIngresosCaja - pagosEnCaja,
          comparacionMensual,
          liquidacionesTotal,
          egresosTotal, egresosPorCategoria
        },
        operacion: {
          atencionesRealizadasMes,
          ocupacion, citasTotales, citasAnuladas, citasCanceladas, citasAusentes, tasaCancelacion, tasaAusencia, pacientesNuevos,
          pacientesRecurrentes, tasaRetorno, presupuestosCreados: presupuestosData.length, presupuestosAprobados: presupuestosAprobados.length, tasaConversion, tiempoPromedioAprobacion,
          esperaPromedio,
          sesionesCaja: cajaData?.length || 0,
        },
        charts: {
          repartoGlobal: chartRepartoGlobal,
          profesionales: chartProfesionales,
          tratamientos: chartTratamientos,
          cotizados: chartCotizados,
          produccionPorDia: chartProduccionPorDia,
          demandaPorHora: chartDemandaPorHora,
          doctores: comparacionDoctores,
          esperaPorDoctor: chartEsperaPorDoctor,
          categorias: chartCategorias,
          pacientes: chartPacientes,
          especialidades: chartEspecialidades,
          presupuestosNoAprobados,
          history: chartHistory
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron cargar las métricas.'
      console.error('Error cargando panel de desempeño:', message)
      setErrorMessage(message)
    } finally {
      setLoading(false)
    }
  }

  if (!mounted || loading) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-400">
      <PulseSpinner />
      <p className="text-xs uppercase tracking-widest font-bold mt-4">Analizando métricas de negocio…</p>
    </div>
  )

  if (errorMessage || !data) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div className="max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-rose-500">No se pudo cargar el panel</p>
        <p className="mt-3 text-sm font-medium text-slate-600">{errorMessage || 'No hay datos disponibles para este periodo.'}</p>
        <button onClick={fetchMetrics} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700">Reintentar</button>
      </div>
    </div>
  )

  const hLast = data.charts.history[data.charts.history.length - 1]
  const hPrev = data.charts.history[data.charts.history.length - 2]
  const deltaCaja = pct(hLast?.Recaudacion, hPrev?.Recaudacion)

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 space-y-8">

        {/* HEADER */}
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-6 sm:p-8 shadow-sm">
          <div className="absolute inset-0 opacity-[0.07]" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '18px 18px'
          }} />
          <div className="relative flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck size={16} className="text-teal-400" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-400">Inteligencia de Negocio</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Desempeño Clínico</h1>
              <p className="text-xs text-slate-400 mt-1">Cajas, liquidaciones y ventas · {MESES[mes - 1]} {anio}</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" onClick={() => setShowLegend(true)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20 transition" title="Ver definición y fuente de cada dato">
                <Info size={14} /> Leyenda
              </button>
              <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="bg-white/10 border border-white/10 rounded-lg px-4 py-2 text-xs font-bold uppercase text-white outline-none cursor-pointer hover:bg-white/20 transition">
                {MESES.map((m, i) => <option key={m} value={i + 1} className="text-slate-900">{m}</option>)}
              </select>
              <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="bg-white/10 border border-white/10 rounded-lg px-4 py-2 text-xs font-bold text-white outline-none cursor-pointer hover:bg-white/20 transition">
                {[2024, 2025, 2026].map(a => <option key={a} value={a} className="text-slate-900">{a}</option>)}
              </select>
            </div>
          </div>
          <PulseLine />
        </div>

        {/* KPIs PRINCIPALES */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <VitalCard icon={Wallet} label="Ingreso Cajas (Mes)" value={money(data.finanzas.totalIngresosCaja)} delta={deltaCaja} history={data.charts.history} dataKey="Recaudacion" accent="#0d9488" />
          <VitalCard icon={Stethoscope} label="Ventas Doctor" value={money(data.finanzas.produccionDoctores)} plain accent="#38bdf8" />
          <VitalCard icon={PieIcon} label="ingreso por Clinica" value={money(data.finanzas.totalMargenClinica)} plain accent="#1e293b" />
          <VitalCard icon={TrendingUp} label="Venta Laboratorio (Paciente)" value={money(data.finanzas.ventaLaboratorio)} plain accent="#b45309" />
          <VitalCard icon={Package} label="Costo Laboratorio (Clínica)" value={money(data.finanzas.totalLab)} plain accent="#7c3aed" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryPanel title="Utilidad Neta" value={money(data.finanzas.utilidadNeta)} detail="Cajas - laboratorio - egresos" accent="text-emerald-600" />
          <SummaryPanel title="Diferencia Pagos / Cierres" value={money(data.finanzas.diferenciaPagosCajas)} detail="Conciliación del periodo" accent={data.finanzas.diferenciaPagosCajas === 0 ? 'text-emerald-600' : 'text-amber-600'} />
          <SummaryPanel title="Conversión de Presupuestos" value={`${data.operacion.tasaConversion}%`} detail={`${data.operacion.presupuestosAprobados} aprobados de ${data.operacion.presupuestosCreados} creados`} accent="text-sky-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <SectionTitle icon={TrendingUp} label="Comparación Mensual" />
            <div className="space-y-3">
              <MiniStat label="Mes actual" value={money(data.finanzas.comparacionMensual.actual)} />
              <MiniStat label="Mes anterior" value={money(data.finanzas.comparacionMensual.mesAnterior)} />
              <MiniStat label="Mismo mes año anterior" value={money(data.finanzas.comparacionMensual.mismoMesAnterior)} />
            </div>
          </div>
          <MetricList icon={Activity} title="Tratamientos Cotizados" items={data.charts.cotizados} valueLabel="Valor cotizado" />
          <MetricList icon={Calendar} title="Producción por Día" items={data.charts.produccionPorDia} valueLabel="Producción" valueKey="produccion" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MetricList icon={Layers} title="Ventas por Categoría" items={data.charts.categorias} valueLabel="Ingresos" />
          <MetricList icon={Users} title="Pacientes con Mayor Facturación" items={data.charts.pacientes} valueLabel="Pagado" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MetricList icon={Stethoscope} title="Producción por Especialidad" items={data.charts.especialidades} valueLabel="Producción" valueKey="produccion" />
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <SectionTitle icon={AlertTriangle} label="Presupuestos de Alto Valor No Aprobados" />
            {data.charts.presupuestosNoAprobados.length === 0 ? (
              <EmptyState text="No hay presupuestos pendientes de aprobación en este periodo." />
            ) : (
              <div className="space-y-3">
                {data.charts.presupuestosNoAprobados.map((presupuesto: any) => (
                  <div key={presupuesto.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{presupuesto.paciente}</p>
                      <p className="text-[10px] text-slate-400 truncate">{presupuesto.nombre_tratamiento || 'Plan de tratamiento'}</p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-amber-600">{money(Number(presupuesto.total || 0))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 1. CAJAS Y REPARTO GENERAL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <SectionTitle icon={DollarSign} label="Desglose de Ingresos Reales en Cajas" />
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <CajaStat label="Efectivo" value={data.finanzas.efectivo} total={data.finanzas.totalIngresosCaja} />
              <CajaStat label="Tarjeta (Transbank)" value={data.finanzas.tarjeta} total={data.finanzas.totalIngresosCaja} />
              <CajaStat label="Transferencia" value={data.finanzas.transferencia} total={data.finanzas.totalIngresosCaja} />
            </div>

            <p className="text-[10px] text-slate-400 mb-4 border-t border-slate-100 pt-4">Histórico de recaudación (cajas consolidadas)</p>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.charts.history}>
                  <defs>
                    <linearGradient id="colorRecaudacion" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} className="text-[10px] font-bold" />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000000}M`} className="text-[10px] font-bold text-slate-400" />
                  <Tooltip formatter={(val: any) => money(Number(val))} cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="Recaudacion" stroke="#0d9488" strokeWidth={3} fillOpacity={1} fill="url(#colorRecaudacion)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center">
            <SectionTitle icon={PieIcon} label="Distribución de Producción" noMargin />
            <p className="text-[10px] text-slate-400 mb-2 w-full text-center">Basado en liquidaciones realizadas</p>
            
            {data.charts.repartoGlobal.length === 0 ? (
               <div className="flex-1 flex items-center justify-center w-full"><EmptyState text="Sin liquidaciones procesadas este mes." /></div>
            ) : (
              <>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.charts.repartoGlobal} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">
                        {data.charts.repartoGlobal.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS_PIE[index % COLORS_PIE.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: any) => money(Number(val))} contentStyle={{ borderRadius: '8px', border: 'none', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full mt-2 space-y-2">
                  {data.charts.repartoGlobal.map((item: any, idx: number) => (
                    <div key={item.name} className="flex justify-between items-center text-xs font-bold text-slate-600">
                      <span className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS_PIE[idx % COLORS_PIE.length] }} />
                        {item.name}
                      </span>
                      <span className="text-slate-800">{money(item.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 2. DESEMPEÑO POR DOCTOR (BARRAS APILADAS) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <SectionTitle icon={Stethoscope} label="Desempeño y Producción por Médico" />
          <p className="text-xs text-slate-500 mb-6 max-w-2xl">
            Composición de la producción de cada profesional. Muestra visualmente cuánto de su trabajo corresponde a costo de laboratorio, honorarios propios y retención de la clínica.
          </p>
          
          {data.charts.profesionales.length === 0 ? (
            <EmptyState text="Aún no se registran liquidaciones detalladas en este mes." />
          ) : (
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.charts.profesionales} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" tickFormatter={(v) => `$${v / 1000000}M`} className="text-[10px] font-bold text-slate-400" />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={120} className="text-[10px] font-bold text-slate-700" />
                  <Tooltip formatter={(val: any) => money(Number(val))} cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '10px' }} />
                  
                  {/* Apilado: Honorarios + Lab + Clínica = Producción Total */}
                  <Bar dataKey="honorarios" name="Honorarios Doctor" stackId="a" fill="#0d9488" radius={[0, 0, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="lab" name="Costo Laboratorio" stackId="a" fill="#b45309" />
                  <Bar dataKey="clinica" name="Margen Clínica" stackId="a" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-8 border-t border-slate-100 pt-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Comparación por doctor</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {data.charts.doctores.map((doctor: any) => (
                <div key={doctor.name} className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold text-slate-700 truncate">{doctor.name}</span>
                  <span className="shrink-0 text-right text-slate-500">{money(doctor.produccion)} · {doctor.pacientes} pacientes · {money(doctor.clinica)} margen</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. TOP TRATAMIENTOS Y GASTOS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <SectionTitle icon={Activity} label="Tratamientos Más Vendidos (Ingresos)" />
            {data.charts.tratamientos.length === 0 ? (
              <EmptyState text="No hay atenciones realizadas registradas este mes." />
            ) : (
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.tratamientos} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={130} className="text-[10px] font-bold text-slate-600" />
                    <Tooltip formatter={(val: any, name: any) => name === 'ingresos' ? [money(Number(val)), 'Ingresos Totales'] : [val, 'Cantidad']} cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none' }} />
                    <Bar dataKey="ingresos" fill="#1e293b" radius={[0, 4, 4, 0]} barSize={16}>
                      {data.charts.tratamientos.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={index < 3 ? '#0d9488' : '#cbd5e1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <SectionTitle icon={FileText} label="Egresos Fijos y Gastos" noMargin />
              <span className="text-lg font-black text-rose-600">{money(data.finanzas.egresosTotal)}</span>
            </div>
            {data.finanzas.egresosPorCategoria.length === 0 ? (
              <EmptyState text="No hay egresos registrados este mes." />
            ) : (
              <div className="space-y-4">
                {data.finanzas.egresosPorCategoria.map((e: any, i: number) => {
                  const maxV = data.finanzas.egresosPorCategoria[0].monto || 1
                  return (
                    <div key={e.categoria}>
                      <div className="flex justify-between text-xs font-bold text-slate-600 mb-1.5">
                        <span>{e.categoria}</span>
                        <span>{money(e.monto)}</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.max((e.monto / maxV) * 100, 2)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 4. MÉTRICAS OPERATIVAS */}
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <SectionTitle icon={Clock} label="Rendimiento de Agenda" />
            <div className="space-y-4 mt-4">
              <MiniStat label="Atenciones realizadas" value={data.operacion.atencionesRealizadasMes} />
              <MiniStat label="Pacientes nuevos" value={data.operacion.pacientesNuevos} />
              <MiniStat label="Pacientes recurrentes" value={data.operacion.pacientesRecurrentes} />
              <MiniStat label="Tasa de retorno" value={`${data.operacion.tasaRetorno}%`} />
              <MiniStat label="Ocupación agenda" value={`${data.operacion.ocupacion}%`} />
              <MiniStat label="Citas anuladas" value={data.operacion.citasAnuladas} isNegative />
              <MiniStat label="Tasa de cancelación" value={`${data.operacion.tasaCancelacion}%`} isNegative={data.operacion.tasaCancelacion > 0} />
              <MiniStat label="Ausencias" value={data.operacion.citasAusentes} isNegative={data.operacion.citasAusentes > 0} />
              <MiniStat label="Tasa de ausencia" value={`${data.operacion.tasaAusencia}%`} isNegative={data.operacion.tasaAusencia > 0} />
              <MiniStat label="Espera promedio" value={data.operacion.esperaPromedio ? `${data.operacion.esperaPromedio} min` : '—'} />
              <MiniStat label="Aprobación promedio" value={data.operacion.tiempoPromedioAprobacion !== null ? `${data.operacion.tiempoPromedioAprobacion} días` : '—'} />
            </div>
          </div>
          <MetricList icon={Clock} title="Demanda por Hora" items={data.charts.demandaPorHora} valueLabel="Citas" valueKey="citas" valueFormat="count" />
          <MetricList icon={Clock} title="Espera Promedio por Doctor" items={data.charts.esperaPorDoctor} valueLabel="Minutos" valueKey="espera" valueFormat="minutes" />
        </div>

      </div>
      {showLegend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="leyenda-panel">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 id="leyenda-panel" className="text-lg font-black text-slate-900">Leyenda del dashboard</h2>
                <p className="mt-1 text-xs text-slate-500">Fuente y significado de cada indicador del periodo seleccionado.</p>
              </div>
              <button type="button" onClick={() => setShowLegend(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar leyenda">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <LegendItem title="Ingreso de Cajas" text="Todo el dinero registrado al cerrar las cajas del periodo." />
              <LegendItem title="Ventas de Doctores" text="Lo producido por los doctores mediante atenciones y pagos de tratamientos." />
              <LegendItem title="Margen de la Clínica" text="Lo que queda de las ventas después de pagar al doctor y descontar el laboratorio." />
              <LegendItem title="Venta de Laboratorio" text="Lo que pagaron los pacientes por trabajos de laboratorio, radiografías, sedación y kits quirúrgicos." />
              <LegendItem title="Costo de Laboratorio" text="Lo que la clínica debe pagar al laboratorio por esos trabajos." />
              <LegendItem title="Utilidad Neta" text="El dinero que queda después de restar laboratorio y gastos de la clínica." />
              <LegendItem title="Ventas por Categoría" text="Agrupa los pagos según el tipo de tratamiento realizado." />
              <LegendItem title="Pacientes Nuevos" text="Personas que fueron registradas por primera vez durante el periodo." />
              <LegendItem title="Pacientes Recurrentes" text="Personas que ya habían sido atendidas y volvieron durante el periodo." />
              <LegendItem title="Conversión de Presupuestos" text="Porcentaje de presupuestos que fueron aprobados o comenzaron a pagarse." />
              <LegendItem title="Tiempo de Aprobación" text="Cantidad promedio de días desde que se crea un presupuesto hasta que comienza a pagarse." />
              <LegendItem title="Producción por Doctor" text="Permite comparar cuánto produjo cada doctor durante el periodo." />
              <LegendItem title="Producción por Especialidad" text="Muestra qué especialidades generan más ingresos." />
              <LegendItem title="Cancelaciones y Ausencias" text="Muestra cuántas citas se cancelaron o no fueron atendidas." />
              <LegendItem title="Demanda por Hora" text="Indica cuáles son las horas con más citas agendadas." />
              <LegendItem title="Espera por Doctor" text="Tiempo promedio que esperan los pacientes antes de comenzar su atención." />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// COMPONENTES AUXILIARES
// ─────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, label, noMargin }: { icon: any, label: string, noMargin?: boolean }) {
  return (
    <h2 className={`text-xs font-bold text-slate-400 uppercase tracking-widest ${noMargin ? '' : 'mb-6'} flex items-center gap-2`}>
      <Icon size={16} /> {label}
    </h2>
  )
}

function MiniStat({ label, value, isNegative }: { label: string, value: string | number, isNegative?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <span className={`text-lg font-black ${isNegative ? 'text-rose-500' : 'text-slate-800'}`}>{value}</span>
    </div>
  )
}

function SummaryPanel({ title, value, detail, accent }: { title: string, value: string, detail: string, accent: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</p>
      <p className={`mt-2 text-2xl font-black ${accent}`}>{value}</p>
      <p className="mt-1 text-[10px] font-medium text-slate-400">{detail}</p>
    </div>
  )
}

function LegendItem({ title, text }: { title: string, text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black text-slate-800">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{text}</p>
    </div>
  )
}

function DeltaBadge({ delta }: { delta?: number }) {
  if (delta === undefined || delta === null || Number.isNaN(delta)) return null
  if (delta === 0) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-400"><Minus size={12} /> Sin cambio</span>
  )
  const positive = delta > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${positive ? 'text-teal-600' : 'text-rose-500'}`}>
      {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {Math.abs(delta)}% vs. mes anterior
    </span>
  )
}

function CajaStat({ label, value, total }: { label: string, value: number, total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-lg font-black text-slate-800 mt-1">{money(value)}</p>
      <p className="text-[10px] font-bold text-teal-600 mt-1">{pct}% del total</p>
    </div>
  )
}

function MetricList({ icon: Icon, title, items, valueLabel, valueKey = 'ingresos', valueFormat = 'money' }: {
  icon: any, title: string, items: any[], valueLabel: string, valueKey?: string, valueFormat?: 'money' | 'count' | 'minutes'
}) {
  const maxValue = items[0]?.[valueKey] || 1
  const formatValue = (value: number) => valueFormat === 'money' ? money(value) : `${Math.round(value)}${valueFormat === 'minutes' ? ' min' : ''}`
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
      <SectionTitle icon={Icon} label={title} />
      {items.length === 0 ? <EmptyState text="Sin datos para este periodo." /> : (
        <div className="space-y-4">
          {items.map((item: any, index: number) => (
            <div key={`${item.name}-${index}`}>
              <div className="flex justify-between gap-3 text-xs font-bold text-slate-600 mb-1.5">
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 text-slate-800">{formatValue(Number(item[valueKey] || 0))}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max((Number(item[valueKey] || 0) / maxValue) * 100, 2)}%` }} />
              </div>
            </div>
          ))}
          <p className="text-[10px] text-slate-400 pt-1">{valueLabel} del periodo seleccionado.</p>
        </div>
      )}
    </div>
  )
}

function EmptyState({ text, icon: Icon = FileText, good }: { text: string, icon?: any, good?: boolean }) {
  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border border-dashed ${good ? 'border-teal-200 bg-teal-50/50 text-teal-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
      <Icon size={18} />
      <span className="text-xs font-bold">{text}</span>
    </div>
  )
}

function PulseLine() {
  return (
    <svg className="relative mt-6 w-full h-6 opacity-40" viewBox="0 0 400 24" preserveAspectRatio="none">
      <polyline points="0,12 60,12 75,12 85,2 95,22 105,12 140,12 155,12 165,4 175,20 185,12 400,12" fill="none" stroke="#2dd4bf" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function PulseSpinner() {
  return (
    <svg width="64" height="24" viewBox="0 0 64 24">
      <polyline points="0,12 18,12 22,4 26,20 30,12 64,12" fill="none" stroke="#0d9488" strokeWidth="2">
        <animate attributeName="stroke-dasharray" values="0,80;80,80" dur="1.1s" repeatCount="indefinite" />
      </polyline>
    </svg>
  )
}

function VitalCard({ icon: Icon, label, value, delta, history, dataKey, accent, plain }: {
  icon: any, label: string, value: string, delta?: number, history?: any[], dataKey?: string, accent: string, plain?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}1a` }}>
          <Icon size={14} style={{ color: accent }} />
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{label}</span>
      </div>
      <div className="text-xl sm:text-2xl font-black text-slate-800 tabular-nums truncate mt-1">{value}</div>
      {!plain && history ? (
        <div className="h-8 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history}>
              <defs>
                <linearGradient id={`grad-${dataKey}-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey={dataKey || ""} stroke={accent} strokeWidth={2} fill={`url(#grad-${dataKey}-${label})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : <div className="h-8" />}
      {!plain && <DeltaBadge delta={delta} />}
    </div>
  )
}

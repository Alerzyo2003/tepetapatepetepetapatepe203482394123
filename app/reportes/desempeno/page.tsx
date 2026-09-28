'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Calendar,
  Receipt,
  Printer,
  Loader2,
  PieChart,
  TrendingUp,
  Wallet,
  Users,
  Sparkles,
  CircleDollarSign,
  Hash,
} from 'lucide-react'
import { toast } from 'sonner'

function formatCLP(value: number) {
  return `$${Number(value || 0).toLocaleString('es-CL')}`
}

function AnimatedAmount({ value, className = '' }: { value: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    let frame = 0
    const start = performance.now()
    const duration = 900
    const from = displayValue
    const to = Number(value || 0)

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(from + (to - from) * eased))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }

    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <span className={className}>{formatCLP(displayValue)}</span>
}

export default function DetalleCajaPage() {
  const { id: cajaId } = useParams()
  const router = useRouter()
  const [caja, setCaja] = useState<any>(null)
  const [pagos, setPagos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  useEffect(() => {
    if (cajaId) fetchDetalleCaja()
  }, [cajaId])

  async function fetchDetalleCaja() {
    setCargando(true)
    try {
      // 1. Info de la sesión
      const { data: sesion } = await supabase
        .from('sesiones_caja')
        .select('*')
        .eq('id', cajaId)
        .maybeSingle() 

      // 2. Obtener Pagos de la Caja actual (SOLO DINERO FÍSICO Y NO ANULADOS)
      const { data: listaPagos } = await supabase
        .from('pagos')
        .select(`
          id, monto, metodo_pago, convenio, fecha_vencimiento, 
          numero_referencia, numero_boleta, fecha_pago, paciente_id, 
          pacientes(nombre, apellido)
        `)
        .eq('caja_id', cajaId)
        .neq('estado', 'Anulado') // OCULTA LOS PAGOS ELIMINADOS
        .neq('metodo_pago', 'Saldo a Favor') // OCULTA LOS PAGOS HECHOS CON LA BILLETERA VIRTUAL
        .order('fecha_pago', { ascending: true })

      setCaja(sesion)
      setPagos(listaPagos || [])
    } catch (error) {
      console.error("Error cargando detalle:", error)
    } finally {
      setCargando(false)
    }
  }

  // TOTALES
  const totalRecaudado = useMemo(() => {
    if (!pagos) return 0;
    return pagos.reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
  }, [pagos]);

  const resumenPagos = useMemo(() => {
    if (!pagos || pagos.length === 0) return null;

    return pagos.reduce((acc: Record<string, { count: number; total: number }>, pago) => {
      const metodo = (pago.metodo_pago || 'Desconocido').toUpperCase();
      const monto = Number(pago.monto || 0);
      
      if (!acc[metodo]) {
        acc[metodo] = { count: 0, total: 0 };
      }
      acc[metodo].count++;
      acc[metodo].total += monto;
      return acc;
    }, {});
  }, [pagos]);

  const handlePrint = async () => {
    setGenerandoPdf(true);
    const toastId = toast.loading("Preparando reporte para imprimir...");

    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById('reporte-impresion-contenido');

      if (!element) {
        toast.error("No se pudo encontrar el contenido para imprimir.", { id: toastId });
        return;
      }

      const opt: any = { 
        margin: [15, 10, 15, 10],
        filename: `Cierre_Caja_${caja?.nombre_responsable?.replace(' ', '_') || 'reporte'}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          letterRendering: true, 
          backgroundColor: '#ffffff', 
          scrollY: 0,
          windowWidth: 700
        }, 
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.avoid-break'] } 
      };

      await html2pdf().set(opt).from(element).toPdf().get('pdf').then((pdf: any) => {
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          pdf.setPage(i);
          pdf.setFontSize(8);
          pdf.setTextColor(120, 120, 120); 
          pdf.text(`Página ${i} de ${totalPages}`, pdf.internal.pageSize.getWidth() - 25, pdf.internal.pageSize.getHeight() - 8);
        }
        window.open(pdf.output('bloburl'), '_blank');
      });

      toast.success("Reporte listo para imprimir", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Error al preparar la impresión", { id: toastId });
    } finally {
      setGenerandoPdf(false);
    }
  };


  // Métricas visuales: solo derivadas de los datos ya obtenidos.
  // No modifican ninguna de las funciones que calculan o consultan la caja.
  const metodosOrdenados = useMemo(() => {
    if (!resumenPagos) return []
    return Object.entries(resumenPagos)
      .map(([metodo, stats]: any) => [metodo, stats] as const)
      .sort((a, b) => Number(b[1].total) - Number(a[1].total))
  }, [resumenPagos])

  const totalTransacciones = pagos.length
  const promedioPago = totalTransacciones > 0 ? totalRecaudado / totalTransacciones : 0
  const pagoMayor = pagos.length > 0
    ? Math.max(...pagos.map((pago) => Number(pago.monto || 0)))
    : 0

  const metodoPrincipal = metodosOrdenados[0]?.[0] || 'Sin datos'
  const totalMetodoPrincipal = Number(metodosOrdenados[0]?.[1]?.total || 0)
  const porcentajeMetodoPrincipal = totalRecaudado > 0
    ? Math.round((totalMetodoPrincipal / totalRecaudado) * 100)
    : 0

  const coloresGrafico = [
    '#3B82F6',
    '#10B981',
    '#C49A5C',
    '#8B5CF6',
    '#F97316',
    '#14B8A6',
  ]

  let acumuladoDonut = 0
  const segmentosDonut = metodosOrdenados.map(([metodo, stats]: any, index) => {
    const porcentaje = totalRecaudado > 0 ? (Number(stats.total) / totalRecaudado) * 100 : 0
    const inicio = acumuladoDonut
    acumuladoDonut += porcentaje
    return {
      metodo,
      total: Number(stats.total),
      count: Number(stats.count),
      porcentaje,
      color: coloresGrafico[index % coloresGrafico.length],
      inicio,
      fin: acumuladoDonut,
    }
  })

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-[#F7FAFF]">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-blue-200/50 blur-xl animate-pulse" />
        <div className="relative bg-white p-5 rounded-3xl shadow-xl border border-slate-100">
          <Loader2 className="animate-spin text-[#C49A5C]" size={40} />
        </div>
      </div>
      <p className="font-bold text-xs uppercase tracking-widest text-slate-400">Generando reporte de caja...</p>
    </div>
  )

  if (!caja) return (
    <div className="min-h-screen grid place-items-center bg-[#F7FAFF] p-8">
      <div className="text-center bg-white p-10 rounded-3xl border border-slate-100 shadow-xl">
        <p className="font-black text-xl text-[#0B1527]">CAJA NO ENCONTRADA</p>
        <button
          onClick={() => router.push('/cajas')}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0B1527] px-5 py-3 text-xs font-bold text-white"
        >
          <ArrowLeft size={15} /> Volver a gestión
        </button>
      </div>
    </div>
  )

  return (
    <main className="min-h-screen bg-[#F7FAFF] p-4 sm:p-6 md:p-10 font-sans text-slate-900 text-left relative overflow-hidden z-0">
      {/* Ambiente visual: capas decorativas sin tocar la lógica */}
      <div className="pointer-events-none absolute -top-40 -right-36 h-[520px] w-[520px] rounded-full bg-blue-200/30 blur-3xl -z-10" />
      <div className="pointer-events-none absolute top-[420px] -left-44 h-[420px] w-[420px] rounded-full bg-emerald-100/35 blur-3xl -z-10" />
      <div className="pointer-events-none absolute bottom-[-180px] right-[10%] h-[420px] w-[420px] rounded-full bg-amber-100/40 blur-3xl -z-10" />

      <div className="absolute top-0 right-0 w-[760px] h-[800px] bg-[url('/fondo-caja.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-[0.10]" />

      <div className="max-w-[1400px] mx-auto relative z-10">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 print:hidden mb-7">
          <button
            onClick={() => router.push('/cajas')}
            className="group w-fit flex items-center gap-2 font-bold text-xs text-slate-500 uppercase hover:text-[#0B1527] transition-all bg-white/90 backdrop-blur px-5 py-3 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:-translate-y-0.5"
          >
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
            Volver a gestión
          </button>

          <button
            onClick={handlePrint}
            disabled={generandoPdf}
            className="group flex items-center justify-center gap-2 font-bold text-xs text-white uppercase bg-[#0B1527] px-6 py-3 rounded-2xl shadow-lg shadow-slate-900/15 hover:bg-slate-800 transition-all disabled:bg-slate-400 hover:-translate-y-0.5"
          >
            {generandoPdf ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} className="transition-transform group-hover:scale-110" />}
            {generandoPdf ? 'Generando...' : 'Imprimir Cierre'}
          </button>
        </div>

        {/* HERO / RESUMEN SUPERIOR */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6 mb-7">
          <section className="rounded-[2rem] bg-white/85 backdrop-blur-xl border border-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.28)] p-6 md:p-8 relative overflow-hidden">
            <div className="absolute right-[-40px] top-[-40px] h-36 w-36 rounded-full bg-blue-100/60 blur-2xl" />
            <div className="relative flex items-start gap-5">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-4 md:p-5 rounded-3xl text-white shadow-lg shadow-blue-500/25 shrink-0">
                <Receipt size={34} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-black text-[#C49A5C] uppercase tracking-[0.22em]">
                    Resumen de Caja {caja.numero_caja ? `#${caja.numero_caja}` : ''}
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest">
                    <Sparkles size={11} /> Resumen listo
                  </span>
                </div>
                <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-[#0B1527] mt-2 truncate">
                  {caja.nombre_responsable}
                </h1>
                <p className="text-xs font-medium text-slate-500 flex items-center gap-2 mt-2">
                  <Calendar size={14} className="text-slate-400 shrink-0" />
                  Cierre: {caja.fecha_cierre ? new Date(caja.fecha_cierre).toLocaleString('es-CL') : 'Turno Abierto'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-7">
              <div className="rounded-2xl bg-slate-50/85 border border-slate-100 p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="flex items-center gap-2 text-slate-400">
                  <Wallet size={15} />
                  <p className="text-[9px] font-black uppercase tracking-widest">Fondo Inicial</p>
                </div>
                <p className="text-2xl md:text-3xl font-black text-[#0B1527] mt-2">
                  <AnimatedAmount value={Number(caja.monto_apertura || 0)} />
                </p>
              </div>

              <div className="rounded-2xl bg-blue-50/85 border border-blue-100 p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="flex items-center gap-2 text-blue-500">
                  <CircleDollarSign size={15} />
                  <p className="text-[9px] font-black uppercase tracking-widest">Total Recaudado</p>
                </div>
                <p className="text-2xl md:text-3xl font-black text-blue-600 mt-2">
                  <AnimatedAmount value={totalRecaudado} />
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] bg-[#0B1527] text-white p-6 md:p-8 shadow-[0_24px_70px_-35px_rgba(11,21,39,0.65)] relative overflow-hidden">
            <div className="absolute inset-0 bg-white/0" />
            <div className="relative">
              <p className="text-[10px] font-black text-sky-200 uppercase tracking-[0.22em]">Visión rápida</p>
              <div className="grid grid-cols-2 gap-4 mt-5">
                <div className="rounded-2xl bg-white/10 border border-white/10 p-4">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Hash size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Transacciones</span>
                  </div>
                  <p className="text-2xl font-black mt-2">{totalTransacciones}</p>
                </div>
                <div className="rounded-2xl bg-white/10 border border-white/10 p-4">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Users size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Promedio</span>
                  </div>
                  <p className="text-xl md:text-2xl font-black mt-2">{formatCLP(promedioPago)}</p>
                </div>
                <div className="col-span-2 rounded-2xl bg-white/10 border border-white/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-slate-300">
                      <TrendingUp size={14} />
                      <span className="text-[9px] font-black uppercase tracking-widest">Pago mayor registrado</span>
                    </div>
                    <span className="text-lg font-black">{formatCLP(pagoMayor)}</span>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-300 transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min(pagoMayor > 0 ? 100 : 0, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-white/10">
                <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Medio con mayor recaudación</p>
                <div className="flex items-end justify-between gap-4 mt-1">
                  <p className="text-sm font-black uppercase">{metodoPrincipal}</p>
                  <p className="text-sm font-black text-sky-200">{porcentajeMetodoPrincipal}%</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* GRÁFICO + MÉTODOS */}
        {resumenPagos && Object.keys(resumenPagos).length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between gap-4 mb-4 px-1">
              <div>
                <p className="text-[10px] font-black text-[#C49A5C] uppercase tracking-[0.22em]">Análisis visual</p>
                <h2 className="text-xl md:text-2xl font-black text-[#0B1527] mt-1">Cómo entró el dinero</h2>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                Distribución del turno
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
              <div className="bg-white/85 backdrop-blur-xl rounded-[2rem] border border-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] p-6 flex items-center justify-center">
                <div className="relative h-56 w-56">
                  <div
                    className="h-full w-full rounded-full shadow-inner"
                    style={{
                      background: segmentosDonut.length
                        ? `conic-gradient(${segmentosDonut.map((segmento) => `${segmento.color} ${segmento.inicio}% ${segmento.fin}%`).join(', ')})`
                        : '#E2E8F0',
                    }}
                  />
                  <div className="absolute inset-6 rounded-full bg-white/95 backdrop-blur flex flex-col items-center justify-center text-center shadow-sm">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total</p>
                    <p className="text-2xl font-black text-[#0B1527] mt-1">{formatCLP(totalRecaudado)}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">{totalTransacciones} movimientos</p>
                  </div>
                </div>
              </div>

              <div className="bg-white/85 backdrop-blur-xl rounded-[2rem] border border-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] p-5 md:p-6">
                <div className="space-y-4">
                  {segmentosDonut.map((segmento, index) => (
                    <div
                      key={segmento.metodo}
                      className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md animate-[fadeUp_.5s_ease-out_both]"
                      style={{ animationDelay: `${index * 70}ms` }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: segmento.color }} />
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-[#0B1527] uppercase tracking-widest truncate">{segmento.metodo}</p>
                            <p className="text-[9px] font-semibold text-slate-400 mt-1">{segmento.count} transacción{segmento.count === 1 ? '' : 'es'}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm md:text-base font-black text-[#0B1527]">{formatCLP(segmento.total)}</p>
                          <p className="text-[9px] font-black text-slate-400">{Math.round(segmento.porcentaje)}%</p>
                        </div>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-slate-200/80 overflow-hidden">
                        <div
                          className="h-full rounded-full animate-[growWidth_1s_ease-out_both]"
                          style={{
                            width: `${segmento.porcentaje}%`,
                            backgroundColor: segmento.color,
                            animationDelay: `${index * 100}ms`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TARJETAS DE MÉTODOS */}
        {resumenPagos && Object.keys(resumenPagos).length > 0 && (
          <section className="mb-9">
            <div className="flex items-center gap-2 mb-4 px-1">
              <PieChart size={18} className="text-[#C49A5C]" />
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#0B1527]">Desglose por medio de pago</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {metodosOrdenados.map(([metodo, stats]: any, index) => (
                <div
                  key={metodo}
                  className="group bg-white/90 backdrop-blur-xl p-5 rounded-[1.7rem] border border-white shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden relative animate-[fadeUp_.5s_ease-out_both]"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div
                    className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl transition-opacity group-hover:opacity-50"
                    style={{ backgroundColor: coloresGrafico[index % coloresGrafico.length] }}
                  />
                  <div className="relative flex items-start justify-between gap-4">
                    <div className={`p-3 rounded-2xl ${metodo.includes('EFECTIVO') ? 'bg-emerald-100/70 text-emerald-600' : 'bg-blue-100/70 text-blue-600'}`}>
                      {metodo.includes('EFECTIVO') ? <Banknote size={22} /> : <CreditCard size={22} />}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-slate-500">
                      {stats.count} mov.
                    </span>
                  </div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-tight mt-4">{metodo}</p>
                  <p className="text-xl md:text-2xl font-black text-[#0B1527] tracking-tight mt-1">{formatCLP(Number(stats.total))}</p>
                  <div className="mt-4 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${totalRecaudado > 0 ? (Number(stats.total) / totalRecaudado) * 100 : 0}%`,
                        backgroundColor: coloresGrafico[index % coloresGrafico.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TABLA DETALLADA */}
        <div className="bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_60px_-35px_rgba(15,23,42,0.28)] border border-white overflow-hidden text-left mb-20">
          <div className="px-5 md:px-7 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center">
            <div>
              <p className="text-[10px] font-black text-[#C49A5C] uppercase tracking-[0.2em]">Detalle</p>
              <h3 className="text-lg font-black text-[#0B1527] mt-1">Movimientos de la caja</h3>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 border border-slate-100 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
              <Hash size={12} />
              {pagos.length} registros
            </div>
          </div>

          <div className="overflow-x-auto text-left">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0B1527] text-white uppercase font-bold text-[10px] tracking-[0.15em]">
                  <th className="px-6 py-5 text-left">#</th>
                  <th className="px-6 py-5 text-left">Nombre Paciente</th>
                  <th className="px-6 py-5 text-left">Medio de Pago</th>
                  <th className="px-6 py-5 text-left">Convenio</th>
                  <th className="px-6 py-5 text-left">Vencimiento</th>
                  <th className="px-6 py-5 text-left"># Referencia</th>
                  <th className="px-6 py-5 text-left"># Boleta</th>
                  <th className="px-6 py-5 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagos.map((p, index) => {
                  const pac = p.pacientes as any
                  return (
                    <tr key={p.id} className="group hover:bg-blue-50/40 transition-all duration-200 text-left">
                      <td className="px-6 py-5 text-[11px] font-medium text-slate-400 italic text-left">
                        {String(index + 1).padStart(2, '0')}
                      </td>
                      <td className="px-6 py-5 text-left">
                        <p className="text-xs font-bold uppercase text-[#0B1527] text-left">
                          {pac ? `${pac.nombre} ${pac.apellido}` : 'Sin nombre'}
                        </p>
                      </td>
                      <td className="px-6 py-5 text-left">
                        <div className="flex items-center gap-2 text-left text-slate-500">
                          {p.metodo_pago.toLowerCase().includes('efectivo')
                            ? <Banknote size={14} className="text-emerald-500" />
                            : <CreditCard size={14} className="text-blue-500" />}
                          <span className="text-[10px] font-bold uppercase">{p.metodo_pago}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-[10px] font-bold text-slate-500 uppercase text-left">
                        {p.convenio || '—'}
                      </td>
                      <td className="px-6 py-5 text-[10px] font-bold text-slate-500 text-left">
                        {p.fecha_vencimiento ? new Date(p.fecha_vencimiento).toLocaleDateString('es-CL') : '—'}
                      </td>
                      <td className="px-6 py-5 text-[10px] font-mono font-bold text-slate-500 text-left">
                        {p.numero_referencia || '—'}
                      </td>
                      <td className="px-6 py-5 text-[10px] font-bold text-slate-700 text-left">
                        {p.numero_boleta || '—'}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <span className="text-sm font-black text-[#0B1527] text-right">
                          {formatCLP(Number(p.monto || 0))}
                        </span>
                      </td>
                    </tr>
                  )
                })}

                {pagos.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-20 text-center">
                      <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">No se registraron pagos en esta sesión</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <style jsx global>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }

          @keyframes growWidth {
            from { transform: scaleX(0); transform-origin: left; }
            to { transform: scaleX(1); transform-origin: left; }
          }
        `}</style>

        {/* CONTENEDOR OCULTO PARA EL GENERADOR DE PDF */}
        <div style={{ position: 'absolute', top: '-9999px', left: '0' }}>
           <div id="reporte-impresion-contenido" style={{ width: '700px', boxSizing: 'border-box', backgroundColor: '#ffffff', color: '#111827', padding: '30px', fontFamily: 'Arial, sans-serif' }}>
              
              <style>{`
                #reporte-impresion-contenido tr { page-break-inside: avoid; }
                #reporte-impresion-contenido thead { display: table-header-group; }
                #reporte-impresion-contenido tfoot { display: table-footer-group; }
              `}</style>

              <div className="avoid-break" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', pageBreakInside: 'avoid' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <img src="https://yqdpmaopnvrgdqbfaiok.supabase.co/storage/v1/object/public/documentos_imagenes/440749454_122171956712064634_7168698893214813270_n.jpg" alt="Logo" style={{ height: '40px', width: 'auto' }} crossOrigin="anonymous" />
                    <div>
                       <h1 style={{ fontSize: '11px', fontWeight: 'bold', margin: '0 0 2px 0', textTransform: 'uppercase' }}>CENTRO MEDICO Y DENTAL DIGNIDAD SPA</h1>
                       <p style={{ fontSize: '9px', margin: '0 0 2px 0', color: '#555' }}>Fecha Impresión: {new Date().toLocaleDateString('es-CL')}</p>
                       <p style={{ fontSize: '9px', margin: '0', color: '#555' }}>Turno Nº: {caja?.numero_caja || '-'}</p>
                    </div>
                 </div>
                 <div>
                     <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, textTransform: 'uppercase', color: '#333' }}>Cierre de Caja</h2>
                 </div>
              </div>

              <div className="avoid-break" style={{ marginBottom: '15px', pageBreakInside: 'avoid' }}>
                 <h3 style={{ fontSize: '11px', fontWeight: 'bold', margin: '0 0 6px 0', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>Detalles del Turno:</h3>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#333' }}>
                    <div style={{ width: '48%' }}>
                       <p style={{ margin: '0 0 3px 0' }}><span style={{ fontWeight: 'bold' }}>Turno Nº:</span> {caja?.numero_caja || '-'}</p>
                       <p style={{ margin: '0 0 3px 0' }}><span style={{ fontWeight: 'bold' }}>Responsable:</span> {caja?.nombre_responsable}</p>
                       <p style={{ margin: '0 0 3px 0' }}><span style={{ fontWeight: 'bold' }}>Estado:</span> {caja?.estado?.toUpperCase()}</p>
                    </div>
                    <div style={{ width: '48%' }}>
                       <p style={{ margin: '0 0 3px 0' }}><span style={{ fontWeight: 'bold' }}>Apertura:</span> {new Date(caja?.fecha_apertura).toLocaleString('es-CL')}</p>
                       <p style={{ margin: '0 0 3px 0' }}><span style={{ fontWeight: 'bold' }}>Cierre:</span> {caja?.fecha_cierre ? new Date(caja.fecha_cierre).toLocaleString('es-CL') : 'Turno Activo'}</p>
                    </div>
                 </div>
              </div>

              <div className="avoid-break" style={{ marginBottom: '15px', pageBreakInside: 'avoid' }}>
                 <h3 style={{ fontSize: '11px', fontWeight: 'bold', margin: '0 0 6px 0', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>Resumen de Montos:</h3>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#333' }}>
                    <div style={{ width: '30%' }}>
                       <p style={{ margin: '0 0 3px 0' }}><span style={{ fontWeight: 'bold' }}>Fondo Inicial:</span> ${Number(caja?.monto_apertura || 0).toLocaleString('es-CL')}</p>
                    </div>
                    <div style={{ width: '30%' }}>
                       <p style={{ margin: '0 0 3px 0' }}><span style={{ fontWeight: 'bold' }}>Total Recaudado:</span> ${totalRecaudado.toLocaleString('es-CL')}</p>
                    </div>
                    <div style={{ width: '30%' }}>
                       <p style={{ margin: '0 0 3px 0' }}><span style={{ fontWeight: 'bold' }}>Total en Caja:</span> ${(totalRecaudado + Number(caja?.monto_apertura || 0)).toLocaleString('es-CL')}</p>
                    </div>
                 </div>
              </div>

              {resumenPagos && Object.keys(resumenPagos).length > 0 && (
              <div className="avoid-break" style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
                 <h3 style={{ fontSize: '11px', fontWeight: 'bold', margin: '0 0 6px 0', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>Desglose por Medio de Pago:</h3>
                 <table style={{ width: '100%', fontSize: '9px', borderCollapse: 'collapse' }}>
                    <thead>
                       <tr style={{ borderBottom: '2px solid #ccc', pageBreakInside: 'avoid' }}>
                          <th style={{ textAlign: 'left', padding: '4px 2px', fontWeight: 'bold', color: '#555' }}>Medio de Pago</th>
                          <th style={{ textAlign: 'center', padding: '4px 2px', fontWeight: 'bold', color: '#555' }}>Nº de Transacciones</th>
                          <th style={{ textAlign: 'right', padding: '4px 2px', fontWeight: 'bold', color: '#555' }}>Total Recaudado</th>
                       </tr>
                    </thead>
                    <tbody>
                       {Object.entries(resumenPagos).map(([metodo, stats]: any, i: number) => (
                          <tr key={i} style={{ borderBottom: '1px solid #eee', pageBreakInside: 'avoid' }}>
                             <td style={{ padding: '6px 2px', textTransform: 'uppercase', fontWeight: 'bold', color: '#333' }}>{metodo}</td>
                             <td style={{ textAlign: 'center', padding: '6px 2px' }}>{stats.count}</td>
                             <td style={{ textAlign: 'right', padding: '6px 2px' }}>${Number(stats.total).toLocaleString('es-CL')}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                 <h3 className="avoid-break" style={{ fontSize: '11px', fontWeight: 'bold', margin: '0 0 6px 0', borderBottom: '1px solid #ddd', paddingBottom: '4px', pageBreakInside: 'avoid' }}>Detalle de Transacciones:</h3>
                 <table style={{ width: '100%', fontSize: '9px', borderCollapse: 'collapse' }}>
                    <thead>
                       <tr style={{ borderBottom: '2px solid #ccc', pageBreakInside: 'avoid' }}>
                          <th style={{ textAlign: 'left', padding: '6px 2px', fontWeight: 'bold', color: '#555' }}>Nº Pago</th>
                          <th style={{ textAlign: 'left', padding: '6px 2px', fontWeight: 'bold', color: '#555' }}>Paciente</th>
                          <th style={{ textAlign: 'left', padding: '6px 2px', fontWeight: 'bold', color: '#555' }}>Nº Boleta</th>
                          <th style={{ textAlign: 'left', padding: '6px 2px', fontWeight: 'bold', color: '#555' }}>Medio de pago</th>
                          <th style={{ textAlign: 'right', padding: '6px 2px', fontWeight: 'bold', color: '#555' }}>Monto</th>
                       </tr>
                    </thead>
                    <tbody>
                       {pagos.map((p: any, idx: number) => (
                           <tr key={idx} style={{ borderBottom: '1px solid #eee', pageBreakInside: 'avoid' }}>
                              <td style={{ padding: '6px 2px' }}>{(p.id_origen_real || p.id).substring(0, 8).toUpperCase()}</td>
                              <td style={{ padding: '6px 2px', textTransform: 'uppercase' }}>{p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellido}` : 'S/N'}</td>
                              <td style={{ padding: '6px 2px' }}>{p.numero_boleta && p.numero_boleta !== 'S/N' ? p.numero_boleta : '-'}</td>
                              <td style={{ padding: '6px 2px', textTransform: 'uppercase' }}>{p.metodo_pago} {p.numero_referencia && p.numero_referencia !== 'S/N' ? `(Ref: ${p.numero_referencia.split('- Ref: ')[1] || p.numero_referencia})` : ''}</td>
                              <td style={{ textAlign: 'right', padding: '6px 2px', fontWeight: 'bold' }}>${Number(p.monto || 0).toLocaleString('es-CL')}</td>
                           </tr>
                        ))}
                       {pagos.length === 0 && (
                          <tr style={{ pageBreakInside: 'avoid' }}>
                             <td colSpan={5} style={{ textAlign: 'center', padding: '10px' }}>No hay transacciones registradas</td>
                          </tr>
                       )}
                    </tbody>
                    <tfoot>
                       <tr style={{ borderTop: '2px solid #333', pageBreakInside: 'avoid' }}>
                          <td colSpan={4} style={{ textAlign: 'right', padding: '10px 4px', fontWeight: 'bold', fontSize: '10px', textTransform: 'uppercase' }}>Total Transacciones:</td>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: 'bold', fontSize: '11px', color: '#059669' }}>${totalRecaudado.toLocaleString('es-CL')}</td>
                       </tr>
                    </tfoot>
                 </table>
              </div>

              <div className="avoid-break" style={{ fontSize: '8px', color: '#666', textAlign: 'center', marginTop: '30px', paddingTop: '10px', borderTop: '1px solid #eee', pageBreakInside: 'avoid' }}>
                 <p style={{ fontWeight: 'bold', margin: '0 0 2px 0', color: '#333' }}>CENTRO MEDICO Y DENTAL DIGNIDAD SPA</p>
                 <p style={{ margin: '0 0 2px 0' }}>Venancia Leiva 1871, Región Metropolitana, La Pintana</p>
                 <p style={{ margin: '0 0 10px 0' }}>+56 9 6646 7641</p>
                 <p style={{ margin: 0 }}>Reporte de Cierre de Caja generado automáticamente por el sistema.</p>
              </div>

           </div>
        </div>
      </div>
    </main>
  )
}

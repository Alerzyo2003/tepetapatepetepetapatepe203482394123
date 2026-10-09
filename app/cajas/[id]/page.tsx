'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { 
  ChevronLeft, Banknote, CreditCard, Landmark, 
  User, Calendar, Receipt, ArrowLeft, Printer, Loader2, PieChart
} from 'lucide-react'
import { toast } from 'sonner'

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
          numero_referencia, numero_boleta, fecha_pago, paciente_id, nota, 
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

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-white">
      <Loader2 className="animate-spin text-[#C49A5C]" size={40} />
      <p className="font-bold text-xs uppercase tracking-widest text-slate-400">Generando reporte de caja...</p>
    </div>
  )

  if (!caja) return <div className="p-20 text-center font-black">CAJA NO ENCONTRADA</div>

  return (
    <main className="min-h-screen bg-white p-6 md:p-10 font-sans text-slate-900 text-left relative overflow-hidden z-0">
      
      <div 
        className="absolute top-0 right-0 w-[800px] h-[900px] bg-[url('/fondo-caja.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-50"
      ></div>

      <div className="max-w-[1400px] mx-auto relative z-10">
        
        {/* HEADER */}
        <div className="flex justify-between items-center print:hidden mb-8">
          <button 
            onClick={() => router.push('/cajas')}
            className="flex items-center gap-2 font-bold text-xs text-slate-500 uppercase hover:text-[#0B1527] transition-all bg-white px-5 py-2.5 rounded-xl shadow-sm border border-slate-200"
          >
            <ArrowLeft size={16} /> Volver a gestión
          </button>
          <button 
            onClick={handlePrint}
            disabled={generandoPdf}
            className="flex items-center gap-2 font-bold text-xs text-white uppercase bg-[#0B1527] px-6 py-2.5 rounded-xl shadow-lg hover:bg-slate-800 transition-all disabled:bg-slate-400"
          >
            {generandoPdf ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} 
            {generandoPdf ? 'Generando...' : 'Imprimir Cierre'}
          </button>
        </div>

        {/* RESUMEN SUPERIOR */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12 max-w-[1000px]">
          
          <div className="flex items-center gap-6 text-left">
            <div className="bg-blue-500 p-5 rounded-3xl text-white shadow-blue-500/30 shadow-lg shrink-0">
              <Receipt size={36} />
            </div>
            <div className="text-left">
             <p className="text-[11px] font-bold text-[#C49A5C] uppercase tracking-[0.2em] text-left">
                Resumen de Caja {caja.numero_caja ? `#${caja.numero_caja}` : ''}
              </p>
              <h1 className="text-3xl md:text-4xl font-black uppercase italic text-[#0B1527] tracking-tight text-left mt-1">
                {caja.nombre_responsable}
              </h1>
              <p className="text-xs font-medium text-slate-500 flex items-center gap-2 mt-2">
                <Calendar size={14} className="text-slate-400"/> 
                Cierre: {caja.fecha_cierre ? new Date(caja.fecha_cierre).toLocaleString('es-CL') : 'Turno Abierto'}
              </p>
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-6 md:px-10 border border-slate-100 shadow-xl flex items-center gap-8 md:gap-12 shrink-0">
             <div className="text-center">
               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Fondo Inicial</p>
               <p className="text-2xl font-black text-[#0B1527]">${Number(caja.monto_apertura || 0).toLocaleString('es-CL')}</p>
             </div>
             <div className="w-px h-12 bg-slate-200"></div>
             <div className="text-center">
               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Total Recaudado</p>
               <p className="text-3xl font-black text-blue-600">${totalRecaudado.toLocaleString('es-CL')}</p>
             </div>
          </div>
        </div>

        {/* DESGLOSE DE MÉTODOS DE PAGO */}
        {resumenPagos && Object.keys(resumenPagos).length > 0 && (
          <div className="mb-12 max-w-[1000px]">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#C49A5C] mb-6 flex items-center gap-2">
              <PieChart size={18} /> Desglose por Medio de Pago
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              {Object.entries(resumenPagos).map(([metodo, stats]) => (
                <div key={metodo} className="bg-white/90 backdrop-blur-sm p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5 transition-all hover:bg-slate-50">
                  <div className={`p-4 rounded-2xl flex-shrink-0 ${metodo.includes('EFECTIVO') ? 'bg-emerald-100/50 text-emerald-600' : 'bg-blue-100/50 text-blue-600'}`}>
                    {metodo.includes('EFECTIVO') ? <Banknote size={24} /> : <CreditCard size={24} />}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">{metodo}</p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">(CANT: {stats.count})</p>
                    <p className="text-xl md:text-2xl font-black text-[#0B1527] tracking-tight mt-1">
                      ${stats.total.toLocaleString('es-CL')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TABLA DETALLADA */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-left mb-20">
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
                  const pac = p.pacientes as any;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group text-left">
                      <td className="px-6 py-5 text-[11px] font-medium text-slate-400 italic text-left">
                        {String(index + 1).padStart(2, '0')}
                      </td>
                      <td className="px-6 py-5 text-left">
                        <p className="text-xs font-bold uppercase text-[#0B1527] text-left">
                          {pac ? `${pac.nombre} ${pac.apellido}` : 'Sin nombre'}
                        </p>
                        {p.nota && <p className="text-[10px] italic text-amber-700 mt-1 max-w-[260px]">💬 {p.nota}</p>}
                      </td>
                      <td className="px-6 py-5 text-left">
                        <div className="flex items-center gap-2 text-left text-slate-500">
                          {p.metodo_pago.toLowerCase().includes('efectivo') ? <Banknote size={14} className="text-emerald-500"/> : <CreditCard size={14} className="text-blue-500"/>}
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
                          ${Number(p.monto || 0).toLocaleString('es-CL')}
                        </span>
                      </td>
                    </tr>
                  );
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

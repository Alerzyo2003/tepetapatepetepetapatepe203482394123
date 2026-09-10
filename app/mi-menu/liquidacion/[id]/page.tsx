'use client'
import { useParams } from 'next/navigation'
import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, Printer, Download, DollarSign, Loader2, CheckCircle2, History, AlertCircle, Eye, X, Wallet } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

export default function MiDetalleLiquidacionPage() {
  const params = useParams()
  const mesSeleccionado = (params.id as string) || new Date().toISOString().substring(0, 7)

  const [profesional, setProfesional] = useState<any>(null)
  const [itemsPendientes, setItemsPendientes] = useState<any[]>([])
  const [cierresCompletados, setCierresCompletados] = useState<any[]>([])
  const [resumenMes, setResumenMes] = useState({ totalMes: 0, totalPagado: 0, saldoPendiente: 0 })
  const [cargando, setCargando] = useState(true)
  const [errorSesion, setErrorSesion] = useState('')
  const [fechaEmision, setFechaEmision] = useState('')
  const [detalleItem, setDetalleItem] = useState<any>(null)
  
  // Estado para los Portals
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    fetchData()
  }, [mesSeleccionado])

  async function fetchData() {
    setCargando(true)
    try {
      // 0. Validar sesión y resolver el profesional dueño de la sesión
      const { data: { user }, error: errUser } = await supabase.auth.getUser()
      if (errUser || !user) {
        setErrorSesion('No se encontró una sesión activa. Por favor inicia sesión nuevamente.')
        return
      }

      const [year, month] = mesSeleccionado.split('-');
      const ultimoDiaNum = new Date(Number(year), Number(month), 0).getDate();
      const ultimoDia = String(ultimoDiaNum).padStart(2, '0');

      const finMes = `${year}-${month}-${ultimoDia} 23:59:59`
      const fechaCortaFin = `${year}-${month}-${ultimoDia}`;

      // 1. Obtener datos del profesional (siempre el dueño de la sesión)
      const { data: prof, error: errProf } = await supabase.from('profesionales').select('*').eq('user_id', user.id).single()
      if (errProf || !prof) {
        setErrorSesion('Tu usuario no tiene un perfil de profesional asociado.')
        return
      }

      const { data: perfil } = await supabase.from('perfiles').select('rut').eq('id', prof.user_id).single();
      setProfesional({ ...prof, rut: perfil?.rut || 'Sin registrar' });

      const porcentajeDr = Number(prof.porcentaje_comision || 40) / 100;

      // 2. Obtener TODA la historia contable hasta el mes seleccionado para la cascada
      let todasLasAtenciones: any[] = [];
      let fetchMoreAt = true;
      let fromAt = 0;
      while (fetchMoreAt) {
        const { data } = await supabase.from('atenciones_realizadas')
          .select(`id, fecha, monto_cobrado, profesional_id, paciente_id, observacion, pacientes(id, nombre, apellido), prestaciones!atenciones_realizadas_prestacion_id_fkey(id, "Nombre Accion")`)
          .eq('profesional_id', prof.user_id)
          .lte('fecha', finMes)
          .range(fromAt, fromAt + 999);
        if (data?.length) { todasLasAtenciones.push(...data); fromAt += 1000; } else { fetchMoreAt = false; }
      }

      let todosLosPagos: any[] = [];
      let fetchMorePagos = true;
      let fromPagos = 0;
      while (fetchMorePagos) {
        const { data } = await supabase.from('pagos')
          .select(`
            id, monto, fecha_pago, profesional_id, paciente_id,
            pacientes ( id, nombre, apellido ),
            presupuesto_items ( id, presupuesto_id, profesional_id, nombre_prestacion, precio_pactado, costo_laboratorio, lab_pagado_por_dr, estado, tipo_reparto, porcentaje_forzado, progreso, abonado, diente_id, cara, observacion )
          `)
          .not('estado', 'eq', 'Anulado')
          .lte('fecha_pago', finMes)
          .range(fromPagos, fromPagos + 999);
        if (data?.length) { todosLosPagos.push(...data); fromPagos += 1000; } else { fetchMorePagos = false; }
      }

      let todasLasLiqs: any[] = [];
      let fetchMoreLq = true;
      let fromLq = 0;
      while (fetchMoreLq) {
        const { data } = await supabase.from('liquidaciones')
          .select('*')
          .eq('profesional_id', prof.id)
          .eq('estado', 'Finalizada')
          .lte('periodo_hasta', fechaCortaFin)
          .order('fecha_pago', { ascending: true })
          .range(fromLq, fromLq + 999);
        if (data?.length) { todasLasLiqs.push(...data); fromLq += 1000; } else { fetchMoreLq = false; }
      }

      // 3. Formatear y Aplicar Regla del 100% Pagado
      const atencionesFormateadas = todasLasAtenciones.map((a: any) => ({
        id_origen: a.id,
        fecha: a.fecha,
        paciente: a.pacientes ? `${a.pacientes.nombre} ${a.pacientes.apellido}` : 'Paciente no encontrado',
        prestacion: a.prestaciones?.["Nombre Accion"] || 'Atención Directa',
        montoPago: Number(a.monto_cobrado),
        descuentoLab: 0,
        esReembolso: false,
        imponible: Number(a.monto_cobrado),
        honorario: Number(a.monto_cobrado) * porcentajeDr,
        tipo: 'Atención',
        paciente_id: a.paciente_id,
        presupuesto_id: null,
        tratamiento_id: a.id,
        estaEvolucionado: true,
        paymentStatus: 'paid',
        costoTotalPrestacion: Number(a.monto_cobrado),
        pagadoTotalPrestacion: Number(a.monto_cobrado),
        observacion: a.observacion
      }));

      const abonosFormateados = todosLosPagos.filter((pago: any) => {
        const pItem = Array.isArray(pago.presupuesto_items) ? pago.presupuesto_items[0] : (pago.presupuesto_items || {});
        const docId = pago.profesional_id || pItem.profesional_id || null;
        if (docId !== prof.user_id) return false;

        const precioPactado = Number(pItem.precio_pactado || 0);
        const abonadoTotal = Number(pItem.abonado || 0);
        
        // REGLA INQUEBRANTABLE (Liquidables solo si 100% pagado)
        return precioPactado > 0 && abonadoTotal >= precioPactado;
      }).map((pago: any) => {
        const pItem = Array.isArray(pago.presupuesto_items) ? pago.presupuesto_items[0] : (pago.presupuesto_items || {});
        
        const montoPago = Number(pago.monto || 0);
        const costoLab = Number(pItem.costo_laboratorio || 0);
        const precioPactado = Number(pItem.precio_pactado || montoPago || 1);
        const pagadoPorDr = Boolean(pItem.lab_pagado_por_dr);
        const totalAbonado = Number(pItem.abonado || 0);

        const itemEstado = pItem.estado?.toLowerCase() || '';
        const estaTerminado = ['realizado', 'atendido', 'terminado', 'finalizado', 'completado'].includes(itemEstado);

        let fraccionPago = montoPago / precioPactado;
        if (fraccionPago > 1) fraccionPago = 1;

        const labAplicado = costoLab * fraccionPago;
        let montoImponible = montoPago;
        if (montoImponible < 0) montoImponible = 0;

        const tipoReparto = pItem.tipo_reparto || 'general';
        let pctDrItem = porcentajeDr;
        if (tipoReparto === 'doctor') pctDrItem = 1;
        else if (tipoReparto === 'clinica') pctDrItem = 0;
        else if (tipoReparto === 'forzado') pctDrItem = Number(pItem.porcentaje_forzado || 0) / 100;

        const comision = estaTerminado ? (montoImponible * pctDrItem) : 0;
        const reembolso = estaTerminado ? (pagadoPorDr ? labAplicado : 0) : 0;

        return {
          id_origen: pago.id,
          fecha: pago.fecha_pago,
          paciente: pago.pacientes ? `${pago.pacientes.nombre} ${pago.pacientes.apellido}` : 'Paciente',
          prestacion: pItem.nombre_prestacion || 'Abono Plan',
          montoPago: montoPago,
          descuentoLab: labAplicado,
          esReembolso: pagadoPorDr,
          imponible: montoImponible,
          honorario: comision + reembolso,
          tipo: 'Abono Plan',
          paciente_id: pago.paciente_id,
          presupuesto_id: pItem.presupuesto_id,
          tratamiento_id: pItem.id,
          estaEvolucionado: estaTerminado,
          paymentStatus: 'paid',
          costoTotalPrestacion: precioPactado,
          pagadoTotalPrestacion: totalAbonado,
          diente: pItem.diente_id,
          cara: pItem.cara,
          observacion: pItem.observacion
        }
      });

      // 4. Unificar y Aplicar Cascada de Tiempo
      const produccionCombinada = [...atencionesFormateadas, ...abonosFormateados]
        .sort((a, b) => new Date(a.fecha?.replace(' ', 'T') || 0).getTime() - new Date(b.fecha?.replace(' ', 'T') || 0).getTime());

      let poolProduccion = produccionCombinada.map(p => ({
        ...p,
        honorario_restante: p.honorario
      }));

      const cierresList: any[] = [];

      todasLasLiqs.forEach((liq, index) => {
        let montoARepartir = Number(liq.monto_total);
        let itemsDeEstaLiq = [];

        let fechaLimite = new Date((liq.fecha_pago || liq.periodo_hasta).replace(' ', 'T'));
        fechaLimite.setHours(23, 59, 59, 999);

        for (let i = 0; i < poolProduccion.length; i++) {
          let item = poolProduccion[i];

          if (item.honorario_restante <= 0) continue;
          if (montoARepartir <= 0) break;

          let fechaItem = new Date(item.fecha ? item.fecha.replace(' ', 'T') : 0);
          if (fechaItem > fechaLimite) continue;

          let aDescontar = Math.min(item.honorario_restante, montoARepartir);

          itemsDeEstaLiq.push({
            ...item,
            honorario: aDescontar
          });

          item.honorario_restante -= aDescontar;
          montoARepartir -= aDescontar;
        }

        let fLiq = new Date((liq.fecha_pago || liq.periodo_hasta).replace(' ', 'T'));
        if (fLiq.getFullYear() === Number(year) && fLiq.getMonth() === (Number(month) - 1)) {
          cierresList.push({
            id: liq.id,
            titulo: `Cierre #${index + 1} • Pagado el ${fLiq.toLocaleDateString('es-CL')}`,
            items: itemsDeEstaLiq,
            montoTotal: liq.monto_total
          });
        }
      });

      // 5. Separar lo que quedó pendiente a pagar de los 100% liquidados
      const pendientesFinal = poolProduccion
        .filter(p => p.honorario_restante > 0)
        .map(p => ({
          ...p,
          honorario: p.honorario_restante
        }));

      // 6. Resumen de contabilidad estrictamente del mes consultado
      const produccionDelMes = produccionCombinada.filter(p => {
        const fechaItem = new Date(p.fecha?.replace(' ', 'T') || 0);
        return fechaItem.getFullYear() === Number(year) && fechaItem.getMonth() === (Number(month) - 1);
      });
      const totalMes = produccionDelMes.reduce((acc, curr) => acc + curr.honorario, 0);

      const liqsDelMes = todasLasLiqs.filter(l => {
        const fechaLiq = new Date((l.fecha_pago || l.periodo_hasta).replace(' ', 'T'));
        return fechaLiq.getFullYear() === Number(year) && fechaLiq.getMonth() === (Number(month) - 1);
      });
      const totalPagado = liqsDelMes.reduce((acc, curr) => acc + Number(curr.monto_total), 0);
      const saldoPendiente = pendientesFinal.reduce((acc, curr) => acc + curr.honorario, 0);

      setResumenMes({ totalMes, totalPagado, saldoPendiente });

      // 7. Obtener TODOS los items pendientes (no pagados 100%, pero sí evolucionados/abonados)
      const { data: itemsEnSeguimientoData } = await supabase
        .from('presupuesto_items')
        .select('*, presupuestos(paciente_id, pacientes(id, nombre, apellido))')
        .eq('profesional_id', user.id)
        .or('progreso.gt.0,abonado.gt.0,estado.eq.realizado,estado.eq.atendido,estado.eq.terminado,estado.eq.finalizado,estado.eq.completado');

      const itemsDeSeguimiento = (itemsEnSeguimientoData || [])
        .map((item: any) => {
            const precioPactado = Number(item.precio_pactado || 0);
            const totalAbonado = Number(item.abonado || 0);

            // Ignorar si ya está en los pendientes 100% liquidados para evitar duplicados
            if (pendientesFinal.some(p => p.tratamiento_id === item.id)) return null;
            // Ignorar si ya está liquidado en algún cierre del mes
            if (cierresList.some(c => c.items.some((i: any) => i.tratamiento_id === item.id))) return null;

            const estaTerminado = ['realizado', 'atendido', 'terminado', 'finalizado', 'completado'].includes(item.estado?.toLowerCase() || '');
            const progreso = Number(item.progreso || 0);
            const estaEvolucionado = estaTerminado || progreso > 0 || totalAbonado > 0;

            if (!estaEvolucionado && totalAbonado === 0) return null;

            let paymentStatus = 'unpaid';
            if (totalAbonado >= precioPactado && precioPactado > 0) {
                paymentStatus = 'paid';
            } else if (totalAbonado > 0) {
                paymentStatus = 'partially-paid';
            }

            const pacienteData = item.presupuestos?.pacientes;
            return {
              id_origen: item.id,
              fecha: item.updated_at,
              paciente: pacienteData ? `${pacienteData.nombre} ${pacienteData.apellido}` : 'Paciente',
              prestacion: item.nombre_prestacion || 'Prestación sin nombre',
              montoPago: totalAbonado,
              honorario: 0, // No genera honorario a la bolsa liquida hasta el 100%
              tipo: 'Seguimiento',
              paciente_id: item.presupuestos?.paciente_id,
              presupuesto_id: item.presupuesto_id,
              tratamiento_id: item.id,
              estaEvolucionado: estaEvolucionado,
              paymentStatus: paymentStatus,
              costoTotalPrestacion: precioPactado,
              pagadoTotalPrestacion: totalAbonado,
              diente: item.diente_id,
              cara: item.cara,
              observacion: item.observacion
            };
        })
        .filter(Boolean);

      // Consolidar todos los ítems para mostrar en la tabla (Liquidables + Pendientes de pago/Deuda)
      setItemsPendientes([...pendientesFinal, ...itemsDeSeguimiento]);
      setCierresCompletados(cierresList.reverse());

    } catch (error: any) {
      toast.error(`Error al cargar datos: ${error.message}`)
    } finally {
      setCargando(false)
    }
  }

  const handlePrint = () => {
    setFechaEmision(new Date().toLocaleDateString('es-CL'));
    setTimeout(() => {
      window.print();
    }, 100);
  }

  const liquidables = itemsPendientes.filter(i => i.paymentStatus === 'paid');
  const parciales = itemsPendientes.filter(i => i.paymentStatus === 'partially-paid');
  const deudas = itemsPendientes.filter(i => i.paymentStatus !== 'paid' && i.paymentStatus !== 'partially-paid');

  const handleExportExcel = () => {
    // Función para evitar que caracteres especiales rompan el formato del Excel
    const escapeXml = (unsafe: any) => (unsafe || '').toString().replace(/[<>&'"]/g, (c: string) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });

    const xmlTemplate = `<?xml version="1.0"?>
    <?mso-application progid="Excel.Sheet"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
     xmlns:o="urn:schemas-microsoft-com:office:office"
     xmlns:x="urn:schemas-microsoft-com:office:excel"
     xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
     xmlns:html="http://www.w3.org/TR/REC-html40">
     <Styles>
      <Style ss:ID="Header">
       <Font ss:Bold="1" ss:Color="#FFFFFF"/>
       <Interior ss:Color="#0A111F" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="Money">
       <NumberFormat ss:Format="&quot;$&quot;#,##0"/>
      </Style>
      <Style ss:ID="Title">
       <Font ss:Bold="1" ss:Size="14"/>
      </Style>
      <Style ss:ID="BoldRight">
       <Font ss:Bold="1"/>
       <Alignment ss:Horizontal="Right"/>
      </Style>
      <Style ss:ID="BoldMoney">
       <Font ss:Bold="1"/>
       <NumberFormat ss:Format="&quot;$&quot;#,##0"/>
      </Style>
     </Styles>

     <!-- ================= HOJA 1 ================= -->
     <Worksheet ss:Name="1. Pagados (A Liquidar)">
      <Table>
       <Column ss:Width="80"/>
       <Column ss:Width="180"/>
       <Column ss:Width="250"/>
       <Column ss:Width="100"/>
       <Column ss:Width="90"/>
       <Column ss:Width="90"/>
       <Column ss:Width="100"/>
       <Row><Cell ss:StyleID="Title"><Data ss:Type="String">TRATAMIENTOS PAGADOS AL 100%</Data></Cell></Row>
       <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Fecha</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Paciente</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Prestación</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Pieza</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Total Prest.</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Total Pagado</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Honorario Dr.</Data></Cell>
       </Row>
       ${liquidables.map(i => `
       <Row>
        <Cell><Data ss:Type="String">${escapeXml(i.fecha ? new Date(i.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F')}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(i.paciente)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(i.prestacion)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml((i.diente ? i.diente : 'General') + (i.cara ? ' ('+i.cara+')' : ''))}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.costoTotalPrestacion)}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.pagadoTotalPrestacion)}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.honorario)}</Data></Cell>
       </Row>
       `).join('')}
       <Row>
        <Cell ss:Index="6" ss:StyleID="BoldRight"><Data ss:Type="String">TOTAL HONORARIOS:</Data></Cell>
        <Cell ss:StyleID="BoldMoney"><Data ss:Type="Number">${Math.round(liquidables.reduce((acc, i) => acc + (i.honorario || 0), 0))}</Data></Cell>
       </Row>
      </Table>
     </Worksheet>

     <!-- ================= HOJA 2 ================= -->
     <Worksheet ss:Name="2. Parciales (Aun No)">
      <Table>
       <Column ss:Width="80"/>
       <Column ss:Width="180"/>
       <Column ss:Width="250"/>
       <Column ss:Width="100"/>
       <Column ss:Width="90"/>
       <Column ss:Width="90"/>
       <Column ss:Width="100"/>
       <Row><Cell ss:StyleID="Title"><Data ss:Type="String">PACIENTES CON PAGOS PARCIALES</Data></Cell></Row>
       <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Fecha</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Paciente</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Prestación</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Pieza</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Total Prest.</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Total Pagado</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Falta Pagar</Data></Cell>
       </Row>
       ${parciales.map(i => `
       <Row>
        <Cell><Data ss:Type="String">${escapeXml(i.fecha ? new Date(i.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F')}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(i.paciente)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(i.prestacion)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml((i.diente ? i.diente : 'General') + (i.cara ? ' ('+i.cara+')' : ''))}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.costoTotalPrestacion)}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.pagadoTotalPrestacion)}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round((i.costoTotalPrestacion || 0) - (i.pagadoTotalPrestacion || 0))}</Data></Cell>
       </Row>
       `).join('')}
       <Row>
        <Cell ss:Index="6" ss:StyleID="BoldRight"><Data ss:Type="String">TOTAL POR PAGAR:</Data></Cell>
        <Cell ss:StyleID="BoldMoney"><Data ss:Type="Number">${Math.round(parciales.reduce((acc, i) => acc + ((i.costoTotalPrestacion || 0) - (i.pagadoTotalPrestacion || 0)), 0))}</Data></Cell>
       </Row>
      </Table>
     </Worksheet>

     <!-- ================= HOJA 3 ================= -->
     <Worksheet ss:Name="3. Deudas (Sin Pago)">
      <Table>
       <Column ss:Width="80"/>
       <Column ss:Width="180"/>
       <Column ss:Width="250"/>
       <Column ss:Width="100"/>
       <Column ss:Width="90"/>
       <Column ss:Width="90"/>
       <Column ss:Width="100"/>
       <Row><Cell ss:StyleID="Title"><Data ss:Type="String">PACIENTES CON DEUDA (SIN PAGOS)</Data></Cell></Row>
       <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Fecha</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Paciente</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Prestación</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Pieza</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Total Prest.</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Total Pagado</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Deuda Total</Data></Cell>
       </Row>
       ${deudas.map(i => `
       <Row>
        <Cell><Data ss:Type="String">${escapeXml(i.fecha ? new Date(i.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F')}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(i.paciente)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(i.prestacion)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml((i.diente ? i.diente : 'General') + (i.cara ? ' ('+i.cara+')' : ''))}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.costoTotalPrestacion)}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">0</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.costoTotalPrestacion)}</Data></Cell>
       </Row>
       `).join('')}
       <Row>
        <Cell ss:Index="6" ss:StyleID="BoldRight"><Data ss:Type="String">TOTAL DEUDAS:</Data></Cell>
        <Cell ss:StyleID="BoldMoney"><Data ss:Type="Number">${Math.round(deudas.reduce((acc, i) => acc + (i.costoTotalPrestacion || 0), 0))}</Data></Cell>
       </Row>
      </Table>
     </Worksheet>
    </Workbook>`;

    const blob = new Blob([xmlTemplate], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Liquidacion_Dr_${profesional?.apellido}_${mesSeleccionado}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const obtenerFechaFinalizacion = () => {
    const [year, month] = mesSeleccionado.split('-');
    const ultimoDiaNum = new Date(Number(year), Number(month), 0).getDate();
    return `${String(ultimoDiaNum).padStart(2, '0')}/${month}/${year}`;
  }

  if (cargando) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FBF8F2] gap-4 relative z-0">
        <Loader2 className="animate-spin text-[#C9A24B]" size={40} />
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Calculando liquidación...</p>
      </div>
    )
  }

  if (errorSesion) {
    return (
      <div className="min-h-screen bg-[#FBF8F2] flex items-center justify-center p-8 relative overflow-hidden z-0">
        <div className="bg-white/90 backdrop-blur-md p-10 rounded-[2.5rem] border border-slate-100 shadow-xl text-center max-w-md relative z-10">
          <p className="text-xs font-black text-red-500 uppercase tracking-widest">{errorSesion}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FBF8F2] font-sans relative overflow-hidden z-0 text-left">

      {/* ========================================================================= */}
      {/* VISTA WEB (OCULTA AL IMPRIMIR) */}
      {/* ========================================================================= */}
      <div className="max-w-7xl mx-auto space-y-8 p-6 md:p-8 pb-20 print:hidden relative z-10 text-left">

        <Link href="/mi-menu/liquidacion" className="flex items-center gap-2 text-slate-500 hover:text-[#C9A24B] font-black text-[10px] uppercase tracking-widest transition-all w-fit bg-white/50 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-200 hover:border-[#C9A24B]/30 shadow-sm">
          <ChevronLeft size={14} /> Volver a mis liquidaciones
        </Link>

        {/* TARJETAS DE RESUMEN SUPERIOR */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/95 backdrop-blur-sm p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-center text-left transition-all hover:shadow-md">
            <p className="text-[10px] font-black text-[#C9A24B] uppercase tracking-[0.2em] mb-2">Total Generado (Mes)</p>
            <p className="text-3xl md:text-4xl font-black text-[#0A111F]">${Math.round(resumenMes.totalMes).toLocaleString('es-CL')}</p>
          </div>
          <div className="bg-white/95 backdrop-blur-sm p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-center text-left transition-all hover:shadow-md">
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-2">Ya Pagado</p>
            <p className="text-3xl md:text-4xl font-black text-emerald-700">${Math.round(resumenMes.totalPagado).toLocaleString('es-CL')}</p>
          </div>
          <div className="bg-[#0A111F] p-8 rounded-[2.5rem] text-white shadow-2xl flex flex-col justify-center relative overflow-hidden transition-all hover:shadow-xl">
            <div className="absolute right-[-20px] bottom-[-20px] opacity-10 pointer-events-none">
              <DollarSign size={140} className="text-[#C9A24B]" />
            </div>
            <p className="text-[10px] font-black uppercase text-[#C9A24B] tracking-[0.2em] relative z-10">Saldo Pendiente a Pagar</p>
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1 relative z-10">Producción nueva no liquidada</p>
            <p className={`text-4xl md:text-5xl font-black mt-4 flex items-center gap-2 relative z-10 ${resumenMes.saldoPendiente > 0 ? "text-white" : "text-slate-500"}`}>
              ${Math.round(resumenMes.saldoPendiente).toLocaleString('es-CL')}
            </p>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-sm p-8 md:p-10 rounded-[3rem] shadow-sm border border-slate-100 text-left">

          {/* HEADER DEL REPORTE */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-200 pb-8 mb-8 text-left">
            <div className="text-left">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-[#C9A24B]/10 rounded-xl flex items-center justify-center text-[#C9A24B] shrink-0">
                  <Wallet size={18} />
                </div>
                <p className="text-[10px] font-black text-[#C9A24B] uppercase tracking-[0.2em]">Desglose de Periodo</p>
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight text-left">
                Detalle de Producción
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-5 text-left">
                <div className="bg-[#0A111F] px-4 py-2.5 rounded-xl text-[10px] font-black text-[#C9A24B] uppercase tracking-widest shadow-sm">
                  Dr. {profesional?.nombre} {profesional?.apellido}
                </div>
                <div className="px-4 py-2.5 border border-[#C9A24B]/30 bg-[#C9A24B]/5 text-[#0A111F] rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">
                  Contrato Vigente: {profesional?.porcentaje_comision || 40}%
                </div>
                <div className="px-4 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest shadow-sm">
                  Periodo: {mesSeleccionado}
                </div>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <button onClick={handleExportExcel} className="w-full md:w-auto bg-emerald-600 text-white px-6 py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-lg font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95">
                <Download size={16} /> Excel (Por Secciones)
              </button>
              <button onClick={handlePrint} className="w-full md:w-auto bg-[#0A111F] text-[#C9A24B] px-6 py-4 rounded-2xl hover:bg-[#1a2538] hover:text-white transition-all shadow-lg font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95">
                <Printer size={16} /> Imprimir Reporte
              </button>
            </div>
          </div>

          <div className="space-y-12">

            {/* ========================================================= */}
            {/* SECCIÓN 1: PRODUCCIÓN PENDIENTE */}
            {/* ========================================================= */}
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 flex items-center justify-center bg-[#C9A24B]/10 text-[#C9A24B] rounded-[1.2rem] shrink-0"><AlertCircle size={20} /></div>
                <div>
                  <h2 className="text-xl font-black text-[#0A111F] uppercase tracking-tight">Estado de Tratamientos y Pagos</h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Tratamientos evolucionados pendientes de liquidación y sus deudas</p>
                </div>
              </div>

              {itemsPendientes.length === 0 ? (
                <div className="p-12 border border-dashed border-slate-300 rounded-[2.5rem] text-center bg-slate-50/50 flex flex-col items-center">
                  <CheckCircle2 size={40} className="text-emerald-500 mb-4 opacity-80" />
                  <p className="text-xs font-black text-[#0A111F] uppercase tracking-widest">No hay producción pendiente</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wide">Todo está liquidado y al día.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-[2rem] border border-slate-200 shadow-sm text-left">
                  <div className="overflow-x-auto text-left">
                    <table className="w-full text-left border-collapse min-w-[900px]">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-5 py-4 text-[9px] font-black text-slate-500 uppercase text-center tracking-widest w-32">Estado</th>
                          <th className="px-5 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Fecha</th>
                          <th className="px-5 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Paciente</th>
                          <th className="px-5 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest max-w-[200px]">Prestación</th>
                          <th className="px-5 py-4 text-[9px] font-black text-slate-500 uppercase text-right tracking-widest">Total Prest.</th>
                          <th className="px-5 py-4 text-[9px] font-black text-slate-500 uppercase text-right tracking-widest">Total Pagado</th>
                          <th className="px-5 py-4 text-[10px] font-black text-[#0A111F] uppercase text-right tracking-widest bg-[#C9A24B]/10 w-32">Honorario</th>
                          <th className="px-5 py-4 text-[9px] font-black text-slate-500 uppercase text-center tracking-widest w-20">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {itemsPendientes.map((item: any, idx: number) => (
                          <tr key={idx} className="text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-4">
                              {item.estaEvolucionado && (
                                <div className="flex items-center justify-center gap-2">
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                                    item.paymentStatus === 'paid' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                                    item.paymentStatus === 'partially-paid' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' :
                                    'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                                  }`}></div>
                                  <span className={`text-[9px] font-black uppercase tracking-widest ${
                                    item.paymentStatus === 'paid' ? 'text-emerald-600' :
                                    item.paymentStatus === 'partially-paid' ? 'text-amber-600' :
                                    'text-red-600'
                                  }`}>
                                    { item.paymentStatus === 'paid' ? 'Pagado' : item.paymentStatus === 'partially-paid' ? 'Parcial' : 'Deuda' }
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-4 text-slate-400">{item.fecha ? new Date(item.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F'}</td>
                            <td className="px-5 py-4 uppercase text-[#0A111F]">{item.paciente}</td>
                            <td className="px-5 py-4 uppercase text-slate-500 max-w-[200px] truncate" title={item.prestacion}>{item.prestacion}</td>
                            <td className="px-5 py-4 text-right text-slate-800">${(item.costoTotalPrestacion || 0).toLocaleString('es-CL')}</td>
                            <td className="px-5 py-4 text-right text-slate-500">${(item.pagadoTotalPrestacion || 0).toLocaleString('es-CL')}</td>
                            <td className="px-5 py-4 text-right font-black text-[#0A111F] bg-[#C9A24B]/5 text-[13px]">
                              ${Math.round(item.honorario).toLocaleString('es-CL')}
                            </td>
                            <td className="px-5 py-4 text-center">
                              <button onClick={() => setDetalleItem(item)} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:bg-[#0A111F] hover:text-[#C9A24B] hover:border-[#0A111F] transition-all shadow-sm">
                                <Eye size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-[#0A111F] border-t-2 border-[#C9A24B]">
                        <tr>
                          <td colSpan={6} className="px-5 py-4 text-right font-black text-slate-300 uppercase text-[10px] tracking-widest">Total Honorario A Pagar:</td>
                          <td className="px-5 py-4 text-right font-black text-[#C9A24B] text-base">
                            ${Math.round(resumenMes.saldoPendiente).toLocaleString('es-CL')}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* ========================================================= */}
            {/* SECCIÓN 2: HISTORIAL DE CIERRES (LO YA PAGADO) */}
            {/* ========================================================= */}
            {cierresCompletados.length > 0 && (
              <div className="pt-10 border-t border-slate-200">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-[1.2rem] border border-emerald-100 shrink-0"><History size={20} /></div>
                  <div>
                    <h2 className="text-xl font-black text-[#0A111F] uppercase tracking-tight">Historial de Liquidaciones</h2>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Cierres completados y pagados en este mes</p>
                  </div>
                </div>

                <div className="space-y-8">
                  {cierresCompletados.map((cierre) => (
                    <div key={cierre.id} className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm text-left">
                      <div className="p-6 md:p-8 flex flex-col sm:flex-row justify-between sm:items-center gap-5 bg-slate-50 border-b border-slate-200">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600 shadow-sm"><CheckCircle2 size={20} /></div>
                          <div>
                            <h3 className="font-black uppercase tracking-tight text-sm md:text-base text-[#0A111F]">{cierre.titulo}</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cierre bloqueado e inmodificable</p>
                          </div>
                        </div>
                        <div className="px-5 py-3.5 rounded-xl text-[11px] font-black tracking-widest uppercase flex items-center gap-2 bg-[#0A111F] text-emerald-400 shadow-md">
                          Pagado: ${(cierre.montoTotal || 0).toLocaleString('es-CL')}
                        </div>
                      </div>

                      <div className="overflow-x-auto text-left">
                        <table className="w-full text-left min-w-[800px]">
                          <thead className="bg-white border-b border-slate-100">
                            <tr>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase text-center tracking-widest w-32">Estado</th>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Paciente</th>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Prestación</th>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase text-right tracking-widest">Total Prest.</th>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase text-right tracking-widest">Total Pagado</th>
                              <th className="px-5 py-4 text-[10px] font-black text-[#0A111F] uppercase text-right tracking-widest bg-emerald-50">Honorario Pagado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {cierre.items.map((item: any, idx: number) => (
                              <tr key={idx} className="text-[11px] font-bold text-slate-500 hover:bg-slate-50 transition-colors opacity-90">
                                <td className="px-5 py-4">
                                  {item.estaEvolucionado && (
                                    <div className="flex items-center justify-center gap-2">
                                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                                        item.paymentStatus === 'paid' ? 'bg-emerald-500' :
                                        item.paymentStatus === 'partially-paid' ? 'bg-amber-500' :
                                        'bg-red-500'
                                      }`}></div>
                                      <span className={`text-[9px] font-black uppercase tracking-widest ${
                                        item.paymentStatus === 'paid' ? 'text-emerald-600' :
                                        item.paymentStatus === 'partially-paid' ? 'text-amber-600' :
                                        'text-red-600'
                                      }`}>
                                        { item.paymentStatus === 'paid' ? 'Pagado' : item.paymentStatus === 'partially-paid' ? 'Parcial' : 'Deuda' }
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-5 py-4 text-slate-400">{item.fecha ? new Date(item.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F'}</td>
                                <td className="px-5 py-4 uppercase text-slate-700">{item.paciente}</td>
                                <td className="px-5 py-4 uppercase max-w-[200px] truncate" title={item.prestacion}>{item.prestacion}</td>
                                <td className="px-5 py-4 text-right">${(item.costoTotalPrestacion || 0).toLocaleString('es-CL')}</td>
                                <td className="px-5 py-4 text-right">${(item.pagadoTotalPrestacion || 0).toLocaleString('es-CL')}</td>
                                <td className="px-5 py-4 text-right font-black text-[#0A111F] bg-emerald-50/50">
                                  ${Math.round(item.honorario).toLocaleString('es-CL')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VISTA IMPRESIÓN (OCULTA EN WEB, VISIBLE AL IMPRIMIR) */}
      {/* ========================================================================= */}
      <div className="hidden print:block bg-white text-slate-900 p-8 font-sans w-full max-w-[1000px] mx-auto">
        
        {/* Cabecera del Documento */}
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-6">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-[#0A111F]">Centro Médico y Dental Dignidad SpA</h1>
            <p className="text-xs text-slate-500 mt-1">Av. Venancia Leiva 1871, Región Metropolitana, La Pintana</p>
            <p className="text-xs text-slate-500">+56 9 6646 7641 / +56 9 9446 4662</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold uppercase text-[#C9A24B]">Liquidación de Honorarios</h2>
            <p className="text-sm font-bold mt-1">Periodo: <span className="font-normal">{mesSeleccionado}</span></p>
            <p className="text-xs text-slate-500">Impreso: {fechaEmision || new Date().toLocaleDateString('es-CL')}</p>
          </div>
        </div>

        {/* Cajas de Resumen */}
        <div className="flex gap-6 mb-8">
          <div className="flex-1 border border-slate-200 p-4 rounded-xl">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 border-b border-slate-100 pb-1">Datos del Profesional</h3>
            <p className="text-sm font-bold uppercase">Dr(a). {profesional?.nombre} {profesional?.apellido}</p>
            <p className="text-xs text-slate-600 mt-1">RUT: {profesional?.rut || 'No Registrado'}</p>
            <p className="text-xs text-slate-600">Porcentaje Convenio: {profesional?.porcentaje_comision || 40}%</p>
          </div>
          <div className="flex-1 border border-[#C9A24B] bg-[#C9A24B]/5 p-4 rounded-xl">
            <h3 className="text-[10px] font-black uppercase text-[#C9A24B] tracking-widest mb-2 border-b border-[#C9A24B]/20 pb-1">Resumen Monetario del Periodo</h3>
            <div className="flex justify-between text-xs mb-1 text-slate-700"><span>Producción Total (Mes):</span> <span className="font-bold">${Math.round(resumenMes.totalMes).toLocaleString('es-CL')}</span></div>
            <div className="flex justify-between text-xs mb-1 text-slate-700"><span>Anticipos/Cierres Previos:</span> <span className="font-bold">${Math.round(resumenMes.totalPagado).toLocaleString('es-CL')}</span></div>
            <div className="flex justify-between text-sm font-black text-[#0A111F] mt-2 pt-2 border-t border-[#C9A24B]/30"><span>TOTAL A TRANSFERIR:</span> <span>${Math.round(resumenMes.saldoPendiente).toLocaleString('es-CL')}</span></div>
          </div>
        </div>

        {/* 1. SECCIÓN PAGADOS (LIQUIDABLES) */}
        {liquidables.length > 0 && (
          <div className="mb-8 page-break-inside-avoid">
            <h3 className="text-[11px] font-black text-white bg-emerald-600 px-4 py-2 uppercase tracking-widest mb-2 rounded-t-lg">1. Tratamientos Pagados 100% (Liquidables)</h3>
            <table className="w-full text-left text-[10px] border-collapse">
              <thead className="bg-slate-100 border-b-2 border-slate-300 text-slate-600 uppercase">
                <tr>
                  <th className="p-2 w-16">Fecha</th>
                  <th className="p-2">Paciente</th>
                  <th className="p-2">Prestación</th>
                  <th className="p-2 text-right">T. Costo</th>
                  <th className="p-2 text-right">Pagado</th>
                  <th className="p-2 text-right text-emerald-800">Honorario</th>
                </tr>
              </thead>
              <tbody>
                {liquidables.map((item: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="p-2">{item.fecha ? new Date(item.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F'}</td>
                    <td className="p-2 uppercase font-bold text-slate-800">{item.paciente}</td>
                    <td className="p-2 uppercase text-slate-600">{item.prestacion} <span className="text-[8px] opacity-60">({item.diente ? item.diente : 'Gen'})</span></td>
                    <td className="p-2 text-right text-slate-500">${Math.round(item.costoTotalPrestacion).toLocaleString('es-CL')}</td>
                    <td className="p-2 text-right text-slate-500">${Math.round(item.pagadoTotalPrestacion).toLocaleString('es-CL')}</td>
                    <td className="p-2 text-right font-black text-emerald-700">${Math.round(item.honorario).toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. SECCIÓN PAGOS PARCIALES */}
        {parciales.length > 0 && (
          <div className="mb-8 page-break-inside-avoid">
            <h3 className="text-[11px] font-black text-slate-900 bg-amber-300 px-4 py-2 uppercase tracking-widest mb-2 rounded-t-lg">2. Pacientes con Pagos Parciales (Aún no Liquidables)</h3>
            <table className="w-full text-left text-[10px] border-collapse">
              <thead className="bg-slate-100 border-b-2 border-slate-300 text-slate-600 uppercase">
                <tr>
                  <th className="p-2 w-16">Fecha</th>
                  <th className="p-2">Paciente</th>
                  <th className="p-2">Prestación</th>
                  <th className="p-2 text-right">T. Costo</th>
                  <th className="p-2 text-right">Pagado</th>
                  <th className="p-2 text-right text-amber-800">Falta Pagar</th>
                </tr>
              </thead>
              <tbody>
                {parciales.map((item: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="p-2">{item.fecha ? new Date(item.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F'}</td>
                    <td className="p-2 uppercase font-bold text-slate-800">{item.paciente}</td>
                    <td className="p-2 uppercase text-slate-600">{item.prestacion} <span className="text-[8px] opacity-60">({item.diente ? item.diente : 'Gen'})</span></td>
                    <td className="p-2 text-right text-slate-500">${Math.round(item.costoTotalPrestacion).toLocaleString('es-CL')}</td>
                    <td className="p-2 text-right font-bold text-amber-600">${Math.round(item.pagadoTotalPrestacion).toLocaleString('es-CL')}</td>
                    <td className="p-2 text-right font-black text-amber-700">${Math.round(item.costoTotalPrestacion - item.pagadoTotalPrestacion).toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. SECCIÓN DEUDAS */}
        {deudas.length > 0 && (
          <div className="mb-8 page-break-inside-avoid">
            <h3 className="text-[11px] font-black text-white bg-red-600 px-4 py-2 uppercase tracking-widest mb-2 rounded-t-lg">3. Pacientes con Deudas Completas (Sin Pagos)</h3>
            <table className="w-full text-left text-[10px] border-collapse">
              <thead className="bg-slate-100 border-b-2 border-slate-300 text-slate-600 uppercase">
                <tr>
                  <th className="p-2 w-16">Fecha</th>
                  <th className="p-2">Paciente</th>
                  <th className="p-2">Prestación</th>
                  <th className="p-2 text-right">T. Costo</th>
                  <th className="p-2 text-right text-red-800">Deuda Total</th>
                </tr>
              </thead>
              <tbody>
                {deudas.map((item: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-200 text-slate-500">
                    <td className="p-2">{item.fecha ? new Date(item.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F'}</td>
                    <td className="p-2 uppercase font-bold text-slate-800">{item.paciente}</td>
                    <td className="p-2 uppercase text-slate-600">{item.prestacion} <span className="text-[8px] opacity-60">({item.diente ? item.diente : 'Gen'})</span></td>
                    <td className="p-2 text-right">${Math.round(item.costoTotalPrestacion).toLocaleString('es-CL')}</td>
                    <td className="p-2 text-right font-black text-red-600">${Math.round(item.costoTotalPrestacion).toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. CIERRES PREVIOS */}
        {cierresCompletados.length > 0 && (
          <div className="mb-8 break-before-page">
            <h3 className="text-[11px] font-black text-slate-800 bg-slate-200 px-4 py-2 uppercase tracking-widest mb-4 rounded-t-lg">4. Historial de Cierres Anteriores (Mes Actual)</h3>
            {cierresCompletados.map((cierre) => (
              <div key={cierre.id} className="mb-6 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                <div className="flex justify-between items-center mb-3">
                    <p className="font-black text-xs uppercase tracking-tight text-slate-800">{cierre.titulo}</p>
                    <p className="font-black text-[11px] bg-slate-200 text-slate-700 px-2 py-1 rounded">Total Cierre: ${Number(cierre.montoTotal).toLocaleString('es-CL')}</p>
                </div>
                <table className="w-full text-left text-[9px] text-gray-700 border-collapse">
                  <thead className="border-b-2 border-slate-300">
                    <tr>
                      <th className="pb-1 w-16 uppercase">Fecha</th>
                      <th className="pb-1 uppercase">Paciente</th>
                      <th className="pb-1 uppercase">Prestación</th>
                      <th className="pb-1 text-right uppercase">Pagado Dr.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cierre.items.map((item: any, idx: number) => (
                      <tr key={`cierre-${cierre.id}-${idx}`} className="border-b border-gray-200 last:border-0">
                        <td className="py-1.5">{item.fecha ? new Date(item.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F'}</td>
                        <td className="py-1.5 uppercase font-bold">{item.paciente}</td>
                        <td className="py-1.5 uppercase text-slate-500">{item.prestacion}</td>
                        <td className="py-1.5 text-right font-bold text-slate-900">${Math.round(item.honorario).toLocaleString('es-CL')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* MODAL DETALLE ITEM MEDIANTE CREATEPORTAL */}
      {/* ========================================================================= */}
      {isMounted && typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
          {detalleItem && (
            <div className="fixed inset-0 bg-[#0A111F]/70 backdrop-blur-sm z-[999999] flex items-center justify-center p-4 text-left" onClick={() => setDetalleItem(null)}>
              <motion.div
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.95 }}
                className="bg-white rounded-[2rem] p-8 md:p-10 w-full max-w-md shadow-2xl text-left border border-slate-100 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-start mb-6 text-left">
                  <div>
                    <h3 className="text-xl font-black text-[#0A111F] uppercase italic tracking-tight">Detalle del Movimiento</h3>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1.5">{detalleItem.paciente}</p>
                  </div>
                  <button onClick={() => setDetalleItem(null)} className="p-2 bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="flex gap-2 mb-6">
                  <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                    detalleItem.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm' :
                    detalleItem.paymentStatus === 'partially-paid' ? 'bg-amber-100 text-amber-700 border border-amber-200 shadow-sm' :
                    'bg-red-100 text-red-700 border border-red-200 shadow-sm'
                  }`}>
                    {detalleItem.paymentStatus === 'paid' ? 'Pagado 100%' : detalleItem.paymentStatus === 'partially-paid' ? 'Pago Parcial' : 'Deuda / Sin Pagar'}
                  </span>
                </div>

                <div className="space-y-4 text-left">
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Prestación</p>
                    <p className="text-[13px] font-bold text-[#0A111F]">{detalleItem.prestacion}</p>
                  </div>
                  
                  {(detalleItem.diente || detalleItem.cara) && (
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Ubicación Clínica</p>
                      <p className="text-[13px] font-bold text-[#0A111F]">
                        {detalleItem.diente ? `Diente: ${detalleItem.diente} ` : ''} 
                        {detalleItem.cara ? `- Cara: ${detalleItem.cara}` : ''}
                      </p>
                    </div>
                  )}

                  {detalleItem.observacion && (
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Observaciones</p>
                      <p className="text-[12px] font-bold text-slate-600 italic">"{detalleItem.observacion}"</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Costo</p>
                      <p className="text-[13px] font-bold text-[#0A111F]">${(detalleItem.costoTotalPrestacion || 0).toLocaleString('es-CL')}</p>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Pagado</p>
                      <p className="text-[13px] font-bold text-[#0A111F]">${(detalleItem.pagadoTotalPrestacion || 0).toLocaleString('es-CL')}</p>
                    </div>
                  </div>
                  
                  <div className={`${detalleItem.paymentStatus === 'paid' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'} p-5 rounded-2xl border`}>
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${detalleItem.paymentStatus === 'paid' ? 'text-emerald-500' : 'text-red-500'}`}>
                      Saldo por Pagar a la Clínica
                    </p>
                    <p className={`text-[13px] font-bold ${detalleItem.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-red-700'}`}>
                      ${((detalleItem.costoTotalPrestacion || 0) - (detalleItem.pagadoTotalPrestacion || 0)).toLocaleString('es-CL')}
                    </p>
                  </div>
                  
                  {detalleItem.presupuesto_id && detalleItem.paciente_id && (
                    <Link href={`/pacientes/${detalleItem.paciente_id}/tratamientos/${detalleItem.presupuesto_id}`} className="flex w-full justify-center items-center gap-2 bg-[#0A111F] text-[#C9A24B] py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-[#1a2538] transition-all mt-8 active:scale-95">
                      Ir al Plan de Tratamiento
                    </Link>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      ) : null}
    </div>
  )
}

'use client'

import { useParams, useSearchParams } from 'next/navigation'
import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, Printer, DollarSign, Loader2, FlaskConical, CheckCircle2, History, AlertCircle, Download, Eye, X, Wallet } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

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
const agruparPorPrestacion = (items: any[]) => {
  const mapa = new Map<string, any>();

  items.forEach((i: any) => {
    const key = `${i.tipo === 'Atención' ? 'at' : 'tr'}-${i.tratamiento_id || i.id_origen}`;
    const prev = mapa.get(key);

    if (!prev) {
      mapa.set(key, {
        ...i,
        honorario: Number(i.honorario || 0),
        montoPago: Number(i.montoPago || 0),
        descuentoLab: Number(i.descuentoLab || 0),
        imponible: Number(i.imponible || 0),
      });
      return;
    }

    prev.honorario += Number(i.honorario || 0);
    prev.montoPago += Number(i.montoPago || 0);
    prev.descuentoLab += Number(i.descuentoLab || 0);
    prev.imponible += Number(i.imponible || 0);

    // Se deja la fecha del último pago (cuando quedó pagado al 100%)
    const fPrev = new Date(String(prev.fecha || 0).replace(' ', 'T')).getTime();
    const fNueva = new Date(String(i.fecha || 0).replace(' ', 'T')).getTime();
    if (fNueva > fPrev) prev.fecha = i.fecha;
  });

  return Array.from(mapa.values());
};
export default function DetalleLiquidacionPage() {
  const { id } = useParams()
  const searchParams = useSearchParams()
  const mesSeleccionado = searchParams.get('mes') || new Date().toISOString().substring(0, 7)

  const [profesional, setProfesional] = useState<any>(null)
  const [itemsPendientes, setItemsPendientes] = useState<any[]>([])
  const [cierresCompletados, setCierresCompletados] = useState<any[]>([])
  const [resumenMes, setResumenMes] = useState({ totalMes: 0, totalPagado: 0, saldoPendiente: 0 })
  const [cargando, setCargando] = useState(true)
  const [fechaEmision, setFechaEmision] = useState('')
  const [detalleItem, setDetalleItem] = useState<any>(null)

  // Estado para los Portals
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    if (id) fetchData()
  }, [id, mesSeleccionado])

  async function fetchData() {
    setCargando(true)
    try {
      const [year, month] = mesSeleccionado.split('-');
      const ultimoDiaNum = new Date(Number(year), Number(month), 0).getDate();
      const ultimoDia = String(ultimoDiaNum).padStart(2, '0');

      const finMes = `${year}-${month}-${ultimoDia} 23:59:59`
      const fechaCortaFin = `${year}-${month}-${ultimoDia}`;

      // 1. Obtener datos del profesional (usando el ID de la URL)
      const { data: prof, error: errProf } = await supabase.from('profesionales').select('*').eq('user_id', id).single()
      if (errProf) throw errProf;
      if (!prof) return;

      const { data: perfil } = await supabase.from('perfiles').select('rut').eq('id', prof.user_id).single();
      setProfesional({ ...prof, rut: perfil?.rut || 'Sin registrar' });

      const porcentajeDr = Number(prof.porcentaje_comision || 40) / 100;

      // 2. Obtener Atenciones Directas del doctor
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

      // 3. Obtener Pagos Históricos de Presupuestos (ahora incluye convenio)
      let todosLosPagos: any[] = [];
      let fetchMorePagos = true;
      let fromPagos = 0;
      const step = 1000;
      while (fetchMorePagos) {
        const { data: pagosChunk, error: errPagos } = await supabase
          .from('pagos')
          .select(`
            id, monto, fecha_pago, profesional_id, paciente_id, convenio,
            pacientes ( id, nombre, apellido ),
            presupuesto_items ( 
              id, presupuesto_id, profesional_id, nombre_prestacion, precio_pactado, 
              abonado, costo_laboratorio, lab_pagado_por_dr, 
              estado, tipo_reparto, porcentaje_forzado, diente_id, cara, observacion, progreso
            )
          `)
          .not('estado', 'eq', 'Anulado')
          .lte('fecha_pago', finMes)
          .range(fromPagos, fromPagos + step - 1);

        if (errPagos) throw errPagos;
        if (pagosChunk && pagosChunk.length > 0) {
          todosLosPagos = [...todosLosPagos, ...pagosChunk];
          fromPagos += step;
        } else {
          fetchMorePagos = false;
        }
      }

      // 4. Obtener Liquidaciones Cerradas del doctor
      const { data: liqsData } = await supabase
        .from('liquidaciones')
        .select('*')
        .eq('profesional_id', prof.id)
        .eq('estado', 'Finalizada')
        .lte('periodo_hasta', fechaCortaFin)
        .order('fecha_pago', { ascending: true });

      const liqsCerradas = liqsData || [];

      // 5. Formatear y Aplicar Regla del 100% Pagado
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
        const docId = pItem.profesional_id || pago.profesional_id || null;
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
        const valorForzado = Number(pItem.porcentaje_forzado || 0) / 100;

        let pctDrItem = porcentajeDr;
        if (tipoReparto === 'doctor') pctDrItem = 1;
        else if (tipoReparto === 'clinica') pctDrItem = 0;
        else if (tipoReparto === 'forzado') pctDrItem = valorForzado;

        const comision = estaTerminado ? (montoImponible * pctDrItem) : 0;
        const reembolso = estaTerminado ? (pagadoPorDr ? labAplicado : 0) : 0;
        const totalAlDoctor = comision + reembolso;

        return {
          id_origen: pago.id,
          fecha: pago.fecha_pago,
          paciente: pago.pacientes ? `${pago.pacientes.nombre} ${pago.pacientes.apellido}` : 'Paciente',
          prestacion: pItem.nombre_prestacion || 'Abono Plan',
          montoPago: montoPago,
          descuentoLab: labAplicado,
          esReembolso: pagadoPorDr,
          imponible: montoImponible,
          honorario: totalAlDoctor,
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

      // 6. Unificar y Aplicar Cascada de Tiempo
      const produccionCombinada = [...atencionesFormateadas, ...abonosFormateados]
        .sort((a, b) => new Date(a.fecha?.replace(' ', 'T') || 0).getTime() - new Date(b.fecha?.replace(' ', 'T') || 0).getTime());

      let poolProduccion = produccionCombinada.map(p => ({
        ...p,
        honorario_restante: p.honorario
      }));

      const cierresList: any[] = [];

      liqsCerradas.forEach((liq, index) => {
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
            numero: index + 1,
            fechaPago: fLiq.toLocaleDateString('es-CL'),
            titulo: `Cierre #${index + 1} • Pagado el ${fLiq.toLocaleDateString('es-CL')}`,
            items: itemsDeEstaLiq,
            montoTotal: liq.monto_total
          });
        }
      });

      // 7. Separar lo que quedó pendiente a pagar de los 100% liquidados
      const pendientesFinal = poolProduccion
        .filter(p => p.honorario_restante > 0)
        .map(p => ({
          ...p,
          honorario: p.honorario_restante
        }));

      // 8. Resumen de contabilidad estrictamente del mes consultado
      const produccionDelMes = produccionCombinada.filter(p => {
        const fechaItem = new Date(p.fecha?.replace(' ', 'T') || 0);
        return fechaItem.getFullYear() === Number(year) && fechaItem.getMonth() === (Number(month) - 1);
      });
      const totalMes = produccionDelMes.reduce((acc, curr) => acc + curr.honorario, 0);

      const liqsDelMes = liqsCerradas.filter(l => {
        const fechaLiq = new Date((l.fecha_pago || l.periodo_hasta).replace(' ', 'T'));
        return fechaLiq.getFullYear() === Number(year) && fechaLiq.getMonth() === (Number(month) - 1);
      });
      const totalPagado = liqsDelMes.reduce((acc, curr) => acc + Number(curr.monto_total), 0);
      const saldoPendiente = pendientesFinal.reduce((acc, curr) => acc + curr.honorario, 0);

      setResumenMes({ totalMes, totalPagado, saldoPendiente });

      // 9. Items en seguimiento (no pagados 100%, o pagados pero aún sin liquidar)
      const { data: itemsEnSeguimientoData } = await supabase
        .from('presupuesto_items')
        .select('*, presupuestos(paciente_id, fecha_creacion, pacientes(id, nombre, apellido))')
        .eq('profesional_id', prof.user_id)
        .or('progreso.gt.0,abonado.gt.0,estado.eq.realizado,estado.eq.atendido,estado.eq.terminado,estado.eq.finalizado,estado.eq.completado');

      // Última fecha de pago por ítem
      const ultimaFechaPagoPorItem: Record<string, string> = {};
      todosLosPagos.forEach((pago: any) => {
        const pItem = Array.isArray(pago.presupuesto_items) ? pago.presupuesto_items[0] : pago.presupuesto_items;
        if (!pItem?.id || !pago.fecha_pago) return;
        const actual = ultimaFechaPagoPorItem[pItem.id];
        if (!actual || pago.fecha_pago > actual) ultimaFechaPagoPorItem[pItem.id] = pago.fecha_pago;
      });

      // Convenio del último pago por ítem
      const convenioPorItem: Record<string, string> = {};
      [...todosLosPagos]
        .sort((a, b) => String(a.fecha_pago).localeCompare(String(b.fecha_pago)))
        .forEach((pago: any) => {
          const pItem = Array.isArray(pago.presupuesto_items) ? pago.presupuesto_items[0] : pago.presupuesto_items;
          if (pItem?.id && pago.convenio) convenioPorItem[pItem.id] = pago.convenio;
        });

      // Ids ya liquidados 100% en CUALQUIER cierre (no solo los del mes consultado)
      const idsLiquidados = new Set(
        poolProduccion
          .filter(p => p.honorario > 0 && p.honorario_restante <= 0)
          .map(p => p.tratamiento_id)
      );

      const estadosTerminados = ['realizado', 'atendido', 'terminado', 'finalizado', 'completado'];

      const itemsDeSeguimiento = (itemsEnSeguimientoData || [])
        .map((item: any) => {
          const precioPactado = Number(item.precio_pactado || 0);
          const totalAbonado = Number(item.abonado || 0);

          // Ya está en pendientes con honorario por pagar
          if (pendientesFinal.some(p => p.tratamiento_id === item.id)) return null;
          // Ya fue liquidado completo en algún cierre (cualquier mes)
          if (idsLiquidados.has(item.id)) return null;
          // Ya aparece en un cierre del mes consultado
          if (cierresList.some(c => c.items.some((i: any) => i.tratamiento_id === item.id))) return null;

          const estaTerminado = estadosTerminados.includes(item.estado?.toLowerCase() || '');
          const progreso = Number(item.progreso || 0);
          const estaEvolucionado = estaTerminado || progreso > 0 || totalAbonado > 0;
          if (!estaEvolucionado && totalAbonado === 0) return null;

          let paymentStatus = 'unpaid';
          if (totalAbonado >= precioPactado && precioPactado > 0) paymentStatus = 'paid';
          else if (totalAbonado > 0) paymentStatus = 'partially-paid';

          const fechaRef = ultimaFechaPagoPorItem[item.id] || item.presupuestos?.fecha_creacion || null;

          if (paymentStatus === 'paid') {
            // Pagado 100% de la clínica: no genera honorario, no hay nada pendiente
            if (item.tipo_reparto === 'clinica') return null;
            // Pagado 100%: solo se muestra en el mes en que se pagó
            if (fechaRef && !String(fechaRef).startsWith(mesSeleccionado)) return null;
          }
          // Parciales y deudas se muestran siempre, aunque sean de meses anteriores

          const pacienteData = item.presupuestos?.pacientes;
          return {
            id_origen: item.id,
            fecha: fechaRef,
            paciente: pacienteData ? `${pacienteData.nombre} ${pacienteData.apellido}` : 'Paciente',
            prestacion: item.nombre_prestacion || 'Prestación sin nombre',
            montoPago: totalAbonado,
            descuentoLab: 0,
            imponible: 0,
            honorario: 0,
            tipo: 'Seguimiento',
            paciente_id: item.presupuestos?.paciente_id,
            presupuesto_id: item.presupuesto_id,
            tratamiento_id: item.id,
            estaEvolucionado,
            paymentStatus,
            costoTotalPrestacion: precioPactado,
            pagadoTotalPrestacion: totalAbonado,
            diente: item.diente_id,
            cara: item.cara,
            observacion: item.observacion,
            convenio: convenioPorItem[item.id] || '',
            tipoReparto: item.tipo_reparto || 'general',
            costoLab: Number(item.costo_laboratorio || 0)
          };
        })
        .filter(Boolean);

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

  const esClinicaOLab = (i: any) =>
    i.tipoReparto === 'clinica' ||
    (i.costoLab || 0) > 0 ||
    /laborator/i.test(i.prestacion || '');

  const liquidables = itemsPendientes.filter(i => i.paymentStatus === 'paid');
  const parciales = itemsPendientes.filter(i => i.paymentStatus === 'partially-paid' && !esClinicaOLab(i));
  const deudas = itemsPendientes.filter(i => i.paymentStatus !== 'paid' && i.paymentStatus !== 'partially-paid');
  const liquidablesExcel = agruparPorPrestacion(liquidables);
  const handleExportExcel = () => {
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
       ${liquidablesExcel.map(i => `
       <Row>
        <Cell><Data ss:Type="String">${escapeXml(i.fecha ? new Date(i.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F')}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(i.paciente)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(i.prestacion)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml((i.diente ? i.diente : 'General') + (i.cara ? ' (' + i.cara + ')' : ''))}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.costoTotalPrestacion)}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.pagadoTotalPrestacion)}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.honorario)}</Data></Cell>
       </Row>
       `).join('')}
       <Row>
        <Cell ss:Index="6" ss:StyleID="BoldRight"><Data ss:Type="String">TOTAL HONORARIOS:</Data></Cell>
        <Cell ss:StyleID="BoldMoney"><Data ss:Type="Number">${Math.round(liquidablesExcel.reduce((acc, i) => acc + (i.honorario || 0), 0))}</Data></Cell>
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
       <Column ss:Width="140"/>
       <Column ss:Width="90"/>
       <Column ss:Width="90"/>
       <Column ss:Width="100"/>
       <Row><Cell ss:StyleID="Title"><Data ss:Type="String">PACIENTES CON PAGOS PARCIALES</Data></Cell></Row>
       <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Fecha</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Paciente</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Prestación</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Pieza</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Convenio</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Total Prest.</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Total Pagado</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Falta Pagar</Data></Cell>
       </Row>
       ${parciales.map(i => `
       <Row>
        <Cell><Data ss:Type="String">${escapeXml(i.fecha ? new Date(i.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F')}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(i.paciente)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(i.prestacion)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml((i.diente ? i.diente : 'General') + (i.cara ? ' (' + i.cara + ')' : ''))}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(i.convenio || 'Sin convenio')}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.costoTotalPrestacion)}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.pagadoTotalPrestacion)}</Data></Cell>
        <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round((i.costoTotalPrestacion || 0) - (i.pagadoTotalPrestacion || 0))}</Data></Cell>
       </Row>
       `).join('')}
       <Row>
        <Cell ss:Index="7" ss:StyleID="BoldRight"><Data ss:Type="String">TOTAL POR PAGAR:</Data></Cell>
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
        <Cell><Data ss:Type="String">${escapeXml((i.diente ? i.diente : 'General') + (i.cara ? ' (' + i.cara + ')' : ''))}</Data></Cell>
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
    a.download = `Liquidacion_${profesional?.nombre}_${profesional?.apellido}_${mesSeleccionado}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Excel descargado correctamente");
  };

  // Descargar el detalle de un cierre ya pagado (sin Costo Lab ni Base Imponible)
  const handleExportCierreExcel = (cierre: any) => {
    const itemsCierre = agruparPorPrestacion(cierre.items);

    const filas = itemsCierre.map((i: any) => `
    <Row>
      <Cell><Data ss:Type="String">${escapeXml(i.fecha ? new Date(i.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F')}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(i.paciente)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(i.prestacion)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml((i.diente ? i.diente : 'General') + (i.cara ? ' (' + i.cara + ')' : ''))}</Data></Cell>
      <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.montoPago || 0)}</Data></Cell>
      <Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(i.honorario || 0)}</Data></Cell>
    </Row>`).join('');

    const totalItems = itemsCierre.reduce((acc: number, i: any) => acc + (i.honorario || 0), 0);
    
    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0A111F" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Money"><NumberFormat ss:Format="&quot;$&quot;#,##0"/></Style>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/></Style>
  <Style ss:ID="BoldRight"><Font ss:Bold="1"/><Alignment ss:Horizontal="Right"/></Style>
  <Style ss:ID="BoldMoney"><Font ss:Bold="1"/><NumberFormat ss:Format="&quot;$&quot;#,##0"/></Style>
 </Styles>
 <Worksheet ss:Name="Cierre ${cierre.numero}">
  <Table>
   <Column ss:Width="80"/><Column ss:Width="180"/><Column ss:Width="250"/><Column ss:Width="100"/>
   <Column ss:Width="90"/><Column ss:Width="100"/>
   <Row><Cell ss:StyleID="Title"><Data ss:Type="String">${escapeXml(`LIQUIDACIÓN CERRADA #${cierre.numero} - Pagada el ${cierre.fechaPago}`)}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">${escapeXml(`Dr. ${profesional?.nombre} ${profesional?.apellido} - RUT: ${profesional?.rut || ''} - Periodo: ${mesSeleccionado}`)}</Data></Cell></Row>
   <Row>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Fecha</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Paciente</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Prestación</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Pieza</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Pago Recibido</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Pagado al Dr.</Data></Cell>
   </Row>
   ${filas}
   <Row>
    <Cell ss:Index="5" ss:StyleID="BoldRight"><Data ss:Type="String">TOTAL PAGADO:</Data></Cell>
    <Cell ss:StyleID="BoldMoney"><Data ss:Type="Number">${Math.round(totalItems)}</Data></Cell>
   </Row>
  </Table>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cierre_${cierre.numero}_${profesional?.nombre}_${profesional?.apellido}_${mesSeleccionado}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Cierre #${cierre.numero} descargado`);
  };

  const obtenerFechaFinalizacion = () => {
    const [year, month] = mesSeleccionado.split('-');
    const ultimoDiaNum = new Date(Number(year), Number(month), 0).getDate();
    return `${String(ultimoDiaNum).padStart(2, '0')}/${month}/${year}`;
  }

  if (cargando) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FBF8F2] gap-4">
      <Loader2 className="animate-spin text-[#C9A24B]" size={40} />
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando reporte de liquidación...</p>
    </div>
  )

  return (
    <main className="min-h-screen bg-[#FBF8F2] p-6 md:p-10 font-sans text-slate-900 relative overflow-hidden z-0">

      <div
        className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"
      ></div>

      <div className="max-w-7xl mx-auto space-y-8 relative z-10 print:hidden text-left">

        <Link href="/administracion/liquidaciones" className="flex items-center gap-2 text-slate-400 hover:text-[#0A111F] font-black text-[10px] uppercase tracking-widest transition-all w-fit">
          <ChevronLeft size={16} /> Volver a liquidaciones
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/95 backdrop-blur-sm p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Generado (Mes)</p>
            <p className="text-3xl font-black text-[#0A111F]">${Math.round(resumenMes.totalMes).toLocaleString('es-CL')}</p>
          </div>
          <div className="bg-emerald-50/80 backdrop-blur-sm p-8 rounded-[2.5rem] border border-emerald-100 flex flex-col justify-center">
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Ya Pagado al Doctor</p>
            <p className="text-3xl font-black text-emerald-700">${Math.round(resumenMes.totalPagado).toLocaleString('es-CL')}</p>
          </div>
          <div className="bg-[#0A111F] p-8 rounded-[2.5rem] text-white shadow-xl flex flex-col justify-center relative overflow-hidden">
            <div className="absolute right-[-20px] bottom-[-20px] opacity-10 pointer-events-none">
              <DollarSign size={120} />
            </div>
            <p className="text-[10px] font-black uppercase text-[#C9A24B] tracking-widest relative z-10">Saldo Pendiente a Pagar</p>
            <p className="text-[9px] text-slate-400 uppercase mt-1 relative z-10">Honorarios listos para pago</p>
            <p className={`text-4xl font-black mt-3 flex items-center gap-2 relative z-10 ${resumenMes.saldoPendiente > 0 ? "text-white" : "text-slate-500"}`}>
              ${Math.round(resumenMes.saldoPendiente).toLocaleString('es-CL')}
            </p>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-sm p-8 md:p-10 rounded-[3rem] shadow-sm border border-slate-100 text-left">

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-100 pb-8 mb-8">
            <div className="text-left">
              <p className="text-[10px] font-black text-[#C9A24B] uppercase tracking-[0.2em] mb-2 text-left">Desglose de Periodo</p>
              <h1 className="text-3xl font-black text-[#0A111F] uppercase italic leading-none text-left tracking-tight">
                Detalle de Producción
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-4 text-left">
                <div className="bg-slate-50 px-4 py-2 rounded-xl text-xs font-black text-slate-700 uppercase border border-slate-200">
                  Dr. {profesional?.nombre} {profesional?.apellido}
                </div>
                <div className="px-4 py-2 border border-[#C9A24B]/30 bg-[#C9A24B]/10 text-[#8A6D2F] rounded-xl text-[10px] font-black uppercase tracking-widest">
                  Contrato Vigente: {profesional?.porcentaje_comision || 40}%
                </div>
                <div className="px-4 py-2 border border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Periodo: {mesSeleccionado}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 w-full md:w-auto mt-4 md:mt-0">
              <button
                onClick={handleExportExcel}
                className="bg-emerald-600 text-white px-6 py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-md font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <Download size={18} /> Descargar Excel
              </button>
              <button
                onClick={handlePrint}
                className="bg-[#0A111F] text-white px-6 py-4 rounded-2xl hover:bg-[#1a2538] transition-all shadow-md font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <Printer size={18} /> Imprimir Reporte
              </button>
            </div>
          </div>

          <div className="space-y-12">

            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-xl"><AlertCircle size={22} /></div>
                <div>
                  <h2 className="text-xl font-black text-[#0A111F] uppercase tracking-tight">Estado de Tratamientos y Pagos</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Tratamientos evolucionados pendientes de liquidación y sus deudas</p>
                </div>
              </div>

              {itemsPendientes.length === 0 ? (
                <div className="p-12 border-2 border-dashed border-slate-200 rounded-[2.5rem] text-center bg-slate-50/50">
                  <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3 opacity-60" />
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">No hay producción pendiente</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Todo está liquidado y al día.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-[2.5rem] border border-amber-200/60 shadow-sm bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[900px]">
                      <thead className="bg-amber-50/60 border-b border-amber-100">
                        <tr>
                          <th className="px-5 py-4 text-[9px] font-black text-amber-800 uppercase tracking-widest w-32 text-center">Estado</th>
                          <th className="px-5 py-4 text-[9px] font-black text-amber-800 uppercase tracking-widest">Fecha</th>
                          <th className="px-5 py-4 text-[9px] font-black text-amber-800 uppercase tracking-widest">Paciente</th>
                          <th className="px-5 py-4 text-[9px] font-black text-amber-800 uppercase tracking-widest">Prestación</th>
                          <th className="px-5 py-4 text-[9px] font-black text-amber-800 uppercase tracking-widest text-right">Pago Recibido</th>
                          <th className="px-5 py-4 text-[9px] font-black text-amber-800 uppercase tracking-widest text-right">Costo Lab</th>
                          <th className="px-5 py-4 text-[9px] font-black text-amber-800 uppercase tracking-widest text-right">Base Imponible</th>
                          <th className="px-5 py-4 text-[9px] font-black text-amber-800 uppercase tracking-widest text-right bg-amber-100/50">Honorario</th>
                          <th className="px-5 py-4 text-[9px] font-black text-amber-800 uppercase tracking-widest w-20 text-center">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {itemsPendientes.map((item: any, idx: number) => (
                          <tr key={idx} className="text-xs font-bold text-slate-700 hover:bg-slate-50/50 transition-colors">
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
                                    {item.paymentStatus === 'paid' ? 'Pagado' : item.paymentStatus === 'partially-paid' ? 'Parcial' : 'Deuda'}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-4 text-slate-400">{item.fecha ? new Date(item.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F'}</td>
                            <td className="px-5 py-4 uppercase font-black">{item.paciente}</td>
                            <td className="px-5 py-4 uppercase text-slate-600 max-w-[200px] truncate" title={item.prestacion}>{item.prestacion}</td>
                            <td className="px-5 py-4 text-right text-slate-800">${(item.montoPago || 0).toLocaleString('es-CL')}</td>
                            <td className="px-5 py-4 text-right">
                              {item.descuentoLab > 0 ? (
                                <div className="flex flex-col items-end">
                                  <span className={`font-black flex items-center gap-1 ${item.esReembolso ? 'text-amber-600' : 'text-red-500'}`}>
                                    <FlaskConical size={12} /> ${Math.round(item.descuentoLab).toLocaleString('es-CL')}
                                  </span>
                                  <span className="text-[8px] font-bold uppercase opacity-60">
                                    {item.esReembolso ? 'Por Reembolsar' : 'Deducido'}
                                  </span>
                                </div>
                              ) : <span className="text-slate-300">-</span>}
                            </td>
                            <td className="px-5 py-4 text-right text-slate-600">${Math.round(item.imponible).toLocaleString('es-CL')}</td>
                            <td className="px-5 py-4 text-right font-black text-amber-700 bg-amber-50/40 text-sm">
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
                      <tfoot className="bg-amber-50/80 border-t border-amber-200">
                        <tr>
                          <td colSpan={7} className="px-6 py-5 text-right font-black text-amber-900 uppercase text-xs">Total Honorario a Pagar:</td>
                          <td className="px-6 py-5 text-right font-black text-amber-700 text-base">
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

            {cierresCompletados.length > 0 && (
              <div className="pt-8 border-t border-slate-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl"><History size={22} /></div>
                  <div>
                    <h2 className="text-xl font-black text-[#0A111F] uppercase tracking-tight">Historial de Liquidaciones</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Cierres completados y pagados en este mes</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {cierresCompletados.map((cierre) => (
                    <div key={cierre.id} className="overflow-hidden rounded-[2.5rem] border border-emerald-100 bg-white shadow-sm">
                      <div className="p-6 md:p-8 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-emerald-50/40">
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-600"><CheckCircle2 size={20} /></div>
                          <div>
                            <h3 className="font-black uppercase tracking-wider text-sm text-emerald-900">{cierre.titulo}</h3>
                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">Cierre bloqueado e inmodificable</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => handleExportCierreExcel(cierre)}
                            className="bg-emerald-600 text-white px-4 py-2.5 rounded-2xl hover:bg-emerald-700 transition-all shadow-sm font-black text-[10px] uppercase tracking-widest flex items-center gap-2"
                            title="Descargar detalle de este cierre"
                          >
                            <Download size={14} /> Descargar Excel
                          </button>
                          <div className="px-5 py-2.5 rounded-2xl text-xs font-black tracking-widest uppercase flex items-center gap-2 bg-emerald-100 text-emerald-800 shadow-sm">
                            Pagado: ${(cierre.montoTotal || 0).toLocaleString('es-CL')}
                          </div>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[900px]">
                          <thead className="bg-slate-50/50 border-y border-slate-100">
                            <tr>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest w-32 text-center">Estado</th>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Paciente</th>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Prestación</th>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Pago Recibido</th>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo Lab</th>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Base Imponible</th>
                              <th className="px-5 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right bg-emerald-50/50">Pagado al Dr.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {cierre.items.map((item: any, idx: number) => (
                              <tr key={idx} className="text-xs font-bold text-slate-600 hover:bg-slate-50/50 transition-colors opacity-90">
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
                                        {item.paymentStatus === 'paid' ? 'Pagado' : item.paymentStatus === 'partially-paid' ? 'Parcial' : 'Deuda'}
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-5 py-4">{item.fecha ? new Date(item.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F'}</td>
                                <td className="px-5 py-4 uppercase font-black">{item.paciente}</td>
                                <td className="px-5 py-4 uppercase max-w-[200px] truncate" title={item.prestacion}>{item.prestacion}</td>
                                <td className="px-5 py-4 text-right">${(item.montoPago || 0).toLocaleString('es-CL')}</td>
                                <td className="px-5 py-4 text-right">
                                  {item.descuentoLab > 0 ? (
                                    <div className="flex flex-col items-end">
                                      <span className="font-black flex items-center gap-1 text-slate-400">
                                        <FlaskConical size={12} /> ${Math.round(item.descuentoLab).toLocaleString('es-CL')}
                                      </span>
                                    </div>
                                  ) : <span className="text-slate-300">-</span>}
                                </td>
                                <td className="px-5 py-4 text-right">${Math.round(item.imponible).toLocaleString('es-CL')}</td>
                                <td className="px-5 py-4 text-right font-black text-emerald-700 bg-emerald-50/50">
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

      <div className="hidden print:block bg-white text-black p-4 font-sans text-[11px] leading-tight max-w-[800px] mx-auto">
        <div className="text-center mb-6">
          <h1 className="font-bold text-lg mb-1">CENTRO MEDICO Y DENTAL DIGNIDAD SPA</h1>
        </div>
        <div className="mb-4">
          <p>Fecha Finalización: {obtenerFechaFinalizacion()}, Fecha Impresión: {fechaEmision}</p>
          <p>Liquidación Periodo: {mesSeleccionado}</p>
        </div>
        <div className="mb-4">
          <p className="font-bold underline mb-1">Profesional:</p>
          <p>Nombre: {profesional?.nombre} {profesional?.apellido} RUT: {profesional?.rut || ''} Sucursal: CENTRO MEDICO Y DENTAL DIGNIDAD</p>
        </div>
        <div className="mb-6">
          <p className="font-bold underline mb-1">Resumen de la Liquidación:</p>
          <p>Producción Mes ${Math.round(resumenMes.totalMes).toLocaleString('es-CL')}</p>
          <p>Ya Pagado (Cierres Previos) ${Math.round(resumenMes.totalPagado).toLocaleString('es-CL')}</p>
          <p className="font-bold mt-1">Saldo Pendiente a Pagar ${Math.round(resumenMes.saldoPendiente).toLocaleString('es-CL')}</p>
        </div>

        {itemsPendientes.length > 0 && (
          <div className="mb-6">
            <p className="font-bold underline mb-2">Detalle de Producción Pendiente de Pago:</p>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-black">
                  <th className="py-1 w-20">Fecha</th>
                  <th className="py-1">Paciente</th>
                  <th className="py-1">Acción</th>
                  <th className="py-1 text-right w-24">Honorario</th>
                </tr>
              </thead>
              <tbody>
                {itemsPendientes.map((item: any, idx: number) => (
                  <tr key={`pend-${idx}`}>
                    <td className="py-1">{item.fecha ? new Date(item.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F'}</td>
                    <td className="py-1 uppercase">{item.paciente}</td>
                    <td className="py-1 uppercase pr-2">
                      {item.prestacion}
                      <span className="text-[8px] text-gray-500 ml-1">
                        ({item.paymentStatus === 'paid' ? 'Pagado' : item.paymentStatus === 'partially-paid' ? 'Parcial' : 'Deuda'})
                      </span>
                    </td>
                    <td className="py-1 text-right font-bold">${Math.round(item.honorario).toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cierresCompletados.length > 0 && (
          <div className="mb-6">
            <p className="font-bold underline mb-2">Detalle de Historial (Cierres ya pagados este mes):</p>
            {cierresCompletados.map((cierre) => (
              <div key={cierre.id} className="mb-4">
                <p className="font-bold italic text-[10px] mb-1">{cierre.titulo} (Total: ${Number(cierre.montoTotal).toLocaleString('es-CL')})</p>
                <table className="w-full text-left text-[9px] mb-2 text-gray-700">
                  <thead>
                    <tr className="border-b border-gray-300">
                      <th className="py-1 w-20">Fecha</th>
                      <th className="py-1">Paciente</th>
                      <th className="py-1">Acción</th>
                      <th className="py-1 text-right w-24">Pagado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cierre.items.map((item: any, idx: number) => (
                      <tr key={`cierre-${cierre.id}-${idx}`}>
                        <td className="py-1">{item.fecha ? new Date(item.fecha.replace(' ', 'T')).toLocaleDateString('es-CL') : 'S/F'}</td>
                        <td className="py-1 uppercase">{item.paciente}</td>
                        <td className="py-1 uppercase pr-2">{item.prestacion}</td>
                        <td className="py-1 text-right">${Math.round(item.honorario).toLocaleString('es-CL')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
        <div className="mt-16 text-center border-t border-black pt-4 text-[10px]">
          <p className="font-bold uppercase">CENTRO MEDICO Y DENTAL DIGNIDAD SPA</p>
          <p>Venancia Leiva 1871, Región Metropolitana, La Pintana | +56966467641 / +56994464662</p>
        </div>
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

    </main>
  )
}

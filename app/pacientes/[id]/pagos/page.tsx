'use client'
import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {  
  Loader2, Coins, ReceiptText, CheckCircle2, AlertCircle,
  CreditCard, Banknote, Landmark, History, EyeOff, ChevronUp,
  ChevronDown, Printer, Trash2, FileText, Wallet, Plus, User, X, CheckSquare
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

type MedioPago = {
    id: string;
    metodo: string;
    monto: number;
    numeroBoleta: string;
    numeroTransferencia: string;
    banco: string;
}

export default function PagosPacientePage() {
  const params = useParams();
  const paciente_id = params?.id as string; // CORRECCIÓN AQUÍ: Casting explícito a string
 
  const [cargando, setCargando] = useState(true)
  const [cargandoAccion, setCargandoAccion] = useState(false)
 
  const [pacienteInfo, setPacienteInfo] = useState<any>(null)
  const [deudas, setDeudas] = useState<any[]>([])
  const [deudaTotalPlan, setDeudaTotalPlan] = useState(0)
  const [planesDetallados, setPlanesDetallados] = useState<any[]>([])
  const [historialPagos, setHistorialPagos] = useState<any[]>([])
  const [listaBancos, setListaBancos] = useState<any[]>([])
 
  const [perfil, setPerfil] = useState<any>(null);
  const puedeVerFinanzas = perfil?.rol === 'ADMIN' || perfil?.rol === 'RECEPCIONISTA';

  const [usuarioLogueado, setUsuarioLogueado] = useState<any>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [cajaActivaId, setCajaActivaId] = useState<string | null>(null);

  // ESTADOS PARA PAGO SELECTIVO Y MÚLTIPLES MÉTODOS
  const [pagosSeleccionados, setPagosSeleccionados] = useState<Record<string, number>>({})
  
  const [mediosPago, setMediosPago] = useState<MedioPago[]>([{
      id: 'default', metodo: 'Transferencia', monto: 0, numeroBoleta: '', numeroTransferencia: '', banco: ''
  }])

  // ESTADOS PARA EL MODAL DE ABONO LIBRE (SALDO A FAVOR)
  const [modalAbonoLibreAbierto, setModalAbonoLibreAbierto] = useState(false)
  const [montoAbonoLibre, setMontoAbonoLibre] = useState<number | ''>('')
  const [metodoAbonoLibre, setMetodoAbonoLibre] = useState('Transferencia')
  const [numeroBoletaAbonoLibre, setNumeroBoletaAbonoLibre] = useState('')
  const [numeroTransferenciaAbonoLibre, setNumeroTransferenciaAbonoLibre] = useState('')
  const [bancoAbonoLibre, setBancoAbonoLibre] = useState('')
 
  const [pagoAImprimir, setPagoAImprimir] = useState<any>(null)

  const montoTotalAPagar = Object.values(pagosSeleccionados).reduce((a, b) => a + b, 0);

  // EFECTO PARA AUTO-DISTRIBUIR MONTOS CUANDO CAMBIA EL TOTAL
  useEffect(() => {
    if (montoTotalAPagar > 0) {
        setMediosPago(prev => {
            const totalPrev = prev.reduce((a, b) => a + b.monto, 0);
            if (totalPrev !== montoTotalAPagar) {
                return rebalancearMontos(prev, montoTotalAPagar);
            }
            return prev;
        });
    } else {
         setMediosPago([{
            id: 'default', metodo: 'Transferencia', monto: 0, numeroBoleta: '', numeroTransferencia: '', banco: ''
        }]);
    }
  }, [montoTotalAPagar]);

  const rebalancearMontos = (medios: MedioPago[], total: number) => {
    if (medios.length === 0) return medios;
    const split = Math.floor(total / medios.length);
    let rem = total % medios.length;
    return medios.map((m, i) => ({
        ...m,
        monto: split + (i === 0 ? rem : 0)
    }));
  };

  useEffect(() => {
    if (paciente_id) cargarDatosFinancieros()
  }, [paciente_id])

  const getDetalles = (comentario: string) => { try { return JSON.parse(comentario || '[]'); } catch(e) { return []; } }

  // FUNCIÓN: Registrar evento en la tabla de auditoría
  const registrarAuditoria = async (accion: string, tabla: string, registroId: string | null, datosAnteriores: any, datosNuevos: any, detalles: string) => {
    try {
      await supabase.from('auditoria_clinica').insert([{
        usuario_id: usuarioLogueado?.id,
        accion,
        tabla,
        detalles,
        paciente_id: paciente_id,
        registro_afectado_id: registroId,
        user_agent: window.navigator.userAgent,
        rut_usuario: perfil?.rut || null,
        nombre_usuario: perfil?.nombre_completo || usuarioLogueado?.email || 'Sistema',
        rol_al_momento: perfil?.rol || null,
        datos_anteriores: datosAnteriores,
        datos_nuevos: datosNuevos
      }]);
    } catch (error) {
      console.error("No se pudo registrar la auditoría:", error);
    }
  };

  async function cargarDatosFinancieros() {
    setCargando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
          setUsuarioLogueado(session.user);
          const { data: perfilData } = await supabase.from('perfiles').select('rol, nombre_completo, rut').eq('id', session.user.id).single();
          setPerfil(perfilData);
      }

      const { data: bancosData } = await supabase.from('bancos').select('nombre').eq('activo', true).order('nombre', { ascending: true });
      if (bancosData) setListaBancos(bancosData);

      const { data: cajaActiva } = await supabase.from('sesiones_caja').select('id').eq('estado', 'abierta').maybeSingle();
      setCajaActivaId(cajaActiva?.id || null);

      const { data: pacData } = await supabase.from('pacientes').select('*').eq('id', paciente_id).single()
      setPacienteInfo(pacData)

      const { data: presupuestosPaciente } = await supabase
        .from('presupuestos')
        .select('id, nombre_tratamiento')
        .eq('paciente_id', paciente_id)
        .eq('aprobado', true)

      const idsPresupuestos = presupuestosPaciente?.map(p => p.id) || [];
      let itemsConDeuda: any[] = [];
      let deudaPlanCompleto = 0;
      let planesParaVista: any[] = [];

      if (idsPresupuestos.length > 0) {
        const { data: itemsData } = await supabase
            .from('presupuesto_items')
            .select(`id, observacion, precio_pactado, abonado, estado, progreso, diente_id, profesional_id, presupuesto_id,
                prestaciones:prestacion_id("Nombre Accion", "Nombre"), profesional:profesional_id(nombre, apellido)`)
            .in('presupuesto_id', idsPresupuestos)
            .not('estado', 'eq', 'cancelada');

        const todosLosItemsMapeados = (itemsData || []).map(item => {
            const precio = Number(item.precio_pactado || 0);
            const abonado = Number(item.abonado || 0);
            const deuda = precio - abonado;
            let nombreDisplay = item.observacion || "Tratamiento";
            
            if (item.prestaciones) {
                const pres = Array.isArray(item.prestaciones) ? (item.prestaciones[0] as Record<string, any>) : (item.prestaciones as Record<string, any>);
                nombreDisplay = pres?.["Nombre Accion"] || pres?.["Nombre"] || nombreDisplay;
            } else if (item.observacion && item.observacion.includes('|')) {
                nombreDisplay = item.observacion.split('|')[0].trim();
            }

            const prof = Array.isArray(item.profesional) ? item.profesional[0] : item.profesional;
            const doctor = prof ? `Dr/a. ${(prof as any).nombre || ''} ${(prof as any).apellido || ''}`.trim() : 'Sin asignar';
            return { ...item, deuda, nombreDisplay, doctor };
        }).filter(item => item.deuda > 0 && (item.estado === 'realizado' || Number(item.progreso || 0) > 0));

        planesParaVista = (presupuestosPaciente || []).map(plan => {
          const itemsDelPlan = todosLosItemsMapeados.filter(item => item.presupuesto_id === plan.id);
          const deudaDelPlan = itemsDelPlan.reduce((acc, item) => acc + item.deuda, 0);
          return { id: plan.id, nombre: plan.nombre_tratamiento || 'Tratamiento General', deudaTotal: deudaDelPlan };
        }).filter(p => p.deudaTotal > 0);

        deudaPlanCompleto = todosLosItemsMapeados.reduce((acc, item) => acc + item.deuda, 0);
        itemsConDeuda = todosLosItemsMapeados.filter(item => String(item.estado || 'pendiente').toLowerCase() !== 'cancelada');
      }
      setDeudas(itemsConDeuda);
      setDeudaTotalPlan(deudaPlanCompleto);
      setPlanesDetallados(planesParaVista);

      const { data: pagosData } = await supabase.from('pagos').select('*, perfiles:anulado_por(nombre_completo), receptor:profesional_id(nombre_completo)')
        .eq('paciente_id', paciente_id).order('fecha_pago', { ascending: false })
      
      const agruparPagos = (pagosBrutos: any[]) => {
          const grupos: any = {};
          pagosBrutos.forEach(p => {
              if (!grupos[p.fecha_pago]) {
                  grupos[p.fecha_pago] = {
                      ...p,
                      monto: Number(p.monto),
                      metodos_detalle: [{ metodo: p.metodo_pago, monto: Number(p.monto), boleta: p.numero_boleta, ref: p.numero_referencia }],
                      comentarios_raw: [...getDetalles(p.comentario)],
                      rawPagos: [p]
                  };
              } else {
                  grupos[p.fecha_pago].monto += Number(p.monto);
                  grupos[p.fecha_pago].metodos_detalle.push({ metodo: p.metodo_pago, monto: Number(p.monto), boleta: p.numero_boleta, ref: p.numero_referencia });
                  grupos[p.fecha_pago].comentarios_raw.push(...getDetalles(p.comentario));
                  grupos[p.fecha_pago].rawPagos.push(p);
                  
                  const metodosSet = new Set(grupos[p.fecha_pago].metodos_detalle.map((m:any) => m.metodo));
                  grupos[p.fecha_pago].metodo_pago = Array.from(metodosSet).join(' + ');

                  const boletasSet = new Set(grupos[p.fecha_pago].metodos_detalle.map((m:any) => m.boleta).filter((b:any) => b && b !== 'S/N'));
                  grupos[p.fecha_pago].numero_boleta = Array.from(boletasSet).join(' | ');

                  const refSet = new Set(grupos[p.fecha_pago].metodos_detalle.map((m:any) => m.ref).filter(Boolean));
                  grupos[p.fecha_pago].numero_referencia = Array.from(refSet).join(' | ');
              }
          });

          Object.values(grupos).forEach((g: any) => {
              const agrupados = Object.values(g.comentarios_raw.reduce((acc: any, curr: any) => {
                  const key = curr.prestacion + (curr.diente || '');
                  if (!acc[key]) acc[key] = { ...curr };
                  else acc[key].abonado_ahora += curr.abonado_ahora;
                  return acc;
              }, {}));
              g.comentario = JSON.stringify(agrupados); 
          });

          return Object.values(grupos).sort((a: any, b: any) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime());
      }

      setHistorialPagos(agruparPagos(pagosData || []));

    } catch (error) { toast.error("Error al cargar la información financiera") } finally { setCargando(false) }
  }

  const toggleSeleccionPago = (itemId: string, deudaMaxima: number) => {
    setPagosSeleccionados(prev => {
        const nuevos = { ...prev };
        if (nuevos[itemId] !== undefined) delete nuevos[itemId];
        else nuevos[itemId] = deudaMaxima;
        return nuevos;
    });
  }

  const handleMontoParcialChange = (itemId: string, monto: number, deudaMaxima: number) => {
    setPagosSeleccionados(prev => ({ ...prev, [itemId]: Math.min(Math.max(0, monto), deudaMaxima) }));
  }

  const agregarMedioPago = () => {
    setMediosPago(prev => {
        const nuevos = [...prev, {
            id: Math.random().toString(36).substring(7),
            metodo: 'Tarjeta de Débito',
            monto: 0,
            numeroBoleta: prev[0]?.numeroBoleta || '',
            numeroTransferencia: '',
            banco: ''
        }];
        return rebalancearMontos(nuevos, montoTotalAPagar);
    });
  };

  const eliminarMedioPago = (id: string) => {
    setMediosPago(prev => {
        const nuevos = prev.filter(m => m.id !== id);
        return rebalancearMontos(nuevos, montoTotalAPagar);
    });
  };

  const updateMedioPago = (id: string, field: keyof MedioPago, value: any) => {
    setMediosPago(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const handleMontoManualChange = (id: string, nuevoMonto: number) => {
    setMediosPago(prev => {
        const index = prev.findIndex(m => m.id === id);
        if (index === -1) return prev;
        
        const validMonto = Math.min(Math.max(0, nuevoMonto), montoTotalAPagar);
        let nuevos = [...prev];
        nuevos[index] = { ...nuevos[index], monto: validMonto };

        const restante = montoTotalAPagar - validMonto;
        const otrosCount = nuevos.length - 1;

        if (otrosCount > 0) {
            const split = Math.floor(restante / otrosCount);
            let rem = restante % otrosCount;
            nuevos = nuevos.map((m, i) => {
                if (i === index) return m;
                const amount = split + (rem > 0 ? 1 : 0);
                rem--;
                return { ...m, monto: amount };
            });
        } else {
            nuevos[index].monto = montoTotalAPagar;
        }
        return nuevos;
    });
  };

  const procesarAbonoLibre = async () => {
    if (!cajaActivaId) return toast.error("No se puede procesar el abono: No hay caja abierta.");
    if (!montoAbonoLibre || Number(montoAbonoLibre) <= 0) return toast.error("Ingrese un monto válido");
    
    if (metodoAbonoLibre !== 'Saldo a Favor') {
        if (!numeroBoletaAbonoLibre.trim()) return toast.error("Debe ingresar el número de boleta SII obligatoriamente.");
        if (metodoAbonoLibre === 'Transferencia') {
            if (!numeroTransferenciaAbonoLibre.trim() || !bancoAbonoLibre.trim()) return toast.error("Debe ingresar el N° de transferencia y seleccionar un banco obligatoriamente.");
        }
    }

    setCargandoAccion(true);
    try {
        const fechaPagoTransaccion = new Date().toISOString(); 
        const montoNuevo = Number(montoAbonoLibre);
        const saldoActual = Number(pacienteInfo?.saldo_a_favor || 0);
        const detalleAbono = [{ prestacion: "Ingreso Manual a Saldo a Favor", diente: null, precio: montoNuevo, doctor: "-", abonado_ahora: montoNuevo }];

        const { data: nuevoPago, error: errPago } = await supabase.from('pagos').insert([{
            paciente_id: paciente_id,
            monto: montoNuevo,
            metodo_pago: metodoAbonoLibre,
            numero_boleta: numeroBoletaAbonoLibre.trim(),
            numero_referencia: metodoAbonoLibre === 'Transferencia' ? `${bancoAbonoLibre.trim()} - Ref: ${numeroTransferenciaAbonoLibre.trim()}` : null,
            profesional_id: usuarioLogueado?.id,
            fecha_pago: fechaPagoTransaccion,
            comentario: JSON.stringify(detalleAbono),
            caja_id: cajaActivaId
        }]).select().single();

        if (errPago) throw errPago;
        await supabase.from('pacientes').update({ saldo_a_favor: saldoActual + montoNuevo }).eq('id', paciente_id);
        
        // AUDITORÍA: Abono Libre
        await registrarAuditoria(
            'INSERT_ABONO_MANUAL',
            'pagos',
            nuevoPago?.id,
            { saldo_a_favor_anterior: saldoActual },
            { saldo_a_favor_nuevo: saldoActual + montoNuevo, pago: nuevoPago },
            `Ingresó $${montoNuevo.toLocaleString('es-CL')} al saldo a favor de ${pacienteInfo?.nombre} ${pacienteInfo?.apellido} (RUT: ${pacienteInfo?.rut}). Método: ${metodoAbonoLibre}.`
        );

        toast.success(`Se agregaron $${montoNuevo.toLocaleString('es-CL')} al Saldo a Favor.`);
        setModalAbonoLibreAbierto(false);
        setMontoAbonoLibre(''); setNumeroBoletaAbonoLibre(''); setNumeroTransferenciaAbonoLibre(''); setBancoAbonoLibre('');
        await cargarDatosFinancieros();

        if(window.confirm("¿Desea imprimir el comprobante de este ingreso?")) {
            imprimirComprobante({
                ...nuevoPago,
                metodos_detalle: [{ metodo: nuevoPago.metodo_pago, monto: nuevoPago.monto, boleta: nuevoPago.numero_boleta, ref: nuevoPago.numero_referencia }]
            });
        }
    } catch (e) { toast.error("Error al procesar el ingreso manual"); } finally { setCargandoAccion(false); }
  }

  const procesarPagoCaja = async () => {
    if (!cajaActivaId) return toast.error("No se puede procesar el pago: No hay caja abierta.");
    if (montoTotalAPagar <= 0) return toast.error("Seleccione al menos un tratamiento para pagar e ingrese un monto válido.");

    const sumMedios = mediosPago.reduce((acc, m) => acc + m.monto, 0);
    if (sumMedios !== montoTotalAPagar) return toast.error("La suma de los métodos de pago no coincide con el total seleccionado.");

    const saldoActual = Number(pacienteInfo?.saldo_a_favor || 0);
    let totalSaldoUsado = 0;

    for (const m of mediosPago) {
        if (m.monto <= 0) return toast.error("Todos los métodos de pago deben tener un monto mayor a 0.");
        if (m.metodo === 'Saldo a Favor') {
            totalSaldoUsado += m.monto;
        } else {
            if (!m.numeroBoleta.trim()) return toast.error(`Debe ingresar el N° de Boleta para el pago de $${m.monto.toLocaleString('es-CL')}.`);
            if (m.metodo === 'Transferencia') {
                if (!m.numeroTransferencia.trim() || !m.banco.trim()) return toast.error(`Faltan datos de transferencia para el pago de $${m.monto.toLocaleString('es-CL')}.`);
            }
        }
    }

    if (totalSaldoUsado > saldoActual) return toast.error("Fondos insuficientes en Billetera Virtual para cubrir el monto asignado.");

    setCargandoAccion(true);
    let detallesDelPago: any[] = [];
    let idsGenerados: string[] = [];
    const fechaPagoTransaccion = new Date().toISOString(); 
    
    try {
        const itemIdsAPagar = Object.keys(pagosSeleccionados);
        let metodosRestantes = mediosPago.map(m => ({ ...m })); 

        for (const itemId of itemIdsAPagar) {
            let aAbonarItem = pagosSeleccionados[itemId];
            if (aAbonarItem <= 0) continue;

            const itemInfo = deudas.find(d => d.id === itemId);
            if (!itemInfo) continue;

            while (aAbonarItem > 0 && metodosRestantes.length > 0) {
                let metodoActual = metodosRestantes[0];
                let montoTomado = Math.min(aAbonarItem, metodoActual.monto);

                if (montoTomado > 0) {
                    const detalleItem = {
                        id: itemInfo.id,
                        prestacion: itemInfo.nombreDisplay,
                        diente: itemInfo.diente_id,
                        precio: itemInfo.precio_pactado,
                        doctor: itemInfo.doctor,
                        abonado_ahora: montoTomado
                    };
                    detallesDelPago.push(detalleItem);

                    const { data: pagoInsertado } = await supabase.from('pagos').insert([{
                        paciente_id: paciente_id,
                        monto: montoTomado,
                        metodo_pago: metodoActual.metodo,
                        numero_boleta: metodoActual.numeroBoleta.trim() || 'S/N',
                        numero_referencia: metodoActual.metodo === 'Transferencia' ? `${metodoActual.banco.trim()} - Ref: ${metodoActual.numeroTransferencia.trim()}` : null,
                        profesional_id: itemInfo.profesional_id,
                        item_id: itemInfo.id,
                        fecha_pago: fechaPagoTransaccion,
                        comentario: JSON.stringify([detalleItem]),
                        caja_id: cajaActivaId
                    }]).select('id').single();

                    if (pagoInsertado) idsGenerados.push(pagoInsertado.id);

                    aAbonarItem -= montoTomado;
                    metodoActual.monto -= montoTomado;
                }

                if (metodoActual.monto <= 0) {
                    metodosRestantes.shift(); 
                }
            }
            await supabase.from('presupuesto_items').update({ abonado: Number(itemInfo.abonado) + pagosSeleccionados[itemId] }).eq('id', itemInfo.id);
        }

        if (totalSaldoUsado > 0) {
            await supabase.from('pacientes').update({ saldo_a_favor: saldoActual - totalSaldoUsado }).eq('id', paciente_id);
            setPacienteInfo((prev: any) => ({ ...prev, saldo_a_favor: saldoActual - totalSaldoUsado }));
        }

        toast.success(`Pago procesado con éxito.`);
        
        // AUDITORÍA: Pagos a Tratamientos
        await registrarAuditoria(
            'INSERT_PAGO_TRATAMIENTO',
            'pagos, presupuesto_items',
            idsGenerados.join(', '),
            { saldo_a_favor_anterior: saldoActual },
            { 
                saldo_a_favor_nuevo: saldoActual - totalSaldoUsado,
                pagos_realizados: detallesDelPago,
                total_pagado: montoTotalAPagar 
            },
            `Registró un pago selectivo de $${montoTotalAPagar.toLocaleString('es-CL')} para ${pacienteInfo?.nombre} ${pacienteInfo?.apellido}.`
        );

        const detallesAgrupadosParaImprimir = Object.values(detallesDelPago.reduce((acc, curr) => {
            if (!acc[curr.id]) acc[curr.id] = { ...curr };
            else acc[curr.id].abonado_ahora += curr.abonado_ahora;
            return acc;
        }, {}));

        const metodosParaImprimir = mediosPago.map(m => ({
            metodo: m.metodo, 
            monto: m.monto, 
            boleta: m.numeroBoleta, 
            ref: m.metodo === 'Transferencia' ? `${m.banco} - Ref: ${m.numeroTransferencia}` : null
        }));

        const pagoConsolidadoParaImprimir = {
            monto: montoTotalAPagar,
            metodos_detalle: metodosParaImprimir,
            fecha_pago: fechaPagoTransaccion,
            comentario: JSON.stringify(detallesAgrupadosParaImprimir)
        };

        setPagosSeleccionados({});
        setMediosPago([{ id: 'default', metodo: 'Transferencia', monto: 0, numeroBoleta: '', numeroTransferencia: '', banco: '' }]);
        
        await cargarDatosFinancieros();
        if(window.confirm("¿Desea imprimir el comprobante de pago ahora?")) imprimirComprobante(pagoConsolidadoParaImprimir);

    } catch (e) { toast.error("Ocurrió un error al procesar el pago"); } finally { setCargandoAccion(false); }
  }

  const reversarPago = async (pago: any) => {
    if (perfil?.rol !== 'ADMIN' && perfil?.rol !== 'RECEPCIONISTA') return toast.error('No tienes permisos para anular pagos.')

    const esAbonoLibre = !pago.rawPagos[0].item_id;
    const mensajeConfirmacion = esAbonoLibre
      ? `Estás a punto de anular un INGRESO MANUAL a la billetera por un total de $${Number(pago.monto).toLocaleString('es-CL')}.\n\nAl presionar "ACEPTAR", se anulará la transacción y el monto se DESCONTARÁ del Saldo a Favor del paciente.\n\nSi presionas "CANCELAR", no se realizará ninguna acción.`
      : `Estás a punto de anular un PAGO A TRATAMIENTO por un total de $${Number(pago.monto).toLocaleString('es-CL')}.\n\nAl presionar "ACEPTAR", se anulará la transacción completa, se restaurará la deuda de los tratamientos involucrados y el dinero se AGREGARÁ al Saldo a Favor (Billetera Virtual) del paciente.\n\nSi presionas "CANCELAR", no se realizará ninguna acción.`;

    if (!window.confirm(mensajeConfirmacion)) return;
    if (pago.estado === 'Anulado') return toast.info("Esta transacción ya fue anulada.");

    // Pedir motivo de anulación obligatorio
    const motivo = window.prompt("Por favor, ingresa el motivo de la anulación (Obligatorio):");
    if (!motivo || motivo.trim() === '') {
        return toast.info("Anulación cancelada. Es obligatorio ingresar un motivo.");
    }

    setCargandoAccion(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let saldoARestaurar = 0;

      for (const p of pago.rawPagos) {
          const montoReversado = Number(p.monto);
          if (p.item_id) {
            const { data: itemActual } = await supabase.from('presupuesto_items').select('abonado, presupuesto_id').eq('id', p.item_id).single();
            if (itemActual) {
              const nuevoAbonoItem = Math.max(0, Number(itemActual.abonado || 0) - montoReversado);
              await supabase.from('presupuesto_items').update({ abonado: nuevoAbonoItem }).eq('id', p.item_id);
              if (itemActual.presupuesto_id) {
                const { data: presActual } = await supabase.from('presupuestos').select('total_abonado').eq('id', itemActual.presupuesto_id).single();
                if (presActual) {
                  const nuevoTotalAbonado = Math.max(0, Number(presActual.total_abonado || 0) - montoReversado);
                  await supabase.from('presupuestos').update({ total_abonado: nuevoTotalAbonado }).eq('id', itemActual.presupuesto_id);
                }
              }
            }
            saldoARestaurar += montoReversado; 
          } else {
            saldoARestaurar -= montoReversado; 
          }
          
          await supabase.from('pagos').update({ estado: 'Anulado', anulado_por: session?.user?.id, fecha_anulacion: new Date().toISOString() }).eq('id', p.id);
      }

      const saldoActual = Number(pacienteInfo?.saldo_a_favor || 0);
      const nuevoSaldo = Math.max(0, saldoActual + saldoARestaurar);

      await supabase.from('pacientes').update({ saldo_a_favor: nuevoSaldo }).eq('id', paciente_id);
      setPacienteInfo((prev: any) => ({ ...prev, saldo_a_favor: nuevoSaldo }));
      
      const detallesAuditoria = esAbonoLibre 
          ? `Anuló un ingreso manual agrupado de $${pago.monto.toLocaleString('es-CL')}. Se descuenta de SALDO A FAVOR. Motivo: ${motivo.trim()}`
          : `Anuló un pago agrupado a tratamiento de $${pago.monto.toLocaleString('es-CL')}. Destino: SALDO A FAVOR. Motivo: ${motivo.trim()}`;

      // AUDITORÍA: Anulación
      const idsPagos = pago.rawPagos.map((p:any) => p.id).join(', ');
      await registrarAuditoria(
          'UPDATE_ANULACION_PAGO',
          'pagos',
          idsPagos,
          { estado_anterior: 'Completado', saldo_anterior: saldoActual },
          { estado_nuevo: 'Anulado', saldo_nuevo: nuevoSaldo, motivo: motivo.trim() },
          detallesAuditoria
      );
      
      toast.success("Transacción anulada por completo. El saldo ha sido ajustado.");
      await cargarDatosFinancieros();
    } catch (e) { toast.error("Error al reversar el pago"); } finally { setCargandoAccion(false); }
  }

  const handleEditarSaldoAFavor = async () => {
    if (perfil?.rol !== 'ADMIN') return toast.error("Solo los administradores pueden editar el saldo manualmente.");
    const motivo = window.prompt("⚠️ ¡ACCIÓN DELICADA! ⚠️\n\nEstás a punto de SOBREESCRIBIR el saldo a favor del paciente.\nEsta acción es para corregir errores y debe usarse con extrema precaución.\n\nPor favor, ingresa un motivo claro para esta corrección (ej: 'Ajuste por error en vuelto del 15/05'):");
    if (!motivo || motivo.trim() === '') return toast.info("La edición fue cancelada. No se ingresó un motivo.");

    const nuevoSaldoStr = window.prompt("Ahora, ingresa el NUEVO MONTO EXACTO del saldo a favor (solo números):");
    if (nuevoSaldoStr === null) return toast.info("Edición cancelada.");
    const nuevoSaldo = Number(nuevoSaldoStr);
    if (isNaN(nuevoSaldo) || nuevoSaldo < 0) return toast.error("Monto inválido. Por favor, ingresa solo números positivos.");

    const confirmacionFinal = window.confirm(`CONFIRMACIÓN FINAL:\n\nEl saldo a favor de ${pacienteInfo?.nombre} ${pacienteInfo?.apellido} se establecerá en:\n\n$${nuevoSaldo.toLocaleString('es-CL')}\n\nMotivo: ${motivo.trim()}\n\n¿Estás absolutamente seguro? Esta acción no se puede deshacer fácilmente.`);
    if (!confirmacionFinal) return toast.info("Edición cancelada por el usuario.");

    setCargandoAccion(true);
    try {
      const saldoAnterior = Number(pacienteInfo?.saldo_a_favor || 0);
      await supabase.from('pacientes').update({ saldo_a_favor: nuevoSaldo }).eq('id', paciente_id);
      
      // AUDITORÍA: Edición manual de saldo
      await registrarAuditoria(
          'UPDATE_EDICION_SALDO',
          'pacientes',
          paciente_id,
          { saldo_a_favor: saldoAnterior },
          { saldo_a_favor: nuevoSaldo, motivo: motivo.trim() },
          `Admin cambió saldo de $${saldoAnterior.toLocaleString('es-CL')} a $${nuevoSaldo.toLocaleString('es-CL')}. Motivo: ${motivo.trim()}`
      );

      toast.success("Saldo a favor actualizado manualmente.");
      await cargarDatosFinancieros();
    } catch (e) { toast.error("Error al actualizar el saldo."); } finally { setCargandoAccion(false); }
  }

  // IMPRESIÓN CON HTML2PDF
  const imprimirComprobante = async (pago: any) => {
    setPagoAImprimir(pago);
    const toastId = toast.loading("Preparando comprobante profesional...");
    
    setTimeout(async () => {
        try {
            const html2pdf = (await import('html2pdf.js')).default;
            const element = document.getElementById('comprobante-impresion-pdf');
            
            if (!element) {
                toast.error("Error al localizar el documento", { id: toastId });
                return;
            }

            const opt = {
                margin: [15, 15, 20, 15] as [number, number, number, number],
                filename: `Comprobante_${pacienteInfo?.rut || 'Pago'}.pdf`,
                image: { type: 'jpeg', quality: 1 } as const,
                html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff', scrollY: 0, windowWidth: 720 },
                jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' } as const,
                pagebreak: { mode: ['css', 'legacy'] as const }
            };

            await html2pdf().set(opt).from(element).toPdf().get('pdf').then((pdf: any) => {
                window.open(pdf.output('bloburl'), '_blank');
            });

            toast.success("Comprobante generado con éxito", { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error("Error al generar el PDF", { id: toastId });
        }
    }, 200); 
  }

  if (cargando) return (
    <div className="h-full min-h-[400px] flex flex-col items-center justify-center print:hidden">
      <Loader2 className="animate-spin text-emerald-500 mb-4" size={45} />
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando estado de cuenta...</p>
    </div>
  )

  const deudaTotal = deudas.reduce((acc, curr) => acc + curr.deuda, 0);
  const deudaPlan = deudaTotalPlan;
  const saldoAFavor = Number(pacienteInfo?.saldo_a_favor || 0);

  if (perfil && !puedeVerFinanzas) {
    return (
      <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 bg-white/90 backdrop-blur-xl rounded-[3rem] shadow-xl border border-white/60">
        <EyeOff className="text-slate-300 mb-4" size={48} />
        <h3 className="text-lg font-black text-slate-700 uppercase">Acceso Restringido</h3>
        <p className="text-sm text-slate-500 max-w-sm mt-2">No tienes los permisos necesarios para visualizar la información financiera de los pacientes.</p>
      </div>
    )
  }

  const detallesImpresion = getDetalles(pagoAImprimir?.comentario);

  return (
    <>
      <div className="p-6 md:p-10 text-left h-full print:hidden">
        
        {/* CABECERA SUPERIOR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 bg-white/90 backdrop-blur-xl p-8 rounded-[2.5rem] shadow-xl border border-white/60">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-[1.5rem] bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-xl shadow-emerald-500/20">
                <ReceiptText size={28} strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter text-slate-800 leading-none">Caja y Recaudación</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-1.5">
                  <User size={12}/> {pacienteInfo?.nombre} {pacienteInfo?.apellido}
                </p>
                <div className={`mt-3 inline-flex items-center gap-2 border px-3.5 py-1.5 rounded-xl shadow-sm ${saldoAFavor > 0 ? 'bg-emerald-50/80 border-emerald-200' : 'bg-slate-50 border-slate-200/80'}`}>
                  <Wallet size={14} className={saldoAFavor > 0 ? 'text-emerald-600' : 'text-slate-400'} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${saldoAFavor > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                    Billetera: <span className={saldoAFavor > 0 ? 'text-emerald-600' : 'text-slate-700'}>${saldoAFavor.toLocaleString('es-CL')}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                <button disabled={!cajaActivaId} onClick={() => setModalAbonoLibreAbierto(true)} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50 border border-emerald-400">
                  <Plus size={16} strokeWidth={3} /> Ingresar Saldo a Favor
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* PANEL PRINCIPAL: COBRO DE DEUDAS */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col sm:flex-row justify-between items-center sm:items-start gap-6 border border-slate-800">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none text-white"><Coins size={120} /></div>
              <div className="relative z-10 w-full">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-2">Deuda Exigible</p>
                <p className={`text-4xl md:text-5xl font-black tracking-tighter ${deudaTotal > 0 ? 'text-white' : 'text-emerald-400'}`}>${deudaTotal.toLocaleString('es-CL')}</p>
                {planesDetallados.length > 1 && deudaPlan > deudaTotal ? (
                  <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Desglose Deuda Total</p>
                    {planesDetallados.map(plan => (
                      <div key={plan.id} className="flex justify-between items-center text-sm">
                        <span className="font-bold text-slate-300 uppercase">{plan.nombre}</span><span className="font-black text-slate-200">${plan.deudaTotal.toLocaleString('es-CL')}</span>
                      </div>
                    ))}
                  </div>
                ) : deudaPlan > deudaTotal ? (
                  <p className="text-sm font-bold text-slate-400 mt-2">Deuda Plan Completo: <span className="text-slate-200">${deudaPlan.toLocaleString('es-CL')}</span></p>
                ) : null}
              </div>

              <div className="relative z-10 bg-emerald-500/20 border border-emerald-500/30 p-5 rounded-3xl w-full sm:w-auto shrink-0 text-center sm:text-right flex flex-col justify-between backdrop-blur-md">
                <div><p className="text-[9px] font-black text-emerald-300 uppercase tracking-widest mb-1">Saldo a Favor</p><p className="text-2xl font-black text-emerald-400">${saldoAFavor.toLocaleString('es-CL')}</p></div>
                {perfil?.rol === 'ADMIN' && (<button onClick={handleEditarSaldoAFavor} className="mt-3 bg-amber-400/20 border border-amber-400/30 text-amber-300 text-[9px] font-black uppercase tracking-widest px-3.5 py-1.5 rounded-xl hover:bg-amber-400 hover:text-slate-900 transition-all">Editar Saldo</button>)}
              </div>
            </div>

            {/* DETALLE DE LO QUE SE DEBE - SELECCIONABLE */}
            {deudas.length > 0 && (
              <div className="bg-white/90 backdrop-blur-xl p-6 md:p-8 rounded-[2.5rem] border border-white/60 shadow-xl">
                   <div className="flex justify-between items-center mb-6">
                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><CheckSquare size={14} /> Selecciona tratamientos a pagar</h4>
                       <button onClick={() => { if (Object.keys(pagosSeleccionados).length === deudas.length) setPagosSeleccionados({}); else { const todos: Record<string, number> = {}; deudas.forEach(d => { todos[d.id] = d.deuda; }); setPagosSeleccionados(todos); } }} className="text-[9px] font-black uppercase text-emerald-600 hover:text-emerald-800 transition-colors">
                          {Object.keys(pagosSeleccionados).length === deudas.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                       </button>
                   </div>
                   
                   <div className="space-y-3">
                    {deudas.map(d => {
                        const isSelected = pagosSeleccionados[d.id] !== undefined;
                        const montoPagar = pagosSeleccionados[d.id] || 0;

                        return (
                            <div key={d.id} className={`flex flex-col md:flex-row justify-between items-start md:items-center p-4 md:p-5 rounded-2xl border transition-colors shadow-sm ${isSelected ? 'bg-emerald-50/50 border-emerald-300' : 'bg-slate-50/80 border-slate-200/60 hover:bg-white cursor-pointer'}`} onClick={() => { if (!isSelected) toggleSeleccionPago(d.id, d.deuda) }}>
                                <div className="flex items-start gap-3 flex-1 pr-4 mb-3 md:mb-0 w-full" onClick={(e) => { if (isSelected) { e.stopPropagation(); toggleSeleccionPago(d.id, d.deuda) } }}>
                                    <div className="pt-1 shrink-0 cursor-pointer"><input type="checkbox" className="w-4 h-4 accent-emerald-500 cursor-pointer" checked={isSelected} readOnly /></div>
                                    <div className="text-left w-full cursor-pointer">
                                        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                                            <p className={`text-xs font-black uppercase leading-none ${isSelected ? 'text-emerald-900' : 'text-slate-800'}`}>{d.nombreDisplay} {d.diente_id ? `(Pieza ${d.diente_id})` : ''}</p>
                                            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest leading-none ${d.estado === 'realizado' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>{d.estado}</span>
                                        </div>
                                        <p className={`text-[9px] font-bold tracking-widest ${isSelected ? 'text-emerald-700/60' : 'text-slate-400'}`}>{d.doctor} | Pactado: ${Number(d.precio_pactado).toLocaleString('es-CL')} | Pagado: <span className={isSelected ? 'text-emerald-700' : 'text-slate-600'}>${Number(d.abonado).toLocaleString('es-CL')}</span></p>
                                    </div>
                                </div>
                                <div className="text-right shrink-0 w-full md:w-auto flex flex-row md:flex-col justify-between items-center md:items-end gap-2 pl-7 md:pl-0 border-t border-slate-200 md:border-0 pt-3 md:pt-0">
                                    <p className="text-sm font-black text-red-500">Deuda: ${d.deuda.toLocaleString('es-CL')}</p>
                                    {isSelected && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-black text-emerald-600 uppercase">Abonar:</span>
                                            <div className="relative">
                                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-600/50 font-black text-xs">$</span>
                                                <input type="number" className="w-28 py-2 pl-6 pr-2 bg-white border border-emerald-300 rounded-lg text-sm font-black text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500/20 text-right shadow-sm" value={montoPagar || ''} onChange={(e) => handleMontoParcialChange(d.id, Number(e.target.value), d.deuda)} onClick={(e) => e.stopPropagation()} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                   </div>
              </div>
            )}

            {deudaTotal > 0 ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/90 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/60 shadow-xl space-y-6">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-black text-emerald-700 uppercase flex items-center gap-2"><Coins size={16} /> Procesar Pagos</h3>
                    <div className="text-right bg-emerald-50 py-1.5 px-4 rounded-xl border border-emerald-100">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mr-2">Total Asignar:</span>
                        <span className="text-sm font-black text-emerald-800">${montoTotalAPagar.toLocaleString('es-CL')}</span>
                    </div>
                </div>

                {!cajaActivaId && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-700 text-xs font-bold flex items-center gap-3 shadow-sm">
                        <AlertCircle size={20} className="shrink-0" />
                        <div><p className="font-black">PAGOS BLOQUEADOS: NO HAY CAJA ABIERTA</p><p className="font-medium">Para registrar pagos, se debe iniciar turno en Cajas.</p></div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {mediosPago.map((medio, index) => (
                        <div key={medio.id} className="relative p-2 border border-slate-200 bg-slate-50/50 rounded-md space-y-1.5 shadow-sm">
                            {mediosPago.length > 1 && (
                                <button onClick={() => eliminarMedioPago(medio.id)} className="absolute top-0.5 right-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 p-0.5 rounded transition-colors">
                                    <Trash2 size={10} />
                                </button>
                            )}
                            
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[8px] font-black">{index + 1}</span>
                                <h5 className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Medio de Pago</h5>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5">
                                <div className="space-y-0.5">
                                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest pl-0.5">Método</label>
                                    <div className="relative">
                                        <select disabled={!cajaActivaId || montoTotalAPagar <= 0} className="w-full py-1 pl-5 pr-1 bg-white hover:bg-slate-50 focus:bg-white border border-slate-200/60 focus:border-emerald-500/50 rounded text-[9px] font-bold uppercase text-slate-700 outline-none focus:ring-1 focus:ring-emerald-500/10 appearance-none shadow-sm disabled:opacity-50" value={medio.metodo} onChange={(e) => updateMedioPago(medio.id, 'metodo', e.target.value)}>
                                            <option value="Transferencia">Transferencia</option>
                                            <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                                            <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                                            <option value="Efectivo">Efectivo</option>
                                            {saldoAFavor > 0 && <option value="Saldo a Favor">Saldo a Favor</option>}
                                        </select>
                                        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                            {medio.metodo.includes('Tarjeta') ? <CreditCard size={10} /> : medio.metodo === 'Efectivo' ? <Banknote size={10} /> : medio.metodo === 'Saldo a Favor' ? <Wallet size={10}/> : <Landmark size={10} />}
                                        </div>
                                        <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={10}/>
                                    </div>
                                </div>

                                <div className="space-y-0.5">
                                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest pl-0.5">Monto</label>
                                    <div className="relative">
                                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-emerald-600 font-black text-[9px]">$</span>
                                        <input type="number" disabled={!cajaActivaId || mediosPago.length === 1 || montoTotalAPagar <= 0} className="w-full py-1 pl-4 pr-1 bg-white border border-emerald-200 text-emerald-700 rounded text-[10px] font-black outline-none focus:ring-1 focus:ring-emerald-500/10 transition-all shadow-sm disabled:opacity-80 disabled:bg-slate-50" value={medio.monto} onChange={(e) => handleMontoManualChange(medio.id, Number(e.target.value))} />
                                    </div>
                                </div>
                            </div>

                            {medio.metodo !== 'Saldo a Favor' && (
                                <div className="space-y-1.5 pt-0.5">
                                    <div className="space-y-0.5">
                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest pl-0.5">N° Boleta SII (*)</label>
                                        <div className="relative">
                                            <input type="text" disabled={!cajaActivaId || montoTotalAPagar <= 0} placeholder="Ej: 1542" className={`w-full py-1 pl-5 pr-1 bg-white border rounded text-[9px] font-bold uppercase text-slate-800 outline-none focus:ring-1 transition-all shadow-sm ${!medio.numeroBoleta.trim() && montoTotalAPagar > 0 ? 'border-amber-300 focus:border-amber-500 focus:ring-amber-500/10' : 'border-slate-200/60 focus:border-emerald-500/50'}`} value={medio.numeroBoleta} onChange={(e) => updateMedioPago(medio.id, 'numeroBoleta', e.target.value)} />
                                            <FileText className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
                                        </div>
                                    </div>
                                    {medio.metodo === 'Transferencia' && (
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <div className="space-y-0.5">
                                                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest pl-0.5">N° Transf (*)</label>
                                                <input type="text" disabled={!cajaActivaId || montoTotalAPagar <= 0} placeholder="Ej: TR-1092" className={`w-full py-1 px-1.5 bg-white border rounded text-[9px] font-bold uppercase shadow-sm outline-none focus:ring-1 transition-all ${!medio.numeroTransferencia.trim() && montoTotalAPagar > 0 ? 'border-amber-300' : 'border-slate-200/60'}`} value={medio.numeroTransferencia} onChange={(e) => updateMedioPago(medio.id, 'numeroTransferencia', e.target.value)} />
                                            </div>
                                            <div className="space-y-0.5">
                                                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest pl-0.5">Banco (*)</label>
                                                <div className="relative">
                                                    <select disabled={!cajaActivaId || montoTotalAPagar <= 0} className={`w-full py-1 pl-1.5 pr-4 bg-white border rounded text-[9px] font-bold uppercase shadow-sm appearance-none outline-none focus:ring-1 transition-all ${!medio.banco.trim() && montoTotalAPagar > 0 ? 'border-amber-300' : 'border-slate-200/60'}`} value={medio.banco} onChange={(e) => updateMedioPago(medio.id, 'banco', e.target.value)}>
                                                        <option value="" disabled>Seleccionar</option>
                                                        {listaBancos.map(b => <option key={b.nombre} value={b.nombre}>{b.nombre}</option>)}
                                                    </select>
                                                    <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={10}/>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex justify-center pt-2">
                    <button onClick={agregarMedioPago} disabled={!cajaActivaId || montoTotalAPagar <= 0} className="px-6 py-2 border-2 border-dashed border-emerald-300 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-50 transition-colors flex items-center gap-2 disabled:opacity-50">
                        <Plus size={14} strokeWidth={3} /> Añadir otra forma de pago
                    </button>
                </div>

                <button onClick={procesarPagoCaja} disabled={cargandoAccion || montoTotalAPagar <= 0 || !cajaActivaId} className="w-full py-5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-3 border border-emerald-400">
                  {cargandoAccion ? <Loader2 className="animate-spin" size={18}/> : <CheckCircle2 size={18} strokeWidth={2.5}/>}
                  {montoTotalAPagar <= 0 ? 'Selecciona un tratamiento arriba' : `Confirmar Pago por $${montoTotalAPagar.toLocaleString('es-CL')}`}
                </button>
              </motion.div>
            ) : (
              <div className="py-16 border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center text-center bg-white/50 backdrop-blur-md shadow-sm">
                   <CheckCircle2 size={56} className="text-emerald-500 mb-4 opacity-80"/>
                   <h3 className="text-lg font-black uppercase text-slate-800">Paciente al día</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 max-w-[250px]">No existen tratamientos aprobados con deuda pendiente por cobrar.</p>
              </div>
            )}
          </div>

          {/* PANEL SECUNDARIO: HISTORIAL DE PAGOS */}
          <aside className="lg:col-span-5">
            <div className="bg-white/90 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white/60 shadow-xl h-full">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><History size={14} /> Historial de Pagos</h4>
                {historialPagos.length === 0 ? (
                    <div className="text-center py-16 opacity-50"><ReceiptText size={40} className="mx-auto text-slate-400 mb-3" /><p className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">No hay pagos registrados</p></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[500px]">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    <th className="p-3 text-[9px] font-black text-slate-400 uppercase"># Pago</th>
                                    <th className="p-3 text-[9px] font-black text-slate-400 uppercase">Medio(s)</th>
                                    <th className="p-3 text-[9px] font-black text-slate-400 uppercase text-right">Monto</th>
                                    <th className="p-3 text-[9px] font-black text-slate-400 uppercase text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {historialPagos.map((pago: any) => {
                                    const isExpanded = expandedRow === pago.fecha_pago; 
                                    const isAnulado = pago.estado === 'Anulado';
                                    const dt = getDetalles(pago.comentario);
                                    
                                    return (
                                        <React.Fragment key={pago.fecha_pago}>
                                            <tr className={`transition-colors text-xs ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50/80'}`}>
                                                <td className="p-3.5 align-top">
                                                    <p className="font-black text-slate-700 uppercase">#{pago.rawPagos[0]?.id?.substring(0, 6)}</p>
                                                    <p className="text-[9px] font-bold text-slate-400">{new Date(pago.fecha_pago).toLocaleDateString('es-CL')}</p>
                                                </td>
                                                <td className="p-3.5 align-top">
                                                    <p className="font-bold text-slate-600 line-clamp-2 max-w-[120px] leading-tight mb-1">{pago.metodo_pago}</p>
                                                    {pago.metodos_detalle.length > 1 && (
                                                        <span className="text-[8px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md font-bold uppercase">Múltiple</span>
                                                    )}
                                                </td>
                                                <td className="p-3.5 align-top text-right">
                                                    <p className={`font-black text-sm ${isAnulado ? 'text-red-500 line-through' : 'text-emerald-600'}`}>
                                                        ${Number(pago.monto).toLocaleString('es-CL')}
                                                    </p>
                                                </td>
                                                <td className="p-3.5 align-top text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button onClick={() => setExpandedRow(isExpanded ? null : pago.fecha_pago)} className="p-2 text-slate-400 hover:bg-slate-200/80 rounded-xl transition-colors">{isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
                                                        <button onClick={() => imprimirComprobante(pago)} className="p-2 text-slate-400 hover:bg-slate-200/80 rounded-xl transition-colors"><Printer size={14} /></button>
                                                        {!isAnulado && (<button onClick={() => reversarPago(pago)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={14} /></button>)}
                                                    </div>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan={4} className="p-0">
                                                        <motion.div initial={{height: 0, opacity: 0}} animate={{height: 'auto', opacity: 1}} className="bg-slate-100/80 p-4 m-2 rounded-2xl border border-slate-200/60">
                                                            
                                                            <h5 className="text-[9px] font-black text-slate-500 uppercase mb-2">Desglose de Tratamientos</h5>
                                                            {dt.length > 0 ? (
                                                                <div className="space-y-2 mb-4">
                                                                    {dt.map((d:any, i:number) => (
                                                                        <div key={i} className="flex justify-between items-start bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                                                                            <div>
                                                                                <p className="text-[10px] font-black text-slate-700 uppercase">{d.prestacion} {d.diente ? `(Pza ${d.diente})` : ''}</p>
                                                                                <p className="text-[9px] font-bold text-slate-400">{d.doctor}</p>
                                                                            </div>
                                                                            <p className="text-[10px] font-bold text-emerald-600">${Number(d.abonado_ahora).toLocaleString('es-CL')}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : <p className="text-xs text-slate-400 italic mb-4">Este pago fue un abono directo a la cuenta.</p>}

                                                            <h5 className="text-[9px] font-black text-slate-500 uppercase mb-2">Métodos de Pago Utilizados</h5>
                                                            <div className="space-y-2">
                                                                {pago.metodos_detalle?.map((md: any, idx: number) => (
                                                                    <div key={idx} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
                                                                        <div>
                                                                            <p className="text-[10px] font-bold text-slate-700 uppercase">{md.metodo}</p>
                                                                            <p className="text-[9px] text-slate-400">
                                                                                {md.boleta && md.boleta !== 'S/N' ? `Bol: ${md.boleta} ` : ''}
                                                                                {md.ref ? `| ${md.ref}` : ''}
                                                                            </p>
                                                                        </div>
                                                                        <p className="text-[10px] font-black text-emerald-600">${Number(md.monto).toLocaleString('es-CL')}</p>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {isAnulado && pago.perfiles && (<div className="mt-4 pt-3 border-t border-red-200 text-center"><p className="text-[9px] font-bold text-red-500">Anulada por {pago.perfiles.nombre_completo} el {new Date(pago.fecha_anulacion).toLocaleDateString('es-CL')}</p></div>)}
                                                        </motion.div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
          </aside>
        </div>
      </div>

      {/* MODAL INGRESO MANUAL DE BILLETERA VIRTUAL */}
      <AnimatePresence>
        {modalAbonoLibreAbierto && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/40 backdrop-blur-md p-4">
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white/95 backdrop-blur-2xl w-full max-w-lg rounded-[3rem] shadow-2xl flex flex-col overflow-hidden text-left border border-white/80">
                <div className="p-8 border-b border-emerald-100 bg-emerald-50/80 flex justify-between items-center shrink-0">
                   <div className="flex items-center gap-4">
                      <div className="p-3.5 bg-emerald-500 text-white rounded-2xl shadow-sm"><Wallet size={24}/></div>
                      <div>
                        <h2 className="font-black text-xl uppercase tracking-tighter text-emerald-900 leading-none">Ingresar Dinero</h2>
                        <p className="text-[10px] text-emerald-700/60 font-bold uppercase tracking-widest mt-1">Abono libre a Billetera Virtual</p>
                      </div>
                   </div>
                   <button onClick={() => setModalAbonoLibreAbierto(false)} className="p-2.5 text-emerald-500 hover:bg-emerald-100 rounded-2xl transition-colors"><X size={20}/></button>
                </div>
                <div className="p-8 space-y-6">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Monto del abono libre ($)</label>
                        <input type="number" placeholder="Ej: 50000" className="w-full p-4 bg-slate-50/80 hover:bg-white border rounded-2xl font-black text-base text-emerald-600 outline-none focus:ring-4 transition-all shadow-sm" value={montoAbonoLibre} onChange={(e) => setMontoAbonoLibre(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Método de Pago</label>
                        <select className="w-full p-4 bg-slate-50/80 hover:bg-white border rounded-2xl font-bold text-xs uppercase outline-none focus:ring-4 transition-all shadow-sm" value={metodoAbonoLibre} onChange={(e) => setMetodoAbonoLibre(e.target.value)}>
                            <option value="Transferencia">Transferencia</option>
                            <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                            <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                            <option value="Efectivo">Efectivo</option>
                        </select>
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">N° Boleta SII (*)</label>
                            <input type="text" placeholder="Ej: 1542" className="w-full p-4 bg-slate-50/80 hover:bg-white border rounded-2xl font-bold text-xs uppercase outline-none focus:ring-4 transition-all shadow-sm" value={numeroBoletaAbonoLibre} onChange={(e) => setNumeroBoletaAbonoLibre(e.target.value)} />
                        </div>
                        {metodoAbonoLibre === 'Transferencia' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">N° Transf (*)</label>
                                    <input type="text" placeholder="Ej: TR-1092" className="w-full p-4 bg-slate-50/80 hover:bg-white border rounded-2xl font-bold text-xs uppercase shadow-sm" value={numeroTransferenciaAbonoLibre} onChange={(e) => setNumeroTransferenciaAbonoLibre(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Banco (*)</label>
                                    <select className="w-full p-4 bg-slate-50/80 hover:bg-white border rounded-2xl font-bold text-xs uppercase shadow-sm appearance-none" value={bancoAbonoLibre} onChange={(e) => setBancoAbonoLibre(e.target.value)}>
                                        <option value="" disabled>Seleccione</option>
                                        {listaBancos.map((b, idx) => <option key={idx} value={b.nombre}>{b.nombre}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="p-8 border-t border-slate-100 bg-white/50 shrink-0 text-right flex gap-3">
                   <button onClick={() => setModalAbonoLibreAbierto(false)} className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all shadow-sm">Cancelar</button>
                   <button onClick={procesarAbonoLibre} disabled={cargandoAccion || !montoAbonoLibre} className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-2xl font-black text-xs uppercase shadow-xl hover:shadow-emerald-500/40 transition-all disabled:opacity-50 flex justify-center gap-2">
                      {cargandoAccion ? <Loader2 className="animate-spin" size={16}/> : <Plus size={16} strokeWidth={3}/>} Ingresar Dinero
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONTENEDOR OCULTO PARA EL GENERADOR DE PDF */}
      <div style={{ position: 'absolute', top: '-9999px', left: '0' }}>
         <div id="comprobante-impresion-pdf" style={{ width: '720px', boxSizing: 'border-box', backgroundColor: '#ffffff', color: '#111827', padding: '30px', fontFamily: 'Arial, sans-serif' }}>
            
            {/* Cabecera */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <img src="https://yqdpmaopnvrgdqbfaiok.supabase.co/storage/v1/object/public/documentos_imagenes/440749454_122171956712064634_7168698893214813270_n.jpg" alt="Logo" style={{ height: '50px', width: 'auto' }} crossOrigin="anonymous" />
                  <div>
                     <h1 style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 2px 0', textTransform: 'uppercase' }}>CENTRO MEDICO Y DENTAL DIGNIDAD SPA</h1>
                     <p style={{ fontSize: '10px', margin: '0 0 2px 0', color: '#555' }}>Fecha Impresión: {new Date().toLocaleDateString('es-CL')}</p>
                     <p style={{ fontSize: '10px', margin: '0', color: '#555' }}>ID: {pagoAImprimir?.rawPagos?.[0]?.id?.substring(0, 8).toUpperCase() || pagoAImprimir?.id?.substring(0, 8).toUpperCase() || 'S/N'}</p>
                  </div>
               </div>
               <div>
                   <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, textTransform: 'uppercase', color: '#333' }}>Comprobante de pago</h2>
               </div>
            </div>

            {/* Paciente */}
            <div style={{ marginBottom: '20px' }}>
               <h3 style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 8px 0', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>Paciente:</h3>
               <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#333' }}>
                  <div style={{ width: '48%' }}>
                     <p style={{ margin: '0 0 4px 0' }}><span style={{ fontWeight: 'bold' }}>Nombre:</span> {pacienteInfo?.nombre} {pacienteInfo?.apellido}</p>
                     <p style={{ margin: '0 0 4px 0' }}><span style={{ fontWeight: 'bold' }}>RUT:</span> {pacienteInfo?.rut || 'S/N'}</p>
                  </div>
                  <div style={{ width: '48%' }}>
                     <p style={{ margin: '0 0 4px 0' }}>
                         <span style={{ fontWeight: 'bold' }}>Fecha de Nacimiento:</span> {pacienteInfo?.fecha_nacimiento ? new Date(pacienteInfo.fecha_nacimiento).toLocaleDateString('es-CL', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : 'No registrada'}
                     </p>
                     <p style={{ margin: '0 0 4px 0' }}><span style={{ fontWeight: 'bold' }}>Convenio:</span> {pacienteInfo?.convenio || 'Sin convenio'}</p>
                  </div>
               </div>
            </div>

            {/* Tratamientos */}
            <div style={{ marginBottom: '25px' }}>
               <h3 style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 8px 0', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>Tratamientos pagados:</h3>
               <p style={{ fontSize: '11px', fontWeight: 'bold', margin: '0 0 2px 0' }}>Plan de Tratamiento General</p>
               <p style={{ fontSize: '11px', margin: '0 0 2px 0', color: '#444' }}>Doctor/a: {detallesImpresion[0]?.doctor || 'Especialista Tratante'}</p>
               <p style={{ fontSize: '11px', margin: '0 0 12px 0', color: '#444' }}>Convenio: {pacienteInfo?.convenio || 'Sin convenio'}</p>

               <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                  <thead>
                     <tr style={{ borderBottom: '2px solid #ccc' }}>
                        <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 'bold', color: '#555' }}>Prestación</th>
                        <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 'bold', color: '#555' }}>Nº Pago</th>
                        <th style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 'bold', color: '#555' }}>Precio</th>
                        <th style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 'bold', color: '#555' }}>Pagado</th>
                     </tr>
                  </thead>
                  <tbody>
                     {detallesImpresion.map((d: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                           <td style={{ padding: '8px 4px' }}>
                              <p style={{ margin: '0 0 2px 0', fontWeight: 'bold', color: '#333' }}>{d.prestacion} {d.diente ? `(Pza ${d.diente})` : ''}</p>
                              <p style={{ margin: 0, color: '#666' }}>Realizada: {new Date(pagoAImprimir?.fecha_pago || new Date()).toLocaleDateString('es-CL')}</p>
                           </td>
                           <td style={{ textAlign: 'center', padding: '8px 4px', verticalAlign: 'top', paddingTop: '10px' }}>
                               {pagoAImprimir?.rawPagos?.[0]?.id?.substring(0, 8).toUpperCase() || pagoAImprimir?.id?.substring(0, 8).toUpperCase() || 'S/N'}
                           </td>
                           <td style={{ textAlign: 'right', padding: '8px 4px', verticalAlign: 'top', paddingTop: '10px' }}>${Number(d.precio || 0).toLocaleString('es-CL')}</td>
                           <td style={{ textAlign: 'right', padding: '8px 4px', verticalAlign: 'top', paddingTop: '10px' }}>${Number(d.abonado_ahora || 0).toLocaleString('es-CL')}</td>
                        </tr>
                     ))}
                     {detallesImpresion.length === 0 && (
                        <tr>
                           <td style={{ padding: '8px 4px', fontWeight: 'bold' }}>Abono a cuenta clínica</td>
                           <td style={{ textAlign: 'center', padding: '8px 4px' }}>{pagoAImprimir?.id?.substring(0, 8).toUpperCase() || 'S/N'}</td>
                           <td style={{ textAlign: 'right', padding: '8px 4px' }}>${Number(pagoAImprimir?.monto || 0).toLocaleString('es-CL')}</td>
                           <td style={{ textAlign: 'right', padding: '8px 4px' }}>${Number(pagoAImprimir?.monto || 0).toLocaleString('es-CL')}</td>
                        </tr>
                     )}
                  </tbody>
               </table>
               <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', paddingRight: '4px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 'bold', margin: 0 }}>Total: ${Number(pagoAImprimir?.monto || 0).toLocaleString('es-CL')}</p>
               </div>
            </div>

            {/* Transacción */}
            <div style={{ marginBottom: '40px' }}>
               <h3 style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 8px 0', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>Transacción:</h3>
               <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                  <thead>
                     <tr style={{ borderBottom: '2px solid #ccc' }}>
                        <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 'bold', color: '#555' }}>Nº Pago</th>
                        <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 'bold', color: '#555' }}>Nº Factura/Boleta</th>
                        <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 'bold', color: '#555' }}>Medio de pago</th>
                        <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 'bold', color: '#555' }}>Fecha vencimiento</th>
                        <th style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 'bold', color: '#555' }}>Monto</th>
                     </tr>
                  </thead>
                  <tbody>
                     {(pagoAImprimir?.metodos_detalle || [{ metodo: pagoAImprimir?.metodo_pago, monto: pagoAImprimir?.monto, boleta: pagoAImprimir?.numero_boleta, ref: pagoAImprimir?.numero_referencia }]).map((md: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                           <td style={{ padding: '8px 4px' }}>{pagoAImprimir?.rawPagos?.[0]?.id?.substring(0, 8).toUpperCase() || pagoAImprimir?.id?.substring(0, 8).toUpperCase() || 'S/N'}</td>
                           <td style={{ padding: '8px 4px' }}>{md.boleta && md.boleta !== 'S/N' ? md.boleta : '-'}</td>
                           <td style={{ padding: '8px 4px' }}>
                               {md.metodo} {md.ref ? `(Ref: ${md.ref.split('- Ref: ')[1] || md.ref})` : ''}
                           </td>
                           <td style={{ padding: '8px 4px' }}>{new Date(pagoAImprimir?.fecha_pago || new Date()).toLocaleDateString('es-CL')}</td>
                           <td style={{ textAlign: 'right', padding: '8px 4px' }}>${Number(md.monto || 0).toLocaleString('es-CL')}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
               <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', paddingRight: '4px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 'bold', margin: 0 }}>Total: ${Number(pagoAImprimir?.monto || 0).toLocaleString('es-CL')}</p>
               </div>
            </div>

            {/* Footer */}
            <div style={{ fontSize: '9px', color: '#666', textAlign: 'center', paddingTop: '20px' }}>
               <p style={{ fontWeight: 'bold', margin: '0 0 2px 0', color: '#333' }}>CENTRO MEDICO Y DENTAL DIGNIDAD SPA</p>
               <p style={{ margin: '0 0 2px 0' }}>Venancia Leiva 1871, Región Metropolitana, La Pintana</p>
               <p style={{ margin: '0 0 15px 0' }}>+56 9 6646 7641</p>
               <p style={{ margin: '0 0 10px 0' }}>Al iniciar este tratamiento declaro que acepto la Política de privacidad de la clínica.</p>
               <p style={{ margin: 0 }}>Página 1/1</p>
            </div>

         </div>
      </div>
    </>
  )
}

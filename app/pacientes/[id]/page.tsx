'use client'
import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import DOMPurify from 'isomorphic-dompurify'
import {
  History, Clock, Calendar, Stethoscope, Loader2, Image as ImageIcon, 
  X, DollarSign, User, Wallet, Building2, ClipboardList, Info, 
  Eye, CreditCard, ClipboardEdit, ClipboardCheck, Edit, Download, FileText, 
  FileSignature, Home, Save, Bold, Italic, Underline, Highlighter, Eraser, List
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

export default function HistorialPage() {
  const { id: paciente_id } = useParams()
  const [bitacora, setBitacora] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todas' | 'mias'>('todas')
  const [mounted, setMounted] = useState(false)

  // Estados para Modal de Vista
  const [itemAVer, setItemAVer] = useState<any>(null)

  // Estados para Modal de Edición de Evoluciones
  const [evolucionAEditar, setEvolucionAEditar] = useState<any>(null)
  const [textoEdicion, setTextoEdicion] = useState('')
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    if (paciente_id) {
      obtenerTodoElHistorial()
    }
  }, [paciente_id])

  // Sincronizar el contenido del editor cuando se abre el modal
  useEffect(() => {
    if (evolucionAEditar && editorRef.current) {
      editorRef.current.innerHTML = evolucionAEditar.descripcion_procedimiento || '';
      setTextoEdicion(evolucionAEditar.descripcion_procedimiento || '');
    }
  }, [evolucionAEditar])

  async function obtenerTodoElHistorial() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setCurrentUserId(user.id)

      const [
        { data: evoluciones },
        { data: presupuestos },
        { data: archivos },
        { data: documentos },
        { data: pagos },
        { data: citas },
        { data: profesionales }
      ] = await Promise.all([
        // Solo traemos las columnas estrictamente necesarias
        supabase.from('evoluciones').select('id, fecha_registro, descripcion_procedimiento, profesional_id').eq('paciente_id', paciente_id),
        supabase.from('presupuestos').select('id, created_at, nombre_tratamiento, total, estado, especialista_id').eq('paciente_id', paciente_id),
        supabase.from('documentos_pacientes').select('id, fecha_subida, titulo, nombre_archivo, descripcion, url_archivo, creado_por').eq('paciente_id', paciente_id),
        supabase.from('documentos_clinicos').select('id, fecha_creacion, titulo_documento, usuario_id').eq('paciente_id', paciente_id),
        supabase.from('pagos').select('id, presupuesto_id, tratamiento_id, plan_id, fecha_pago, created_at, concepto, descripcion, detalle, motivo, nombre_tratamiento, observaciones, notas, monto, metodo_pago').eq('paciente_id', paciente_id),
        supabase.from('citas').select('id, created_at, inicio, estado, motivo, profesional_id').eq('paciente_id', paciente_id),
        supabase.from('profesionales').select('user_id, nombre, apellido')
      ])

      const evs = (evoluciones || []).map(e => ({
        ...e,
        tipo: 'evolucion',
        fecha: e.fecha_registro,
        titulo_header: 'EVOLUCIÓN CLÍNICA',
        body_title: 'Evolución Clínica',
        body_desc: e.descripcion_procedimiento,
        desc_plana: e.descripcion_procedimiento,
        leftIcon: <ClipboardEdit size={22} />,
        rightIcon: <Stethoscope size={18} strokeWidth={2} />,
        bgLine: 'bg-[#4361ee]', // Azul
        bgIcon: 'bg-[#4361ee]/10',
        textIcon: 'text-[#4361ee]'
      }))

      const pres = (presupuestos || []).map(p => ({
        ...p,
        tipo: 'presupuesto',
        fecha: p.created_at,
        titulo_header: 'PRESUPUESTO CREADO',
        body_title: `Plan de Tratamiento: ${p.nombre_tratamiento || 'Nuevo Plan'}`,
        body_desc: <>Monto total: ${Number(p.total || 0).toLocaleString('es-CL')} | Estado: <span className="text-purple-700 font-bold uppercase">{p.estado}</span></>,
        desc_plana: `Monto total: $${Number(p.total || 0).toLocaleString('es-CL')} | Estado: ${p.estado}`,
        leftIcon: <ClipboardCheck size={22} />,
        rightIcon: <Edit size={18} strokeWidth={2} />,
        bgLine: 'bg-[#a32cc4]', // Morado
        bgIcon: 'bg-[#a32cc4]/10',
        textIcon: 'text-[#a32cc4]'
      }))

      const arcs = (archivos || []).map(a => ({
        ...a,
        tipo: 'archivo',
        fecha: a.fecha_subida,
        titulo_header: 'DOCUMENTO AGREGADO',
        body_title: `Archivo: ${a.titulo || a.nombre_archivo}`,
        body_desc: <span>{a.descripcion || 'Archivo cargado al expediente.'}</span>,
        desc_plana: a.descripcion || `Archivo cargado al expediente.`,
        url_archivo: a.url_archivo,
        leftIcon: <ImageIcon size={22} />,
        rightIcon: <Download size={18} strokeWidth={2} />,
        bgLine: 'bg-[#f59f00]', // Naranja
        bgIcon: 'bg-[#f59f00]/10',
        textIcon: 'text-[#f59f00]'
      }))

      const docs = (documentos || []).map(d => ({
        ...d,
        tipo: 'documento',
        fecha: d.fecha_creacion,
        titulo_header: 'PRESTACIÓN REALIZADA',
        body_title: d.titulo_documento || 'Documento Clínico',
        body_desc: <span>Documento generado y archivado.</span>,
        desc_plana: `Documento generado y archivado.`,
        leftIcon: <FileText size={22} />,
        rightIcon: <FileSignature size={18} strokeWidth={2} />,
        bgLine: 'bg-slate-500', 
        bgIcon: 'bg-slate-100',
        textIcon: 'text-slate-600'
      }))

      const cts = (citas || []).map(c => ({
        ...c,
        tipo: 'cita',
        fecha: c.created_at || c.inicio,
        titulo_header: 'CITA AGENDADA',
        body_title: c.estado || 'Agendada',
        body_desc: <span>Observación: {c.motivo || 'Control rutinario sin novedades.'}</span>,
        desc_plana: `Observación: ${c.motivo || 'Control rutinario sin novedades.'}`,
        leftIcon: <Calendar size={22} />,
        rightIcon: <Clock size={18} strokeWidth={2} />,
        bgLine: 'bg-[#dc3545]', // Rojo
        bgIcon: 'bg-[#dc3545]/10',
        textIcon: 'text-[#dc3545]'
      }))

      const pagosNormales: any[] = [];
      const pagosAgrupados: Record<string, any[]> = {};

      (pagos || []).forEach(p => {
        const presId = p.presupuesto_id || p.tratamiento_id || p.plan_id;
        if (presId) {
            if (!pagosAgrupados[presId]) pagosAgrupados[presId] = [];
            pagosAgrupados[presId].push(p);
        } else {
            pagosNormales.push(p);
        }
      });

      const pgsGenerales = pagosNormales.map(pg => {
        const conceptoReal = pg.concepto || pg.descripcion || pg.detalle || pg.motivo || pg.nombre_tratamiento || pg.observaciones || pg.notas || 'Abono General';
        return {
          ...pg,
          tipo: 'pago',
          fecha: pg.fecha_pago || pg.created_at,
          titulo_header: 'PAGO RECIBIDO',
          body_title: `Abono: ${conceptoReal}`,
          body_desc: <>Monto: ${Number(pg.monto || 0).toLocaleString('es-CL')} | Método: <span className="text-[#5a9c9b] font-medium">{pg.metodo_pago || 'No especificado'}</span></>,
          desc_plana: `Monto: $${Number(pg.monto || 0).toLocaleString('es-CL')} | Método: ${pg.metodo_pago || 'No especificado'}`,
          leftIcon: <CreditCard size={22} />,
          rightIcon: <DollarSign size={18} strokeWidth={2} />,
          bgLine: 'bg-[#5a9c9b]', // Teal
          bgIcon: 'bg-[#5a9c9b]/10',
          textIcon: 'text-[#5a9c9b]'
        }
      });

      const pgsGrupos = Object.entries(pagosAgrupados).map(([pres_id, subPagos]) => {
        const planInfo = presupuestos?.find(pr => pr.id === pres_id);
        const total = subPagos.reduce((acc, cur) => acc + Number(cur.monto || 0), 0);
        const maxDate = subPagos.reduce((max, p) => {
            const d1 = new Date(p.fecha_pago || p.created_at || 0);
            const d2 = new Date(max);
            return d1 > d2 ? (p.fecha_pago || p.created_at) : max;
        }, subPagos[0].fecha_pago || subPagos[0].created_at);

        const nombrePlan = planInfo?.nombre_tratamiento || subPagos[0]?.concepto || subPagos[0]?.descripcion || 'Tratamiento / Plan';

        return {
           id: `grupo-${pres_id}`,
           tipo: 'grupo_pagos',
           fecha: maxDate,
           titulo_header: 'PAGO RECIBIDO',
           body_title: `Abonos de Plan: ${nombrePlan}`,
           body_desc: <span>Monto acumulado: ${total.toLocaleString('es-CL')} en {subPagos.length} pago(s)</span>,
           desc_plana: `Monto acumulado: $${total.toLocaleString('es-CL')} en ${subPagos.length} pago(s)`,
           leftIcon: <Wallet size={22} />,
           rightIcon: <DollarSign size={18} strokeWidth={2} />,
           bgLine: 'bg-[#5a9c9b]',
           bgIcon: 'bg-[#5a9c9b]/10',
           textIcon: 'text-[#5a9c9b]',
           pagos: subPagos.sort((a,b) => new Date(b.fecha_pago || 0).getTime() - new Date(a.fecha_pago || 0).getTime())
        };
      });

      const total = [...evs, ...pres, ...arcs, ...docs, ...pgsGenerales, ...pgsGrupos, ...cts].sort((a, b) =>
        new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime()
      )

      const final = total.map(item => ({
        ...item,
        autor: profesionales?.find((p: any) => p.user_id === (item.profesional_id || item.especialista_id || item.creado_por || item.usuario_id))
      }))

      setBitacora(final)
    } catch (err) {
      console.error("Error en historial:", err)
    } finally {
      setLoading(false)
    }
  }

  // --- Función para guardar edición de Evolución ---
  const handleGuardarEdicion = async () => {
    // Si al quitar etiquetas HTML está vacío
    const textoLimpio = textoEdicion.replace(/<[^>]*>?/gm, '').trim();
    if (!textoLimpio) {
      toast.error("El detalle de la evolución no puede estar vacío")
      return
    }

    setGuardandoEdicion(true)
    try {
      const { error } = await supabase
        .from('evoluciones')
        .update({ descripcion_procedimiento: textoEdicion }) // Guardamos con formato HTML
        .eq('id', evolucionAEditar.id)

      if (error) throw error

      toast.success("Evolución actualizada correctamente")
      setEvolucionAEditar(null)
      setTextoEdicion('')
      obtenerTodoElHistorial()
    } catch (error) {
      console.error(error)
      toast.error("Error al actualizar la evolución")
    } finally {
      setGuardandoEdicion(false)
    }
  }

  const bitacoraFiltrada = bitacora.filter(item => {
    if (filtro === 'mias') return (item.profesional_id || item.especialista_id || item.creado_por) === currentUserId
    return true
  })

  const formatoFechaVisual = (isoString: string) => {
    if (!isoString) return 'S/F';
    const d = new Date(isoString);
    const dia = d.getDate();
    const mes = d.toLocaleString('es-CL', { month: 'short' }).replace('.', '');
    const anio = d.getFullYear();
    return `${dia} ${mes} ${anio}`;
  }

  const formatoHora = (isoString: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    let timeStr = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: true });
    return timeStr.replace('AM', 'a. m.').replace('PM', 'p. m.').toLowerCase();
  }

  // Comando para inyectar estilo de editor enriquecido
  const executeCommand = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    if (editorRef.current) {
        editorRef.current.focus();
        setTextoEdicion(editorRef.current.innerHTML);
    }
  };

  if (!mounted || loading) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <Loader2 className="animate-spin text-blue-600" size={40} />
      <p className="text-slate-500 font-black text-xs uppercase tracking-widest animate-pulse">Cargando Historial...</p>
    </div>
  )

  return (
    <div className="w-full pb-10 px-4 md:px-0 bg-slate-50 min-h-screen pt-4">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 md:gap-6 mb-10 pl-2">
          <div className="flex items-center gap-4">
            <div className="bg-[#e6f2f2] p-4 rounded-full text-[#104a5a]">
              <History size={32} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[22px] md:text-2xl font-black text-[#0B2136] uppercase tracking-tight leading-none">Historial Clínico</h2>
              <p className="text-slate-400 text-[10px] uppercase tracking-widest mt-1">Línea de tiempo detallada</p>
            </div>
          </div>

          <div className="flex w-full sm:w-auto items-center p-1 bg-white rounded-[1.2rem] border border-slate-100 shadow-sm">
            <button 
              onClick={() => setFiltro('todas')} 
              className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${
                filtro === 'todas' ? 'bg-[#e6f2f2] text-[#104a5a] shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Building2 size={14} /> Todas
            </button>
            <button 
              onClick={() => setFiltro('mias')} 
              className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${
                filtro === 'mias' ? 'bg-[#e6f2f2] text-[#104a5a] shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <User size={14} /> Mías
            </button>
          </div>
        </div>

        {/* TIMELINE */}
        <div className="w-full bg-slate-50/50 pb-10">
          <AnimatePresence mode='popLayout'>
            {bitacoraFiltrada.map((item, idx) => {
              const autor = item.autor as any;
              const nombreDoctor = autor ? `Dr.(a) ${autor.nombre} ${autor.apellido}` : (item.tipo === 'presupuesto' ? 'Sistema' : 'Asistente Clínico');
              
              return (
                <motion.div
                  layout 
                  key={`${item.tipo}-${item.id || idx}`}
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }}
                  className="flex w-full relative mb-5"
                >
                  {/* FECHA COLUMNA IZQUIERDA */}
                  <div className="w-[85px] md:w-32 shrink-0 text-right pr-4 md:pr-6 pt-5">
                    <span className="text-[11px] md:text-[13px] font-medium text-[#5a9c9b]">
                      {formatoFechaVisual(item.fecha)}
                    </span>
                  </div>

                  {/* LÍNEA Y PUNTO TEAL (#5a9c9b) */}
                  <div className="relative w-4 shrink-0 flex justify-center">
                    <div className="absolute top-0 bottom-[-20px] w-[2px] bg-[#5a9c9b]/60"></div>
                    <div className="absolute top-[22px] w-3 h-3 rounded-full bg-[#5a9c9b] z-10"></div>
                  </div>

                  {/* TARJETA DE CONTENIDO */}
                  <div className="flex-1 ml-4 md:ml-6 group">
                    <div className="bg-white border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] rounded-2xl flex flex-col relative overflow-hidden transition-shadow hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)]">
                      
                      {/* Borde Izquierdo de Color */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${item.bgLine}`}></div>

                      {/* Cuerpo de la Tarjeta */}
                      <div className="p-5 pl-7 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        
                        {/* Icono Circular */}
                        <div className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center shrink-0 ${item.bgIcon} ${item.textIcon}`}>
                          {item.leftIcon}
                        </div>

                        {/* Textos Principales */}
                        <div className="flex-1 min-w-0 pr-4">
                          <h4 className="text-[14px] md:text-[15px] font-bold text-[#0B2136] leading-tight mb-1">
                            {item.body_title}
                          </h4>
                          {item.tipo === 'evolucion' ? (
                            <div className="text-[12px] md:text-[13px] text-slate-500 font-normal rich-text-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.descripcion || item.body_desc || '') }}></div>
                          ) : (
                            <p className="text-[12px] md:text-[13px] text-slate-500 font-normal">
                              {item.descripcion || item.body_desc}
                            </p>
                          )}
                        </div>

                        {/* Botones de Acción Derecha */}
                        <div className="flex items-center gap-2 self-end sm:self-auto w-full sm:w-auto justify-end sm:justify-start pt-2 sm:pt-0">
                          
                          {/* BOTÓN EDITAR EVOLUCIÓN */}
                          {item.tipo === 'evolucion' && (
                            <button 
                              onClick={() => setEvolucionAEditar(item)}
                              className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center transition-colors"
                              title="Editar Evolución"
                            >
                              <Edit size={16} strokeWidth={2.5}/>
                            </button>
                          )}

                          <button 
                            onClick={() => setItemAVer(item)}
                            className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-slate-50 text-[#0B2136] hover:bg-[#5a9c9b]/10 hover:text-[#5a9c9b] flex items-center justify-center transition-colors"
                            title="Ver detalles"
                          >
                            <Eye size={16} strokeWidth={2.5}/>
                          </button>
                          
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-slate-50 text-[#0B2136] flex items-center justify-center">
                            {item.rightIcon}
                          </div>
                        </div>
                      </div>

                      {/* Previsualización si es archivo */}
                      {item.tipo === 'archivo' && item.url_archivo && (
                        <div className="px-5 pl-7 pb-4 flex gap-4 bg-white">
                          <div className="relative overflow-hidden rounded-lg border border-slate-200 w-24 h-16 shrink-0 bg-slate-100">
                              <img src={item.url_archivo} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt="Vista previa" />
                          </div>
                          <div className="flex flex-col justify-center gap-1">
                              <a href={item.url_archivo} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-[#5a9c9b] uppercase hover:underline">Ver archivo</a>
                          </div>
                        </div>
                      )}

                      {/* FOOTER: CENTRO MÉDICO Y DOCTOR */}
                      <div className="bg-slate-50/70 mx-5 mb-5 mt-1 rounded-xl px-4 py-3 flex items-center gap-2 text-[10px] md:text-[11px] text-slate-500 font-medium">
                        <Building2 size={13} className="shrink-0 text-slate-400"/>
                        <span className="truncate uppercase">
                          CENTRO MEDICO Y DENTAL DIGNIDAD SPA, {nombreDoctor}. {formatoHora(item.fecha)}
                        </span>
                      </div>

                    </div>
                  </div>
                </motion.div>
              );
            })}
            
            {bitacoraFiltrada.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center gap-4 bg-white/50 rounded-[2rem] border border-dashed border-slate-300 ml-20 md:ml-32 mt-8">
                  <History className="text-slate-300 w-10 h-10" />
                  <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest text-center">No hay registros de actividad</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* PORTALS: MODALES */}
      {mounted && createPortal(
        <>
          {/* MODAL DE VISTA (VER INFO GENERAL) */}
          <AnimatePresence>
            {itemAVer && (
              <div className="fixed inset-0 z-[999998] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                 <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
                   <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${itemAVer.bgIcon} ${itemAVer.textIcon} border border-slate-100 shadow-sm`}>{itemAVer.leftIcon}</div>
                        <h3 className="font-bold uppercase text-slate-800 text-[11px] tracking-widest">Detalles del Registro</h3>
                      </div>
                      <button onClick={() => setItemAVer(null)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-xl transition-colors"><X size={18}/></button>
                   </div>
                   
                   <div className="p-6 overflow-y-auto custom-scrollbar text-left flex-1 space-y-4">
                      {itemAVer.tipo !== 'grupo_pagos' && (
                        <div className="space-y-4">
                          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                             <p className="text-[9px] font-bold uppercase text-[#5a9c9b] tracking-widest mb-1">Título / Concepto</p>
                             <p className="text-[15px] font-bold text-slate-800">{itemAVer.body_title}</p>
                          </div>
                          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                             <p className="text-[9px] font-bold uppercase text-[#5a9c9b] tracking-widest mb-1">Fecha de Registro</p>
                             <p className="text-[14px] font-medium text-slate-800">{itemAVer.fecha ? new Date(itemAVer.fecha).toLocaleString('es-CL') : 'S/F'}</p>
                          </div>
                          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                             <p className="text-[9px] font-bold uppercase text-[#5a9c9b] tracking-widest mb-1">Detalles de Operación</p>
                             {itemAVer.tipo === 'evolucion' ? (
                               <div className="text-[14px] text-slate-600 whitespace-pre-wrap leading-relaxed rich-text-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(itemAVer.desc_plana || '') }}></div>
                             ) : (
                               <p className="text-[14px] text-slate-600 whitespace-pre-wrap leading-relaxed">{itemAVer.desc_plana}</p>
                             )}
                          </div>
                        </div>
                      )}

                      {itemAVer.tipo === 'grupo_pagos' && (
                        <div className="space-y-4">
                           <div className="bg-[#e6f2f2] p-5 rounded-2xl border border-[#5a9c9b]/20">
                              <p className="text-[9px] font-bold uppercase text-[#5a9c9b] tracking-widest mb-1">Plan Relacionado</p>
                              <p className="text-[15px] font-bold text-[#104a5a]">{itemAVer.body_title}</p>
                              <p className="text-[13px] font-medium text-[#104a5a]/70 mt-1">{itemAVer.desc_plana}</p>
                           </div>
                           
                           <h4 className="font-bold uppercase text-[10px] text-slate-500 tracking-widest pt-2 pl-1">Desglose de Pagos ({itemAVer.pagos.length})</h4>
                           <div className="space-y-3">
                             {itemAVer.pagos.map((pago: any) => {
                               const detallePago = pago.concepto || pago.descripcion || pago.detalle || pago.motivo;
                               return (
                                 <div key={pago.id} className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm">
                                   <p className="text-[15px] font-black text-slate-800">${Number(pago.monto).toLocaleString('es-CL')}</p>
                                   {detallePago && <p className="text-[13px] font-medium text-slate-600 my-0.5">{detallePago}</p>}
                                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{pago.metodo_pago} • {new Date(pago.fecha_pago || pago.created_at).toLocaleDateString()}</p>
                                 </div>
                               )
                             })}
                           </div>
                        </div>
                      )}
                   </div>
                 </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* MODAL EDICIÓN EVOLUCIÓN CON TEXTO ENRIQUECIDO */}
          <AnimatePresence>
            {evolucionAEditar && (
              <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                 <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
                   <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-blue-100 text-blue-600 border border-blue-200 shadow-sm"><ClipboardEdit size={20}/></div>
                        <h3 className="font-bold uppercase text-slate-800 text-[11px] tracking-widest">Editar Evolución Clínica</h3>
                      </div>
                      <button onClick={() => setEvolucionAEditar(null)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-xl transition-colors"><X size={18}/></button>
                   </div>
                   
                   <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4 bg-slate-50/50">
                      <div className="space-y-3">
                         <label className="text-[10px] font-bold uppercase text-slate-500 tracking-widest pl-1">Descripción del Procedimiento</label>
                         
                         {/* CONTENEDOR DEL EDITOR ENRIQUECIDO */}
                         <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                            
                            {/* Toolbar de herramientas */}
                            <div className="flex flex-wrap items-center gap-1.5 p-2.5 border-b border-slate-100 bg-slate-50">
                               <button type="button" onClick={(e) => { e.preventDefault(); executeCommand('bold'); }} className="p-2 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors" title="Negrita">
                                  <Bold size={16}/>
                               </button>
                               <button type="button" onClick={(e) => { e.preventDefault(); executeCommand('italic'); }} className="p-2 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors" title="Cursiva">
                                  <Italic size={16}/>
                               </button>
                               <button type="button" onClick={(e) => { e.preventDefault(); executeCommand('underline'); }} className="p-2 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors" title="Subrayado">
                                  <Underline size={16}/>
                               </button>
                               <div className="w-px h-5 bg-slate-300 mx-1"></div>
                               <button type="button" onClick={(e) => { e.preventDefault(); executeCommand('insertUnorderedList'); }} className="p-2 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors" title="Viñetas">
                                  <List size={16}/>
                               </button>
                               <div className="w-px h-5 bg-slate-300 mx-1"></div>
                               <button type="button" onClick={(e) => { e.preventDefault(); executeCommand('backColor', '#fef08a'); }} className="p-2 hover:bg-yellow-100 rounded-lg text-yellow-600 transition-colors" title="Destacar amarillo">
                                  <Highlighter size={16}/>
                               </button>
                               <button type="button" onClick={(e) => { e.preventDefault(); executeCommand('removeFormat'); }} className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors" title="Limpiar formato">
                                  <Eraser size={16}/>
                               </button>
                            </div>

                            {/* Área Content Editable */}
                            <div 
                               ref={editorRef}
                               contentEditable
                               suppressContentEditableWarning
                               onInput={(e) => setTextoEdicion(e.currentTarget.innerHTML)}
                               className="w-full min-h-[16rem] max-h-[24rem] p-5 text-[14px] outline-none text-slate-700 bg-white custom-scrollbar rich-text-content overflow-y-auto"
                            />
                         </div>
                      </div>
                   </div>

                   <div className="p-6 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0">
                      <button onClick={() => setEvolucionAEditar(null)} className="px-6 py-3 rounded-xl text-slate-500 hover:bg-slate-100 font-bold text-xs uppercase tracking-widest transition-colors">Cancelar</button>
                      <button onClick={handleGuardarEdicion} disabled={guardandoEdicion || !textoEdicion.trim()} className="px-6 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-bold text-xs uppercase tracking-widest transition-colors flex items-center gap-2 disabled:opacity-50 shadow-md">
                         {guardandoEdicion ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Guardar Cambios
                      </button>
                   </div>
                 </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>,
        document.body
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        
        /* ESTILOS GLOBALES PARA EL TEXTO ENRIQUECIDO */
        .rich-text-content b, .rich-text-content strong { font-weight: 800 !important; color: #0f172a; }
        .rich-text-content i, .rich-text-content em { font-style: italic !important; }
        .rich-text-content u { text-decoration: underline !important; text-underline-offset: 2px; }
        .rich-text-content span[style*="background-color"] { padding: 0 4px; border-radius: 4px; color: #854d0e; font-weight: 600; }
        .rich-text-content ul { list-style-type: disc !important; padding-left: 1.5rem !important; margin-top: 0.5rem; margin-bottom: 0.5rem; }
        .rich-text-content { line-height: 1.6; }
        
        /* Placeholder para el div contenteditable vacío */
        .rich-text-content[contenteditable]:empty:before {
            content: "Escribe o modifica el detalle de la evolución aquí...";
            color: #94a3b8;
            pointer-events: none;
            display: block;
        }
      `}}></style>
    </div>
  )
}

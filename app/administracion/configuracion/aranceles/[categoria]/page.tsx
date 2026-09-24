'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import { 
  ArrowLeft, Loader2, CheckCircle2, 
  XCircle, RefreshCw, Plus, X, Save, Pencil, Search, Tag, BookMarked
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// Lista oficial de iconos del odontograma
const ICONOS_DISPONIBLES = [
  { id: "default", label: "Círculo (Genérico)" },
  { id: "extraccion", label: "Extracción (X Roja/Verde)" },
  { id: "endodoncia", label: "Endodoncia (Línea en raíz)" },
  { id: "restauracion", label: "Restauración / Tapadura" },
  { id: "corona", label: "Corona" },
  { id: "implante", label: "Implante" },
  { id: "perno", label: "Perno Muñón" },
  { id: "rayos", label: "Rayos-X" },
  { id: "removible", label: "Prótesis Removible" },
  { id: "limpieza", label: "Limpieza/Pulido" },
  { id: "caries", label: "Caries" },
  { id: "sano", label: "Diente Sano" },
  { id: "otro", label: "Otro (Estrella)" }
];

export default function DetalleArancelPage() {
  const { categoria } = useParams()
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [actualizandoId, setActualizandoId] = useState<string | null>(null)
  const [editandoPrecioId, setEditandoPrecioId] = useState<string | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState<string>('');
  const [busqueda, setBusqueda] = useState('')

  // Estado para las pestañas
  const [tabActiva, setTabActiva] = useState<'habilitados' | 'deshabilitados'>('habilitados');
  
  // Estados para el Modal de Nueva/Editar Prestación
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [modoEdicion, setModoEdicion] = useState(false)
  const [itemEditandoId, setItemEditandoId] = useState<string | null>(null)
  
  // Estado para los Portals
  const [isMounted, setIsMounted] = useState(false)
  
  const decodedCat = decodeURIComponent(categoria as string)

  // Formulario inicial
  const formInicial = {
    nombre_accion: '',
    codigo_accion: '',
    uco: '',
    precio: '',
    nombre_arancel: 'Arancel Base',
    id_accion_ext: '', 
    icono_tipo: 'default'
  }
  const [form, setForm] = useState(formInicial)

  useEffect(() => {
    setIsMounted(true)
    fetchItems()
  }, [])

  async function fetchItems() {
    setCargando(true)
    try {
      const { data: prestacionesData, error: prestError } = await supabase
        .from('prestaciones')
        .select('*')
        .eq('Nombre Categoria', decodedCat)
        .order('Nombre Accion', { ascending: true })

      if (prestError) throw prestError;
      if (!prestacionesData || prestacionesData.length === 0) {
        setItems([]);
        return;
      }

      const prestacionIds = prestacionesData.map(p => p.id);
      const usageMap = new Map<string, number>();

      const { data: realizadoItems, error: realizadoError } = await supabase
        .from('presupuesto_items')
        .select('prestacion_id')
        .in('prestacion_id', prestacionIds)
        .in('estado', ['realizado', 'atendido', 'terminado', 'completado', 'finalizado']);

      if (realizadoError) toast.warning("No se pudieron cargar las estadísticas de planes.");
      
      if (realizadoItems) {
        for (const item of realizadoItems) {
          if (item.prestacion_id) {
            usageMap.set(item.prestacion_id, (usageMap.get(item.prestacion_id) || 0) + 1);
          }
        }
      }

      const { data: atencionesDirectas, error: atencionesError } = await supabase
        .from('atenciones_realizadas')
        .select('prestacion_id')
        .in('prestacion_id', prestacionIds);

      if (atencionesError) toast.warning("No se pudieron cargar las estadísticas de atenciones directas.");

      if (atencionesDirectas) {
        for (const item of atencionesDirectas) {
          if (item.prestacion_id) {
            usageMap.set(item.prestacion_id, (usageMap.get(item.prestacion_id) || 0) + 1);
          }
        }
      }

      const itemsConConteo = prestacionesData.map(p => ({ ...p, veces_usado: usageMap.get(p.id) || 0 }));
      setItems(itemsConConteo);
    } catch (error: any) {
      toast.error("Error al cargar las prestaciones");
      setItems([]);
    } finally {
      setCargando(false);
    }
  }

  // FUNCIÓN PARA CREAR NUEVA PRESTACIÓN
  async function handleCrearPrestacion() {
    if (!form.nombre_accion || !form.precio) return toast.error("Nombre y Precio son obligatorios")
    
    setGuardando(true)
    try {
      const { error } = await supabase
        .from('prestaciones')
        .insert([{
          "Nombre": form.nombre_accion, 
          "Nombre Categoria": decodedCat,
          "Nombre Accion": form.nombre_accion,
          "Codigo Accion": form.codigo_accion,
          "UCO": parseFloat(form.uco) || 0,
          "Precio": parseInt(form.precio) || 0,
          "Nombre Arancel": form.nombre_arancel,
          "Habilitado": "si",
          "ID Acción": form.id_accion_ext,
          "icono_tipo": form.icono_tipo
        }])

      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('auditoria_clinica').insert([{
          usuario_id: user?.id,
          accion: 'CREATE / PRESTACION',
          tabla: 'prestaciones',
          detalles: `Creó la prestación "${form.nombre_accion}" en la categoría "${decodedCat}" con un precio de $${form.precio}.`
      }])

      toast.success("Prestación creada con éxito.")
      setModalAbierto(false)
      setForm(formInicial)
      fetchItems()
    } catch (err: any) {
      toast.error("Error al guardar la prestación")
    } finally {
      setGuardando(false)
    }
  }

  // FUNCIÓN PARA EDITAR PRESTACIÓN
  async function handleGuardarEdicion() {
    if (!form.nombre_accion || !form.precio) return toast.error("Nombre y Precio son obligatorios")
    if (!itemEditandoId) return;

    setGuardando(true)
    try {
      const { error } = await supabase
        .from('prestaciones')
        .update({
          "Nombre": form.nombre_accion, 
          "Nombre Accion": form.nombre_accion,
          "Codigo Accion": form.codigo_accion,
          "UCO": parseFloat(form.uco) || 0,
          "Precio": parseInt(form.precio) || 0,
          "Nombre Arancel": form.nombre_arancel,
          "ID Acción": form.id_accion_ext,
          "icono_tipo": form.icono_tipo
        })
        .eq('id', itemEditandoId)

      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('auditoria_clinica').insert([{
          usuario_id: user?.id,
          accion: 'UPDATE / PRESTACION (COMPLETA)',
          tabla: 'prestaciones',
          detalles: `Editó los datos de la prestación "${form.nombre_accion}" en la categoría "${decodedCat}".`
      }])

      toast.success("Prestación actualizada con éxito.")
      setModalAbierto(false)
      fetchItems()
    } catch (err: any) {
      toast.error("Error al actualizar la prestación")
    } finally {
      setGuardando(false)
    }
  }

  // PREPARAR MODAL PARA EDICIÓN
  function abrirModalEdicion(item: any) {
    setForm({
      nombre_accion: item["Nombre Accion"] || '',
      codigo_accion: item["Codigo Accion"] || '',
      uco: item.UCO ? String(item.UCO) : '',
      precio: item.Precio ? String(item.Precio) : '',
      nombre_arancel: item["Nombre Arancel"] || 'Arancel Base',
      id_accion_ext: item["ID Acción"] || '', 
      icono_tipo: item.icono_tipo || 'default'
    });
    setItemEditandoId(item.id);
    setModoEdicion(true);
    setModalAbierto(true);
  }

  // FUNCIÓN PARA CAMBIAR ESTADO
  async function toggleEstado(id: string, estadoActual: string) {
    setActualizandoId(id)
    const valorLimpio = (estadoActual || "").trim().toLowerCase();
    const nuevoEstado = (valorLimpio === 'si' || valorLimpio === 'sí') ? 'no' : 'si';
    
    try {
      const { error } = await supabase
        .from('prestaciones')
        .update({ "Habilitado": nuevoEstado }) 
        .eq('id', id)

      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      const item = items.find(i => i.id === id)
      await supabase.from('auditoria_clinica').insert([{
          usuario_id: user?.id,
          accion: 'UPDATE / ESTADO PRESTACION',
          tabla: 'prestaciones',
          detalles: `Cambió el estado de la prestación "${item?.['Nombre Accion'] || 'N/A'}" a "${nuevoEstado}".`
      }])
      toast.success("Estado actualizado.")
      setItems(items.map(item => 
        item.id === id ? { ...item, Habilitado: nuevoEstado } : item
      ))
    } catch (err: any) {
      toast.error("Error al actualizar el estado")
    } finally {
      setActualizandoId(null)
    }
  }

  async function handleActualizarPrecio(id: string) {
    const itemOriginal = items.find(i => i.id === id);
    if (!itemOriginal) return;

    if (nuevoPrecio === '' || isNaN(Number(nuevoPrecio))) {
      setEditandoPrecioId(null);
      return;
    }
  
    const precioFinal = Number(nuevoPrecio);
  
    if (precioFinal === Number(itemOriginal?.Precio || 0)) {
      setEditandoPrecioId(null);
      return;
    }
  
    setActualizandoId(id);
    setEditandoPrecioId(null);
  
    try {
      const { error } = await supabase.from('prestaciones').update({ "Precio": precioFinal }).eq('id', id);
      if (error) throw error;
  
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('auditoria_clinica').insert([{
          usuario_id: user?.id,
          accion: 'UPDATE / PRECIO PRESTACION',
          tabla: 'prestaciones',
          detalles: `Cambió el precio rápido de "${itemOriginal?.['Nombre Accion'] || 'N/A'}" de $${Number(itemOriginal?.Precio || 0).toLocaleString('es-CL')} a $${precioFinal.toLocaleString('es-CL')}.`
      }]);
  
      toast.success("Precio actualizado.");
      setItems(items.map(item => item.id === id ? { ...item, Precio: precioFinal } : item));
    } catch (err: any) {
      toast.error("Error al actualizar el precio.");
    } finally {
      setActualizandoId(null);
    }
  }

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#FBF8F2] gap-4">
      <Loader2 className="animate-spin text-[#C9A24B]" size={40}/>
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando arancel...</p>
    </div>
  )

  const itemsHabilitados = items.filter(item => {
    const valor = (item.Habilitado || "").trim().toLowerCase();
    return valor === 'si' || valor === 'sí';
  });

  const itemsDeshabilitados = items.filter(item => {
    const valor = (item.Habilitado || "").trim().toLowerCase();
    return valor !== 'si' && valor !== 'sí';
  });

  let itemsMostrados = tabActiva === 'habilitados' ? itemsHabilitados : itemsDeshabilitados;

  if (busqueda) {
    const busquedaLower = busqueda.toLowerCase();
    itemsMostrados = itemsMostrados.filter(item => 
      (item["Nombre Accion"] || '').toLowerCase().includes(busquedaLower) ||
      (item["Codigo Accion"] || '').toLowerCase().includes(busquedaLower)
    );
  }

  return (
    <main className="min-h-screen bg-[#FBF8F2] p-6 md:p-10 font-sans text-slate-900 relative overflow-hidden z-0">
      
      {/* IMAGEN DE FONDO GLOBAL */}
      <div 
        className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"
      ></div>

      <div className="max-w-6xl mx-auto space-y-8 relative z-10 text-left">
        
        {/* NAVEGACIÓN */}
        <button 
          onClick={() => router.back()} 
          className="flex items-center gap-2 font-black text-[10px] text-slate-400 uppercase hover:text-[#0A111F] transition-all group w-fit"
        >
          <div className="p-2 bg-white rounded-xl shadow-sm group-hover:bg-[#0A111F] group-hover:text-white transition-all border border-slate-200">
            <ArrowLeft size={14}/>
          </div>
          Volver a Categorías
        </button>

        {/* HEADER */}
        <header className="bg-white/90 backdrop-blur-md p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 text-left">
          <div className="flex items-center gap-5 text-left w-full md:w-auto">
            <div className="bg-[#0A111F] w-16 h-16 rounded-full flex items-center justify-center text-[#C9A24B] shadow-lg shrink-0">
              <BookMarked size={28} />
            </div>
            <div className="text-left">
              <span className="bg-[#C9A24B]/10 text-[#8A6D2F] px-3.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-[#C9A24B]/20 inline-block mb-2">Arancel Clínico</span>
              <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight text-left">{decodedCat}</h1>
            </div>
          </div>
          
          <button 
            onClick={() => {
              setForm(formInicial);
              setModoEdicion(false);
              setItemEditandoId(null);
              setModalAbierto(true);
            }}
            className="bg-[#0A111F] text-white px-6 py-4 rounded-full font-bold text-[11px] uppercase tracking-wider hover:bg-[#1a2538] transition-all shadow-md flex items-center justify-center gap-2 shrink-0 w-full md:w-auto text-left"
          >
            <Plus size={16} /> Nueva Acción
          </button>
        </header>

        {/* BUSCADOR */}
        <div className="relative group max-w-md text-left">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#C9A24B] transition-colors" size={18} />
          <input 
            type="text"
            placeholder="BUSCAR POR NOMBRE O CÓDIGO..."
            className="w-full bg-white/95 backdrop-blur-sm p-4 pl-12 pr-6 rounded-full border border-slate-200 shadow-sm outline-none focus:border-[#C9A24B] transition-all font-bold text-xs uppercase text-slate-900 placeholder:text-slate-400"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {/* TABLA DE ACCIONES */}
        <div className="bg-white/95 backdrop-blur-sm rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden text-left">
          
          {/* PESTAÑAS HABILITADOS / DESHABILITADOS */}
          <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-[#FBF8F2]/50">
            <button onClick={() => setTabActiva('habilitados')} className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${tabActiva === 'habilitados' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
              <CheckCircle2 size={14}/> Habilitados ({itemsHabilitados.length})
            </button>
            <button onClick={() => setTabActiva('deshabilitados')} className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${tabActiva === 'deshabilitados' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
              <XCircle size={14}/> Deshabilitados ({itemsDeshabilitados.length})
            </button>
          </div>

          <div className="overflow-x-auto text-left">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em]">
                  <th className="px-8 py-5">Tratamiento / Acción</th>
                  <th className="px-6 py-5 text-center">Uso (Realizadas)</th>
                  <th className="px-6 py-5 text-center">Estado</th>
                  <th className="px-6 py-5 text-center">Precio</th>
                  <th className="px-8 py-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60 text-left">
                {itemsMostrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center p-20 text-slate-400 font-bold text-xs uppercase tracking-widest">
                      {busqueda 
                        ? 'No se encontraron prestaciones con ese criterio.' 
                        : 'No hay prestaciones en esta sección.'
                      }
                    </td>
                  </tr>
                )}
                {itemsMostrados.map((item) => {
                  const valorNormalizado = (item.Habilitado || "").trim().toLowerCase();
                  const esSi = valorNormalizado === 'si' || valorNormalizado === 'sí';

                  return (
                    <tr key={item.id} className="group hover:bg-slate-50/50 transition-all text-left">
                      <td className="px-8 py-5 text-left">
                        <div className="flex flex-col text-left">
                          <span className="text-xs font-black text-[#0A111F] uppercase italic group-hover:text-[#C9A24B] transition-colors leading-tight text-left">
                            {item["Nombre Accion"]}
                          </span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-wider text-left">
                            Cod: {item["Codigo Accion"] || '---'} | Icono: {item.icono_tipo || 'default'}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-5 text-center">
                        {item.veces_usado > 0 ? (
                          <span className="font-black text-emerald-600 text-sm">{item.veces_usado}</span>
                        ) : (
                          <span className="font-bold text-slate-300">-</span>
                        )}
                      </td>

                      <td className="px-6 py-5 text-center">
                        <button 
                          onClick={() => toggleEstado(item.id, item.Habilitado)}
                          disabled={actualizandoId === item.id}
                          className={`
                            relative inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-sm
                            ${esSi 
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                              : 'bg-red-50 text-red-500 border border-red-100'
                            }
                            ${actualizandoId === item.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
                          `}
                        >
                          {actualizandoId === item.id ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : esSi ? (
                            <CheckCircle2 size={12} />
                          ) : (
                            <XCircle size={12} />
                          )}
                          {esSi ? 'Habilitado' : 'Deshabilitado'}
                        </button>
                      </td>

                      <td className="px-6 py-5 text-center font-black text-[#0A111F] text-sm tracking-tight relative">
                        {editandoPrecioId === item.id ? (
                          <input
                            type="number"
                            value={nuevoPrecio}
                            onChange={(e) => setNuevoPrecio(e.target.value)}
                            onBlur={() => handleActualizarPrecio(item.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            autoFocus
                            className="w-28 text-center bg-white border-2 border-[#C9A24B] rounded-xl p-1.5 font-black text-[#0A111F] text-sm tracking-tight outline-none shadow-md"
                          />
                        ) : (
                          <span 
                            onClick={() => { setEditandoPrecioId(item.id); setNuevoPrecio(String(item.Precio || 0)); }}
                            className="cursor-pointer hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-all inline-block"
                            title="Haz clic para editar el precio rápido"
                          >
                            ${Number(item.Precio || 0).toLocaleString('es-CL')}
                          </span>
                        )}
                        {actualizandoId === item.id && editandoPrecioId !== item.id && <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-[#C9A24B]" size={16} />}
                      </td>

                      <td className="px-8 py-5 text-center">
                        <button 
                          onClick={() => abrirModalEdicion(item)}
                          disabled={actualizandoId === item.id}
                          className="w-9 h-9 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 hover:border-blue-200 transition-all mx-auto shadow-sm disabled:opacity-50"
                          title="Editar Prestación"
                        >
                          <Pencil size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL NUEVA / EDITAR PRESTACIÓN ENVOLVIDO EN CREATEPORTAL */}
      {isMounted && typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
          {modalAbierto && (
            <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4 text-left">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                className="bg-white w-full max-w-lg rounded-[3rem] p-8 md:p-10 shadow-2xl relative border border-slate-100 overflow-y-auto max-h-[90vh] text-left"
              >
                <button onClick={() => setModalAbierto(false)} className="absolute top-8 right-8 p-2 bg-slate-50 rounded-full text-slate-400 hover:text-red-500 transition-colors shadow-sm">
                  <X size={20}/>
                </button>
                
                <h2 className="text-xl font-black text-[#0A111F] tracking-tight uppercase italic leading-none mb-1">
                  {modoEdicion ? 'Editar Acción' : 'Añadir Acción'}
                </h2>
                <p className="text-[#C9A24B] text-[10px] font-bold uppercase tracking-widest mb-6">Categoría: {decodedCat}</p>

                <div className="space-y-5 text-left">
                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 block">Nombre de la Acción Clínica</label>
                    <input 
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] text-slate-900 shadow-sm placeholder:text-slate-400"
                      placeholder="Ej: Obturación Resina Composite"
                      value={form.nombre_accion}
                      onChange={(e) => setForm({...form, nombre_accion: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 block">Código Interno</label>
                      <input 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] text-slate-900 shadow-sm placeholder:text-slate-400"
                        placeholder="0101001"
                        value={form.codigo_accion}
                        onChange={(e) => setForm({...form, codigo_accion: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 block">Precio ($)</label>
                      <input 
                        type="number"
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] text-slate-900 shadow-sm placeholder:text-slate-400"
                        placeholder="0"
                        value={form.precio}
                        onChange={(e) => setForm({...form, precio: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 block">Valor UCO</label>
                      <input 
                        type="number" step="0.01"
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] text-slate-900 shadow-sm placeholder:text-slate-400"
                        placeholder="0.00"
                        value={form.uco}
                        onChange={(e) => setForm({...form, uco: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 block">Icono en Odontograma</label>
                      <select 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] text-slate-900 shadow-sm cursor-pointer"
                        value={form.icono_tipo}
                        onChange={(e) => setForm({...form, icono_tipo: e.target.value})}
                      >
                        {ICONOS_DISPONIBLES.map(ico => (
                          <option key={ico.id} value={ico.id}>{ico.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={modoEdicion ? handleGuardarEdicion : handleCrearPrestacion}
                    disabled={guardando}
                    className="w-full mt-6 bg-[#0A111F] text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 disabled:bg-slate-300"
                  >
                    {guardando ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} 
                    {guardando ? 'Guardando...' : modoEdicion ? 'Guardar Cambios' : 'Guardar Prestación'}
                  </button>
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

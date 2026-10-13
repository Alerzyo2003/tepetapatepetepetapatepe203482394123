'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { 
  ArrowLeft, Loader2, Plus, X, Save, Trash2, 
  Search, Package, Layers, Edit3, Minus, ChevronRight, FolderPlus, FolderOpen, RefreshCcw, Check
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// LISTAS NECESARIAS PARA ICONOS
const LESIONES_LISTA = [
  "Caries", "Infección Pulpar", "Fractura", "Movilidad", "Residuo Radicular", "Erosión", "Atrición", "Abfracción", 
  "Corona (mal estado)", "Corona provisoria (mal estado)", "Perno muñon (mal estado)", 
  "Restauración (mal estado)", "Amalgama (mal estado)", "Implante (mal estado)", "Endodoncia (mal estado)", "Otro"
];

const ICONOS_DISPONIBLES = [
  { id: "extraccion", label: "Extracción", icon: "extraccion" },
  { id: "endodoncia", label: "Endodoncia", icon: "endodoncia" },
  { id: "restauracion", label: "Restauración", icon: "restauracion" },
  { id: "corona", label: "Corona", icon: "corona" },
  { id: "implante", label: "Implante", icon: "implante" },
  { id: "perno", label: "Perno Muñón", icon: "perno" },
  { id: "rayos", label: "Rayos-X", icon: "rayos" },
  { id: "removible", label: "Prótesis Removible", icon: "removible" },
  { id: "limpieza", label: "Limpieza/Pulido", icon: "limpieza" },
  { id: "caries", label: "Caries", icon: "caries" },
  { id: "sano", label: "Diente Sano", icon: "sano" },
  { id: "otro", label: "Otro (Estrella)", icon: "otro" },
  { id: "default", label: "Círculo (Genérico)", icon: "default" }
];

export default function PlantillasPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center bg-[#F8FAFC]"><Loader2 className="animate-spin text-blue-600" size={40}/></div>}>
      <PlantillasContenido />
    </Suspense>
  )
}

function PlantillasContenido() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  const seccionUrl = searchParams.get('seccion')
  const seccionActiva = seccionUrl ? decodeURIComponent(seccionUrl).toUpperCase() : null

  const [cargando, setCargando] = useState(true)
  const [plantillas, setPlantillas] = useState<any[]>([])
  const [prestacionesDisponibles, setPrestacionesDisponibles] = useState<any[]>([])
  const [seccionesVirtuales, setSeccionesVirtuales] = useState<string[]>([])
  
  const [modalAbierto, setModalAbierto] = useState(false)
  const [modalSeccionAbierto, setModalSeccionAbierto] = useState(false)
  const [nombreNuevaSeccion, setNombreNuevaSeccion] = useState('')
  
  const [modalIcono, setModalIcono] = useState<{abierto: boolean, prestacion: any, esParaPack?: boolean}>({ abierto: false, prestacion: null, esParaPack: false });
  
  const [modo, setModo] = useState<'crear' | 'editar'>('crear')
  const [plantillaIdEditando, setPlantillaIdEditando] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const [iconoPack, setIconoPack] = useState<string | null>(null)
  
  // 🔥 NUEVOS ESTADOS PARA MANEJAR FASES DENTRO DEL PACK 🔥
  const [seccionesPack, setSeccionesPack] = useState<{id: string, nombre: string}[]>([{ id: 'default', nombre: 'FASE 1' }]);
  const [seccionActivaId, setSeccionActivaId] = useState<string>('default');
  const [itemsSeleccionados, setItemsSeleccionados] = useState<any[]>([])

  useEffect(() => {
    fetchData()
    const guardadas = localStorage.getItem('secciones_vacias')
    if (guardadas) setSeccionesVirtuales(JSON.parse(guardadas))
  }, [])

  const valorRealTotal = useMemo(() => {
    return itemsSeleccionados.reduce((acc, curr) => acc + (Number(curr.Precio || 0) * (curr.cantidad || 1)), 0);
  }, [itemsSeleccionados]);

  const secciones = useMemo(() => {
    const grupos = plantillas.reduce((acc: any, curr: any) => {
      const cat = curr.categoria || 'GENERAL';
      if (!acc[cat]) acc[cat] = { nombre: cat, totalPacks: 0 };
      acc[cat].totalPacks += 1;
      return acc;
    }, {});

    seccionesVirtuales.forEach(sv => {
        if (!grupos[sv]) grupos[sv] = { nombre: sv, totalPacks: 0 };
    });

    return Object.values(grupos).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
  }, [plantillas, seccionesVirtuales]);

  const packsDeLaSeccion = useMemo(() => {
    if (!seccionActiva) return [];
    return plantillas.filter(p => (p.categoria || 'GENERAL') === seccionActiva);
  }, [plantillas, seccionActiva]);

  async function fetchData() {
    setCargando(true)
    try {
      const { data: packs, error: errPacks } = await supabase.from('plantillas').select(`*, items_count: plantilla_items(count)`).order('created_at', { ascending: false })
      if (errPacks) throw errPacks

      let allPrests: any[] = [];
      let fetchMore = true, from = 0;
      while (fetchMore) {
          const { data, error } = await supabase.from('prestaciones').select('*').range(from, from + 999);
          if (error) throw error;
          if (data && data.length > 0) { 
              allPrests = [...allPrests, ...data]; 
              if (data.length < 1000) fetchMore = false; else from += 1000; 
          } else fetchMore = false;
      }
      setPlantillas(packs || [])
      setPrestacionesDisponibles(allPrests.sort((a, b) => (a["Nombre Accion"] || '').localeCompare(b["Nombre Accion"] || '')))
    } catch (err: any) { toast.error("Error al cargar") } finally { setCargando(false) }
  }

  const irASeccion = (nombre: string) => {
      router.push(`${pathname}?seccion=${encodeURIComponent(nombre)}`)
  }

  const salirDeSeccion = () => {
      router.push(pathname)
  }

  const crearSeccionNueva = () => {
    if(!nombreNuevaSeccion.trim()) return toast.error("Ingresa un nombre");
    const nombreLimpio = nombreNuevaSeccion.trim().toUpperCase();
    
    if (!seccionesVirtuales.includes(nombreLimpio)) {
        const nuevas = [...seccionesVirtuales, nombreLimpio];
        setSeccionesVirtuales(nuevas);
        localStorage.setItem('secciones_vacias', JSON.stringify(nuevas));
    }
    
    setModalSeccionAbierto(false);
    setNombreNuevaSeccion('');
    toast.success(`Carpeta ${nombreLimpio} creada`);
    irASeccion(nombreLimpio);
  }

  const borrarSeccionVacia = (nombreSec: string, e: any) => {
      e.stopPropagation();
      if(!confirm(`¿Eliminar la carpeta vacía "${nombreSec}"?`)) return;
      const nuevas = seccionesVirtuales.filter(s => s !== nombreSec);
      setSeccionesVirtuales(nuevas);
      localStorage.setItem('secciones_vacias', JSON.stringify(nuevas));
      toast.success("Carpeta eliminada");
  }

  const abrirEditar = async (pack: any) => {
    setModo('editar'); 
    setPlantillaIdEditando(pack.id); 
    setNombrePlantilla(pack.nombre);
    setIconoPack(pack.icono_tipo || null);
    
    const { data } = await supabase.from('plantilla_items').select('prestacion_id, cantidad, seccion').eq('plantilla_id', pack.id);
    
    if (data && data.length > 0) {
        // Obtenemos los nombres únicos de las secciones que ya tenía el pack
        const uniqueSecNames = Array.from(new Set(data.map(d => d.seccion || 'FASE 1')));
        const newSecs = uniqueSecNames.map((name, i) => ({ id: `sec_${i}`, nombre: name }));
        setSeccionesPack(newSecs);
        setSeccionActivaId(newSecs[0].id);

        const items = data.map(d => {
            const p = prestacionesDisponibles.find(p => p.id === d.prestacion_id);
            const secMatch = newSecs.find(s => s.nombre === (d.seccion || 'FASE 1'));
            return p ? { ...p, cantidad: d.cantidad, seccion_id: secMatch?.id || newSecs[0].id } : null;
        }).filter(Boolean);
        setItemsSeleccionados(items);
    } else {
        setSeccionesPack([{ id: 'default', nombre: 'FASE 1' }]);
        setSeccionActivaId('default');
        setItemsSeleccionados([]);
    }
    setModalAbierto(true);
  }

  const abrirCrear = () => {
    setModo('crear'); 
    setPlantillaIdEditando(null); 
    setNombrePlantilla(''); 
    setIconoPack(null);
    setItemsSeleccionados([]); 
    setSeccionesPack([{ id: 'default', nombre: 'FASE 1' }]);
    setSeccionActivaId('default');
    setModalAbierto(true);
  }

  const toggleItem = (prestacion: any) => {
    if (!seccionActivaId) return toast.error("Selecciona una fase en la derecha para añadir el tratamiento");

    // Verifica si la prestación ya existe DENTRO de la fase activa
    const existe = itemsSeleccionados.find(i => i.id === prestacion.id && i.seccion_id === seccionActivaId);
    if (existe) {
        setItemsSeleccionados(itemsSeleccionados.map(i => (i.id === prestacion.id && i.seccion_id === seccionActivaId) ? {...i, cantidad: i.cantidad+1} : i));
    } else {
        setItemsSeleccionados([...itemsSeleccionados, {...prestacion, cantidad: 1, seccion_id: seccionActivaId}]);
    }
  }

  const handleGuardarIcono = async (iconoId: string | null) => {
    if (modalIcono.esParaPack) {
        setIconoPack(iconoId);
        setModalIcono({ abierto: false, prestacion: null, esParaPack: false });
        toast.success(iconoId ? "Icono asignado al Pack" : "Icono removido del Pack");
        return;
    }

    const prestacionActual = modalIcono.prestacion;
    if (!prestacionActual?.id) return;

    try {
        await supabase.from('prestaciones').update({ icono_tipo: iconoId }).eq('id', prestacionActual.id);
        
        setPrestacionesDisponibles(prev => prev.map(p => p.id === prestacionActual.id ? { ...p, icono_tipo: iconoId } : p));
        setItemsSeleccionados(prev => prev.map(item => item.id === prestacionActual.id ? { ...item, icono_tipo: iconoId } : item));

        setModalIcono({ abierto: false, prestacion: null, esParaPack: false });
        toast.success(iconoId ? "Logo asignado a la prestación" : "Logo restablecido");
    } catch (err) {
        toast.error("Error al asignar el logo");
    }
  }

  const handleGuardarPlantilla = async () => {
    if (!nombrePlantilla.trim()) return toast.error("Falta el nombre del pack");
    if (itemsSeleccionados.length === 0) return toast.error("El pack está vacío");
    if (!seccionActiva) return toast.error("No hay sección activa");

    setGuardando(true)
    try {
      const payload: any = { 
          nombre: nombrePlantilla.toUpperCase().trim(), 
          categoria: seccionActiva, 
          precio_total: valorRealTotal
      };

      if (iconoPack) payload.icono_tipo = iconoPack; 
      
      // Mapear la sección de cada item
      const itemsMap = itemsSeleccionados.map(i => ({ 
          prestacion_id: i.id, 
          cantidad: i.cantidad, 
          seccion: seccionesPack.find(s => s.id === i.seccion_id)?.nombre?.trim() || 'FASE 1' 
      }));

      if (modo === 'crear') {
        const { data: newPack, error: insertError } = await supabase.from('plantillas').insert([payload]).select().single()
        
        if (insertError) {
             delete payload.icono_tipo;
             const fallbackRes = await supabase.from('plantillas').insert([payload]).select().single();
             if(fallbackRes.error) throw fallbackRes.error;
             await supabase.from('plantilla_items').insert(itemsMap.map(im => ({ ...im, plantilla_id: fallbackRes.data.id })));
        } else {
             await supabase.from('plantilla_items').insert(itemsMap.map(im => ({ ...im, plantilla_id: newPack.id })));
        }

      } else {
        const { error: updateError } = await supabase.from('plantillas').update(payload).eq('id', plantillaIdEditando);
        if (updateError) {
             delete payload.icono_tipo;
             await supabase.from('plantillas').update(payload).eq('id', plantillaIdEditando);
        }
        await supabase.from('plantilla_items').delete().eq('plantilla_id', plantillaIdEditando)
        await supabase.from('plantilla_items').insert(itemsMap.map(im => ({ ...im, plantilla_id: plantillaIdEditando })))
      }
      setModalAbierto(false); fetchData(); toast.success("Pack guardado");
    } catch (err: any) { 
        toast.error("Error crítico al guardar. Asegúrese de que la base de datos esté online."); 
    } finally { 
        setGuardando(false) 
    }
  }

  const eliminarPlantilla = async (id: string) => {
    if (!confirm("¿Eliminar este pack?")) return;
    try {
      await supabase.from('plantillas').delete().eq('id', id);
      setPlantillas(prev => prev.filter(p => p.id !== id));
      toast.success("Eliminado");
    } catch (err: any) { toast.error("Error"); }
  };

  const prestacionesFiltradas = useMemo(() => {
    if (!busqueda) return prestacionesDisponibles;
    const n = (s:string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const b = n(busqueda);
    let terms = [b];
    if (b === 'rx') terms.push('radio', 'panoramica', 'scanner');
    if (b.includes('tapadura')) terms.push('restaura', 'resina');
    return prestacionesDisponibles.filter(p => terms.some(t => n(p["Nombre Accion"]||"").includes(t) || n(p["Nombre Categoria"]||"").includes(t)));
  }, [busqueda, prestacionesDisponibles])

  if (cargando) return <div className="h-screen flex items-center justify-center bg-[#F8FAFC]"><Loader2 className="animate-spin text-blue-600" size={40}/></div>

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 pb-20 font-sans relative">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* NAVEGADOR SUPERIOR */}
        <div className="flex items-center gap-4">
            <button onClick={() => seccionActiva ? salirDeSeccion() : router.push('/aranceles')} className="flex items-center gap-2 font-black text-[10px] text-slate-400 uppercase hover:text-blue-600 transition-all group">
                <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100 group-hover:bg-blue-600 group-hover:text-white"><ArrowLeft size={14}/></div>
                {seccionActiva ? 'Volver a todas las Carpetas' : 'Volver al Arancel Maestro'}
            </button>
        </div>

        {/* CABECERA DINÁMICA */}
        <header className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
           <div className="flex items-center gap-6">
             <div className="bg-slate-900 p-5 rounded-[2rem] text-white shadow-xl">
               {seccionActiva ? <FolderOpen size={32} /> : <Layers size={32} />}
             </div>
             <div>
               <h1 className="text-3xl font-black text-slate-800 uppercase italic leading-none">
                 {seccionActiva ? `Carpeta: ${seccionActiva}` : 'Carpetas de Plantillas'}
               </h1>
               <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-3">
                 {seccionActiva ? 'Packs contenidos en esta sección' : 'Organiza tus packs por áreas clínicas'}
               </p>
             </div>
           </div>
           
           {!seccionActiva ? (
               <button onClick={() => setModalSeccionAbierto(true)} className="bg-blue-600 text-white px-10 py-5 rounded-3xl font-black text-xs uppercase shadow-xl hover:bg-slate-900 transition-all flex items-center gap-2 active:scale-95">
                 <FolderPlus size={18} /> Crear Nueva Carpeta
               </button>
           ) : (
               <button onClick={abrirCrear} className="bg-emerald-600 text-white px-10 py-5 rounded-3xl font-black text-xs uppercase shadow-xl hover:bg-emerald-700 transition-all flex items-center gap-2 active:scale-95">
                 <Plus size={18} /> Crear Pack Clínico aquí
               </button>
           )}
        </header>

        {/* VISTA 1: CARPETAS PRINCIPALES */}
        {!seccionActiva ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4">
            {secciones.length === 0 ? (
               <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                  <FolderPlus size={48} className="mx-auto text-slate-300 mb-4"/>
                  <p className="text-xs font-black text-slate-400 uppercase mb-4">No has creado ninguna carpeta.</p>
                  <button onClick={() => setModalSeccionAbierto(true)} className="bg-white text-blue-600 border border-blue-200 px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-sm hover:bg-blue-50 transition-all">
                     Crear mi primera sección
                  </button>
               </div>
            ) : (
              secciones.map((sec: any) => (
                <motion.div key={sec.nombre} whileHover={{ y: -5 }} onClick={() => irASeccion(sec.nombre)} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group flex items-center justify-between relative">
                  {sec.totalPacks === 0 && (
                      <button onClick={(e) => borrarSeccionVacia(sec.nombre, e)} className="absolute top-6 right-6 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all z-10">
                        <Trash2 size={16}/>
                      </button>
                  )}
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all"><FolderOpen size={28}/></div>
                    <div>
                        <h3 className="text-xl font-black text-slate-800 uppercase italic leading-tight pr-6">{sec.nombre}</h3>
                        {sec.totalPacks === 0 
                            ? <p className="text-[10px] font-black text-amber-500 uppercase mt-1">Carpeta Vacía</p>
                            : <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{sec.totalPacks} Packs creados</p>
                        }
                    </div>
                  </div>
                  <ChevronRight className="text-slate-300 group-hover:text-blue-600 shrink-0" />
                </motion.div>
              ))
            )}
          </div>
        ) : (
          /* VISTA 2: CONTENIDO DE LA CARPETA (PACKS) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4">
            {packsDeLaSeccion.length === 0 && (
                <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                  <Package size={48} className="mx-auto text-slate-300 mb-4"/>
                  <p className="text-xs font-black text-slate-400 uppercase mb-4">La carpeta está lista pero vacía.</p>
                  <button onClick={abrirCrear} className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-sm hover:bg-emerald-100 transition-all">
                     Crear primer Pack aquí
                  </button>
               </div>
            )}
            {packsDeLaSeccion.map((pack) => (
              <div key={pack.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all relative group flex flex-col justify-between min-h-[220px]">
                <div className="absolute top-6 right-6 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => abrirEditar(pack)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl"><Edit3 size={16}/></button>
                  <button onClick={() => eliminarPlantilla(pack.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl"><Trash2 size={16}/></button>
                </div>
                
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0">
                     {pack.icono_tipo ? (
                        <div className="w-8 h-8">
                          <svg viewBox="-10 -10 120 140" className="w-full h-full drop-shadow-sm">
                             <LogoRender iconoKey={pack.icono_tipo} hallazgo={pack.nombre} colorOverride="#059669" />
                          </svg>
                        </div>
                     ) : (
                        <Package size={28} />
                     )}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase leading-snug pr-8">{pack.nombre}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 flex items-center gap-1.5"><Layers size={12}/> {pack.items_count?.[0]?.count || 0} Tratamientos</p>
                  </div>
                </div>

                <div className="mt-4 pt-6 border-t border-slate-50 flex items-center justify-between"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Suma Real</span><span className="text-xl font-black text-emerald-600">${Number(pack.precio_total).toLocaleString('es-CL')}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modalSeccionAbierto && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[99999] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden flex flex-col">
              <div className="p-8 bg-blue-600 text-white flex justify-between items-center">
                 <div className="flex items-center gap-3"><FolderPlus size={24} /><h2 className="text-xl font-black uppercase italic tracking-tighter">Nueva Sección</h2></div>
                 <button onClick={() => setModalSeccionAbierto(false)} className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-red-500 transition-all"><X size={16}/></button>
              </div>
              <div className="p-8 space-y-6">
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-2">Nombre de la Carpeta</label>
                    <input 
                       autoFocus type="text" placeholder="Ej: ORTODONCIA, CIRUGÍA..." 
                       value={nombreNuevaSeccion} onChange={(e) => setNombreNuevaSeccion(e.target.value)} 
                       onKeyDown={(e) => e.key === 'Enter' && crearSeccionNueva()} 
                       className="w-full p-5 bg-slate-50 rounded-2xl font-black text-sm uppercase outline-none focus:ring-2 ring-blue-500/20 shadow-inner border border-slate-100" 
                    />
                 </div>
                 <button onClick={crearSeccionNueva} className="w-full bg-slate-900 text-white py-5 rounded-[1.5rem] font-black text-xs uppercase shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                    Crear Carpeta
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalAbierto && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[99999] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] mt-10">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div>
                    <h2 className="text-2xl font-black uppercase italic tracking-tighter">{modo === 'crear' ? 'Diseñar Pack Clínico' : 'Editar Pack'}</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Guardando en sección: {seccionActiva}</p>
                 </div>
                 <button onClick={() => setModalAbierto(false)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-red-500 transition-all"><X size={20}/></button>
              </div>

              <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                 <div className="w-full md:w-1/2 flex flex-col bg-slate-50 border-r border-slate-100">
                    <div className="p-6 border-b border-slate-100"><input type="text" placeholder="Buscar prestación para agregar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full py-4 px-6 rounded-2xl bg-white border-none text-xs font-bold outline-none shadow-sm focus:ring-2 ring-blue-500/20" /></div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                       {prestacionesFiltradas.slice(0, 100).map(p => {
                         const totalAgregados = itemsSeleccionados.filter(i => i.id === p.id).reduce((acc, curr) => acc + curr.cantidad, 0);
                         const seleccionado = totalAgregados > 0;
                         const esInactiva = ['no', 'false', 'falso', '', 'n'].includes(String(p.Habilitado || '').trim().toLowerCase());
                         
                         return (
                           <div key={p.id} className={`p-4 mb-3 rounded-2xl cursor-pointer transition-all flex items-start gap-3 border-l-8 ${seleccionado ? 'bg-blue-600 text-white border-blue-800 shadow-md' : esInactiva ? 'bg-red-50/70 text-slate-500 border-red-500/50' : 'bg-white hover:bg-emerald-50 text-slate-700 border-emerald-500/50 shadow-sm'}`}>
                              
                              <button 
                                  onClick={(e) => { e.stopPropagation(); setModalIcono({abierto: true, prestacion: p, esParaPack: false}); }} 
                                  title="Asignar o Cambiar Logo" 
                                  className={`w-10 h-10 flex shrink-0 items-center justify-center rounded-lg transition-colors overflow-hidden group/logo relative mr-1 ${seleccionado ? 'bg-blue-700 hover:bg-blue-500' : 'bg-slate-100 hover:bg-emerald-200'}`}
                              >
                                 <div className="w-6 h-6 group-hover/logo:opacity-0 transition-opacity">
                                    <svg viewBox="-10 -10 120 140" className="w-full h-full drop-shadow-sm">
                                       <LogoRender iconoKey={p.icono_tipo} hallazgo={p["Nombre Accion"]} colorOverride={seleccionado ? "#ffffff" : "#3b82f6"} />
                                    </svg>
                                 </div>
                                 <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity text-white flex-col">
                                    <RefreshCcw size={14} className={seleccionado ? "text-white" : "text-emerald-700"} />
                                 </div>
                              </button>

                              <div onClick={() => toggleItem(p)} className="flex-1 min-w-0 py-0.5 flex flex-col justify-center h-full">
                                 <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                    <p className={`text-[8px] font-black uppercase ${seleccionado ? 'text-blue-200' : 'text-slate-400'}`}>{p["Nombre Categoria"]}</p>
                                    {esInactiva && !seleccionado && <span className="bg-red-600 text-white text-[7px] font-black px-1.5 py-0.5 rounded-sm">INACTIVA</span>}
                                    {seleccionado && <span className="bg-white text-blue-600 text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm">x{totalAgregados} agregados</span>}
                                 </div>
                                 <p className="text-xs font-black uppercase leading-snug break-words">{p["Nombre Accion"]}</p>
                              </div>

                              <div onClick={() => toggleItem(p)} className="flex flex-col items-end justify-center h-full gap-2">
                                 <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${seleccionado ? 'bg-white text-blue-600' : 'bg-slate-100'}`}>
                                    {seleccionado ? <Check size={14} strokeWidth={4}/> : <Plus size={14}/>}
                                 </div>
                                 <span className="text-[10px] font-bold">${Number(p.Precio).toLocaleString('es-CL')}</span>
                              </div>

                           </div>
                         )
                       })}
                    </div>
                 </div>

                 <div className="w-full md:w-1/2 flex flex-col bg-slate-100">
                    <div className="p-8 space-y-4 shrink-0 border-b border-slate-200 bg-white">
                       
                       <div className="flex gap-4 items-end">
                          <div className="space-y-1 flex-1">
                             <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block">Nombre Comercial del Pack</label>
                             <input type="text" placeholder="Ej: Pack Promocional 2026" value={nombrePlantilla} onChange={(e) => setNombrePlantilla(e.target.value)} className="w-full p-5 bg-slate-50 rounded-2xl font-black text-sm uppercase outline-none shadow-inner border border-slate-100 focus:ring-2 ring-emerald-500/20" />
                          </div>

                          <button 
                             onClick={() => setModalIcono({ abierto: true, prestacion: null, esParaPack: true })}
                             title="Elegir icono representativo del pack"
                             className="w-[72px] h-[72px] shrink-0 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center hover:bg-emerald-50 hover:border-emerald-200 transition-all text-slate-400 hover:text-emerald-600 shadow-sm"
                          >
                             {iconoPack ? (
                                <div className="w-8 h-8">
                                    <svg viewBox="-10 -10 120 140" className="w-full h-full drop-shadow-sm">
                                       <LogoRender iconoKey={iconoPack} hallazgo={nombrePlantilla} colorOverride="#059669" />
                                    </svg>
                                </div>
                             ) : (
                                <>
                                   <Package size={20} />
                                   <span className="text-[7px] font-black uppercase mt-1.5 tracking-widest text-slate-500">Logo</span>
                                </>
                             )}
                          </button>
                       </div>

                    </div>

                    <div className="flex-1 overflow-y-auto px-8 pb-8 pt-4 custom-scrollbar">
                       
                       <div className="flex justify-between items-center border-b border-slate-200/50 pb-3 mb-5 mt-2">
                           <div>
                               <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fases del Pack</h4>
                               <p className="text-[9px] text-slate-400 font-bold mt-0.5">Selecciona una fase y añade los tratamientos desde la izquierda.</p>
                           </div>
                           <button onClick={() => {
                               const newId = `sec_${Date.now()}`;
                               setSeccionesPack([...seccionesPack, { id: newId, nombre: `FASE ${seccionesPack.length + 1}` }]);
                               setSeccionActivaId(newId);
                           }} className="text-[9px] font-black uppercase bg-blue-100 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-200 transition-colors shadow-sm flex items-center gap-1 shrink-0">
                               <Plus size={12}/> Agregar Fase
                           </button>
                       </div>

                       {seccionesPack.length === 0 && (
                           <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-[2.5rem]">
                               <Layers size={32} className="mx-auto text-slate-300 mb-3"/>
                               <p className="text-[10px] font-black text-slate-400 uppercase">No hay fases creadas.</p>
                           </div>
                       )}

                       {seccionesPack.map(sec => {
                           const itemsEnSec = itemsSeleccionados.filter(i => i.seccion_id === sec.id);
                           const isActive = seccionActivaId === sec.id;
                           
                           return (
                               <div 
                                   key={sec.id} 
                                   onClick={() => setSeccionActivaId(sec.id)} 
                                   className={`p-4 rounded-[1.5rem] border-2 transition-all mb-4 ${isActive ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-slate-200 bg-white opacity-70 hover:opacity-100 cursor-pointer hover:border-blue-300'}`}
                               >
                                   <div className="flex justify-between items-center mb-4 border-b border-slate-200/50 pb-3">
                                       <div className="flex items-center gap-3 flex-1">
                                           <div className={`w-3 h-3 rounded-full shrink-0 ${isActive ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-slate-300'}`}></div>
                                           <input 
                                               value={sec.nombre}
                                               onChange={(e) => setSeccionesPack(seccionesPack.map(s => s.id === sec.id ? { ...s, nombre: e.target.value } : s))}
                                               className={`bg-transparent font-black text-sm uppercase outline-none focus:border-b-2 border-blue-400 w-full transition-colors ${isActive ? 'text-blue-700' : 'text-slate-600'}`}
                                               placeholder="NOMBRE DE FASE..."
                                               onClick={(e) => { e.stopPropagation(); setSeccionActivaId(sec.id); }}
                                           />
                                       </div>
                                       {seccionesPack.length > 1 && (
                                           <button onClick={(e) => {
                                               e.stopPropagation();
                                               if(itemsEnSec.length > 0 && !confirm(`¿Eliminar la fase "${sec.nombre}" y todos sus tratamientos?`)) return;
                                               setSeccionesPack(seccionesPack.filter(s => s.id !== sec.id));
                                               setItemsSeleccionados(itemsSeleccionados.filter(i => i.seccion_id !== sec.id));
                                               if(isActive) setSeccionActivaId(seccionesPack.find(s => s.id !== sec.id)?.id || '');
                                           }} className="text-slate-400 hover:text-red-500 p-2 bg-white rounded-xl shadow-sm border border-slate-200 transition-colors ml-3"><Trash2 size={14}/></button>
                                       )}
                                   </div>
                                   
                                   {isActive && itemsEnSec.length === 0 && (
                                       <div className="py-6 text-center bg-white/60 rounded-xl border border-blue-200 border-dashed">
                                           <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">
                                               Fase Activa
                                           </p>
                                           <p className="text-[9px] font-bold text-slate-500 mt-1">Haz clic en los tratamientos del menú izquierdo para agregarlos aquí.</p>
                                       </div>
                                   )}

                                   {itemsEnSec.length > 0 && (
                                       <div className="space-y-3">
                                           {itemsEnSec.map(item => (
                                               <div key={item.id} className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center justify-between group">
                                                   <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                                                       <button 
                                                           onClick={(e) => { e.stopPropagation(); setModalIcono({abierto: true, prestacion: item, esParaPack: false}); }}
                                                           title="Cambiar Logo" 
                                                           className="w-10 h-10 shrink-0 flex items-center justify-center bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-400 rounded-lg transition-all group/resumenlogo relative overflow-hidden"
                                                       >
                                                           <div className="w-6 h-6 group-hover/resumenlogo:opacity-0 transition-opacity">
                                                              <svg viewBox="-10 -10 120 140" className="w-full h-full drop-shadow-sm">
                                                                 <LogoRender iconoKey={item.icono_tipo} hallazgo={item["Nombre Accion"]} colorOverride="#64748b" />
                                                              </svg>
                                                           </div>
                                                           <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/resumenlogo:opacity-100 transition-opacity text-blue-600 flex-col">
                                                              <Edit3 size={14} />
                                                           </div>
                                                       </button>
                                                       
                                                       <div className="truncate">
                                                           <span className="text-[8px] font-black uppercase text-slate-400 block mb-0.5">{item["Nombre Categoria"]}</span>
                                                           <span className="text-xs font-black uppercase leading-tight text-slate-800 truncate block">{item["Nombre Accion"]}</span>
                                                       </div>
                                                   </div>
                                                   
                                                   <div className="flex items-center gap-4 shrink-0">
                                                       <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                                          <button onClick={(e) => { e.stopPropagation(); const n = Math.max(1, item.cantidad - 1); setItemsSeleccionados(itemsSeleccionados.map(i => (i.id === item.id && i.seccion_id === sec.id) ? {...i, cantidad: n} : i)) }} className="w-6 h-6 rounded-md bg-white hover:bg-slate-200 flex items-center justify-center text-slate-600 shadow-sm"><Minus size={12}/></button>
                                                          <span className="font-black text-xs w-4 text-center">{item.cantidad}</span>
                                                          <button onClick={(e) => { e.stopPropagation(); setItemsSeleccionados(itemsSeleccionados.map(i => (i.id === item.id && i.seccion_id === sec.id) ? {...i, cantidad: i.cantidad + 1} : i)) }} className="w-6 h-6 rounded-md bg-slate-900 hover:bg-blue-600 text-white flex items-center justify-center shadow-sm"><Plus size={12}/></button>
                                                       </div>
                                                       <span className="font-black text-blue-600 text-xs w-16 text-right">${(item.Precio * item.cantidad).toLocaleString('es-CL')}</span>
                                                       <button onClick={(e) => { e.stopPropagation(); setItemsSeleccionados(itemsSeleccionados.filter(i => !(i.id === item.id && i.seccion_id === sec.id))) }} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 size={14}/></button>
                                                   </div>
                                               </div>
                                           ))}
                                       </div>
                                   )}
                               </div>
                           )
                       })}
                    </div>

                    <div className="p-8 bg-white border-t border-slate-200 space-y-4 shrink-0">
                       <div className="flex justify-between items-center bg-slate-50 p-5 rounded-2xl shadow-sm border border-slate-100">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Suma Real Total</span>
                           <span className="text-xl font-black text-emerald-600">${valorRealTotal.toLocaleString('es-CL')}</span>
                       </div>
                       <button onClick={handleGuardarPlantilla} disabled={guardando || itemsSeleccionados.length === 0 || !nombrePlantilla.trim()} className="w-full bg-slate-900 text-white py-6 rounded-3xl font-black text-xs uppercase shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:bg-slate-300">
                         {guardando ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} GUARDAR PACK
                       </button>
                    </div>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalIcono.abierto && (
          <div className="fixed inset-0 z-[9999999] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
             <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden text-left flex flex-col max-h-[85vh]">
                <div className="p-6 bg-blue-600 text-white flex justify-between items-center shrink-0">
                  <h3 className="text-lg font-black uppercase italic tracking-tighter">
                     {modalIcono.esParaPack ? 'Icono del Pack' : 'Asignar Icono Permanente'}
                  </h3>
                  <button onClick={() => setModalIcono({abierto: false, prestacion: null, esParaPack: false})} className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-red-500 transition-all"><X size={16}/></button>
                </div>
                
                <div className="p-6 bg-blue-50 border-b border-blue-100 shrink-0 text-center">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Selecciona el dibujo para:</p>
                  <span className="text-sm font-black text-blue-900 uppercase leading-snug">
                     {modalIcono.esParaPack ? (nombrePlantilla || 'Nuevo Pack') : modalIcono.prestacion?.["Nombre Accion"]}
                  </span>
                  <p className="text-[9px] font-bold text-slate-500 mt-2">
                     {modalIcono.esParaPack ? 'Este icono representará al pack en el menú y listas.' : 'Este icono se dibujará en el Odontograma cuando apliques esta prestación.'}
                  </p>
                </div>

                <div className="p-6 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 gap-3 custom-scrollbar flex-1">
                   {ICONOS_DISPONIBLES.map(ico => (
                      <button key={ico.id} onClick={() => handleGuardarIcono(ico.id)} className="flex flex-col items-center justify-center p-3 bg-white hover:border-blue-400 rounded-2xl border-2 border-slate-100 shadow-sm transition-all group hover:bg-blue-50">
                        <div className="w-10 h-10 mb-2 group-hover:scale-110 transition-transform">
                           <svg viewBox="-10 -10 120 140" className="w-full h-full drop-shadow-sm">
                               <LogoRender iconoKey={ico.id} hallazgo={ico.label} colorOverride="#2563eb" />
                           </svg>
                        </div>
                        <span className="text-[9px] font-black uppercase text-slate-500 group-hover:text-blue-600 text-center leading-tight">{ico.label}</span>
                      </button>
                   ))}
                </div>
                
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
                   <button onClick={() => handleGuardarIcono(null)} className="flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase text-red-500 hover:bg-red-50 rounded-xl transition-all border border-red-100 bg-white shadow-sm">
                      <Trash2 size={14}/> Quitar Logo
                   </button>
                   <button onClick={() => setModalIcono({abierto: false, prestacion: null, esParaPack: false})} className="px-6 py-3 bg-slate-900 text-white hover:bg-blue-600 transition-all rounded-xl text-[10px] font-black uppercase shadow-sm">
                      Cancelar
                   </button>
                </div>

             </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  )
}

function LogoRender({ hallazgo, iconoKey, colorOverride, isRealizado, isPendiente }: { hallazgo?: string, iconoKey?: string, colorOverride?: string, isRealizado?: boolean, isPendiente?: boolean }) {
  const originalName = (hallazgo || "").toLowerCase();
  const explicitIcon = (iconoKey || "").toLowerCase();
  const h = explicitIcon || originalName; 
  
  const isLesion = LESIONES_LISTA.some(l => l.toLowerCase() === originalName);
  const isMalEstado = originalName.includes("mal estado") || originalName.includes("fractu") || originalName.includes("infec");
  
  let color = "#2563eb"; 
  if (colorOverride) color = colorOverride;
  else if (isRealizado) color = "#059669"; 
  else if (isPendiente) color = "#ef4444"; 
  else if (isLesion) color = "#0f172a"; 

  const patternId = `hash-${Math.random().toString(36).substr(2, 9)}`;
  const pattern = isMalEstado ? (<defs><pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke={color} strokeWidth="3" /></pattern></defs>) : null;
  const fill = isMalEstado ? `url(#${patternId})` : color;
  
  if (h.includes("caries") || h.includes("restauraci") || h.includes("amalgama")) return <g>{pattern}<path d="M 35 75 Q 50 60 65 75 Q 75 90 50 100 Q 25 90 35 75 Z" fill={fill} /></g>;
  if (h.includes("corona provisoria")) return <g><circle cx="50" cy="80" r="30" fill={isMalEstado ? fill : "none"} stroke={color} strokeWidth="4" /><text x="50" y="88" textAnchor="middle" fontSize="24" fontWeight="900" fill={isMalEstado ? "#fff" : color}>P</text></g>;
  if (h.includes("corona")) return <circle cx="50" cy="80" r="30" fill={isMalEstado ? fill : "none"} stroke={color} strokeWidth="4" />;
  if (h.includes("endo") || h.includes("infec")) return <path d="M 40 15 L 40 45 A 10 10 0 0 0 60 45 L 60 15" fill={isMalEstado ? fill : "none"} stroke={color} strokeWidth="8" strokeLinecap="round" />;
  if (h.includes("impla")) return <g fill={fill}><path d="M 45 15 L 55 15 L 55 50 L 50 60 L 45 50 Z" /><line x1="38" y1="25" x2="62" y2="25" stroke={color} strokeWidth="4" /><line x1="38" y1="35" x2="62" y2="35" stroke={color} strokeWidth="4" /></g>;
  if (h.includes("perno") || h.includes("muñón") || h.includes("munon")) return <path d="M 45 15 L 55 15 L 55 60 L 65 85 L 35 85 L 45 60 Z" fill={fill} stroke={color} strokeWidth="2" />;
  if (h.includes("fractu")) return <path d="M 60 10 L 40 60 L 60 60 L 40 110" stroke={color} strokeWidth="6" fill="none" />;
  if (h.includes("protesis") || h.includes("removible")) return <g stroke={color} strokeWidth="4"><line x1="30" y1="110" x2="70" y2="110" /><line x1="30" y1="118" x2="70" y2="118" /></g>;
  if (h.includes("sellante")) return <path d="M 25 95 Q 37 85 50 95 T 75 95" fill="none" stroke={color} strokeWidth="6" />;
  if (h.includes("movilidad")) return <g stroke={color} strokeWidth="4" fill="none"><path d="M 15 50 Q 0 75 15 100" /><path d="M 85 50 Q 100 75 85 100" /></g>;
  if (h.includes("rr") || h.includes("residuo radicular")) return <g><rect x="30" y="65" width="40" height="25" rx="6" fill={color} /><text x="50" y="83" fill="#fff" fontSize="16" fontWeight="900" textAnchor="middle">RR</text></g>;
  
  // 🔥 NUEVOS ICONOS AÑADIDOS PARA SOPORTAR TODO EL MENÚ 🔥
  if (h.includes("extrac") || h.includes("exodoncia")) return <g stroke={color} strokeWidth="12" strokeLinecap="round" opacity="0.8"><line x1="20" y1="20" x2="80" y2="80" /><line x1="80" y1="20" x2="20" y2="80" /></g>;
  if (h.includes("limpieza") || h.includes("pulido") || h.includes("destartraje") || h.includes("profilaxis")) return <g fill={fill}><circle cx="30" cy="30" r="10"/><circle cx="70" cy="40" r="8"/><circle cx="40" cy="70" r="12"/></g>;
  if (h.includes("rayos") || h.includes("radiografia") || h.includes("scanner") || h.includes("panoramica")) return <g stroke={color} strokeWidth="6" fill="none"><rect x="20" y="20" width="60" height="60" rx="4" /><circle cx="50" cy="50" r="15"/></g>;
  if (h.includes("sano")) return <path d="M 25 50 L 45 70 L 80 30" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  
  if (h === "default" || h.includes("otro")) return <circle cx="50" cy="50" r="20" fill={fill} opacity="0.8" />;
  
  return <circle cx="50" cy="50" r="20" fill={fill} opacity="0.8" />;
}

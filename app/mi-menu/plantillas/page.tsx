'use client'
import { useState, useEffect, useMemo, Suspense, useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import { 
  ArrowLeft, Loader2, Plus, X, Save, Trash2, 
  Search, Package, Layers, Edit3, Calculator, Minus, ChevronRight, FolderPlus, FolderOpen, RefreshCcw, Check,
  ChevronDown
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
    <Suspense fallback={
      <div className="h-screen flex flex-col items-center justify-center bg-[#FBF8F2] gap-4">
        <Loader2 className="animate-spin text-[#C9A24B]" size={40}/>
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando plantillas...</p>
      </div>
    }>
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
  const [seccionesPack, setSeccionesPack] = useState<string[]>([])
  const [nombreNuevaSeccionPack, setNombreNuevaSeccionPack] = useState('')
  const [itemsSeleccionados, setItemsSeleccionados] = useState<any[]>([])
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isPrestacionDropdownOpen, setIsPrestacionDropdownOpen] = useState(false);

  // Estado para los Portals
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
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
    setSeccionesPack(pack.secciones_presupuesto || []);
    
    const { data, error } = await supabase.from('plantilla_items').select('cantidad, seccion, prestaciones(*)').eq('plantilla_id', pack.id);
    
    if (error) {
      toast.error("Error al cargar los detalles del pack.");
      return;
    }

    if (data) {
        const items = data.map(d => {
            const p = d.prestaciones;
            if (!p) return null;
            return { 
              ...p, 
              cantidad: d.cantidad, 
              seccion: d.seccion,
              instanceId: crypto.randomUUID() 
            };
        }).filter(Boolean);

        setItemsSeleccionados(items);

        if ((pack.secciones_presupuesto || []).length === 0 && items.length > 0) {
          const seccionesDeItems = Array.from(new Set(items.map(it => it?.seccion).filter((value): value is string => Boolean(value))));
          setSeccionesPack(seccionesDeItems);
        }
    }
    setModalAbierto(true);
  }

  const abrirCrear = () => {
    setModo('crear'); 
    setPlantillaIdEditando(null); 
    setNombrePlantilla(''); 
    setIconoPack(null);
    setSeccionesPack([]);
    setItemsSeleccionados([]); 
    setModalAbierto(true);
  }

  const toggleItem = (prestacion: any) => {
    const esInactiva = ['no', 'false', 'falso', '', 'n'].includes(String(prestacion.Habilitado || '').trim().toLowerCase());
    if (esInactiva) {
      toast.error(`La prestación "${prestacion["Nombre Accion"]}" está inhabilitada y no puede ser agregada.`);
      return;
    }
    const ultimaSeccion = seccionesPack.length > 0 ? seccionesPack[seccionesPack.length - 1] : null;
    const newItem = {
      ...prestacion,
      instanceId: crypto.randomUUID(),
      cantidad: 1,
      seccion: ultimaSeccion
    };
    setItemsSeleccionados(prevItems => [...prevItems, newItem]);
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

  const handleSectionChange = (itemId: string, newSection: string) => {
    setItemsSeleccionados(prev =>
        prev.map(item =>
            item.instanceId === itemId ? { ...item, seccion: newSection || null } : item
        )
    );
  };

  const handleDrop = (targetSection: string | null) => {
    if (!draggedItemId) return;
    handleSectionChange(draggedItemId, targetSection ?? '');
    setDraggedItemId(null);
    setDragOverSection(null);
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
          precio_total: valorRealTotal,
          secciones_presupuesto: seccionesPack.length > 0 ? seccionesPack : null
      };

      if (iconoPack) payload.icono_tipo = iconoPack; 
      
      if (modo === 'crear') {
        const { data: newPack, error: insertError } = await supabase.from('plantillas').insert([payload]).select().single()
        
        if (insertError) {
             delete payload.secciones_presupuesto;
             delete payload.icono_tipo;
             const fallbackRes = await supabase.from('plantillas').insert([payload]).select().single();
             if(fallbackRes.error) throw fallbackRes.error;
             await supabase.from('plantilla_items').insert(itemsSeleccionados.map(i => ({ plantilla_id: fallbackRes.data.id, prestacion_id: i.id, cantidad: i.cantidad, seccion: i.seccion })));
        } else {
             await supabase.from('plantilla_items').insert(itemsSeleccionados.map(i => ({ plantilla_id: newPack.id, prestacion_id: i.id, cantidad: i.cantidad, seccion: i.seccion })));
        }

      } else {
        const { error: updateError } = await supabase.from('plantillas').update(payload).eq('id', plantillaIdEditando);
        if (updateError) {
             delete payload.secciones_presupuesto;
             delete payload.icono_tipo;
             await supabase.from('plantillas').update(payload).eq('id', plantillaIdEditando);
        }
        await supabase.from('plantilla_items').delete().eq('plantilla_id', plantillaIdEditando)
        await supabase.from('plantilla_items').insert(itemsSeleccionados.map(i => ({ plantilla_id: plantillaIdEditando, prestacion_id: i.id, cantidad: i.cantidad, seccion: i.seccion })))
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

  const categoriasPrestaciones = useMemo(() => {
    const categorias = new Set<string>();
    prestacionesDisponibles.forEach(p => {
      if (p["Nombre Categoria"]) {
        categorias.add(p["Nombre Categoria"]);
      }
    });
    return Array.from(categorias).sort();
  }, [prestacionesDisponibles]);

  const prestacionesParaMostrar = useMemo(() => {
    const source = prestacionesDisponibles;
    const normalizar = (str: string | null | undefined) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const b = normalizar(busqueda);

    if (b) {
        let terms = [b];
        if (b === 'rx') terms.push('radio', 'panoramica', 'scanner');
        if (b.includes('tapadura')) terms.push('restaura', 'resina');
        return source.filter(p => terms.some(t => normalizar(p["Nombre Accion"]).includes(t) || normalizar(p["Nombre Categoria"]).includes(t)));
    }

    if (categoriaSeleccionada) {
        return source.filter(p => p["Nombre Categoria"] === categoriaSeleccionada);
    }
    return [];
  }, [busqueda, prestacionesDisponibles, categoriaSeleccionada]);

  const prestacionesDeCategoria = useMemo(() => {
    if (!categoriaSeleccionada) return [];
    return prestacionesDisponibles.filter(p => p["Nombre Categoria"] === categoriaSeleccionada)
      .sort((a, b) => (a["Nombre Accion"] || '').localeCompare(b["Nombre Accion"] || ''));
  }, [busqueda, prestacionesDisponibles, categoriaSeleccionada]);

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#FBF8F2] gap-4">
      <Loader2 className="animate-spin text-[#C9A24B]" size={40}/>
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando plantillas...</p>
    </div>
  )

  return (
    <main className="min-h-screen bg-[#FBF8F2] p-6 md:p-8 font-sans relative overflow-hidden z-0">
      
      {/* IMAGEN DE FONDO GLOBAL */}
      <div 
        className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"
      ></div>

      <div className="max-w-7xl mx-auto space-y-8 relative z-10 text-left">
        
        {/* NAVEGADOR SUPERIOR */}
        <div className="flex items-center gap-4">
            <button onClick={() => seccionActiva ? salirDeSeccion() : router.back()} className="flex items-center gap-2 font-black text-[10px] text-slate-400 uppercase hover:text-[#C9A24B] transition-all group">
                <div className="p-2 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200 group-hover:bg-[#0A111F] group-hover:border-[#0A111F] group-hover:text-[#C9A24B] transition-colors"><ArrowLeft size={14}/></div>
                {seccionActiva ? 'Volver a todas las Carpetas' : 'Volver atrás'}
            </button>
        </div>

        {/* CABECERA DINÁMICA */}
        <header className="bg-white/90 backdrop-blur-md p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 text-left">
           <div className="flex items-center gap-5 text-left w-full md:w-auto">
             <div className="bg-[#0A111F] w-16 h-16 rounded-[2rem] flex items-center justify-center text-[#C9A24B] shadow-lg shrink-0">
               {seccionActiva ? <FolderOpen size={30} /> : <Layers size={30} />}
             </div>
             <div className="text-left">
               <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight text-left">
                 {seccionActiva ? `Carpeta: ${seccionActiva}` : 'Carpetas de Plantillas'}
               </h1>
               <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1.5 text-left">
                 {seccionActiva ? 'Packs contenidos en esta sección' : 'Organiza tus packs por áreas clínicas'}
               </p>
             </div>
           </div>
           
           {!seccionActiva ? (
               <button onClick={() => setModalSeccionAbierto(true)} className="bg-[#0A111F] text-white px-6 py-4 rounded-full font-bold text-[11px] uppercase tracking-wider shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-2 active:scale-95 w-full md:w-auto shrink-0 text-left">
                 <FolderPlus size={16} /> Crear Nueva Carpeta
               </button>
           ) : (
               <button onClick={abrirCrear} className="bg-[#C9A24B] text-white px-6 py-4 rounded-full font-bold text-[11px] uppercase tracking-wider shadow-lg hover:bg-[#b08d3c] transition-all flex items-center justify-center gap-2 active:scale-95 w-full md:w-auto shrink-0 text-left">
                 <Plus size={16} /> Crear Pack Clínico aquí
               </button>
           )}
        </header>

        {/* VISTA 1: CARPETAS PRINCIPALES */}
        {!seccionActiva ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 text-left">
            {secciones.length === 0 ? (
               <div className="col-span-full py-20 text-center bg-white/80 backdrop-blur-sm rounded-[3rem] border border-dashed border-slate-300">
                  <FolderPlus size={48} className="mx-auto text-slate-300 mb-4"/>
                  <p className="text-xs font-black text-slate-400 uppercase mb-4">No has creado ninguna carpeta.</p>
                  <button onClick={() => setModalSeccionAbierto(true)} className="bg-white text-[#0A111F] border border-slate-200 px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-sm hover:border-[#C9A24B] hover:text-[#C9A24B] transition-all">
                     Crear mi primera sección
                  </button>
               </div>
            ) : (
              secciones.map((sec: any) => (
                <motion.div key={sec.nombre} whileHover={{ y: -5 }} onClick={() => irASeccion(sec.nombre)} className="bg-white/95 backdrop-blur-sm p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-[#C9A24B]/30 transition-all cursor-pointer group flex items-center justify-between relative text-left">
                  {sec.totalPacks === 0 && (
                      <button onClick={(e) => borrarSeccionVacia(sec.nombre, e)} className="absolute top-6 right-6 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all z-10">
                        <Trash2 size={16}/>
                      </button>
                  )}
                  <div className="flex items-center gap-5 text-left">
                    <div className="w-14 h-14 bg-[#C9A24B]/10 rounded-2xl flex items-center justify-center text-[#C9A24B] group-hover:bg-[#0A111F] group-hover:text-[#C9A24B] transition-all shrink-0"><FolderOpen size={24}/></div>
                    <div className="text-left">
                        <h3 className="text-lg font-black text-[#0A111F] uppercase italic leading-tight pr-6">{sec.nombre}</h3>
                        {sec.totalPacks === 0 
                            ? <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mt-1">Carpeta Vacía</p>
                            : <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{sec.totalPacks} Packs creados</p>
                        }
                    </div>
                  </div>
                  <ChevronRight className="text-slate-300 group-hover:text-[#C9A24B] shrink-0" />
                </motion.div>
              ))
            )}
          </div>
        ) : (
          /* VISTA 2: CONTENIDO DE LA CARPETA (PACKS) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 text-left">
            {packsDeLaSeccion.length === 0 && (
                <div className="col-span-full py-20 text-center bg-white/80 backdrop-blur-sm rounded-[3rem] border border-dashed border-slate-300">
                  <Package size={48} className="mx-auto text-slate-300 mb-4"/>
                  <p className="text-xs font-black text-slate-400 uppercase mb-4">La carpeta está lista pero vacía.</p>
                  <button onClick={abrirCrear} className="bg-[#C9A24B] text-white px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-sm hover:bg-[#b08d3c] transition-all">
                     Crear primer Pack aquí
                  </button>
               </div>
            )}
            {packsDeLaSeccion.map((pack) => (
              <div key={pack.id} className="bg-white/95 backdrop-blur-sm p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-[#C9A24B]/30 transition-all relative group flex flex-col justify-between min-h-[220px] text-left">
                <div className="absolute top-6 right-6 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => abrirEditar(pack)} className="p-2 text-slate-400 hover:text-[#0A111F] hover:bg-slate-100 rounded-xl transition-colors"><Edit3 size={16}/></button>
                  <button onClick={() => eliminarPlantilla(pack.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={16}/></button>
                </div>
                
                <div className="flex items-center gap-4 mb-4 text-left">
                  <div className="w-14 h-14 bg-[#0A111F] rounded-2xl flex items-center justify-center text-[#C9A24B] shrink-0">
                     {pack.icono_tipo ? (
                        <div className="w-8 h-8">
                          <svg viewBox="-10 -10 120 140" className="w-full h-full drop-shadow-sm">
                             <LogoRender iconoKey={pack.icono_tipo} hallazgo={pack.nombre} colorOverride="#C9A24B" />
                          </svg>
                        </div>
                     ) : (
                        <Package size={24} />
                     )}
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-black text-[#0A111F] uppercase leading-snug pr-8 line-clamp-2">{pack.nombre}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-1.5"><Layers size={12}/> {pack.items_count?.[0]?.count || 0} Tratamientos</p>
                  </div>
                </div>

                <div className="mt-4 pt-6 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Suma Real</span>
                  <span className="text-xl font-black text-[#C9A24B]">${Number(pack.precio_total).toLocaleString('es-CL')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODALES ENVUELTOS EN CREATEPORTAL */}
      {/* ========================================================================= */}
      
      {isMounted && typeof document !== 'undefined' ? createPortal(
        <>
          <AnimatePresence>
            {modalSeccionAbierto && (
              <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border border-slate-100">
                  <div className="p-8 bg-[#0A111F] text-[#C9A24B] flex justify-between items-center text-left">
                     <div className="flex items-center gap-3"><FolderPlus size={24} /><h2 className="text-xl font-black uppercase italic tracking-tight">Nueva Carpeta</h2></div>
                     <button onClick={() => setModalSeccionAbierto(false)} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-slate-300"><X size={16}/></button>
                  </div>
                  <div className="p-8 space-y-6 text-left">
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Nombre de la Carpeta</label>
                        <input 
                           autoFocus type="text" placeholder="Ej: ORTODONCIA, CIRUGÍA..." 
                           value={nombreNuevaSeccion} onChange={(e) => setNombreNuevaSeccion(e.target.value)} 
                           onKeyDown={(e) => e.key === 'Enter' && crearSeccionNueva()} 
                           className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] text-slate-900 shadow-sm placeholder:text-slate-400" 
                        />
                     </div>
                     <button onClick={crearSeccionNueva} className="w-full bg-[#0A111F] text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-2 mt-4">
                        Crear Carpeta
                     </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {modalAbierto && (
              <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] mt-4 md:mt-10 border border-slate-100">
                  <div className="p-6 md:p-8 bg-[#0A111F] text-[#C9A24B] flex justify-between items-center shrink-0 text-left">
                     <div className="text-left">
                        <h2 className="text-xl md:text-2xl font-black uppercase italic tracking-tight">{modo === 'crear' ? 'Diseñar Pack Clínico' : 'Editar Pack'}</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Guardando en sección: {seccionActiva}</p>
                     </div>
                     <button onClick={() => setModalAbierto(false)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-slate-300"><X size={20}/></button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#FBF8F2] relative text-left">
                    <div className="p-6 md:p-8 space-y-8 relative z-0">
                      
                      {/* Buscador de prestaciones */}
                      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-4 text-left relative z-20">
                        <label className="text-[10px] font-black text-[#0A111F] uppercase tracking-widest ml-1 block">Buscar y Agregar Prestaciones</label>
                        <div className="flex flex-col md:flex-row gap-3">
                          
                          {/* Buscador por nombre */}
                          <div className="flex-1 relative">
                            <input
                              type="text"
                              placeholder="BUSCAR PRESTACIÓN..."
                              value={busqueda}
                              onChange={(e) => { setBusqueda(e.target.value); setCategoriaSeleccionada(null); setIsCategoryDropdownOpen(false); setIsPrestacionDropdownOpen(false); }}
                              className="w-full py-4 px-5 rounded-2xl bg-white border border-slate-200 text-xs font-bold uppercase outline-none shadow-sm focus:border-[#C9A24B] placeholder:text-slate-400 text-slate-900"
                            />
                            {busqueda && (
                              <div className="absolute z-30 top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar text-left">
                                {prestacionesParaMostrar.length > 0 ? prestacionesParaMostrar.slice(0, 50).map(p => {
                                  const esInactiva = ['no', 'false', 'falso', '', 'n'].includes(String(p.Habilitado || '').trim().toLowerCase());
                                  return (
                                    <div key={p.id} onClick={() => toggleItem(p)} className={`p-4 border-b border-slate-100 transition-all flex items-center justify-between gap-3 text-left ${esInactiva ? 'bg-red-50 text-slate-400 cursor-not-allowed' : 'hover:bg-[#C9A24B]/10 cursor-pointer group'}`}>
                                      <div className="flex-1 min-w-0 text-left">
                                        <p className="text-[8px] font-black uppercase text-[#C9A24B] tracking-widest">{p["Nombre Categoria"]}</p>
                                        <p className={`text-[11px] font-bold uppercase leading-snug break-words mt-0.5 ${esInactiva ? 'line-through text-slate-400' : 'text-[#0A111F]'}`}>{p["Nombre Accion"]}</p>
                                      </div>
                                      <button onClick={(e) => { e.stopPropagation(); toggleItem(p); }} disabled={esInactiva} className={`w-24 text-center text-[10px] font-black uppercase tracking-widest py-2 rounded-xl bg-[#0A111F] text-[#C9A24B] hover:bg-[#1a2538] transition-colors ${esInactiva ? 'opacity-50 cursor-not-allowed bg-slate-300 text-white' : ''}`}>
                                        Agregar
                                      </button>
                                    </div>
                                  )
                                }) : <p className="p-6 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">No hay resultados</p>}
                              </div>
                            )}
                          </div>

                          {/* Dropdown de Categorías */}
                          <div className="relative">
                            <button onClick={() => {setIsCategoryDropdownOpen(p => !p); setIsPrestacionDropdownOpen(false);}} className="w-full md:w-56 flex items-center justify-between gap-2 py-4 px-5 rounded-2xl bg-white border border-slate-200 text-[11px] font-bold uppercase text-[#0A111F] hover:border-[#C9A24B] transition-colors shadow-sm">
                              <span className="truncate">{categoriaSeleccionada || 'POR CATEGORÍA'}</span>
                              <ChevronDown size={14} className={`transition-transform text-slate-400 ${isCategoryDropdownOpen ? 'rotate-180 text-[#C9A24B]' : ''}`} />
                            </button>
                            {isCategoryDropdownOpen && (
                              <div className="absolute z-20 top-full right-0 mt-2 w-full md:w-72 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar text-left">
                                {categoriasPrestaciones.map(cat => (
                                  <div key={cat} onClick={() => { setCategoriaSeleccionada(cat); setIsCategoryDropdownOpen(false); setBusqueda(''); setIsPrestacionDropdownOpen(true); }} className="p-4 text-[10px] font-black uppercase tracking-widest text-[#0A111F] hover:bg-[#C9A24B]/10 hover:text-[#C9A24B] cursor-pointer border-b border-slate-100 transition-colors">
                                    {cat}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Dropdown de Prestaciones por Categoría */}
                          <div className="relative">
                            <button onClick={() => setIsPrestacionDropdownOpen(p => !p)} disabled={!categoriaSeleccionada} className="w-full md:w-56 flex items-center justify-between gap-2 py-4 px-5 rounded-2xl bg-white border border-slate-200 text-[11px] font-bold uppercase text-[#0A111F] hover:border-[#C9A24B] transition-colors shadow-sm disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed">
                              <span className="truncate">VER PRESTACIONES</span>
                              <ChevronDown size={14} className={`transition-transform text-slate-400 ${isPrestacionDropdownOpen ? 'rotate-180 text-[#C9A24B]' : ''}`} />
                            </button>
                            {isPrestacionDropdownOpen && categoriaSeleccionada && (
                              <div className="absolute z-20 top-full right-0 mt-2 w-full md:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar text-left">
                                {prestacionesDeCategoria.length > 0 ? prestacionesDeCategoria.map(p => {
                                  const esInactiva = ['no', 'false', 'falso', '', 'n'].includes(String(p.Habilitado || '').trim().toLowerCase());
                                  return (
                                    <div key={p.id} onClick={() => toggleItem(p)} className={`p-4 border-b border-slate-100 transition-all flex items-center justify-between gap-3 text-left ${esInactiva ? 'bg-red-50 text-slate-400 cursor-not-allowed' : 'hover:bg-[#C9A24B]/10 cursor-pointer group'}`}>
                                      <p className={`text-[11px] font-bold uppercase leading-snug break-words flex-1 min-w-0 ${esInactiva ? 'line-through text-slate-400' : 'text-[#0A111F]'}`}>{p["Nombre Accion"]}</p>
                                      <button onClick={(e) => { e.stopPropagation(); toggleItem(p); }} disabled={esInactiva} className={`w-24 text-center text-[10px] font-black uppercase tracking-widest py-2 rounded-xl bg-[#0A111F] text-[#C9A24B] hover:bg-[#1a2538] transition-colors ${esInactiva ? 'opacity-50 cursor-not-allowed bg-slate-300 text-white' : ''}`}>
                                        Agregar
                                      </button>
                                    </div>
                                  )
                                }) : <p className="p-6 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">Vacio</p>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Nombre de la plantilla */}
                      <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 text-left relative z-10">
                        <label className="text-[10px] font-black text-[#0A111F] uppercase tracking-widest ml-1 block mb-2">Nombre del Pack</label>
                        <input 
                          type="text" 
                          placeholder="EJ: PLAN DE ORTODONCIA 12 MESES" 
                          value={nombrePlantilla} 
                          onChange={(e) => setNombrePlantilla(e.target.value)} 
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm md:text-lg uppercase outline-none focus:border-[#C9A24B] text-slate-900 transition-colors placeholder:text-slate-300" 
                        />
                      </div>

                      {/* Contenido de la plantilla */}
                      <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 text-left relative z-0">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                          <label className="text-[10px] font-black text-[#0A111F] uppercase tracking-widest ml-1 block">Contenido del Pack</label>
                          <div className="flex gap-2 w-full md:w-auto">
                            <input
                              type="text"
                              value={nombreNuevaSeccionPack}
                              onChange={(e) => setNombreNuevaSeccionPack(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if(nombreNuevaSeccionPack.trim()){ setSeccionesPack([...seccionesPack, nombreNuevaSeccionPack.trim().toUpperCase()]); setNombreNuevaSeccionPack(''); } } }}
                              placeholder="NOMBRE NUEVA SECCIÓN"
                              className="flex-1 md:flex-none p-3.5 border border-slate-200 bg-slate-50 rounded-xl text-[10px] font-bold uppercase outline-none focus:border-[#C9A24B] placeholder:text-slate-400"
                            />
                            <button 
                              type="button" 
                              onClick={() => { if(nombreNuevaSeccionPack.trim()){ setSeccionesPack([...seccionesPack, nombreNuevaSeccionPack.trim().toUpperCase()]); setNombreNuevaSeccionPack(''); } }} 
                              className="px-5 py-3.5 bg-[#0A111F] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#1a2538] transition-colors flex items-center justify-center gap-2 shrink-0"
                            >
                              <Plus size={14} /> Sección
                            </button>
                          </div>
                        </div>

                        <div className="bg-[#FBF8F2] p-4 md:p-6 rounded-[1.5rem] border border-slate-100 min-h-[200px] text-left">
                          {itemsSeleccionados.length === 0 && seccionesPack.length === 0 ? (
                            <div className="py-12 text-center flex flex-col items-center opacity-60">
                              <Package size={32} className="text-[#C9A24B] mb-3"/>
                              <p className="text-[10px] font-black text-[#0A111F] uppercase tracking-widest">Aún no hay prestaciones en este pack</p>
                            </div>
                          ) : (
                            <div className="space-y-6 text-left">
                              {seccionesPack.map(seccionNombre => {
                                  const itemsEnSeccion = itemsSeleccionados.filter(it => it.seccion === seccionNombre);
                                  return (
                                      <div 
                                        key={seccionNombre}
                                        onDragOver={(e) => { e.preventDefault(); setDragOverSection(seccionNombre); }}
                                        onDragLeave={() => setDragOverSection(null)}
                                        onDrop={() => handleDrop(seccionNombre)}
                                        className={`p-4 md:p-5 rounded-2xl transition-colors border border-transparent ${dragOverSection === seccionNombre ? 'bg-[#C9A24B]/10 border-[#C9A24B]/30' : 'bg-white shadow-sm'}`}
                                      >
                                          <div className="flex justify-between items-center text-left">
                                            <h4 className="text-[11px] font-black text-[#0A111F] uppercase tracking-[0.2em]">{seccionNombre}</h4>
                                            <button onClick={() => setSeccionesPack(seccionesPack.filter(s => s !== seccionNombre))} className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors">
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                          <div className="border-t border-slate-100 mt-3 pt-4 space-y-3 text-left">
                                            {itemsEnSeccion.length > 0 ? (
                                                itemsEnSeccion.map(item => <ItemEnResumen key={item.instanceId} item={item} setModalIcono={setModalIcono} setItemsSeleccionados={setItemsSeleccionados} itemsSeleccionados={itemsSeleccionados} setDraggedItemId={setDraggedItemId} draggedItemId={draggedItemId} />)
                                            ) : (
                                                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold text-center py-4 opacity-50">Arrastra una prestación aquí</p>
                                            )}
                                          </div>
                                      </div>
                                  );
                              })}

                              {itemsSeleccionados.filter(it => !it.seccion).length > 0 && (
                                  <div
                                    onDragOver={(e) => { e.preventDefault(); setDragOverSection('sin-asignar'); }}
                                    onDragLeave={() => setDragOverSection(null)}
                                    onDrop={() => handleDrop(null)}
                                    className={`p-4 md:p-5 rounded-2xl transition-colors border border-transparent ${dragOverSection === 'sin-asignar' ? 'bg-[#C9A24B]/10 border-[#C9A24B]/30' : 'bg-white shadow-sm'}`}
                                  >
                                      <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Prestaciones sin sección</h4>
                                      <div className="border-t border-slate-100 mt-3 pt-4 space-y-3 text-left">
                                        {itemsSeleccionados.filter(it => !it.seccion).map(item => (
                                          <ItemEnResumen key={item.instanceId} item={item} setModalIcono={setModalIcono} setItemsSeleccionados={setItemsSeleccionados} itemsSeleccionados={itemsSeleccionados} setDraggedItemId={setDraggedItemId} draggedItemId={draggedItemId} />
                                        ))}
                                      </div>
                                  </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 md:p-8 bg-white border-t border-slate-100 space-y-5 shrink-0 text-left">
                      <div className="flex justify-between items-center bg-[#FBF8F2] p-5 md:p-6 rounded-[1.5rem] border border-slate-100">
                          <span className="text-[10px] font-black text-[#0A111F] uppercase tracking-[0.2em]">Suma Total <span className="hidden md:inline">(Sin descuentos ni convenios)</span></span>
                          <span className="text-2xl font-black text-[#C9A24B]">${valorRealTotal.toLocaleString('es-CL')}</span>
                      </div>
                      <div className="flex flex-col md:flex-row gap-3">
                        <button onClick={() => setModalAbierto(false)} className="w-full md:w-auto md:flex-1 bg-slate-100 text-slate-500 py-4 md:py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-colors">
                          Cancelar
                        </button>
                        <button onClick={handleGuardarPlantilla} disabled={guardando || itemsSeleccionados.length === 0 || !nombrePlantilla.trim()} className="w-full md:w-[60%] bg-[#0A111F] text-white py-4 md:py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:bg-slate-300">
                          {guardando ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>}
                          {modo === 'crear' ? 'Guardar Nuevo Pack' : 'Guardar Cambios'}
                        </button>
                      </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {modalIcono.abierto && (
              <div className="fixed inset-0 z-[9999999] bg-[#0A111F]/70 backdrop-blur-sm flex items-center justify-center p-4 text-left">
                 <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden text-left flex flex-col max-h-[85vh] border border-slate-100">
                    <div className="p-6 md:p-8 bg-[#0A111F] text-[#C9A24B] flex justify-between items-center shrink-0">
                      <h3 className="text-lg md:text-xl font-black uppercase italic tracking-tight">
                         {modalIcono.esParaPack ? 'Icono del Pack' : 'Asignar Icono'}
                      </h3>
                      <button onClick={() => setModalIcono({abierto: false, prestacion: null, esParaPack: false})} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-slate-300"><X size={16}/></button>
                    </div>
                    
                    <div className="p-6 bg-[#FBF8F2] border-b border-slate-100 shrink-0 text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Selecciona el dibujo para:</p>
                      <span className="text-[13px] font-black text-[#0A111F] uppercase leading-snug">
                         {modalIcono.esParaPack ? (nombrePlantilla || 'NUEVO PACK') : modalIcono.prestacion?.["Nombre Accion"]}
                      </span>
                      <p className="text-[9px] font-bold text-slate-500 mt-2 uppercase tracking-wide">
                         {modalIcono.esParaPack ? 'Este icono representará al pack en las carpetas.' : 'Este icono se dibujará en el Odontograma.'}
                      </p>
                    </div>

                    <div className="p-6 md:p-8 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 gap-4 custom-scrollbar flex-1 bg-white">
                       {ICONOS_DISPONIBLES.map(ico => (
                          <button key={ico.id} onClick={() => handleGuardarIcono(ico.id)} className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:border-[#C9A24B] rounded-2xl border border-slate-100 shadow-sm transition-all group hover:bg-[#C9A24B]/5 hover:shadow-md">
                            <div className="w-10 h-10 mb-3 group-hover:scale-110 transition-transform">
                               <svg viewBox="-10 -10 120 140" className="w-full h-full drop-shadow-sm">
                                   <LogoRender iconoKey={ico.id} hallazgo={ico.label} colorOverride="#0A111F" />
                               </svg>
                            </div>
                            <span className="text-[9px] font-black uppercase text-slate-500 group-hover:text-[#0A111F] text-center leading-tight tracking-wide">{ico.label}</span>
                          </button>
                       ))}
                    </div>
                    
                    <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
                       <button onClick={() => handleGuardarIcono(null)} className="flex items-center gap-2 px-5 py-3.5 text-[9px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 hover:border-red-200 rounded-xl transition-all border border-red-100 bg-white shadow-sm">
                          <Trash2 size={14}/> Quitar
                       </button>
                       <button onClick={() => setModalIcono({abierto: false, prestacion: null, esParaPack: false})} className="px-6 py-3.5 bg-[#0A111F] text-white hover:bg-[#1a2538] transition-all rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm">
                          Cancelar
                       </button>
                    </div>
                 </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>,
        document.body
      ) : null}

    </main>
  )
}

function ItemEnResumen({ item, setModalIcono, setItemsSeleccionados, itemsSeleccionados, setDraggedItemId, draggedItemId }: any) {
  return (
    <div 
      draggable 
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.instanceId); if(setDraggedItemId) setDraggedItemId(item.instanceId); }}
      onDragEnd={() => { if(setDraggedItemId) setDraggedItemId(null); }}
      className={`p-3 md:p-4 rounded-2xl bg-white border border-slate-100 shadow-sm group flex flex-col cursor-grab active:cursor-grabbing transition-opacity ${draggedItemId === item.instanceId ? 'opacity-40 border-[#C9A24B] bg-[#C9A24B]/5' : 'opacity-100 hover:border-slate-200'} text-left`}
    >
      <div className="flex justify-between items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
          <button
            onClick={() => setModalIcono({ abierto: true, prestacion: item, esParaPack: false })}
            title="Cambiar Logo Permanentemente"
            className="w-10 h-10 shrink-0 flex items-center justify-center bg-slate-50 hover:bg-[#C9A24B]/10 border border-slate-100 hover:border-[#C9A24B]/50 rounded-xl transition-all group/resumenlogo relative overflow-hidden"
          >
            <div className="w-6 h-6 group-hover/resumenlogo:opacity-0 transition-opacity flex items-center justify-center">
              <svg viewBox="-10 -10 120 140" className="w-full h-full drop-shadow-sm">
                <LogoRender iconoKey={item.icono_tipo} hallazgo={item["Nombre Accion"]} colorOverride="#0A111F" />
              </svg>
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/resumenlogo:opacity-100 transition-opacity text-[#C9A24B] flex-col">
              <Edit3 size={14} />
            </div>
          </button>

          <span className="text-[10px] md:text-[11px] font-bold uppercase leading-snug text-[#0A111F] truncate">{item["Nombre Accion"]}</span>
        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-100 rounded-lg p-0.5">
            <button onClick={() => { const n = Math.max(1, item.cantidad - 1); setItemsSeleccionados((prev: any[]) => prev.map(i => i.instanceId === item.instanceId ? {...i, cantidad: n} : i)) }} className="w-7 h-7 rounded-md hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"><Minus size={14} /></button>
            <span className="font-black text-xs w-5 text-center text-[#0A111F]">{item.cantidad}</span>
            <button onClick={() => setItemsSeleccionados((prev: any[]) => prev.map(i => i.instanceId === item.instanceId ? { ...i, cantidad: i.cantidad + 1 } : i)) } className="w-7 h-7 rounded-md bg-[#0A111F] hover:bg-[#1a2538] text-[#C9A24B] flex items-center justify-center transition-colors"><Plus size={14} /></button>
          </div>
          <span className="font-bold text-[#C9A24B] text-[10px] md:text-[11px] w-16 md:w-20 text-right">${(item.Precio * item.cantidad).toLocaleString('es-CL')}</span>
          <button onClick={() => setItemsSeleccionados((prev: any[]) => prev.filter(i => i.instanceId !== item.instanceId))} className="text-slate-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 shrink-0 transition-colors"><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  )
}

function LogoRender({ hallazgo, iconoKey, colorOverride, isRealizado, isPendiente }: { hallazgo?: string, iconoKey?: string, colorOverride?: string, isRealizado?: boolean, isPendiente?: boolean }) {
  const originalName = (hallazgo || "").toLowerCase();
  const explicitIcon = (iconoKey || "").toLowerCase();
  const h = explicitIcon || originalName; 
  
  const isLesion = LESIONES_LISTA.some(l => l.toLowerCase() === originalName);
  const isMalEstado = originalName.includes("mal estado") || originalName.includes("fractu") || originalName.includes("infec");
  
  let color = "#0A111F"; // Default Navy
  if (colorOverride) color = colorOverride;
  else if (isRealizado) color = "#C9A24B"; // Gold for realized
  else if (isPendiente) color = "#ef4444"; 
  else if (isLesion) color = "#0A111F"; 

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
  
  if (h.includes("extrac") || h.includes("exodoncia")) return <g stroke={color} strokeWidth="12" strokeLinecap="round" opacity="0.8"><line x1="20" y1="20" x2="80" y2="80" /><line x1="80" y1="20" x2="20" y2="80" /></g>;
  if (h.includes("limpieza") || h.includes("pulido") || h.includes("destartraje") || h.includes("profilaxis")) return <g fill={fill}><circle cx="30" cy="30" r="10"/><circle cx="70" cy="40" r="8"/><circle cx="40" cy="70" r="12"/></g>;
  if (h.includes("rayos") || h.includes("radiografia") || h.includes("scanner") || h.includes("panoramica")) return <g stroke={color} strokeWidth="6" fill="none"><rect x="20" y="20" width="60" height="60" rx="4" /><circle cx="50" cy="50" r="15"/></g>;
  if (h.includes("sano")) return <path d="M 25 50 L 45 70 L 80 30" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  
  if (h === "default" || h.includes("otro")) return <circle cx="50" cy="50" r="20" fill={fill} opacity="0.8" />;
  
  return <circle cx="50" cy="50" r="20" fill={fill} opacity="0.8" />;
}

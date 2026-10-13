'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import { 
  BookOpen, Plus, Loader2, X, Layers, FolderPlus, Search, Tag, Edit3, Save, BookMarked
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import Link from 'next/link'

export default function ArancelesCategoriasPage() {
  const router = useRouter()
  const [categorias, setCategorias] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [allPrestaciones, setAllPrestaciones] = useState<any[]>([]) 
  const [nombreNuevaCat, setNombreNuevaCat] = useState('')
  const [creando, setCreando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  
  // Estados para doctores
  const [profesionales, setProfesionales] = useState<any[]>([])

  // Estados para el modal de edición de prestación
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false)
  const [itemAEditar, setItemAEditar] = useState<any | null>(null)
  const [editando, setEditando] = useState(false)
  
  // Estados para el reparto de categorías
  const [tipoRepartoNuevaCat, setTipoRepartoNuevaCat] = useState<'general'|'doctor'|'clinica'|'forzado'>('general')
  const [profesionalRepartoNuevaCat, setProfesionalRepartoNuevaCat] = useState('')
  const [porcentajeForzadoNuevaCat, setPorcentajeForzadoNuevaCat] = useState<number | ''>('')
  
  const [modalEditarCatAbierto, setModalEditarCatAbierto] = useState(false)
  const [catAEditar, setCatAEditar] = useState<{nombre: string, tipo_reparto: string, profesional_id?: string | null, porcentaje_forzado?: number | null} | null>(null)
  
  // Estado para los Portals
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    fetchData()
  }, [])

  async function fetchData() {
    setCargando(true)
    try {
      // 1. Obtener todas las prestaciones
      const { data: prestacionesData, error: prestError } = await supabase
        .from('prestaciones')
        .select('id, "Nombre Accion", "Nombre Categoria", "Nombre", "Precio"')
      if (prestError) throw prestError
      setAllPrestaciones(prestacionesData || [])

      // 2. Obtener lista de profesionales activos
      const { data: profsData } = await supabase.from('profesionales').select('user_id, nombre, apellido').eq('activo', true)
      setProfesionales(profsData || [])

      // 3. Obtener el tipo de reparto y doctor vinculado (reglas de categoría)
      const { data: catsData } = await supabase.from('categorias_prestaciones').select('nombre, tipo_reparto, profesional_id, porcentaje_forzado')
      const map: Record<string, any> = {}
      catsData?.forEach(c => { 
        map[c.nombre] = { tipo: c.tipo_reparto, profesional_id: c.profesional_id, porcentaje_forzado: c.porcentaje_forzado }
      })

      // 4. Unir categorías de prestaciones y categorías con reglas para no omitir ninguna
      const catsDePrestaciones = [...new Set(prestacionesData?.map(p => p['Nombre Categoria']) || [])].filter(Boolean)
      const catsConRegla = catsData?.map(c => c.nombre) || []
      const todasLasCategoriasNombres = [...new Set([...catsDePrestaciones, ...catsConRegla])]

      // 5. Unir la información para renderizar las tarjetas
      const categoriasFinal = todasLasCategoriasNombres.map(c => ({ 
        nombre: c,
        tipo_reparto: map[c]?.tipo || 'general',
        profesional_id: map[c]?.profesional_id || null,
        porcentaje_forzado: map[c]?.porcentaje_forzado || null
      })).sort((a, b) => a.nombre.localeCompare(b.nombre));

      setCategorias(categoriasFinal)

    } catch (err: any) {
      toast.error("Error al cargar categorías: " + err.message)
    } finally {
      setCargando(false)
    }
  }

  const handleCrearCategoria = async () => {
    if (!nombreNuevaCat.trim()) return toast.error("Escribe un nombre para la categoría")
    if (tipoRepartoNuevaCat === 'doctor' && !profesionalRepartoNuevaCat) return toast.error("Debes seleccionar un doctor")
    if (tipoRepartoNuevaCat === 'forzado' && (!porcentajeForzadoNuevaCat || Number(porcentajeForzadoNuevaCat) <= 0)) return toast.error("Debes ingresar un porcentaje válido")
    
    setCreando(true)
    try {
      const { error } = await supabase.from('prestaciones').insert({
        'Nombre Categoria': nombreNuevaCat.trim(),
        'Nombre Accion': 'Acción de Ejemplo (Puedes borrarla)',
        'Precio': 0,
        'Habilitado': 'No'
      })
      if (error) throw error
      
      // Guardar en la base de datos la regla y el doctor
      const { error: reglaError } = await supabase.from('categorias_prestaciones').upsert({
        nombre: nombreNuevaCat.trim(),
        tipo_reparto: tipoRepartoNuevaCat,
        profesional_id: tipoRepartoNuevaCat === 'doctor' ? profesionalRepartoNuevaCat : null,
        porcentaje_forzado: tipoRepartoNuevaCat === 'forzado' ? Number(porcentajeForzadoNuevaCat) : null 
      }, { onConflict: 'nombre' })

      if (reglaError) throw reglaError

      toast.success("Categoría creada con éxito.")
      setModalAbierto(false)
      setNombreNuevaCat('')
      setTipoRepartoNuevaCat('general')
      setProfesionalRepartoNuevaCat('')
      setPorcentajeForzadoNuevaCat('') 
      fetchData() 
    } catch (err: any) {
      toast.error("Error al crear la categoría: " + err.message)
    } finally {
      setCreando(false)
    }
  }

  const handleGuardarRepartoCat = async () => {
    if (!catAEditar) return;
    if (catAEditar.tipo_reparto === 'doctor' && !catAEditar.profesional_id) return toast.error("Debes seleccionar un doctor")

    try {
      const { error } = await supabase.from('categorias_prestaciones').upsert({
        nombre: catAEditar.nombre,
        tipo_reparto: catAEditar.tipo_reparto,
        profesional_id: catAEditar.tipo_reparto === 'doctor' ? catAEditar.profesional_id : null,
        porcentaje_forzado: catAEditar.tipo_reparto === 'forzado' ? Number(catAEditar.porcentaje_forzado) : null
      }, { onConflict: 'nombre' });
      
      if (error) throw error;

      toast.success("Reparto de la categoría actualizado");
      setModalEditarCatAbierto(false);
      fetchData();
    } catch (error: any) {
      toast.error("Error al actualizar: " + error.message);
    }
  }

  const handleGuardarCambios = async () => {
    if (!itemAEditar) return;
    const nombre = itemAEditar['Nombre Accion']?.trim();
    const precio = Number(itemAEditar.Precio);

    if (!nombre) return toast.error("El nombre no puede estar vacío.");
    if (isNaN(precio)) return toast.error("El precio debe ser un número.");

    setEditando(true);
    try {
        const { data: originalItem, error: fetchError } = await supabase
            .from('prestaciones')
            .select('"Nombre Accion", "Precio"')
            .eq('id', itemAEditar.id)
            .single();

        if (fetchError || !originalItem) throw new Error("No se pudo encontrar la prestación original.");

        const updates: { [key: string]: any } = {};
        let detallesCambio = [];

        if (nombre !== originalItem['Nombre Accion']) {
            updates['Nombre Accion'] = nombre;
            updates['Nombre'] = nombre; 
            detallesCambio.push(`nombre de "${originalItem['Nombre Accion']}" a "${nombre}"`);
        }
        if (precio !== originalItem.Precio) {
            updates['Precio'] = precio;
            detallesCambio.push(`precio de $${Number(originalItem.Precio || 0).toLocaleString('es-CL')} a $${precio.toLocaleString('es-CL')}`);
        }

        if (Object.keys(updates).length === 0) {
            toast.info("No se realizaron cambios.");
            setModalEditarAbierto(false);
            return;
        }

        const { error: updateError } = await supabase.from('prestaciones').update(updates).eq('id', itemAEditar.id);
        if (updateError) throw updateError;

        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('auditoria_clinica').insert([{
            usuario_id: user?.id,
            accion: 'UPDATE / PRESTACION',
            tabla: 'prestaciones',
            detalles: `Editó la prestación (ID: ${itemAEditar.id.substring(0, 8)}...). Cambió ${detallesCambio.join(' y ')}.`
        }]);

        setAllPrestaciones(prev => prev.map(p => p.id === itemAEditar.id ? { ...p, ...updates } : p));
        toast.success("Prestación actualizada.");
        setModalEditarAbierto(false);
        setItemAEditar(null);
    } catch (err: any) {
        toast.error("Error al guardar los cambios: " + err.message);
    } finally {
        setEditando(false);
    }
  }

  const prestacionesFiltradas = useMemo(() => {
    if (!busqueda) return [];
    const busquedaLower = busqueda.toLowerCase();
    return allPrestaciones.filter(prest => {
      const prestacionName = (prest["Nombre Accion"] || prest["Nombre"] || '').toLowerCase();
      return prestacionName.includes(busquedaLower);
    });
  }, [busqueda, allPrestaciones]);

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#FBF8F2] gap-4">
      <Loader2 className="animate-spin text-[#C9A24B]" size={40}/>
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando arancel...</p>
    </div>
  )

  return (
    <main className="min-h-screen bg-[#FBF8F2] p-6 md:p-10 font-sans text-slate-900 relative overflow-hidden z-0">
      
      {/* IMAGEN DE FONDO GLOBAL */}
      <div 
        className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"
      ></div>

      <div className="max-w-7xl mx-auto space-y-8 relative z-10 text-left">
        
        {/* HEADER TIPO TARJETA BLANCA */}
        <header className="bg-white/90 backdrop-blur-md p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 text-left">
          <div className="flex items-center gap-5 text-left w-full md:w-auto">
            <div className="bg-[#0A111F] w-16 h-16 rounded-full flex items-center justify-center text-[#C9A24B] shadow-lg shrink-0">
              <BookMarked size={28} />
            </div>
            <div className="text-left">
              <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight text-left">
                ARANCEL DE PRESTACIONES
              </h1>
              <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1.5 text-left">
                Agrupado por Categorías
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => setModalAbierto(true)}
            className="bg-[#0A111F] text-white px-6 py-4 rounded-full font-bold text-[11px] uppercase tracking-wider hover:bg-[#1a2538] transition-all shadow-md flex items-center justify-center gap-2 shrink-0 w-full md:w-auto text-left"
          >
            <Plus size={16} /> Nueva Categoría
          </button>
        </header>

        {/* BUSCADOR */}
        <div className="relative group max-w-md text-left">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#C9A24B] transition-colors" size={18} />
          <input 
            type="text"
            placeholder="BUSCAR PRESTACIÓN POR NOMBRE..."
            className="w-full bg-white/95 backdrop-blur-sm p-4 pl-12 pr-6 rounded-full border border-slate-200 shadow-sm outline-none focus:border-[#C9A24B] transition-all font-bold text-xs uppercase text-slate-900 placeholder:text-slate-400"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {/* GRILLA DE CATEGORÍAS O PRESTACIONES FILTRADAS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
          {!busqueda ? (
            <>
              {categorias.length === 0 ? (
                <div className="col-span-full text-center py-24 bg-white/95 backdrop-blur-sm rounded-[2.5rem] border border-slate-100 shadow-sm">
                    <Layers size={48} className="mx-auto text-slate-300 mb-4 opacity-60"/>
                    <p className="font-black text-[#0A111F] uppercase text-sm tracking-tight">No hay categorías de aranceles.</p>
                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Crea la primera para empezar a organizar tus prestaciones.</p>
                </div>
              ) : ( 
                categorias.map((cat) => {
                  const profVinculado = cat.profesional_id ? profesionales.find(p => p.user_id === cat.profesional_id) : null;
                  const totalItemsCat = allPrestaciones.filter(p => p['Nombre Categoria'] === cat.nombre).length;
                  
                  return (
                    <div key={cat.nombre} className="relative group text-left">
                      <div className="relative h-full text-left">
                        <Link href={`/administracion/configuracion/aranceles/${encodeURIComponent(cat.nombre)}`} className="block h-full text-left">
                          <motion.div whileHover={{ y: -4 }} className="bg-white/95 backdrop-blur-sm p-8 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer h-full flex flex-col justify-between text-left">
                            <div className="flex items-center gap-4 text-left">
                              <div className="w-12 h-12 bg-[#C9A24B]/10 rounded-2xl flex items-center justify-center text-[#C9A24B] shrink-0">
                                <BookOpen size={22}/>
                              </div>
                              <div className="text-left overflow-hidden">
                                <h3 className="text-base font-black text-[#0A111F] uppercase italic leading-tight truncate text-left">{cat.nombre}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 text-left">{totalItemsCat} prestaciones</p>
                              </div>
                            </div>
                            
                            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-left">
                              <span className="text-[9px] font-black uppercase text-slate-400">Reparto de pago:</span>
                              <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md tracking-wider ${
                                cat.tipo_reparto === 'doctor' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                cat.tipo_reparto === 'clinica' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                cat.tipo_reparto === 'forzado' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                'bg-slate-50 text-slate-600 border border-slate-200'
                              }`}>
                                {cat.tipo_reparto === 'doctor' ? `100% Dr. ${profVinculado ? profVinculado.apellido : ''}` : 
                                 cat.tipo_reparto === 'clinica' ? '100% Clínica' : 
                                 cat.tipo_reparto === 'forzado' ? `${cat.porcentaje_forzado}% Fijo Doctor` :
                                 'General (%)'}
                              </span>
                            </div>
                          </motion.div>
                        </Link>

                        <div className="absolute top-4 right-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCatAEditar(cat); setModalEditarCatAbierto(true); }} className="p-2.5 bg-white rounded-full shadow-sm text-slate-400 hover:text-[#C9A24B] border border-slate-200 transition-colors" title="Editar Regla de Pago">
                            <Edit3 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </>
          ) : (
            <>
              {prestacionesFiltradas.length === 0 ? (
                <div className="col-span-full text-center py-24 bg-white/95 backdrop-blur-sm rounded-[2.5rem] border border-slate-100 shadow-sm">
                    <Search size={48} className="mx-auto text-slate-300 mb-4 opacity-60"/>
                    <p className="font-black text-[#0A111F] uppercase text-sm tracking-tight">No se encontraron prestaciones.</p>
                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Intenta con otro término de búsqueda.</p>
                </div>
              ) : (
                prestacionesFiltradas.map((prest) => (
                    <motion.div 
                      key={prest.id}
                      whileHover={{ y: -4 }} 
                      onClick={() => router.push(`/administracion/configuracion/aranceles/${encodeURIComponent(prest['Nombre Categoria'])}`)}
                      className="bg-white/95 backdrop-blur-sm p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between h-full relative text-left"
                    >
                        <div>
                            <div className="flex items-start justify-between">
                                <div className="w-12 h-12 bg-[#C9A24B]/10 rounded-2xl flex items-center justify-center text-[#C9A24B]"><Tag size={20}/></div>
                                <span className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-100">${Number(prest.Precio || 0).toLocaleString('es-CL')}</span>
                            </div>
                            <h3 className="text-base font-black text-[#0A111F] uppercase italic leading-tight mt-4 group-hover:text-[#C9A24B] transition-colors">{prest['Nombre Accion']}</h3>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-6 border-t border-slate-100 pt-4">Categoría: {prest['Nombre Categoria']}</p>
                        
                        <div className="absolute bottom-4 right-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setItemAEditar({...prest}); setModalEditarAbierto(true); }} 
                                className="p-2.5 bg-white rounded-full shadow-sm text-slate-400 hover:text-[#C9A24B] border border-slate-200 transition-colors"
                                title="Editar Prestación"
                            >
                                <Edit3 size={14} />
                            </button>
                        </div>
                    </motion.div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODALES ENVOLVIDOS EN CREATEPORTAL */}
      {/* ========================================================================= */}
      {isMounted && typeof document !== 'undefined' ? createPortal(
        <>
          {/* MODAL NUEVA CATEGORÍA */}
          <AnimatePresence>
            {modalAbierto && (
              <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} className="bg-white w-full max-w-md rounded-[3rem] p-8 md:p-10 shadow-2xl relative border border-slate-100 text-left">
                  <button onClick={() => setModalAbierto(false)} className="absolute top-8 right-8 p-2 bg-slate-50 rounded-full text-slate-400 hover:text-red-500 transition-colors"><X size={20}/></button>
                  <h2 className="text-xl font-black text-[#0A111F] tracking-tight uppercase italic leading-none mb-6">Nueva Categoría</h2>
                  <div className="space-y-5 text-left">
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 block">Nombre de la Categoría</label>
                      <input autoFocus className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] text-slate-900 shadow-sm" value={nombreNuevaCat} onChange={(e) => setNombreNuevaCat(e.target.value)} placeholder="Ej: Endodoncia..." />
                    </div>
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 block">Vincular a</label>
                      <select
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] text-slate-900 shadow-sm cursor-pointer"
                        value={tipoRepartoNuevaCat}
                        onChange={(e) => setTipoRepartoNuevaCat(e.target.value as any)}
                      >
                        <option value="general">General (según % contrato del doctor)</option>
                        <option value="doctor">100% Doctor</option>
                        <option value="clinica">100% Clínica</option>
                        <option value="forzado">% Personalizado Fijo</option>
                      </select>
                    </div>
                    {tipoRepartoNuevaCat === 'forzado' && (
                      <div className="space-y-2 text-left">
                        <label className="text-[10px] font-black text-[#C9A24B] uppercase tracking-widest ml-2 block">Porcentaje para el Doctor (%)</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            min="0" max="100"
                            placeholder="Ej: 15"
                            className="w-full p-4 bg-[#C9A24B]/10 text-[#0A111F] rounded-2xl font-bold text-xs border border-[#C9A24B]/30 outline-none uppercase shadow-sm"
                            value={porcentajeForzadoNuevaCat}
                            onChange={(e) => setPorcentajeForzadoNuevaCat(Number(e.target.value))}
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-[#C9A24B]">%</span>
                        </div>
                      </div>
                    )}
                    {tipoRepartoNuevaCat === 'doctor' && (
                      <div className="space-y-2 text-left">
                        <label className="text-[10px] font-black text-[#C9A24B] uppercase tracking-widest ml-2 block">Seleccionar Doctor</label>
                        <select
                          className="w-full p-4 bg-[#C9A24B]/10 text-[#0A111F] rounded-2xl font-bold text-xs border border-[#C9A24B]/30 outline-none uppercase shadow-sm cursor-pointer"
                          value={profesionalRepartoNuevaCat}
                          onChange={(e) => setProfesionalRepartoNuevaCat(e.target.value)}
                        >
                          <option value="">-- Elija un Doctor --</option>
                          {profesionales.map(p => (
                            <option key={p.user_id} value={p.user_id}>Dr(a). {p.nombre} {p.apellido}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-400 font-medium px-1">Se creará una prestación de ejemplo dentro de esta categoría para que no quede vacía. Podrás editarla o borrarla después.</p>
                    <button onClick={handleCrearCategoria} disabled={creando} className="w-full bg-[#0A111F] text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 disabled:bg-slate-300 mt-4">
                      {creando ? <Loader2 className="animate-spin" size={18} /> : <FolderPlus size={18} />} 
                      Crear Categoría
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* MODAL EDITAR PRESTACIÓN */}
          <AnimatePresence>
            {modalEditarAbierto && itemAEditar && (
              <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} className="bg-white w-full max-w-md rounded-[3rem] p-8 md:p-10 shadow-2xl relative border border-slate-100 text-left">
                  <button onClick={() => setModalEditarAbierto(false)} className="absolute top-8 right-8 p-2 bg-slate-50 rounded-full text-slate-400 hover:text-red-500 transition-colors"><X size={20}/></button>
                  <h2 className="text-xl font-black text-[#0A111F] tracking-tight uppercase italic leading-none mb-6">Editar Prestación</h2>
                  <div className="space-y-5 text-left">
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 block">Nombre de la Prestación</label>
                      <input 
                        autoFocus 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] text-slate-900 shadow-sm" 
                        value={itemAEditar['Nombre Accion']} 
                        onChange={(e) => setItemAEditar((prev: any) => ({...prev, 'Nombre Accion': e.target.value}))} 
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 block">Precio ($)</label>
                      <input 
                        type="number"
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] text-slate-900 shadow-sm" 
                        value={itemAEditar.Precio} 
                        onChange={(e) => setItemAEditar((prev: any) => ({...prev, 'Precio': e.target.value}))} 
                      />
                    </div>
                    <button onClick={handleGuardarCambios} disabled={editando} className="w-full bg-[#0A111F] text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 disabled:bg-slate-300 mt-4">
                      {editando ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} 
                      Guardar Cambios
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* MODAL EDITAR CATEGORÍA Y REPARTO */}
          <AnimatePresence>
            {modalEditarCatAbierto && catAEditar && (
              <div className="fixed inset-0 bg-[#0A111F]/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-4 text-left">
                <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} className="bg-white w-full max-w-md rounded-[3rem] p-8 md:p-10 shadow-2xl relative border border-slate-100 text-left">
                  <button onClick={() => setModalEditarCatAbierto(false)} className="absolute top-8 right-8 p-2 bg-slate-50 rounded-full text-slate-400 hover:text-red-500 transition-colors"><X size={20}/></button>
                  <h2 className="text-xl font-black text-[#0A111F] tracking-tight uppercase italic leading-none mb-1">Editar Categoría</h2>
                  <p className="text-xs font-bold text-[#C9A24B] uppercase tracking-widest mb-6">{catAEditar.nombre}</p>
                  
                  <div className="space-y-5 text-left">
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 block">Vincular ganancia a</label>
                      <select
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs uppercase outline-none focus:border-[#C9A24B] text-slate-900 shadow-sm cursor-pointer"
                        value={catAEditar.tipo_reparto}
                        onChange={(e) => setCatAEditar({...catAEditar, tipo_reparto: e.target.value, profesional_id: e.target.value === 'doctor' ? catAEditar.profesional_id : null})}
                      >
                        <option value="general">General (según % contrato del doctor)</option>
                        <option value="doctor">100% Doctor</option>
                        <option value="clinica">100% Clínica</option>
                        <option value="forzado">% Personalizado Fijo</option>
                      </select>
                    </div>

                    {catAEditar.tipo_reparto === 'doctor' && (
                      <div className="space-y-2 text-left">
                        <label className="text-[10px] font-black text-[#C9A24B] uppercase tracking-widest ml-2 block">Seleccionar Doctor</label>
                        <select
                          className="w-full p-4 bg-[#C9A24B]/10 text-[#0A111F] rounded-2xl font-bold text-xs border border-[#C9A24B]/30 outline-none uppercase shadow-sm cursor-pointer"
                          value={catAEditar.profesional_id || ''}
                          onChange={(e) => setCatAEditar({...catAEditar, profesional_id: e.target.value})}
                        >
                          <option value="">-- Elija un Doctor --</option>
                          {profesionales.map(p => (
                            <option key={p.user_id} value={p.user_id}>Dr(a). {p.nombre} {p.apellido}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    <button onClick={handleGuardarRepartoCat} className="w-full bg-[#0A111F] text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 mt-4">
                      <Save size={18} /> Guardar Cambios
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

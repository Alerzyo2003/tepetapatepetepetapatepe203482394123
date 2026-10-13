'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DOMPurify from 'isomorphic-dompurify'
import { 
  ArrowLeft, Type, AlignLeft, Image as ImageIcon, 
  Minus, Columns, Eye, Save, Trash2, ChevronUp, 
  ChevronDown, Loader2, X, EyeOff,
  UploadCloud, Layout, List, CheckSquare, AlignJustify, Plus,
  FileText
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

export default function ConstructorDocumentosPage() {
  const { id } = useParams()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [subiendoImagen, setSubiendoImagen] = useState<string | null>(null)
  const [modoVistaPrevia, setModoVistaPrevia] = useState(false)
  const [menuColumnasAbierto, setMenuColumnasAbierto] = useState(false)
  
  const [bloques, setBloques] = useState<any[]>([])
  const [nombrePlantilla, setNombrePlantilla] = useState('NUEVO DOCUMENTO CLÍNICO')
  const [plantillaId, setPlantillaId] = useState<string | null>(null)

  useEffect(() => {
    const processBlocksForSignedUrls = async (blocks: any[]): Promise<any[]> => {
      if (!blocks) return [];
      const processedBlocks = await Promise.all(
          blocks.map(async (bloque) => {
              if (!bloque) return null;
              if (bloque.tipo === 'imagen' && bloque.contenido && !bloque.contenido.startsWith('http')) {
                  const { data } = await supabase.storage.from('documentos_imagenes').createSignedUrl(bloque.contenido, 3600);
                  return { ...bloque, signedUrl: data?.signedUrl };
              }
              if (bloque.tipo === 'fila' && bloque.slots) {
                  const newSlots = await processBlocksForSignedUrls(bloque.slots);
                  return { ...bloque, slots: newSlots };
              }
              return bloque;
          })
      );
      return processedBlocks.filter(Boolean);
    };

    async function fetchPlantilla() {
      setCargando(true)
      const { data } = await supabase.from('documentos_plantillas').select('*').eq('categoria_id', id).maybeSingle()
      if (data) {
        setPlantillaId(data.id)
        setNombrePlantilla(data.nombre)
        const processedContenido = await processBlocksForSignedUrls(data.contenido || []);
        setBloques(processedContenido)
      }
      setCargando(false)
    }

    fetchPlantilla()
  }, [id])

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      const payload = { categoria_id: id, nombre: nombrePlantilla.toUpperCase(), contenido: bloques, updated_at: new Date() }
      let error;
      if (plantillaId) {
        const { error: err } = await supabase.from('documentos_plantillas').update(payload).eq('id', plantillaId)
        error = err
      } else {
        const { data, error: err } = await supabase.from('documentos_plantillas').insert([payload]).select().single()
        if (data) setPlantillaId(data.id)
        error = err
      }
      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('auditoria_clinica').insert([{
          usuario_id: user?.id,
          accion: 'UPDATE / PLANTILLA DOCUMENTO',
          tabla: 'documentos_plantillas',
          detalles: `Modificó la plantilla de documento "${nombrePlantilla}".`
      }])
      toast.success("Plantilla guardada correctamente")
    } catch (err: any) { toast.error("Error al guardar la plantilla") } 
    finally { setGuardando(false) }
  }

  const crearBloqueBase = (tipo: string) => ({
    id: Math.random().toString(36).substr(2, 9),
    tipo,
    label: ['separador', 'titulo', 'texto', 'imagen'].includes(tipo) ? '' : 'Nueva Etiqueta',
    contenido: '',
    opciones: ['desplegable', 'seleccion_multiple'].includes(tipo) ? ['Opción 1', 'Opción 2'] : [],
  })

  const agregarBloque = (tipo: string, extra: any = {}) => {
    if (tipo === 'fila') {
      const nuevaFila = {
        id: Math.random().toString(36).substr(2, 9),
        tipo: 'fila',
        columnas: extra.columnas || 2,
        slots: Array.from({ length: extra.columnas || 2 }, () => null)
      }
      setBloques([...bloques, nuevaFila])
    } else {
      setBloques([...bloques, crearBloqueBase(tipo)])
    }
    setMenuColumnasAbierto(false)
  }

  const asignarBloqueASlot = (filaId: string, slotIndex: number, tipo: string) => {
    setBloques(bloques.map(b => {
      if (b.id === filaId) {
        const nuevosSlots = [...(b.slots || [])];
        nuevosSlots[slotIndex] = tipo ? crearBloqueBase(tipo) : null;
        return { ...b, slots: nuevosSlots };
      }
      return b;
    }));
  }

  const actualizarBloqueInterno = (filaId: string, slotIndex: number, key: string, valor: any) => {
    setBloques(bloques.map(b => {
      if (b.id === filaId) {
        const nuevosSlots = [...(b.slots || [])];
        nuevosSlots[slotIndex] = { ...nuevosSlots[slotIndex], [key]: valor };
        return { ...b, slots: nuevosSlots };
      }
      return b;
    }));
  }

  const actualizarBloque = (id: string, key: string, valor: any) => {
    setBloques(bloques.map(b => b.id === id ? { ...b, [key]: valor } : b))
  }

  const eliminarBloque = (id: string) => setBloques(bloques.filter(b => b.id !== id))
  
  const moverBloque = (index: number, direccion: 'subir' | 'bajar') => {
    const nuevaLista = [...bloques];
    const item = nuevaLista.splice(index, 1)[0];
    nuevaLista.splice(direccion === 'subir' ? index - 1 : index + 1, 0, item);
    setBloques(nuevaLista);
  }

  const gestionarSubidaImagen = async (bloqueId: string, event: React.ChangeEvent<HTMLInputElement>, filaId?: string, slotIndex?: number) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSubiendoImagen(bloqueId);
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('documentos_imagenes').upload(fileName, file);
        if (uploadError) throw uploadError;
        
        const { data: signedUrlData } = await supabase.storage.from('documentos_imagenes').createSignedUrl(fileName, 3600);
        
        if (filaId !== undefined && slotIndex !== undefined) {
          setBloques(prev => prev.map(b => {
            if (b.id === filaId) {
              const nuevosSlots = [...(b.slots || [])];
              nuevosSlots[slotIndex] = { ...nuevosSlots[slotIndex], contenido: fileName, signedUrl: signedUrlData?.signedUrl };
              return { ...b, slots: nuevosSlots };
            }
            return b;
          }));
        } else {
          setBloques(prev => prev.map(b => b.id === bloqueId ? { ...b, contenido: fileName, signedUrl: signedUrlData?.signedUrl } : b));
        }
    } catch (error: any) { toast.error('Error al subir la imagen'); } 
    finally { setSubiendoImagen(null); }
  };

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#FBF8F2] gap-4">
      <Loader2 className="animate-spin text-[#C9A24B]" size={40} />
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Cargando constructor...</p>
    </div>
  )

  return (
    <main className={`min-h-screen transition-all duration-500 text-left relative z-0 overflow-hidden ${modoVistaPrevia ? 'bg-slate-200 p-0 md:p-12' : 'bg-[#FBF8F2] p-6 md:p-8 font-sans'}`}>
      
      {/* IMAGEN DE FONDO GLOBAL */}
      {!modoVistaPrevia && (
        <div className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"></div>
      )}

      <AnimatePresence>
        {modoVistaPrevia && (
          <motion.button initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            onClick={() => setModoVistaPrevia(false)}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 px-8 py-5 bg-[#0A111F]/90 backdrop-blur-xl text-[#C9A24B] rounded-full font-black text-xs uppercase shadow-2xl hover:scale-105 active:scale-95 transition-all border border-[#C9A24B]/30"
          >
            <EyeOff size={18} /> Volver al Editor
          </motion.button>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto space-y-8 relative z-10">
        {!modoVistaPrevia && (
          <header className="bg-white/90 backdrop-blur-md p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 sticky top-6 z-50 transition-all">
            <div className="flex items-center gap-4 text-left w-full md:w-auto">
              <button 
                onClick={() => router.back()} 
                className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-[#0A111F] hover:text-[#C9A24B] transition-all shrink-0"
              >
                <ArrowLeft size={20}/>
              </button>
              <div className="flex-1">
                <input 
                  className="w-full text-lg md:text-xl font-black text-[#0A111F] uppercase italic bg-transparent outline-none border-none focus:ring-0 truncate" 
                  value={nombrePlantilla} 
                  onChange={(e) => setNombrePlantilla(e.target.value)}
                  placeholder="NOMBRE DEL DOCUMENTO"
                />
                <p className="text-[9px] font-bold text-[#C9A24B] uppercase tracking-widest ml-1 leading-none mt-1">Constructor de Plantillas Clínicas</p>
              </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto shrink-0">
              <button onClick={() => setModoVistaPrevia(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-slate-50 text-slate-500 rounded-2xl font-black text-[10px] uppercase hover:bg-[#C9A24B] hover:text-white transition-all shadow-sm border border-slate-100">
                <Eye size={16}/> Vista Previa
              </button>
              <button onClick={handleGuardar} disabled={guardando} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-[#0A111F] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#1a2538] transition-all shadow-lg disabled:opacity-50">
                {guardando ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Guardar
              </button>
            </div>
          </header>
        )}

        {!modoVistaPrevia && (
          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-9 gap-3">
            <BotonTool icon={<Type size={18}/>} label="Título" onClick={() => agregarBloque('titulo')} />
            <BotonTool icon={<AlignLeft size={18}/>} label="Texto" onClick={() => agregarBloque('texto')} />
            <BotonTool icon={<ImageIcon size={18}/>} label="Imagen" onClick={() => agregarBloque('imagen')} />
            
            <div className="relative">
                <BotonTool active={menuColumnasAbierto} icon={<Layout size={18}/>} label="Fila" onClick={() => setMenuColumnasAbierto(!menuColumnasAbierto)} />
                <AnimatePresence>
                    {menuColumnasAbierto && (
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 5 }}
                            className="absolute top-full mt-3 left-0 w-48 bg-[#0A111F] rounded-[1.5rem] p-3 shadow-2xl z-[100] space-y-1 border border-white/10">
                            {[2, 3, 4].map(n => (
                                <button key={n} onClick={() => agregarBloque('fila', { columnas: n })} className="w-full p-3 rounded-xl text-white font-black text-[10px] uppercase hover:bg-[#C9A24B] flex justify-between items-center transition-all">
                                    {n} Columnas <Columns size={12} />
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <BotonTool icon={<Minus size={18}/>} label="Separador" onClick={() => agregarBloque('separador')} />
            <BotonTool variant="form" icon={<Plus size={18}/>} label="Input" onClick={() => agregarBloque('input')} />
            <BotonTool variant="form" icon={<AlignJustify size={18}/>} label="Multi" onClick={() => agregarBloque('textarea')} />
            <BotonTool variant="form" icon={<List size={18}/>} label="Drop" onClick={() => agregarBloque('desplegable')} />
            <BotonTool variant="form" icon={<CheckSquare size={18}/>} label="Check" onClick={() => agregarBloque('seleccion_multiple')} />
          </div>
        )}

        {/* LIENZO DEL DOCUMENTO */}
        <div className={`min-h-[800px] transition-all duration-700 relative shadow-2xl ${modoVistaPrevia ? 'bg-white p-10 md:p-24 rounded-none shadow-black/10' : 'bg-white/95 backdrop-blur-sm rounded-[3rem] p-8 md:p-16 border border-slate-100'}`}>
          
          {bloques.length === 0 && !modoVistaPrevia && (
            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30 pointer-events-none">
              <FileText size={80} className="text-[#C9A24B] mb-4" />
              <p className="font-black uppercase text-xl text-[#0A111F] tracking-widest">Lienzo Vacío</p>
              <p className="text-sm font-bold text-slate-500 uppercase">Añade bloques desde la barra superior</p>
            </div>
          )}

          <div className="space-y-10">
            {bloques.map((bloque, index) => (
              <div key={bloque.id} className="relative group text-left text-slate-900">
                {!modoVistaPrevia && (
                  <div className="absolute -left-12 md:-left-16 top-0 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-all z-10">
                    <button onClick={() => moverBloque(index, 'subir')} className="p-2.5 bg-white rounded-xl shadow-md text-slate-400 hover:text-[#C9A24B] hover:border-[#C9A24B]/30 border border-slate-200 transition-colors"><ChevronUp size={14}/></button>
                    <button onClick={() => moverBloque(index, 'bajar')} className="p-2.5 bg-white rounded-xl shadow-md text-slate-400 hover:text-[#C9A24B] hover:border-[#C9A24B]/30 border border-slate-200 transition-colors"><ChevronDown size={14}/></button>
                    <button onClick={() => eliminarBloque(bloque.id)} className="p-2.5 bg-white rounded-xl shadow-md text-red-400 hover:bg-red-50 hover:border-red-200 border border-slate-200 transition-colors mt-2"><Trash2 size={14}/></button>
                  </div>
                )}

                {bloque.tipo === 'fila' ? (
                  <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${bloque.columnas}, minmax(0, 1fr))` }}>
                    {(bloque.slots || []).map((slot: any, sIdx: number) => (
                      <div key={sIdx} className={`min-h-[100px] rounded-[2rem] transition-all relative ${!modoVistaPrevia && !slot ? 'bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center' : ''}`}>
                        {!slot && !modoVistaPrevia ? (
                           <div className="flex flex-wrap gap-1.5 justify-center p-4">
                              <button onClick={() => asignarBloqueASlot(bloque.id, sIdx, 'input')} className="p-2 bg-white rounded-lg shadow-sm text-[8px] font-black uppercase text-slate-500 hover:bg-[#0A111F] hover:text-[#C9A24B] border border-slate-200 transition-colors">Input</button>
                              <button onClick={() => asignarBloqueASlot(bloque.id, sIdx, 'desplegable')} className="p-2 bg-white rounded-lg shadow-sm text-[8px] font-black uppercase text-slate-500 hover:bg-[#0A111F] hover:text-[#C9A24B] border border-slate-200 transition-colors">Drop</button>
                              <button onClick={() => asignarBloqueASlot(bloque.id, sIdx, 'seleccion_multiple')} className="p-2 bg-white rounded-lg shadow-sm text-[8px] font-black uppercase text-slate-500 hover:bg-[#0A111F] hover:text-[#C9A24B] border border-slate-200 transition-colors">Check</button>
                              <button onClick={() => asignarBloqueASlot(bloque.id, sIdx, 'imagen')} className="p-2 bg-white rounded-lg shadow-sm text-[8px] font-black uppercase text-slate-500 hover:bg-[#C9A24B] hover:text-white border border-slate-200 transition-colors">Foto</button>
                              <button onClick={() => asignarBloqueASlot(bloque.id, sIdx, 'texto')} className="p-2 bg-white rounded-lg shadow-sm text-[8px] font-black uppercase text-slate-500 hover:bg-[#C9A24B] hover:text-white border border-slate-200 transition-colors">Texto</button>
                           </div>
                        ) : slot ? (
                          <div className="relative">
                            {!modoVistaPrevia && <button onClick={() => asignarBloqueASlot(bloque.id, sIdx, '')} className="absolute -top-3 -right-3 p-1.5 bg-white shadow-md border border-slate-100 rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors z-20"><X size={12}/></button>}
                            <RenderBloque 
                              bloque={slot} 
                              modoVistaPrevia={modoVistaPrevia} 
                              onUpdate={(key:string, val:any) => actualizarBloqueInterno(bloque.id, sIdx, key, val)}
                              onUpload={(e:any) => gestionarSubidaImagen(slot.id, e, bloque.id, sIdx)}
                              subiendoImagen={subiendoImagen}
                            />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <RenderBloque 
                    bloque={bloque} 
                    modoVistaPrevia={modoVistaPrevia} 
                    onUpdate={(key: string, val: any) => actualizarBloque(bloque.id, key, val)} 
                    onUpload={(e:any) => gestionarSubidaImagen(bloque.id, e)}
                    subiendoImagen={subiendoImagen}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

function RenderBloque({ bloque, modoVistaPrevia, onUpdate, onUpload, subiendoImagen }: any) {
  if (!bloque) return null;

  return (
    <div className="space-y-2 w-full">
      {!['separador', 'titulo', 'texto', 'imagen'].includes(bloque.tipo) && (
        !modoVistaPrevia ? (
          <input 
            className="text-[10px] font-black uppercase text-[#C9A24B] bg-transparent outline-none border-b border-dashed border-transparent focus:border-[#C9A24B]/30 w-full placeholder:text-slate-300 pb-1" 
            value={bloque.label} 
            onChange={(e) => onUpdate('label', e.target.value)} 
            placeholder="Etiqueta de campo..."
          />
        ) : (
          <label className="block text-[11px] font-black uppercase text-[#C9A24B] mb-1.5 tracking-widest">{bloque.label}</label>
        )
      )}

      {bloque.tipo === 'titulo' && (
        modoVistaPrevia ? <h2 className="text-2xl md:text-3xl font-black uppercase italic text-[#0A111F]">{bloque.contenido}</h2> :
        <input 
          className="w-full text-xl md:text-2xl font-black uppercase italic text-[#0A111F] outline-none border-b-2 border-transparent focus:border-[#C9A24B]/30 bg-transparent placeholder:text-slate-300 pb-2" 
          value={bloque.contenido} 
          onChange={(e) => onUpdate('contenido', e.target.value)} 
          placeholder="Título del Documento..." 
        />
      )}

      {bloque.tipo === 'texto' && (
        modoVistaPrevia ? (
          <div className="text-[#0A111F]/80 text-sm md:text-base leading-relaxed text-justify whitespace-pre-line" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bloque.contenido) }} />
        ) : (
          <textarea 
            className="w-full min-h-[120px] text-sm text-[#0A111F] bg-slate-50 p-4 md:p-6 rounded-2xl md:rounded-[2rem] outline-none resize-y border border-slate-200 focus:border-[#C9A24B]/50 transition-colors placeholder:text-slate-400" 
            value={bloque.contenido} 
            onChange={(e) => onUpdate('contenido', e.target.value)} 
            placeholder="Escribir instrucciones o texto informativo aquí..." 
          />
        )
      )}

      {bloque.tipo === 'input' && (
        <input 
          readOnly={modoVistaPrevia} 
          className={`w-full p-4 rounded-2xl text-sm font-bold outline-none transition-all ${modoVistaPrevia ? 'bg-transparent border-b-2 border-slate-200 rounded-none px-0' : 'bg-slate-50 border border-slate-200 focus:border-[#C9A24B]/50'}`} 
          placeholder="..." 
        />
      )}
      
      {bloque.tipo === 'textarea' && (
        <textarea 
          readOnly={modoVistaPrevia} 
          rows={3} 
          className={`w-full p-4 rounded-2xl text-sm font-bold outline-none resize-none transition-all ${modoVistaPrevia ? 'bg-transparent border-2 border-slate-100' : 'bg-slate-50 border border-slate-200 focus:border-[#C9A24B]/50'}`} 
          placeholder="..." 
        />
      )}

      {bloque.tipo === 'desplegable' && (
        <div className="space-y-2">
          {modoVistaPrevia ? (
            <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none appearance-none cursor-pointer">
              <option>Seleccione...</option>
              {bloque.opciones?.map((o: any, i: number) => <option key={i}>{o}</option>)}
            </select>
          ) : (
            <div className="space-y-1.5 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              {bloque.opciones?.map((o: any, i: number) => (
                <div key={i} className="flex gap-2 group/opt items-center">
                  <input 
                    className="flex-1 bg-white p-3 rounded-xl border border-slate-100 text-[10px] font-black uppercase outline-none focus:border-[#C9A24B]/50 transition-all shadow-sm" 
                    value={o} 
                    onChange={(e) => {
                      const n = [...bloque.opciones]; n[i] = e.target.value; onUpdate('opciones', n);
                    }}
                  />
                  <button onClick={() => onUpdate('opciones', bloque.opciones.filter((_:any,idx:any) => idx !== i))} className="text-red-400 p-2 opacity-0 group-hover/opt:opacity-100 transition-all hover:bg-red-50 rounded-lg"><X size={14}/></button>
                </div>
              ))}
              <button onClick={() => onUpdate('opciones', [...bloque.opciones, 'NUEVA OPCIÓN'])} className="text-[9px] font-black text-[#C9A24B] uppercase p-2 hover:underline mt-2 inline-block">+ Añadir Opción</button>
            </div>
          )}
        </div>
      )}

      {bloque.tipo === 'seleccion_multiple' && (
        <div className={`grid gap-3 p-4 rounded-2xl ${!modoVistaPrevia ? 'bg-slate-50 border border-slate-200' : ''}`}>
          {bloque.opciones?.map((o: any, i: number) => (
            <div key={i} className="flex items-center gap-3 group/check">
              <div className={`w-5 h-5 border-2 rounded-md shrink-0 flex items-center justify-center ${modoVistaPrevia ? 'border-[#C9A24B]' : 'border-slate-300'}`} >
                {modoVistaPrevia && <div className="w-2.5 h-2.5 bg-[#C9A24B] rounded-[2px] opacity-0 hover:opacity-100 cursor-pointer transition-opacity"></div>}
              </div>
              {!modoVistaPrevia ? (
                <>
                  <input 
                    className="flex-1 bg-white border border-slate-100 p-2.5 rounded-xl text-[10px] font-black uppercase outline-none focus:border-[#C9A24B]/50" 
                    value={o} 
                    onChange={(e) => {
                      const n = [...bloque.opciones]; n[i] = e.target.value; onUpdate('opciones', n);
                    }}
                  />
                  <button onClick={() => onUpdate('opciones', bloque.opciones.filter((_:any,idx:any) => idx !== i))} className="text-red-400 p-2 opacity-0 group-hover/check:opacity-100 transition-all hover:bg-red-50 rounded-lg"><X size={14}/></button>
                </>
              ) : (
                <span className="text-sm font-bold text-[#0A111F]">{o}</span>
              )}
            </div>
          ))}
          {!modoVistaPrevia && <button onClick={() => onUpdate('opciones', [...bloque.opciones, 'NUEVO CHECK'])} className="text-[9px] font-black text-[#C9A24B] uppercase mt-2 w-fit px-2 hover:underline">+ Añadir Ítem</button>}
        </div>
      )}

      {bloque.tipo === 'imagen' && (
          <div className={`flex flex-col items-center justify-center w-full min-h-[150px] ${modoVistaPrevia ? '' : 'bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-300'}`}>
              {subiendoImagen === bloque.id ? (
                  <div className="flex flex-col items-center gap-3 py-6"><Loader2 className="animate-spin text-[#C9A24B]" size={28} /><p className="text-[9px] font-black uppercase tracking-widest text-[#C9A24B]">Subiendo...</p></div>
              ) : bloque.contenido ? (
                  <div className="relative inline-block">
                      <img src={bloque.signedUrl || bloque.contenido} className="max-h-[250px] object-contain rounded-xl shadow-md border border-slate-100" alt="Vista Previa" />
                      {!modoVistaPrevia && <button onClick={() => onUpdate('contenido', '')} className="absolute -top-3 -right-3 p-2 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors"><X size={14}/></button>}
                  </div>
              ) : (
                  !modoVistaPrevia && (
                      <label className="cursor-pointer flex flex-col items-center gap-3 text-slate-400 hover:text-[#C9A24B] transition-colors w-full h-full justify-center">
                          <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
                          <UploadCloud size={36}/>
                          <span className="text-[9px] font-black uppercase tracking-widest">Subir Imagen</span>
                      </label>
                  )
              )}
          </div>
      )}

      {bloque.tipo === 'separador' && <div className="h-[2px] bg-slate-100 w-full my-6 rounded-full" />}
    </div>
  )
}

function BotonTool({ icon, label, onClick, active, variant = 'design' }: any) {
  return (
    <button 
      onClick={onClick} 
      className={`w-full flex flex-col items-center justify-center gap-2.5 p-4 border rounded-[1.8rem] transition-all active:scale-95 group ${
        active 
          ? 'bg-[#C9A24B] border-[#C9A24B] text-white shadow-lg' 
          : variant === 'form' 
            ? 'bg-[#0A111F] border-[#0A111F] text-white hover:bg-[#1a2538] shadow-sm' 
            : 'bg-white/90 backdrop-blur-sm border-slate-200 text-slate-500 hover:border-[#C9A24B] hover:text-[#C9A24B] shadow-sm'
      }`}
    >
      <div className={`p-3 rounded-xl transition-colors ${
        active 
          ? 'bg-white/20' 
          : variant === 'form' 
            ? 'bg-white/10 text-[#C9A24B]' 
            : 'bg-slate-50 group-hover:bg-[#C9A24B]/10 text-slate-400 group-hover:text-[#C9A24B]'
      }`}>
        {icon}
      </div>
      <span className="text-[8px] font-black uppercase tracking-widest text-center leading-tight">{label}</span>
    </button>
  )
}

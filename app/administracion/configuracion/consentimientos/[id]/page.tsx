'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { 
  ArrowLeft, Save, Copy, Eye, EyeOff, 
  Printer, Loader2, CheckSquare, Square, FileText, Clock
} from 'lucide-react'

import DOMPurify from 'isomorphic-dompurify'
import dynamic from 'next/dynamic'
const ReactQuill = dynamic(() => import('react-quill-new'), { 
  ssr: false,
  loading: () => <div className="h-64 bg-slate-50 animate-pulse rounded-[2rem]" />
})
import 'react-quill-new/dist/quill.snow.css';

export default function DetalleConsentimientoPage() {
  const { id } = useParams()
  const router = useRouter()
  
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [modoVistaPrevia, setModoVistaPrevia] = useState(false)
  
  const [nombre, setNombre] = useState('')
  const [texto, setTexto] = useState('')
  const [mostrarFirmaPaciente, setMostrarFirmaPaciente] = useState(true)
  const [mostrarFirmaProfesional, setMostrarFirmaProfesional] = useState(true)

  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['clean']
    ],
  }), [])

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setCargando(true)
    try {
      const { data } = await supabase.from('consentimientos').select('*').eq('id', id).single()
      if (data) {
        setNombre(data.nombre)
        setTexto(data.texto || '')
        setMostrarFirmaPaciente(data.firma_paciente ?? true)
        setMostrarFirmaProfesional(data.firma_profesional ?? true)
      }
    } catch (e) { console.error(e) }
    finally { setCargando(false) }
  }

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      const { error } = await supabase
        .from('consentimientos')
        .update({ 
          texto, 
          firma_paciente: mostrarFirmaPaciente, 
          firma_profesional: mostrarFirmaProfesional,
          updated_at: new Date()
        })
        .eq('id', id)
      if (error) throw error
      alert("✅ Consentimiento guardado")
    } catch (err: any) {
      alert("Error al guardar")
    } finally {
      setGuardando(false)
    }
  }

  const handleDuplicar = async () => {
    const nuevoNombre = prompt("Nombre para el duplicado:", `${nombre} COPIA`)
    if (!nuevoNombre) return
    setGuardando(true)
    try {
      const { data, error } = await supabase.from('consentimientos').insert([{
          nombre: nuevoNombre.toUpperCase(),
          texto,
          firma_paciente: mostrarFirmaPaciente,
          firma_profesional: mostrarFirmaProfesional,
          estado: 'Sí'
      }]).select().single()
      if (error) throw error
      router.push(`/administracion/configuracion/consentimientos/${data.id}`)
    } catch (err) { alert("Error al duplicar") } finally { setGuardando(false) }
  }

  const obtenerFechaHoraActual = () => {
    const ahora = new Date();
    return ahora.toLocaleString('es-CL', {
      dateStyle: 'long',
      timeStyle: 'short'
    });
  }

  if (cargando) return <div className="h-screen flex items-center justify-center bg-[#F8FAFC]"><Loader2 className="animate-spin text-blue-600" size={40} /></div>

  return (
    <div className={`min-h-screen transition-all ${modoVistaPrevia ? 'bg-slate-100 p-0' : 'bg-[#F8FAFC] p-8'}`}>
      
      {!modoVistaPrevia && (
        <div className="max-w-5xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 sticky top-4 z-[100] print:hidden">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all"><ArrowLeft size={20}/></button>
            <h1 className="text-xl font-black text-slate-800 uppercase italic leading-none">{nombre}</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setModoVistaPrevia(true)} className="flex items-center gap-2 px-5 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase hover:bg-blue-600 hover:text-white transition-all"><Eye size={16}/> Vista Previa</button>
            <button onClick={handleDuplicar} className="flex items-center gap-2 px-5 py-3.5 bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-blue-600 transition-all"><Copy size={16}/> Duplicar</button>
            <button onClick={handleGuardar} disabled={guardando} className="flex items-center gap-2 px-6 py-3.5 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all">
               {guardando ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Guardar
            </button>
          </div>
        </div>
      )}

      {/* CONTENEDOR DOCUMENTO */}
      <div id="documento-imprimible" className={`max-w-4xl mx-auto transition-all ${modoVistaPrevia ? 'bg-white p-12 overflow-visible' : 'space-y-6'}`}>
        
        {modoVistaPrevia && (
          <div className="print:hidden">
             <button onClick={() => setModoVistaPrevia(false)} className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-full font-black text-[10px] uppercase shadow-2xl z-[1000] border-2 border-white/10 hover:scale-105 transition-all"><EyeOff size={16}/> Salir</button>
             <button onClick={() => window.print()} className="fixed bottom-8 right-8 flex items-center gap-2 px-8 py-4 bg-emerald-500 text-white rounded-full font-black text-[10px] uppercase shadow-2xl z-[1000] hover:bg-emerald-600 transition-all"><Printer size={18}/> Imprimir</button>
          </div>
        )}

        {/* ENCABEZADO */}
        {modoVistaPrevia && (
          <div className="flex justify-between items-start mb-10 border-b-2 border-slate-900 pb-6">
            <img src="https://yqdpmaopnvrgdqbfaiok.supabase.co/storage/v1/object/public/documentos_imagenes/440749454_122171956712064634_7168698893214813270_n.jpg" className="h-20 w-auto" alt="Logo" />
            <div className="text-right">
              <h2 className="text-lg font-black uppercase text-slate-900 leading-tight">Centro Médico y Dental Dignidad SpA</h2>
              <p className="text-[11px] font-bold text-slate-500 uppercase mt-1 italic">Fecha: {new Date().toLocaleDateString('es-CL')}</p>
            </div>
          </div>
        )}

        {/* CUERPO TEXTO */}
        <div className={modoVistaPrevia ? 'mt-6' : 'bg-white rounded-[3rem] p-10 border border-slate-100 shadow-sm'}>
          {!modoVistaPrevia && <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 ml-4 flex items-center gap-2 print:hidden"><FileText size={14}/> Cuerpo del Consentimiento</p>}
          
          {modoVistaPrevia ? (
            <div className="space-y-6">
              <div className="text-slate-800 text-[13px] leading-[1.8] text-justify quill-preview break-words" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(texto) }} />
              
              <div className="pt-4 border-t border-slate-100 flex items-center gap-2 text-slate-400 italic">
                <Clock size={12} />
                <span className="text-[10px] font-medium uppercase tracking-tighter">
                  Consentimiento generado el: {obtenerFechaHoraActual()}
                </span>
              </div>
            </div>
          ) : (
            <div className="custom-quill">
              <ReactQuill theme="snow" value={texto} onChange={setTexto} modules={modules} placeholder="Redacta el consentimiento aquí..." />
            </div>
          )}
        </div>

        {/* FIRMAS */}
        {modoVistaPrevia && (
          <div className="grid grid-cols-2 gap-12 mt-16 firmas-area">
            {mostrarFirmaPaciente && (
              <div className="flex flex-col items-center">
                <div className="w-full border-t border-slate-900 mb-2" />
                <span className="text-[11px] font-black uppercase text-slate-900">Firma Paciente</span>
                <span className="text-[9px] text-slate-500 uppercase mt-1">R.U.T: ___________________</span>
              </div>
            )}
            {mostrarFirmaProfesional && (
              <div className="flex flex-col items-center">
                <div className="w-full border-t border-slate-900 mb-2" />
                <span className="text-[11px] font-black uppercase text-slate-900">Firma Profesional</span>
                <span className="text-[9px] text-slate-500 uppercase mt-1">C.I / Registro SIS</span>
              </div>
            )}
          </div>
        )}

        {!modoVistaPrevia && (
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => setMostrarFirmaPaciente(!mostrarFirmaPaciente)} className={`flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all ${mostrarFirmaPaciente ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-100 text-slate-400'}`}>
              <div className="flex items-center gap-3">{mostrarFirmaPaciente ? <CheckSquare size={20}/> : <Square size={20}/>}<span className="text-[11px] font-black uppercase">Firma Paciente</span></div>
            </button>
            <button onClick={() => setMostrarFirmaProfesional(!mostrarFirmaProfesional)} className={`flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all ${mostrarFirmaProfesional ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-100 text-slate-400'}`}>
              <div className="flex items-center gap-3">{mostrarFirmaProfesional ? <CheckSquare size={20}/> : <Square size={20}/>}<span className="text-[11px] font-black uppercase">Firma Profesional</span></div>
            </button>
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          @page { margin: 0 !important; size: auto; }
          body, html { margin: 0 !important; padding: 0 !important; background: white !important; overflow: visible !important; height: auto !important; }
          nav, aside, header, footer, .print\\:hidden, button { display: none !important; }
          #documento-imprimible { 
            display: block !important; 
            width: 100% !important; 
            margin: 0 !important; 
            padding: 20mm !important; 
            box-shadow: none !important;
            height: auto !important;
          }
          .firmas-area { page-break-inside: avoid; }
          .quill-preview { font-size: 11pt !important; color: black !important; }
        }
        .custom-quill .ql-editor { min-height: 400px; background: #f8fafc; border-radius: 1.5rem; }
      `}</style>
    </div>
  )
}

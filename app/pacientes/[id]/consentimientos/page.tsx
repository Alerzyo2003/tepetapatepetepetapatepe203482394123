'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import {
  FileSignature, FileCheck, Plus, Trash2, Loader2, X,
  ChevronRight, CheckCircle2, Clock, Settings
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { toast } from 'sonner'

export default function ConsentimientosPacientePage() {
  const { id: pacienteId } = useParams()
  const router = useRouter()
  
  const [consentimientosEmitidos, setConsentimientosEmitidos] = useState<any[]>([])
  const [tiposConsentimientos, setTiposConsentimientos] = useState<any[]>([])
  const [presupuestos, setPresupuestos] = useState<any[]>([])
  const [profesionales, setProfesionales] = useState<any[]>([])
  
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [creando, setCreando] = useState(false)
  const [mounted, setMounted] = useState(false)
  
  // --- ESTADOS PARA AUDITORÍA SEREMI ---
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [sessionUserRole, setSessionUserRole] = useState<string | null>(null)
  const [perfil, setPerfil] = useState<any>(null)

  // Estados para Edición
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false)
  const [editando, setEditando] = useState(false)
  const [docAEditar, setDocAEditar] = useState({ id: '', especialista_id: '', nombre_doc: '' })

  const [form, setForm] = useState({
    tipo_id: '',
    presupuesto_id: '',
    especialista_id: ''
  })

  useEffect(() => {
    setMounted(true);
    if (pacienteId) {
      // Usamos getSession para ahorrar Egress y traemos los datos SEREMI
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (session?.user) {
          setSessionUserId(session.user.id)
          const { data: profile } = await supabase
            .from('perfiles')
            .select('rut, nombre_completo, rol')
            .eq('id', session.user.id)
            .single()
            
          if (profile) {
            setPerfil(profile)
            setSessionUserRole(profile.rol)
          }
        }
      })
      fetchData()
    }
  }, [pacienteId])

  // --- FUNCIÓN DE AUDITORÍA ENRIQUECIDA (SEREMI) ---
  const registrarAuditoria = async (accion: string, detalles: string, datos_anteriores: any = null, datos_nuevos: any = null) => {
    if (!sessionUserId || !perfil) return;
    try {
      await supabase.from('auditoria_clinica').insert([{
        usuario_id: sessionUserId,
        rut_usuario: perfil.rut,
        nombre_usuario: perfil.nombre_completo,
        rol_al_momento: perfil.rol,
        paciente_id: pacienteId,
        accion,
        tabla: 'paciente_consentimientos',
        detalles,
        datos_anteriores,
        datos_nuevos,
        user_agent: navigator.userAgent
      }]);
    } catch (e) {
      console.error("Error al registrar auditoría", e);
    }
  }

  async function fetchData() {
    setCargando(true)
    try {
      const { data: emitidos, error: errEmitidos } = await supabase
        .from('paciente_consentimientos')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('fecha_creacion', { ascending: false });

      const [tipos, pres, pros] = await Promise.all([
        supabase.from('consentimientos').select('*').eq('estado', 'Sí'),
        supabase.from('presupuestos').select('id, nombre_tratamiento').eq('paciente_id', pacienteId),
        supabase.from('profesionales').select('id, user_id, nombre, apellido').eq('activo', true)
      ]);

      setConsentimientosEmitidos(emitidos || []);
      setTiposConsentimientos(tipos.data || []);
      setPresupuestos(pres.data || []);
      setProfesionales(pros.data || []);

    } catch (error: any) {
      console.error("Error al cargar:", error);
      toast.error("Error de conexión con AureoDent");
    } finally {
      setCargando(false);
    }
  }

  const handleAbrirModal = () => {
    const initialFormState = {
      tipo_id: '',
      presupuesto_id: '',
      especialista_id: ''
    }
    if (sessionUserRole === 'DENTISTA' && sessionUserId) {
      const propio = profesionales.find(p => p.user_id === sessionUserId);
      if (propio) initialFormState.especialista_id = propio.id;
    }
    setForm(initialFormState)
    setModalAbierto(true)
  }

  async function handleCrearConsentimiento() {
    if (!form.tipo_id || !form.especialista_id) {
      toast.error("Selecciona plantilla y especialista");
      return;
    }

    setCreando(true);
    try {
      const plantilla = tiposConsentimientos.find(t => t.id === form.tipo_id);
      const pro = profesionales.find(p => p.id === form.especialista_id);

      const nuevoRegistro = {
        paciente_id: pacienteId,
        consentimiento_id: form.tipo_id,
        especialista_id: form.especialista_id,
        presupuesto_id: form.presupuesto_id || null,
        nombre_consentimiento: plantilla?.nombre || 'Sin nombre',
        contenido_legal: plantilla?.texto || '', 
        creado_por: `${pro?.nombre} ${pro?.apellido}`,
        firma_paciente: 'Pendiente',
        firma_profesional: 'Pendiente',
        fecha_creacion: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('paciente_consentimientos')
        .insert([nuevoRegistro])
        .select()
        .single();

      if (error) throw error;

      // REGISTRAR AUDITORÍA SEREMI
      await registrarAuditoria(
        'INSERT / CREAR CONSENTIMIENTO', 
        `Generó consentimiento legal "${plantilla?.nombre}" asignado a Dr/a. ${pro?.nombre} ${pro?.apellido}.`, 
        null, 
        nuevoRegistro
      );

      toast.success("¡Registro legal generado exitosamente!");
      setModalAbierto(false);
      setForm({ tipo_id: '', presupuesto_id: '', especialista_id: '' });
      fetchData(); 

    } catch (error: any) {
      console.error("Error Supabase:", error);
      toast.error("Error: " + error.message);
    } finally {
      setCreando(false);
    }
  }

  async function handleGuardarEdicion() {
    if (!docAEditar.especialista_id) {
      return toast.error("Selecciona un especialista");
    }

    setEditando(true);
    try {
      const pro = profesionales.find(p => p.id === docAEditar.especialista_id);
      const nombrePro = `${pro?.nombre} ${pro?.apellido}`;

      const { error } = await supabase
        .from('paciente_consentimientos')
        .update({
          especialista_id: docAEditar.especialista_id,
          creado_por: nombrePro
        })
        .eq('id', docAEditar.id);

      if (error) throw error;

      // REGISTRAR AUDITORÍA SEREMI
      await registrarAuditoria(
        'UPDATE / REASIGNAR CONSENTIMIENTO', 
        `Reasignó el consentimiento "${docAEditar.nombre_doc}" al especialista Dr/a. ${nombrePro}.`, 
        { nombre_doc: docAEditar.nombre_doc }, 
        { especialista_id_nuevo: docAEditar.especialista_id, asignado_a: nombrePro }
      );

      toast.success("Especialista actualizado correctamente");
      setModalEditarAbierto(false);
      fetchData();
    } catch (error: any) {
      toast.error("Error al actualizar el documento");
    } finally {
      setEditando(false);
    }
  }

  async function eliminarDocumento(id: string) {
    if (!confirm("¿Deseas eliminar este registro permanentemente?")) return;
    try {
      const doc = consentimientosEmitidos.find(d => d.id === id);
      
      const { error } = await supabase.from('paciente_consentimientos').delete().eq('id', id);
      if (error) throw error;

      // REGISTRAR AUDITORÍA SEREMI
      await registrarAuditoria(
        'DELETE / ELIMINAR CONSENTIMIENTO', 
        `Eliminó el consentimiento "${doc?.nombre_consentimiento || 'Desconocido'}".`, 
        doc, 
        null
      );

      toast.success("Eliminado correctamente");
      fetchData();
    } catch (e) {
      toast.error("Error al eliminar");
    }
  }

  if (cargando) return (
    <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-[#D4AF37]" size={40} />
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">AureoDent está cargando...</p>
    </div>
  )

  return (
    <main className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 font-sans pb-20 text-left w-full overflow-hidden">
      
      {/* Header Responsivo */}
      <header className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 text-left">
        <div className="flex items-center gap-4 md:gap-6 text-left">
          <div className="bg-slate-900 p-4 md:p-5 rounded-2xl md:rounded-[2rem] text-white shadow-xl shrink-0"><FileSignature className="w-6 h-6 md:w-8 md:h-8" /></div>
          <div className="text-left">
            <h1 className="text-xl md:text-2xl font-black text-slate-800 uppercase italic leading-none">Consentimientos</h1>
            <p className="text-slate-400 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mt-1.5 md:mt-2">Gestión Legal Áurea</p>
          </div>
        </div>
        <button 
          onClick={handleAbrirModal} 
          className="w-full md:w-auto bg-blue-600 text-white px-6 md:px-10 py-4 md:py-5 rounded-2xl md:rounded-[2rem] font-black text-[10px] md:text-xs uppercase shadow-xl hover:bg-slate-900 transition-all flex items-center justify-center gap-3 active:scale-95 whitespace-nowrap"
        >
          <Plus size={18} /> Generar Registro
        </button>
      </header>

      {/* Tabla Responsiva adaptada a Cards en Mobile */}
      <div className="bg-white rounded-[2rem] md:rounded-[3.5rem] shadow-xl border border-slate-100 w-full overflow-hidden">
        <table className="w-full text-left">
          <thead className="hidden md:table-header-group bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
            <tr>
              <th className="px-10 py-6">Documento</th>
              <th className="px-6 py-6 text-center">Especialista</th>
              <th className="px-6 py-6 text-center">Estado</th>
              <th className="px-10 py-6 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 md:divide-slate-50 flex flex-col md:table-row-group">
            {consentimientosEmitidos.length === 0 ? (
                <tr className="flex md:table-row">
                    <td colSpan={4} className="w-full py-16 md:py-24 text-center text-slate-300 font-black uppercase italic text-xs tracking-widest block md:table-cell">
                        No hay registros en la bitácora
                    </td>
                </tr>
            ) : (
              consentimientosEmitidos.map((doc) => (
                <tr key={doc.id} className="hover:bg-blue-50/30 transition-all group flex flex-col md:table-row p-5 md:p-0">
                  <td className="px-2 md:px-10 py-2 md:py-7 block md:table-cell">
                      <p className="text-sm md:text-sm font-black text-slate-800 uppercase italic leading-tight">{doc.nombre_consentimiento}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 md:mt-1.5">{new Date(doc.fecha_creacion).toLocaleDateString('es-CL')}</p>
                  </td>
                  <td className="px-4 md:px-6 py-5 md:py-6 text-center max-w-[220px]">
                    <div className="flex md:block justify-between items-center w-full">
                      <span className="md:hidden text-[9px] font-black text-slate-400 uppercase tracking-widest">Especialista</span>
                      <span className="text-[9px] md:text-[10px] font-black text-slate-600 bg-slate-100 px-3 md:px-4 py-1.5 md:py-2 rounded-xl border uppercase inline-block break-words">
                      {doc.creado_por}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 md:px-6 py-2 md:py-6 block md:table-cell text-center">
                    <div className="flex md:justify-center justify-between items-center gap-1.5 md:gap-2 w-full">
                      <span className="md:hidden text-[9px] font-black text-slate-400 uppercase tracking-widest">Estado</span>
                      <div className="flex items-center gap-1.5">
                        {doc.firma_paciente === 'Firmado'
                          ? <><CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" /> <span className="text-[9px] font-black text-emerald-600 uppercase">Firmado</span></>
                          : <><Clock className="w-4 h-4 md:w-5 md:h-5 text-orange-400" /> <span className="text-[9px] font-black text-orange-500 uppercase">Pendiente</span></>}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 md:px-10 py-4 md:py-6 block md:table-cell text-right">
                    <div className="flex justify-end gap-2 items-center w-full border-t border-slate-100 md:border-none pt-4 md:pt-0 mt-2 md:mt-0">
                      <button onClick={() => {
                          setDocAEditar({ id: doc.id, especialista_id: doc.especialista_id || '', nombre_doc: doc.nombre_consentimiento });
                          setModalEditarAbierto(true);
                        }} 
                        className="w-10 h-10 md:w-12 md:h-12 bg-slate-50 text-slate-400 rounded-xl md:rounded-2xl flex items-center justify-center hover:bg-amber-50 hover:text-amber-500 transition-all opacity-100 md:opacity-0 group-hover:opacity-100"
                        title="Cambiar Especialista"
                      >
                        <Settings size={18} />
                      </button>
                      <button onClick={() => eliminarDocumento(doc.id)} className="w-10 h-10 md:w-12 md:h-12 bg-red-50 text-red-400 rounded-xl md:rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all opacity-100 md:opacity-0 group-hover:opacity-100" title="Eliminar">
                        <Trash2 size={18} />
                      </button>
                      <Link href={`/pacientes/${pacienteId}/consentimientos/${doc.id}`} className="w-10 h-10 md:w-12 md:h-12 bg-slate-100 text-slate-400 rounded-xl md:rounded-2xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all">
                        <ChevronRight size={20} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Nuevo Registro */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {modalAbierto && (
            <div className="fixed inset-0 flex items-center justify-center p-4 md:p-6" style={{ zIndex: 999999 }}>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModalAbierto(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
              <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} className="bg-white w-full max-w-lg rounded-[2.5rem] md:rounded-[3.5rem] shadow-2xl relative overflow-hidden p-6 md:p-10 space-y-6 md:space-y-8 text-left">
                  <div className="flex justify-between items-start text-left">
                    <div className="text-left pr-4">
                      <h3 className="text-lg md:text-xl font-black text-slate-800 uppercase italic leading-tight">Nuevo Registro</h3>
                      <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">AureoDent Legal System</p>
                    </div>
                    <button onClick={() => setModalAbierto(false)} className="p-2 md:p-3 bg-slate-50 text-slate-400 rounded-xl md:rounded-2xl hover:text-red-500 hover:bg-red-50 transition-all shrink-0"><X size={20}/></button>
                  </div>

                  <div className="space-y-5 md:space-y-6 text-left">
                    <div className="space-y-2 text-left">
                      <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 md:ml-4">Plantilla de Consentimiento</label>
                      <select value={form.tipo_id} onChange={(e) => setForm({...form, tipo_id: e.target.value})} className="w-full p-4 md:p-5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-[1rem] md:rounded-[1.5rem] outline-none font-bold text-[10px] md:text-xs text-slate-700 truncate">
                        <option value="">Selecciona plantilla...</option>
                        {tiposConsentimientos.map(t => <option key={t.id} value={t.id}>{String(t.nombre || '').toUpperCase()}</option>)}
                      </select>
                    </div>

                    <div className="space-y-2 text-left">
                      <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 md:ml-4">Especialista</label>
                      <select value={form.especialista_id} onChange={(e) => setForm({...form, especialista_id: e.target.value})} className="w-full p-4 md:p-5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-[1rem] md:rounded-[1.5rem] outline-none font-bold text-[10px] md:text-xs text-slate-700 truncate">
                        <option value="">Selecciona especialista...</option>
                        {profesionales.map(p => <option key={p.id} value={p.id}>{String(p.nombre || '').toUpperCase()} {String(p.apellido || '').toUpperCase()}</option>)}
                      </select>
                    </div>

                    <div className="space-y-2 text-left">
                      <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 md:ml-4">Presupuesto (Opcional)</label>
                      <select value={form.presupuesto_id} onChange={(e) => setForm({...form, presupuesto_id: e.target.value})} className="w-full p-4 md:p-5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-[1rem] md:rounded-[1.5rem] outline-none font-bold text-[10px] md:text-xs text-slate-700 truncate">
                        <option value="">Sin presupuesto asociado</option>
                        {presupuestos.map(pr => <option key={pr.id} value={pr.id}>{String(pr.nombre_tratamiento || 'Tratamiento').toUpperCase()}</option>)}
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={handleCrearConsentimiento} 
                    disabled={creando} 
                    className="w-full bg-slate-900 text-white py-5 md:py-6 rounded-[1.5rem] md:rounded-[2rem] font-black text-[10px] md:text-xs uppercase tracking-widest md:tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2 md:gap-3 disabled:opacity-50"
                  >
                    {creando ? <Loader2 className="animate-spin" size={18} /> : <FileCheck size={18} />}
                    {creando ? 'Generando...' : 'Crear Documento Legal'}
                  </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Modal Editar Especialista - Portal */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {modalEditarAbierto && (
            <div className="fixed inset-0 flex items-center justify-center p-4 md:p-6" style={{ zIndex: 999999 }}>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModalEditarAbierto(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
              <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} className="bg-white w-full max-w-sm rounded-[2.5rem] md:rounded-[3.5rem] shadow-2xl relative overflow-hidden p-6 md:p-10 space-y-6 md:space-y-8 text-left">
                  <div className="flex justify-between items-start text-left">
                    <div className="text-left pr-4">
                      <h3 className="text-lg md:text-xl font-black text-slate-800 uppercase italic leading-tight">Reasignar</h3>
                      <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cambiar Especialista</p>
                    </div>
                    <button onClick={() => setModalEditarAbierto(false)} className="p-2 md:p-3 bg-slate-50 text-slate-400 rounded-xl md:rounded-2xl hover:text-red-500 hover:bg-red-50 transition-all shrink-0"><X size={20}/></button>
                  </div>

                  <div className="space-y-5 md:space-y-6 text-left">
                    <div className="space-y-2 text-left">
                      <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 md:ml-4">Especialista a Cargo</label>
                      <select value={docAEditar.especialista_id} onChange={(e) => setDocAEditar({...docAEditar, especialista_id: e.target.value})} className="w-full p-4 md:p-5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-[1rem] md:rounded-[1.5rem] outline-none font-bold text-[10px] md:text-xs text-slate-700 truncate">
                        <option value="">Selecciona especialista...</option>
                        {profesionales.map(p => <option key={p.id} value={p.id}>{String(p.nombre || '').toUpperCase()} {String(p.apellido || '').toUpperCase()}</option>)}
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={handleGuardarEdicion} 
                    disabled={editando} 
                    className="w-full bg-blue-600 text-white py-5 md:py-6 rounded-[1.5rem] md:rounded-[2rem] font-black text-[10px] md:text-xs uppercase tracking-widest md:tracking-[0.2em] shadow-xl hover:bg-slate-900 transition-all flex items-center justify-center gap-2 md:gap-3 disabled:opacity-50"
                  >
                    {editando ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                    {editando ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </main>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User, ClipboardList, Activity, Wallet, ArrowLeft, UserCircle, Loader2, Coins, Lock, Spline, CalendarClock, ImageIcon, History, CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'

// --- LAZY LOADING DE MODALES ---
const ModalAgendarCita = dynamic(() => import('@/components/Modales/ModalAgendarCita'), { ssr: false })
const ModalTicketCita = dynamic(() => import('@/components/Modales/ModalTicketCita'), { ssr: false })
const ModalEditarAntecedentes = dynamic(() => import('@/components/Modales/ModalEditarAntecedentes'), { ssr: false })
// Cambiamos los Dropdowns por Modales para evitar el corte por overflow
const ModalHistorialCitas = dynamic(() => import('@/components/Modales/DropdownHistorial'), { ssr: false })
const ModalProximasCitas = dynamic(() => import('@/components/Modales/DropdownProximasCitas'), { ssr: false })
export default function PacienteLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const id = params.id as string
  const pathname = usePathname()
  const router = useRouter()
  const [mounted, setMounted] = useState(false);
  
  const [paciente, setPaciente] = useState<any>(null)
  const [antecedentes, setAntecedentes] = useState<any[]>([])
  const [proximasCitas, setProximasCitas] = useState<any[]>([])
  const [citasAnteriores, setCitasAnteriores] = useState<any[]>([])
  
  const [perfil, setPerfil] = useState<any>(null)

  // Estados de Modales
  const [modalHistorialAbierto, setModalHistorialAbierto] = useState(false)
  const [modalCitasAbierto, setModalCitasAbierto] = useState(false)
  const [modalAgendarAbierto, setModalAgendarAbierto] = useState(false)
  const [mostrarTicket, setMostrarTicket] = useState(false)
  const [citaConfirmadaData, setCitaConfirmadaData] = useState<any>(null)
  const [modalEdicionAntecedentes, setModalEdicionAntecedentes] = useState(false)
  const [categoriaActiva, setCategoriaActiva] = useState<'alerta' | 'enfermedad' | 'medicamento'>('alerta')
  const actualizarMotivoCita = async (citaId: string, nuevoMotivo: string) => {
  try {
    const { error } = await supabase
      .from('citas')
      .update({ motivo: nuevoMotivo })
      .eq('id', citaId);

    if (error) throw error;

    // Actualiza el estado local optimísticamente
    setCitasAnteriores(prev => 
      prev.map(cita => cita.id === citaId ? { ...cita, motivo: nuevoMotivo } : cita)
    );
  } catch (error) {
    console.error("Error al actualizar el comentario:", error);
    alert("Hubo un error al actualizar el comentario.");
  }
};
  const calcularEdad = (fechaNac: string) => {
    if (!fechaNac) return 'N/A';
    const hoy = new Date();
    const cumple = new Date(fechaNac);
    let edad = hoy.getFullYear() - cumple.getFullYear();
    const m = hoy.getMonth() - cumple.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < cumple.getDate())) edad--;
    return edad + ' años';
  }

  useEffect(() => {
    setMounted(true);
    const getUserProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data: pData } = await supabase.from('perfiles').select('rol, id').eq('id', session.user.id).single()
        setPerfil(pData)
      }
    }
    getUserProfile()
  }, [])

  useEffect(() => {
    if (!id) return;
    fetchDatosMaestros();

    const channel = supabase
      .channel('cambios-paciente')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pacientes', filter: `id=eq.${id}` }, (payload) => { 
        setPaciente((prev: any) => ({ ...prev, ...payload.new })); 
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'antecedentes', filter: `paciente_id=eq.${id}` }, () => {
        fetchAntecedentes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id])

  async function fetchAntecedentes() {
    const { data } = await supabase.from('antecedentes').select('id, categoria, contenido').eq('paciente_id', id)
    if (data) setAntecedentes(data)
  }

  async function fetchDatosMaestros() {
    try {
      const hoy = new Date().toISOString();
      const [resPac, resAnt, resCitasProx, resCitasAnt, resProfs] = await Promise.all([
        supabase.from('pacientes').select('id, nombre, apellido, rut, sexo, fecha_nacimiento, prevision, telefono, activo').eq('id', id).maybeSingle(),
        supabase.from('antecedentes').select('id, categoria, contenido').eq('paciente_id', id),
        supabase.from('citas').select('id, inicio, fin, estado, estado_confirmacion, motivo, profesional_id')
          .eq('paciente_id', id).gte('inicio', hoy).neq('estado', 'cancelada').order('inicio', { ascending: true }).limit(3),
        supabase.from('citas').select('id, inicio, fin, estado, estado_confirmacion, motivo, profesional_id')
          .eq('paciente_id', id).lt('inicio', hoy).order('inicio', { ascending: false }).limit(10),
        supabase.from('profesionales').select('user_id, nombre, apellido')
      ]);
      
      if (resPac.data) setPaciente(resPac.data);
      if (resAnt.data) setAntecedentes(resAnt.data);
      
      const mapearCitas = (citasData: any[]) => citasData.map(cita => {
        const prof = resProfs.data?.find((p: any) => p.user_id === cita.profesional_id);
        return { ...cita, profesional_nombre: prof ? `Dr. ${prof.nombre.split(' ')[0]} ${prof.apellido.split(' ')[0]}` : 'Especial.' };
      });

      if (resCitasProx.data) setProximasCitas(mapearCitas(resCitasProx.data));
      if (resCitasAnt.data) setCitasAnteriores(mapearCitas(resCitasAnt.data));

    } catch (err) { console.error(err) }
  }

  const abrirEdicionRapida = (categoria: 'alerta' | 'enfermedad' | 'medicamento') => {
    setCategoriaActiva(categoria);
    setModalEdicionAntecedentes(true);
  };

  const rolesPermitidos = ['ADMIN', 'RECEPCIONISTA', 'DENTISTA'];
  const puedeVerFinanzas = rolesPermitidos.includes(perfil?.rol);
  const puedeVerRecetas = ['DENTISTA', 'ADMIN', 'RECEPCIONISTA', 'ASISTENTE'].includes(perfil?.rol);

  if (!paciente) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
      <Loader2 size={32} className="animate-spin text-blue-600 mb-4" />
      <h3 className="text-lg font-black uppercase text-slate-500">Cargando ficha...</h3>
    </div>
  )

  if (paciente && paciente.activo === false) return (
    <div className="h-screen flex items-center justify-center bg-[#FDFDFD] p-6 selection:bg-red-100">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-lg w-full p-10 rounded-[3.5rem] shadow-2xl border border-red-50 text-center flex flex-col items-center">
        <Lock size={48} strokeWidth={2.5} className="text-red-500 mb-4" />
        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-3">Ficha Bloqueada</h1>
        <p className="text-sm font-bold text-slate-500 mb-8">Este paciente ha sido marcado como inactivo.</p>
        <button onClick={() => router.back()} className="w-full bg-slate-900 text-white font-black text-[11px] uppercase tracking-[0.2em] py-5 rounded-2xl">
          Volver Atrás
        </button>
      </motion.div>
    </div>
  )

  const esFicha = pathname.startsWith(`/pacientes/${id}`) && !pathname.includes('/datos') && !pathname.includes('/tratamientos') && !pathname.includes('/periodontograma') && !pathname.includes('/odontograma') && !pathname.includes('/archivos') && !pathname.includes('/pagos');
  const esTratamientos = pathname.includes('/tratamientos');
  const alertas = antecedentes.filter(a => a.categoria === 'alerta');
  const enfermedades = antecedentes.filter(a => a.categoria === 'enfermedad');
  const medicamentos = antecedentes.filter(a => a.categoria === 'medicamento');

  return (
    <div className="min-h-screen flex flex-col font-sans text-left bg-slate-50 print:block">
      <header className="bg-white relative lg:sticky top-0 z-40 border-b border-slate-200 shadow-sm print:hidden max-w-full">
        
        {/* SECCIÓN SUPERIOR: Info Paciente y Alertas */}
        <div className="px-4 py-2.5 w-full mx-auto flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3">
          
         {/* Información del Paciente */}
          <div className="flex items-center gap-3 min-w-0 w-full xl:w-auto">
            <div className="bg-blue-600 p-2 rounded-xl text-white shrink-0">
              <User size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-black uppercase text-slate-900 truncate leading-tight" title={`${paciente.nombre} ${paciente.apellido}`}>
                {paciente.nombre} {paciente.apellido}
              </h1>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-500 mt-0.5">
                <span className="whitespace-nowrap font-bold text-slate-700">RUT: {paciente.rut}</span> 
                <span className="hidden sm:inline text-slate-300">|</span> 
                <span className="whitespace-nowrap">Edad: {calcularEdad(paciente.fecha_nacimiento)}</span> 
                <span className="hidden sm:inline text-slate-300">|</span> 
                <span className="text-purple-600 font-bold truncate">Convenio: {paciente.prevision || 'Ninguno'}</span>
              </div>
            </div>
          </div>

          {/* Alertas Médicas (Scroll horizontal interno en móvil sin barra visible) */}
          <div className="flex gap-1.5 overflow-x-auto w-full xl:w-auto pb-1 xl:pb-0 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div onClick={() => abrirEdicionRapida('alerta')} className="w-32 shrink-0 bg-red-50 p-1.5 rounded-lg cursor-pointer">
              <span className="text-[9px] font-bold text-red-600 uppercase">Alertas</span>
              <p className="text-[10px] truncate leading-tight">{alertas.length > 0 ? alertas[0].contenido : 'Ninguna'}</p>
            </div>
            <div onClick={() => abrirEdicionRapida('enfermedad')} className="w-32 shrink-0 bg-blue-50 p-1.5 rounded-lg cursor-pointer">
              <span className="text-[9px] font-bold text-blue-600 uppercase">Enfermedades</span>
              <p className="text-[10px] truncate leading-tight">{enfermedades.length > 0 ? enfermedades[0].contenido : 'Ninguna'}</p>
            </div>
            <div onClick={() => abrirEdicionRapida('medicamento')} className="w-32 shrink-0 bg-purple-50 p-1.5 rounded-lg cursor-pointer">
              <span className="text-[9px] font-bold text-purple-600 uppercase">Medicamentos</span>
              <p className="text-[10px] truncate leading-tight">{medicamentos.length > 0 ? medicamentos[0].contenido : 'Ninguno'}</p>
            </div>
          </div>

        </div>

        {/* SECCIÓN INFERIOR: Tabs y Botones de Acción */}
        <div className="bg-slate-50 border-t border-slate-100 px-4 py-2 flex flex-col xl:flex-row items-center justify-between gap-3 w-full">
          
          {/* IZQUIERDA: Menú de Navegación (Deslizable horizontalmente en móvil) */}
          <div className="flex items-center gap-1 w-full xl:w-auto overflow-x-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <a href="/agenda" className="p-1.5 bg-white border border-slate-200 text-slate-400 rounded-lg hover:text-blue-600 transition-all shadow-sm mr-1 shrink-0" title="Volver a la Agenda">
               <ArrowLeft size={12} strokeWidth={2.5}/>
            </a>
            <TabLink href={`/pacientes/${id}`} active={esFicha} icon={<ClipboardList size={11}/>} label="Ficha" />
            <TabLink href={`/pacientes/${id}/datos`} active={pathname.includes('/datos')} icon={<UserCircle size={11}/>} label="Perfil" />
            {puedeVerFinanzas && <TabLink href={`/pacientes/${id}/pagos`} active={pathname.includes('/pagos')} icon={<Coins size={11}/>} label="Pagos" />}
            <TabLink href={`/pacientes/${id}/tratamientos`} active={pathname.includes('/tratamientos')} icon={<Wallet size={11}/>} label="Tratamientos" />
            <TabLink href={`/pacientes/${id}/periodontograma`} active={pathname.includes('/periodontograma')} icon={<Activity size={11}/>} label="Periodontograma" />
            <TabLink href={`/pacientes/${id}/archivos`} active={pathname.includes('/archivos')} icon={<ImageIcon size={11}/>} label="Archivos" />
            <TabLink href={`/pacientes/${id}/odontograma`} active={pathname.includes('/odontograma')} icon={<Spline size={11}/>} label="Odontograma" />
          </div>

          {/* DERECHA: Botones Funcionales (Siempre visibles sin necesidad de scroll) */}
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full xl:w-auto shrink-0 border-t border-slate-100 xl:border-0 pt-2 xl:pt-0">
             
             <div className="flex gap-2">
               <ModalHistorialCitas 
                 abierto={modalHistorialAbierto} 
                 setAbierto={setModalHistorialAbierto} 
                 cerrarOtro={setModalCitasAbierto}
                 citas={citasAnteriores}
                 onUpdateMotivo={actualizarMotivoCita}
               />
               
               <ModalProximasCitas 
                 abierto={modalCitasAbierto} 
                 setAbierto={setModalCitasAbierto} 
                 cerrarOtro={setModalHistorialAbierto}
                 citas={proximasCitas}
               />
             </div>
             
             <button onClick={() => setModalAgendarAbierto(true)} className="bg-[#C9A24B] flex items-center justify-center gap-1 text-white px-2.5 py-1.5 rounded-md text-[8px] font-black uppercase tracking-wide hover:bg-[#B38D3A] shadow-sm transition-colors flex-1 sm:flex-none max-w-[120px]">
                <CalendarClock size={10} /> <span className="whitespace-nowrap">Agendar Cita</span>
             </button>
             
          </div>
          
        </div>
      </header>

      <main className={`w-full mx-auto flex-1 overflow-hidden ${esTratamientos ? '' : 'p-4 lg:p-6 max-w-6xl'}`}>
        {esFicha && (
          <nav className="bg-white p-2 rounded-2xl mb-4 border flex gap-1 overflow-x-auto max-w-full scroll-smooth">
            <SubTabLink href={`/pacientes/${id}`} active={pathname === `/pacientes/${id}`} label="Resumen" />
            <SubTabLink href={`/pacientes/${id}/evoluciones`} active={pathname.includes('/evoluciones')} label="Evoluciones" />
            <SubTabLink href={`/pacientes/${id}/antecedentes`} active={pathname.includes('/antecedentes')} label="Ant. Médicos" />
            <SubTabLink href={`/pacientes/${id}/rx-documentos`} active={pathname.includes('/rx-documentos')} label="RX y Multimedia" />
            {puedeVerRecetas && <SubTabLink href={`/pacientes/${id}/recetas`} active={pathname.includes('/recetas')} label="Recetario" />}
            <SubTabLink href={`/pacientes/${id}/documentos`} active={pathname.includes('/documentos')} label="Documentos" />
            <SubTabLink href={`/pacientes/${id}/consentimientos`} active={pathname.includes('/consentimientos')} label="Consentimientos" />
          </nav>
        )}
        {children}
      </main>

      {/* RENDERIZADO DE MODALES */}
      {mounted && (
        <>
          <ModalAgendarCita 
            isOpen={modalAgendarAbierto} 
            onClose={() => setModalAgendarAbierto(false)} 
            paciente={paciente}
            creadoPor={perfil?.id}
            onSuccess={(data: any) => {
              setModalAgendarAbierto(false);
              setCitaConfirmadaData(data);
              setMostrarTicket(true);
            }}
          />
          <ModalTicketCita 
            isOpen={mostrarTicket} 
            data={citaConfirmadaData}
            onClose={() => setMostrarTicket(false)}
          />
          <ModalEditarAntecedentes 
            isOpen={modalEdicionAntecedentes}
            categoria={categoriaActiva}
            antecedentes={antecedentes}
            pacienteId={id}
            onClose={() => setModalEdicionAntecedentes(false)}
            onUpdate={fetchAntecedentes}
          />
          {/* LOS DOS COMPONENTES QUE ESTABAN AQUÍ SE BORRARON */}
        </>
      )}
        
    </div>
  )
}
function TabLink({ href, active, icon, label }: any) {
  return (
    <Link href={href} className={`flex items-center gap-1 px-1.5 py-1 rounded-xl font-black text-[9px] uppercase tracking-wide transition-all shrink-0 ${active ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
      {icon} <span className="whitespace-nowrap">{label}</span>
    </Link>
  )
}

function SubTabLink({ href, active, label }: any) {
  return (
    <Link href={href} className={`px-3 py-1.5 rounded-lg font-bold text-[9px] uppercase transition-all whitespace-nowrap shrink-0 ${active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
      {label}
    </Link>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { createPortal } from 'react-dom'
import {
  Save, Loader2, Clock, Calendar, Trash2,
  LayoutGrid, Sparkles, CalendarDays, AlertCircle, XCircle,
  MessageCircle, Phone, X, CalendarClock, Ban, CheckCircle2, UserCircle,
  ChevronLeft, ChevronRight, Users, Stethoscope, Info, Edit2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

const DIAS = [
  { id: 1, label: 'Lunes' }, { id: 2, label: 'Martes' }, { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' }, { id: 5, label: 'Viernes' }, { id: 6, label: 'Sábado' }, { id: 0, label: 'Domingo' }
];

const tToMins = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
const minsToT = (m: number) => {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const min = (m % 60).toString().padStart(2, '0');
  return `${h}:${min}`;
}
const getMinsFromDateStr = (dtString: string) => {
  const timePart = dtString.includes('T') ? dtString.split('T')[1] : dtString.split(' ')[1];
  return tToMins(timePart.substring(0,5));
}

const getLunes = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  date.setHours(0,0,0,0);
  return date;
}

const toLocalISODate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function BoxConfigPage() {
  const [profesionales, setProfesionales] = useState<any[]>([])
  const [profesionalId, setProfesionalId] = useState('')
  const [disponibilidad, setDisponibilidad] = useState<any[]>([])
  const [todosLosBloqueos, setTodosLosBloqueos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const [fechaInasistencia, setFechaInasistencia] = useState('')
  const [motivoInasistencia, setMotivoInasistencia] = useState('')

  const [fechaGlobal, setFechaGlobal] = useState('')
  const [motivoGlobal, setMotivoGlobal] = useState('Feriado Legal')

  const [citasConflictivas, setCitasConflictivas] = useState<any[]>([])
  const [mostrarModalConflictos, setMostrarModalConflictos] = useState(false)
  const [modoModal, setModoModal] = useState<'bloquear' | 'revisar'>('bloquear')
  const [citaEnEdicion, setCitaEnEdicion] = useState<string | null>(null)
  
  const [nuevaFecha, setNuevaFecha] = useState('')
  const [nuevaHora, setNuevaHora] = useState('')
  const [nuevoBox, setNuevoBox] = useState(1)
  const [nuevoEspecialista, setNuevoEspecialista] = useState('')
  const [duracionCitaEdicion, setDuracionCitaEdicion] = useState(45)

  const [semanaInicio, setSemanaInicio] = useState<Date>(getLunes(new Date()))
  const [dispoSemana, setDispoSemana] = useState<any[]>([])
  const [cargandoSlots, setCargandoSlots] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  const [nuevoBloque, setNuevoBloque] = useState<any>({
    id: null,
    tipo: 'semanal', 
    dia_semana: 1,
    hora_inicio: '09:00',
    hora_fin: '13:00',
    box_id: 1,
    fecha_especifica: ''
  })

  useEffect(() => { 
    setIsMounted(true)
    fetchInicial() 
  }, [])
  
  useEffect(() => {
    if (profesionalId) {
        fetchDisponibilidad();
        fetchBloqueos();
        cancelarEdicion();
    }
  }, [profesionalId])

  useEffect(() => {
    if (nuevoEspecialista && citaEnEdicion) {
      calcularDisponibilidadSemanal()
    }
  }, [semanaInicio, nuevoEspecialista, citaEnEdicion, duracionCitaEdicion])

  async function calcularDisponibilidadSemanal() {
    setCargandoSlots(true);
    try {
      const dias = Array.from({length: 7}).map((_, i) => {
        const d = new Date(semanaInicio);
        d.setDate(d.getDate() + i);
        return d;
      });

      const inicioSemanaStr = toLocalISODate(dias[0]);
      const finSemanaStr = toLocalISODate(dias[6]);
      const profNuevo = profesionales.find(p => p.user_id === nuevoEspecialista);

      const { data: bloqueos } = await supabase.from('bloqueos_agenda')
        .select('fecha, hora_inicio, hora_fin').eq('profesional_id', profNuevo?.id) 
        .gte('fecha', inicioSemanaStr).lte('fecha', finSemanaStr);

      const { data: dispo } = await supabase.from('disponibilidad_profesional')
        .select('*').eq('profesional_id', nuevoEspecialista);

      const { data: citas } = await supabase.from('citas')
        .select('inicio, fin').eq('profesional_id', nuevoEspecialista)
        .gte('inicio', `${inicioSemanaStr}T00:00:00`)
        .lte('inicio', `${finSemanaStr}T23:59:59`)
        .neq('estado', 'cancelada');

      const semanaProcesada = dias.map(dateObj => {
        const dateStr = toLocalISODate(dateObj);
        const diaSemanaNum = dateObj.getDay();

        const bloqueosDia = bloqueos?.filter(b => b.fecha === dateStr) || [];
        if (bloqueosDia.some(b => !b.hora_inicio || !b.hora_fin)) {
          return { date: dateStr, dateObj, status: 'bloqueado', slots: [] };
        }

        const dispoEspecialDia = dispo?.filter(d => d.fecha_especifica === dateStr) || [];
        let dispoDia = [];
        if (dispoEspecialDia.length > 0) {
          dispoDia = dispoEspecialDia;
        } else {
          dispoDia = dispo?.filter(d => d.dia_semana === diaSemanaNum && !d.fecha_especifica) || [];
        }

        if (dispoDia.length === 0) {
          return { date: dateStr, dateObj, status: 'sin_horario', slots: [] };
        }

        const citasDia = citas?.filter(c => c.inicio.startsWith(dateStr)).map(c => ({
          inicio: getMinsFromDateStr(c.inicio),
          fin: getMinsFromDateStr(c.fin)
        })) || [];

        let slotsLibres: string[] = [];
        dispoDia.forEach(bloque => {
          let currTime = tToMins(bloque.hora_inicio);
          const endTime = tToMins(bloque.hora_fin);

          while (currTime + duracionCitaEdicion <= endTime) {
            const slotEnd = currTime + duracionCitaEdicion;
            const chocaCita = citasDia.some(cita => currTime < cita.fin && slotEnd > cita.inicio);
            
            const chocaBloqueo = bloqueosDia.some(b => {
              if (!b.hora_inicio || !b.hora_fin) return true;
              return currTime < tToMins(b.hora_fin) && slotEnd > tToMins(b.hora_inicio);
            });

            if (!chocaCita && !chocaBloqueo) {
              slotsLibres.push(minsToT(currTime));
            }
            currTime += 15;
          }
        });

        slotsLibres = [...new Set(slotsLibres)].sort();

        return {
          date: dateStr,
          dateObj,
          status: slotsLibres.length > 0 ? 'limpio' : 'lleno',
          slots: slotsLibres
        };
      });

      setDispoSemana(semanaProcesada);
    } catch (error) {
      toast.error("Error al calcular la agenda semanal");
    } finally {
      setCargandoSlots(false);
    }
  }

  const prevWeek = () => {
    const newDate = new Date(semanaInicio);
    newDate.setDate(newDate.getDate() - 7);
    setSemanaInicio(newDate);
  }

  const nextWeek = () => {
    const newDate = new Date(semanaInicio);
    newDate.setDate(newDate.getDate() + 7);
    setSemanaInicio(newDate);
  }

  async function fetchInicial() {
    const { data } = await supabase.from('profesionales').select('*').eq('activo', true).order('nombre')
    if (data?.length) {
      setProfesionales(data)
      setProfesionalId(data[0].user_id)
    }
    setCargando(false)
  }

  async function fetchDisponibilidad() {
    const { data } = await supabase
      .from('disponibilidad_profesional')
      .select('*')
      .eq('profesional_id', profesionalId)
      .order('dia_semana', { ascending: true })
    setDisponibilidad(data || [])
  }

  async function fetchBloqueos() {
    const prof = profesionales.find(p => p.user_id === profesionalId);
    if (!prof) return;

    const { data } = await supabase
      .from('bloqueos_agenda')
      .select('*')
      .eq('profesional_id', prof.id)
    setTodosLosBloqueos(data || [])
  }

  const cancelarEdicion = () => {
    setNuevoBloque({
      id: null,
      tipo: 'semanal',
      dia_semana: 1,
      hora_inicio: '09:00',
      hora_fin: '13:00',
      box_id: 1,
      fecha_especifica: ''
    });
  }

  const editarBloque = (bloque: any) => {
    setNuevoBloque({
      id: bloque.id,
      tipo: bloque.fecha_especifica ? 'especial' : 'semanal',
      dia_semana: bloque.dia_semana || 1,
      hora_inicio: bloque.hora_inicio.substring(0, 5),
      hora_fin: bloque.hora_fin.substring(0, 5),
      box_id: bloque.box_id,
      fecha_especifica: bloque.fecha_especifica || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const agregarBloque = async () => {
    if (nuevoBloque.hora_inicio >= nuevoBloque.hora_fin) return toast.error("Horario inválido");
    
    const esEspecial = nuevoBloque.tipo === 'especial';
    
    if (esEspecial && !nuevoBloque.fecha_especifica) {
      return toast.error("Por favor, selecciona una fecha para el horario especial");
    }

    setGuardando(true)
    try {
      let diaCalculado = nuevoBloque.dia_semana;
      if (esEspecial) {
        const d = new Date(nuevoBloque.fecha_especifica + 'T12:00:00');
        diaCalculado = d.getDay();
      }

      const payload = {
        profesional_id: profesionalId,
        dia_semana: diaCalculado,
        hora_inicio: nuevoBloque.hora_inicio,
        hora_fin: nuevoBloque.hora_fin,
        box_id: nuevoBloque.box_id,
        fecha_especifica: esEspecial ? nuevoBloque.fecha_especifica : null
      };

      // 🔥 LOG DE DEPURACIÓN (MÁNDAME LO QUE SALGA AQUÍ) 🔥
      console.log("=== DATOS ENVIADOS A SUPABASE ===", payload);
      toast.info(`Guardando: Tipo: ${nuevoBloque.tipo} | Fecha Especial: ${payload.fecha_especifica || 'Ninguna (Semanal)'}`);

      if (nuevoBloque.id) {
        const { error } = await supabase.from('disponibilidad_profesional').update(payload).eq('id', nuevoBloque.id);
        if (error) throw error;
        toast.success(`Horario ${esEspecial ? 'Especial' : 'Semanal'} actualizado`);
      } else {
        const { error } = await supabase.from('disponibilidad_profesional').insert([payload]);
        if (error) throw error;
        toast.success(`Horario ${esEspecial ? 'Especial' : 'Semanal'} agregado`);
      }
      
      fetchDisponibilidad();
      cancelarEdicion();
    } catch (e) { 
      toast.error("Error al guardar el horario"); 
      console.error("ERROR GUARDANDO:", e);
    } finally { 
      setGuardando(false) 
    }
  }

  const validarInasistencia = async () => {
    if (!fechaInasistencia) return toast.error("Seleccione una fecha");
    setGuardando(true);
    try {
      const inicioDia = `${fechaInasistencia}T00:00:00`;
      const finDia = `${fechaInasistencia}T23:59:59`;

      const { data: citas, error: errCitas } = await supabase
        .from('citas')
        .select(`id, inicio, fin, pacientes (nombre, apellido, telefono, rut)`)
        .eq('profesional_id', profesionalId)
        .gte('inicio', inicioDia)
        .lte('inicio', finDia)
        .neq('estado', 'cancelada')
        .order('inicio', { ascending: true });

      if (errCitas) throw errCitas;

      if (citas && citas.length > 0) {
        setCitasConflictivas(citas);
        setSemanaInicio(getLunes(new Date(`${fechaInasistencia}T12:00:00`)));
        setModoModal('bloquear');
        setMostrarModalConflictos(true);
        setGuardando(false);
        return;
      }

      await ejecutarBloqueoFinal();

    } catch (error: any) {
      toast.error("Error al validar la fecha");
      setGuardando(false);
    }
  };
  const bloquearDiaGlobal = async () => {
    if (!fechaGlobal) return toast.error("Seleccione una fecha para el cierre global");
    if (!confirm(`¿Estás seguro de bloquear el día ${fechaGlobal} para TODOS los especialistas?`)) return;
    
    setGuardando(true);
    try {
      const profIds = profesionales.map(p => p.id);
      
      // 1. Buscar si algunos ya tienen bloqueo ese día
      const { data: bloqueosExistentes } = await supabase
        .from('bloqueos_agenda')
        .select('id, profesional_id')
        .eq('fecha', fechaGlobal)
        .in('profesional_id', profIds);
        
      const bloqueadosIds = bloqueosExistentes?.map(b => b.profesional_id) || [];
      
      // 2. Si ya tenían un bloqueo (ej: de unas horas), lo actualizamos a día completo
      if (bloqueosExistentes && bloqueosExistentes.length > 0) {
        const idsToUpdate = bloqueosExistentes.map(b => b.id);
        await supabase.from('bloqueos_agenda')
          .update({ motivo: motivoGlobal, hora_inicio: null, hora_fin: null })
          .in('id', idsToUpdate);
      }
      
      // 3. Para los doctores que no tenían bloqueo, se lo creamos
      const aBloquear = profesionales.filter(p => !bloqueadosIds.includes(p.id));
      if (aBloquear.length > 0) {
        const payload = aBloquear.map(p => ({
          profesional_id: p.id,
          fecha: fechaGlobal,
          motivo: motivoGlobal
        }));
        const { error } = await supabase.from('bloqueos_agenda').insert(payload);
        if (error) throw error;
      }

      await supabase.from('auditoria_clinica').insert([{
        usuario_id: usuarioLogueado, // Corregido: usar la variable que ya tienes en el estado
        accion: 'INSERT / CIERRE GLOBAL',
        tabla: 'bloqueos_agenda',
        detalles: `Bloqueó la clínica completa para el día ${fechaGlobal}. Motivo: ${motivoGlobal}.`
      }]);
      
      toast.success("Cierre global aplicado a todos los especialistas");
      setFechaGlobal('');
      fetchBloqueos();
    } catch(e) {
      toast.error("Error al aplicar cierre global");
    } finally {
      setGuardando(false);
    }
  };
  const ejecutarBloqueoFinal = async () => {
    setGuardando(true);
    try {
      const prof = profesionales.find(p => p.user_id === profesionalId);
      if (!prof) throw new Error("No se encontró el profesional");

      const { data: bloqueoExistente } = await supabase
        .from('bloqueos_agenda')
        .select('id')
        .eq('profesional_id', prof.id) 
        .eq('fecha', fechaInasistencia)
        .maybeSingle();

      if (bloqueoExistente) {
        const { error: errUpdate } = await supabase
          .from('bloqueos_agenda')
          .update({ 
            motivo: motivoInasistencia || "Inasistencia programada",
            hora_inicio: null,
            hora_fin: null 
          })
          .eq('id', bloqueoExistente.id);
          
        if (errUpdate) throw errUpdate;
      } else {
        const { error: errBloqueo } = await supabase
          .from('bloqueos_agenda')
          .insert([{
            profesional_id: prof.id, 
            fecha: fechaInasistencia,
            motivo: motivoInasistencia || "Inasistencia programada"
          }]);

        if (errBloqueo) throw errBloqueo;
      }

      toast.success("Jornada bloqueada con éxito");
      setFechaInasistencia('');
      setMotivoInasistencia('');
      setMostrarModalConflictos(false);
      fetchBloqueos();
    } catch (error: any) {
      console.error(error);
      toast.error("Error al registrar el bloqueo");
    } finally {
      setGuardando(false);
    }
  }

  const eliminarBloque = async (bloque: any) => {
    if(!confirm("¿Estás seguro de eliminar este horario?")) return;

    setGuardando(true);
    try {
      await supabase.from('disponibilidad_profesional').delete().eq('id', bloque.id);
      fetchDisponibilidad();
      
      if (nuevoBloque.id === bloque.id) {
        cancelarEdicion();
      }

      const hoyStr = toLocalISODate(new Date());
      const { data: citasFuturas } = await supabase
        .from('citas')
        .select('inicio')
        .eq('profesional_id', profesionalId)
        .gte('inicio', `${hoyStr}T00:00:00`)
        .neq('estado', 'cancelada');

      let cantidadAfectadas = 0;
      if (citasFuturas && !bloque.fecha_especifica) {
        cantidadAfectadas = citasFuturas.filter(c => {
          const diaSemanaCita = new Date(c.inicio).getDay();
          return diaSemanaCita === (bloque.dia_semana === 7 ? 0 : bloque.dia_semana);
        }).length;
      }

      if (cantidadAfectadas > 0) {
        toast.warning(
          `Horario eliminado. PERO tienes ${cantidadAfectadas} pacientes a futuro en este día. Sus horas NO se han borrado de la agenda, pero deberías reagendarlos.`,
          { duration: 8000, icon: <AlertCircle className="text-amber-500"/> }
        );
      } else {
        toast.success("Horario eliminado correctamente.");
      }
    } catch (error) {
      toast.error("Error al eliminar el bloque");
    } finally {
      setGuardando(false);
    }
  }

  const revisarPacientesPendientes = async (fechaBloqueada: string) => {
    const loadingToast = toast.loading("Buscando pacientes...");
    try {
      const inicioDia = `${fechaBloqueada}T00:00:00`;
      const finDia = `${fechaBloqueada}T23:59:59`;

      const { data: citas, error: errCitas } = await supabase
        .from('citas')
        .select(`id, inicio, fin, pacientes (nombre, apellido, telefono, rut)`)
        .eq('profesional_id', profesionalId)
        .gte('inicio', inicioDia)
        .lte('inicio', finDia)
        .neq('estado', 'cancelada')
        .order('inicio', { ascending: true });

      if (errCitas) throw errCitas;

      setFechaInasistencia(fechaBloqueada);
      setCitasConflictivas(citas || []);
      setSemanaInicio(getLunes(new Date(`${fechaBloqueada}T12:00:00`)));
      setModoModal('revisar');
      setMostrarModalConflictos(true);
      toast.dismiss(loadingToast);
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error("Error al buscar pacientes");
    }
  }

  const anularCitaDirecta = async (citaId: string) => {
    if(!confirm("¿Estás seguro de anular la cita de este paciente?")) return;
    try {
      await supabase.from('citas').update({ estado: 'cancelada' }).eq('id', citaId);
      toast.success("Cita anulada correctamente");
      setCitasConflictivas(prev => prev.filter(c => c.id !== citaId));
    } catch(e) {
      toast.error("No se pudo anular la cita");
    }
  }

  const reagendarCitaDirecta = async (citaId: string) => {
    if(!nuevaFecha || !nuevaHora || !nuevoEspecialista) return toast.error("Selecciona un día y hora del calendario");
    
    setGuardando(true);
    try {
      const inicioDate = new Date(`${nuevaFecha}T${nuevaHora}:00`);
      const finDate = new Date(inicioDate.getTime() + duracionCitaEdicion * 60000);
      const finHoraStr = `${finDate.getHours().toString().padStart(2, '0')}:${finDate.getMinutes().toString().padStart(2, '0')}:00`;

      await supabase.from('citas').update({
        inicio: `${nuevaFecha}T${nuevaHora}:00`,
        fin: `${nuevaFecha}T${finHoraStr}`,
        box_id: nuevoBox,
        profesional_id: nuevoEspecialista,
        estado: 'reprogramada'
      }).eq('id', citaId);

      toast.success("Cita reagendada con éxito");
      setCitaEnEdicion(null);
      setCitasConflictivas(prev => prev.filter(c => c.id !== citaId));
    } catch(e) {
      toast.error("Error al reagendar");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white">
      <Loader2 className="animate-spin text-[#C9A24B]" size={40} />
    </div>
  )

  const profesionalSeleccionado = profesionales.find(p => p.user_id === profesionalId);
  const hoyStr = toLocalISODate(new Date());

  const bloqueosFuturos = todosLosBloqueos
    .filter(b => b.fecha >= hoyStr)
    .sort((a, b) => a.fecha.localeCompare(b.fecha)); 

  const bloquesEspeciales = disponibilidad.filter(b => b.fecha_especifica);

  return (
    <main className="min-h-screen bg-[#FBF8F2] p-6 md:p-10 font-sans text-slate-900 relative overflow-hidden z-0">
      
      <div 
        className="absolute top-0 right-0 w-[700px] h-[800px] bg-[url('/fondo-profesionales.png')] bg-contain bg-right-top bg-no-repeat -z-10 pointer-events-none opacity-40 mix-blend-multiply"
      ></div>

      <div className="max-w-7xl mx-auto space-y-8 relative z-10 text-left">
        
        <header className="bg-white/90 backdrop-blur-md p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 text-left">
          <div className="flex items-center gap-5 text-left w-full md:w-auto">
            <div className="bg-[#0A111F] w-16 h-16 rounded-full flex items-center justify-center text-[#C9A24B] shadow-lg shrink-0">
              <LayoutGrid size={28} />
            </div>
            <div className="text-left">
              <h1 className="text-2xl md:text-3xl font-black text-[#0A111F] uppercase italic leading-none tracking-tight text-left">
                BOXES & HORARIOS
              </h1>
              <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#C9A24B] animate-pulse"></span> Gestión de Agenda
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-[2rem] border border-slate-100 flex items-center pr-6 gap-4 min-w-[280px]">
            <div className="w-12 h-12 rounded-full bg-[#0A111F] flex items-center justify-center text-[#C9A24B] font-black text-lg shadow-inner shrink-0">
              {profesionalSeleccionado?.nombre?.[0]}
            </div>
            <div className="flex flex-col text-left flex-1">
              <span className="text-[9px] font-black text-[#C9A24B] uppercase tracking-widest mb-0.5">Especialista</span>
              <select className="bg-transparent font-black text-sm text-slate-800 uppercase outline-none cursor-pointer w-full" value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)}>
                {profesionales.map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
              </select>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-4 space-y-8">
            
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/95 backdrop-blur-sm p-8 md:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-8">
              
              <div className="flex bg-slate-50 p-1.5 rounded-2xl gap-1 border border-slate-100 relative">
                {nuevoBloque.id && (
                  <div className="absolute -top-3 -right-3 bg-blue-500 text-white text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-sm animate-pulse">
                    Editando
                  </div>
                )}
                {/* 🔥 BOTONES CON TYPE="BUTTON" PARA EVITAR RELOADS 🔥 */}
                <button type="button" onClick={() => setNuevoBloque({...nuevoBloque, tipo: 'semanal'})} className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase transition-all tracking-wider ${nuevoBloque.tipo === 'semanal' ? 'bg-white text-[#0A111F] shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>
                  Semanal
                </button>
                <button type="button" onClick={() => setNuevoBloque({...nuevoBloque, tipo: 'especial'})} className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase transition-all tracking-wider ${nuevoBloque.tipo === 'especial' ? 'bg-[#0A111F] text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
                  Especial
                </button>
              </div>

              <div className="space-y-6 text-left">
                {nuevoBloque.tipo === 'semanal' ? (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                      <CalendarDays size={12} className="text-[#C9A24B]"/> Día de Repetición
                    </label>
                    <select className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-xs border border-slate-200 shadow-sm outline-none focus:border-[#C9A24B] text-slate-900 transition-colors" value={nuevoBloque.dia_semana} onChange={(e) => setNuevoBloque({...nuevoBloque, dia_semana: Number(e.target.value)})}>
                      {DIAS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                      <Calendar size={12} className="text-[#C9A24B]"/> Fecha Única
                    </label>
                    <input type="date" className="w-full p-4 bg-[#C9A24B]/5 border-[#C9A24B]/30 border rounded-2xl font-bold text-xs text-slate-900 outline-none focus:border-[#C9A24B] transition-colors shadow-sm" value={nuevoBloque.fecha_especifica} onChange={(e) => setNuevoBloque({...nuevoBloque, fecha_especifica: e.target.value})} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Desde</label>
                    <input type="time" className="w-full p-4 bg-slate-50 border border-slate-200 shadow-sm rounded-2xl font-bold text-xs text-slate-900 outline-none focus:border-[#C9A24B] transition-colors" value={nuevoBloque.hora_inicio} onChange={(e) => setNuevoBloque({...nuevoBloque, hora_inicio: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Hasta</label>
                    <input type="time" className="w-full p-4 bg-slate-50 border border-slate-200 shadow-sm rounded-2xl font-bold text-xs text-slate-900 outline-none focus:border-[#C9A24B] transition-colors" value={nuevoBloque.hora_fin} onChange={(e) => setNuevoBloque({...nuevoBloque, hora_fin: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Asignar Box</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map(n => (
                      <button type="button" key={n} onClick={() => setNuevoBloque({...nuevoBloque, box_id: n})} className={`py-3.5 rounded-2xl text-[11px] font-black tracking-widest transition-all border ${nuevoBloque.box_id === n ? 'bg-[#0A111F] text-[#C9A24B] border-[#0A111F] shadow-md' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-white hover:text-slate-600'}`}>BOX {n}</button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={agregarBloque} disabled={guardando} className="flex-1 py-5 bg-[#0A111F] text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 disabled:bg-slate-300">
                    {guardando ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} 
                    {nuevoBloque.id ? "Actualizar Horario" : "Guardar Horario"}
                  </button>
                  {nuevoBloque.id && (
                     <button type="button" onClick={cancelarEdicion} className="px-5 bg-red-50 text-red-500 hover:bg-red-100 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all border border-red-100" title="Cancelar edición">
                       <X size={18} />
                     </button>
                  )}
                </div>
              </div>
            </motion.div>

            <div className="bg-red-50/50 p-8 md:p-10 rounded-[2.5rem] border border-red-100 shadow-sm space-y-8">
              
              {/* --- BLOQUEO INDIVIDUAL --- */}
              <div className="flex items-center gap-4 text-left">
                <div className="bg-red-500 p-4 rounded-2xl text-white shadow-md shadow-red-500/30 shrink-0"><XCircle size={24} /></div>
                <div className="text-left">
                  <h2 className="text-xl font-black text-red-900 uppercase italic leading-none tracking-tight">Inasistencia</h2>
                  <p className="text-red-400 text-[9px] font-black uppercase tracking-widest mt-1.5">Bloqueo de Jornada Individual</p>
                </div>
              </div>

              <div className="space-y-4 text-left">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-red-400 uppercase tracking-widest ml-2">Día a Cancelar</label>
                  <input type="date" className="w-full p-4 bg-white border border-red-200 shadow-sm rounded-2xl font-bold text-xs text-red-900 outline-none focus:border-red-400 transition-colors" value={fechaInasistencia} onChange={(e) => setFechaInasistencia(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-red-400 uppercase tracking-widest ml-2">Motivo</label>
                  <input type="text" placeholder="Ej: Licencia médica..." className="w-full p-4 bg-white border border-red-200 shadow-sm rounded-2xl font-bold text-xs text-red-900 outline-none focus:border-red-400 transition-colors placeholder:text-red-200" value={motivoInasistencia} onChange={(e) => setMotivoInasistencia(e.target.value)} />
                </div>
                <button onClick={validarInasistencia} disabled={guardando} className="w-full py-5 bg-red-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all flex items-center justify-center gap-3 mt-2 disabled:opacity-50">
                  Validar y Bloquear Doctor
                </button>
              </div>

              {/* --- BLOQUEO GLOBAL (FERIADOS) --- */}
              <div className="pt-8 border-t border-red-200/60">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-red-100 p-2.5 rounded-xl text-red-600"><Users size={20} /></div>
                  <div>
                    <h3 className="font-black text-red-900 uppercase leading-none">Cierre General</h3>
                    <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mt-1">Feriados para toda la clínica</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <input type="date" className="w-full p-4 bg-white border border-red-200 shadow-sm rounded-2xl font-bold text-xs text-red-900 outline-none focus:border-red-400 transition-colors" value={fechaGlobal} onChange={(e) => setFechaGlobal(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <input type="text" placeholder="Ej: Feriado Irrenunciable..." className="w-full p-4 bg-white border border-red-200 shadow-sm rounded-2xl font-bold text-xs text-red-900 outline-none focus:border-red-400 transition-colors placeholder:text-red-200" value={motivoGlobal} onChange={(e) => setMotivoGlobal(e.target.value)} />
                  </div>
                  <button onClick={bloquearDiaGlobal} disabled={guardando} className="w-full py-4 bg-red-950 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-red-900 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                    Bloquear Clínica Completa
                  </button>
                </div>
              </div>

            </div>
          </div>

          <div className="lg:col-span-8 space-y-8">
            <div className="bg-white/95 backdrop-blur-sm p-8 md:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 min-h-full">
              
              {bloqueosFuturos.length > 0 && (
                <div className="space-y-6 mb-12">
                  <h3 className="text-[11px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-red-100">
                    <AlertCircle size={14} /> Jornadas Bloqueadas (Activas a futuro)
                  </h3>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {bloqueosFuturos.map(b => (
                      <div key={b.id} className="bg-red-50 border border-red-100 p-5 rounded-[1.5rem] flex justify-between items-center group shadow-sm transition-all hover:shadow-md">
                        <div className="text-left">
                          <p className="text-[11px] font-black text-red-600 uppercase mb-0.5 tracking-tight">
                            {new Date(b.fecha + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'long' })}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sin atención</p>
                          {b.motivo && <p className="text-[9px] font-semibold text-slate-400 mt-1 truncate max-w-[150px]">Motivo: {b.motivo}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => revisarPacientesPendientes(b.fecha)} className="w-10 h-10 flex items-center justify-center text-blue-500 hover:bg-blue-50 bg-white rounded-full shadow-sm border border-blue-100 transition-all" title="Ver pacientes pendientes por reagendar">
                            <Users size={16}/>
                          </button>
                          <button onClick={async () => { await supabase.from('bloqueos_agenda').delete().eq('id', b.id); fetchBloqueos(); toast.success("Día rehabilitado"); }} className="w-10 h-10 flex items-center justify-center text-red-500 hover:bg-red-50 bg-white rounded-full shadow-sm border border-red-100 transition-all" title="Eliminar Bloqueo">
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bloquesEspeciales.length > 0 && (
                <div className="space-y-6 mb-12">
                  <h3 className="text-[11px] font-black text-[#0A111F] uppercase tracking-widest flex items-center gap-2 pb-4 border-b border-slate-100">
                    <Calendar size={14} className="text-[#C9A24B]"/> Resumen Horarios Especiales
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {bloquesEspeciales.map(b => (
                      <div key={b.id} className={`bg-white border ${nuevoBloque.id === b.id ? 'border-blue-400 bg-blue-50/30' : 'border-slate-200'} px-5 py-4 rounded-2xl flex flex-col gap-3 shadow-sm group hover:border-[#C9A24B] transition-colors text-left`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[9px] font-black text-[#C9A24B] uppercase tracking-widest block mb-1">Fecha Única</span>
                            <span className="text-[13px] font-black text-[#0A111F]">
                              {new Date(b.fecha_especifica + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </span>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-[#C9A24B]/10 text-[#C9A24B] flex items-center justify-center text-[9px] font-black tracking-tighter border border-[#C9A24B]/20 shrink-0">
                            B{b.box_id}
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                           <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                             <span className="text-[11px] font-bold text-slate-600">{b.hora_inicio.substring(0,5)} a {b.hora_fin.substring(0,5)}</span>
                           </div>
                           <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all">
                             <button onClick={() => editarBloque(b)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all" title="Editar bloque">
                               <Edit2 size={14}/>
                             </button>
                             <button onClick={() => eliminarBloque(b)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Eliminar bloque">
                               <Trash2 size={14}/>
                             </button>
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-6">
                <h3 className="text-[11px] font-black text-[#0A111F] uppercase tracking-widest flex items-center gap-2 pb-4 border-b border-slate-100">
                  <CalendarDays size={14} className="text-[#C9A24B]"/> Resumen Horarios Semanales
                </h3>
                
                <div className="space-y-3">
                  {DIAS.map((dia) => {
                    const bloques = disponibilidad.filter(b => b.dia_semana === dia.id && !b.fecha_especifica);
                    return (
                      <div key={dia.id} className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 p-4 hover:bg-slate-50 rounded-2xl transition-all group border border-transparent hover:border-slate-100">
                        <div className="w-28 text-left shrink-0">
                          <span className="text-xs font-black uppercase text-slate-800 tracking-wide group-hover:text-[#C9A24B] transition-colors">{dia.label}</span>
                        </div>
                        
                        <div className="flex-1 flex flex-wrap gap-3 justify-start">
                            {bloques.length === 0 ? (
                              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">Libre / Sin Atención</span>
                            ) : bloques.map(b => (
                              <div key={b.id} className={`bg-white border ${nuevoBloque.id === b.id ? 'border-blue-400 bg-blue-50/30' : 'border-slate-200'} px-4 py-2.5 rounded-2xl flex items-center gap-4 shadow-sm group/item hover:border-[#C9A24B] transition-colors`}>
                                <div className="text-left">
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Horario</span>
                                  <span className="text-[11px] font-black text-[#0A111F]">{b.hora_inicio.substring(0,5)} a {b.hora_fin.substring(0,5)}</span>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-[#C9A24B]/10 text-[#C9A24B] flex items-center justify-center text-[9px] font-black tracking-tighter border border-[#C9A24B]/20">
                                  B{b.box_id}
                                </div>
                                <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover/item:opacity-100 transition-all">
                                  <button onClick={() => editarBloque(b)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all" title="Editar bloque">
                                    <Edit2 size={14}/>
                                  </button>
                                  <button onClick={() => eliminarBloque(b)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Eliminar bloque">
                                    <Trash2 size={14}/>
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isMounted && typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
          {mostrarModalConflictos && (
            <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-[#0A111F]/60 backdrop-blur-sm p-4 text-left">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-[#FBF8F2] w-full max-w-5xl max-h-[90vh] flex flex-col rounded-[3rem] shadow-2xl overflow-hidden text-left"
              >
                <div className={`${modoModal === 'bloquear' ? 'bg-red-500' : 'bg-blue-600'} p-8 md:p-10 flex items-center justify-between shrink-0 shadow-sm relative z-10 transition-colors text-left`}>
                  <div className="flex items-center gap-5 text-white">
                    <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
                      {modoModal === 'bloquear' ? <AlertCircle size={32} /> : <Users size={32} />}
                    </div>
                    <div>
                      <h2 className="text-2xl font-black uppercase italic leading-none tracking-tight">Pacientes Pendientes</h2>
                      <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.3em] mt-2">
                        {citasConflictivas.length} citas detectadas el {fechaInasistencia}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setMostrarModalConflictos(false)} className={`p-3 text-white rounded-full transition-all backdrop-blur-md ${modoModal === 'bloquear' ? 'bg-red-600/50 hover:bg-red-700' : 'bg-blue-700/50 hover:bg-blue-800'}`}>
                    <X size={20} />
                  </button>
                </div>

                <div className="p-8 md:p-10 overflow-y-auto bg-[#FBF8F2] flex-1 space-y-6 custom-scrollbar text-left">
                  
                  {citasConflictivas.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center text-center">
                      <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500 mb-6 shadow-inner">
                        <CheckCircle2 size={48} />
                      </div>
                      <p className="text-xl font-black text-[#0A111F] uppercase tracking-tight">Agenda Limpia</p>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-2">Todos los pacientes han sido gestionados.</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 flex items-start gap-4 shadow-sm text-left">
                        <Info size={20} className="text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-xs font-bold text-blue-800 leading-relaxed">
                          Puedes gestionar a los pacientes directamente desde este panel reagendando o cancelando sus horas. <br className="hidden md:block"/>
                          {modoModal === 'bloquear' && 'Si decides no hacerlo ahora, presiona "Forzar Bloqueo" al final y las citas quedarán como pendientes para más tarde.'}
                        </p>
                      </div>

                      <div className="space-y-4">
                        {citasConflictivas.map((cita) => {
                          let horaFomateada = "Sin hora";
                          try { horaFomateada = new Date(cita.inicio).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }); } catch (e) {}
                          
                          const telefonoLimpio = cita.pacientes?.telefono ? cita.pacientes.telefono.replace(/\D/g, '') : '';
                          const isEditing = citaEnEdicion === cita.id;

                          let durationStr = "45 min";
                          try {
                            const dMins = Math.round((new Date(cita.fin).getTime() - new Date(cita.inicio).getTime()) / 60000);
                            if (dMins > 0) durationStr = `${dMins} min`;
                          } catch (e) {}

                          return (
                            <div key={cita.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col group transition-all text-left">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="flex items-center gap-5">
                                  <div className="w-16 h-16 rounded-2xl bg-slate-50 text-slate-600 flex flex-col items-center justify-center border border-slate-100 shrink-0 shadow-inner">
                                    <Clock size={16} className="mb-1 opacity-40 text-[#C9A24B]" />
                                    <span className="text-[11px] font-black">{horaFomateada}</span>
                                  </div>
                                  <div>
                                    <h4 className="font-black text-base text-[#0A111F] uppercase leading-none tracking-tight">{cita.pacientes?.nombre} {cita.pacientes?.apellido}</h4>
                                    <div className="flex flex-wrap items-center gap-3 mt-3">
                                      <span className="text-[9px] font-bold text-slate-500 tracking-widest bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-200 flex items-center gap-1.5 uppercase">
                                        <Clock size={10} className="text-[#C9A24B]"/> {durationStr}
                                      </span>
                                      <span className="text-[9px] font-bold text-slate-500 tracking-widest bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-200 uppercase">
                                        RUT: {cita.pacientes?.rut || 'Sin registrar'}
                                      </span>
                                      {telefonoLimpio && (
                                        <span className="text-[9px] font-bold text-blue-600 tracking-widest flex items-center gap-1.5 bg-blue-50 px-2.5 py-1.5 rounded-md border border-blue-100 uppercase">
                                          <Phone size={10}/> {cita.pacientes.telefono}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {!isEditing && (
                                  <div className="flex flex-wrap gap-2 self-start md:self-auto shrink-0">
                                    {telefonoLimpio && (
                                      <>
                                        <a href={`tel:${telefonoLimpio}`} className="w-10 h-10 flex items-center justify-center bg-slate-50 border border-slate-200 text-slate-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 rounded-full transition-all shadow-sm" title="Llamar">
                                          <Phone size={16} />
                                        </a>
                                        <a href={`https://wa.me/${telefonoLimpio}`} target="_blank" rel="noreferrer" className="w-10 h-10 flex items-center justify-center bg-slate-50 border border-slate-200 text-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 rounded-full transition-all shadow-sm" title="WhatsApp">
                                          <MessageCircle size={16} />
                                        </a>
                                      </>
                                    )}
                                    <div className="w-px h-6 bg-slate-200 mx-1 self-center hidden sm:block"></div>
                                    <button onClick={() => {
                                      const dInicio = new Date(cita.inicio);
                                      const dFin = new Date(cita.fin);
                                      const calcMins = Math.round((dFin.getTime() - dInicio.getTime()) / 60000);
                                      setDuracionCitaEdicion(calcMins > 0 ? calcMins : 45);

                                      setCitaEnEdicion(cita.id);
                                      setNuevaFecha(''); setNuevaHora(''); setNuevoBox(1);
                                      setNuevoEspecialista(profesionalId);
                                    }} className="px-5 py-2 bg-[#C9A24B]/10 border border-[#C9A24B]/30 text-[#C9A24B] text-[10px] font-black uppercase tracking-widest hover:bg-[#C9A24B] hover:text-white rounded-full transition-all flex items-center gap-2 shadow-sm" title="Reagendar">
                                      <CalendarClock size={14} /> Reagendar
                                    </button>
                                    <button onClick={() => anularCitaDirecta(cita.id)} className="w-10 h-10 flex items-center justify-center bg-slate-50 border border-slate-200 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-full transition-all shadow-sm" title="Cancelar Cita">
                                      <Ban size={16} />
                                    </button>
                                  </div>
                                )}
                              </div>

                              <AnimatePresence>
                                {isEditing && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                    <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col gap-6 text-left">
                                      
                                      <div className="flex flex-col md:flex-row gap-5 items-center justify-between">
                                        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto flex-1">
                                          <div className="space-y-2 flex-1">
                                            <label className="text-[9px] font-black text-[#C9A24B] uppercase tracking-widest ml-2 flex items-center gap-1.5"><Stethoscope size={12}/> Derivar a Especialista</label>
                                            <select className="w-full p-4 bg-white border border-[#C9A24B]/30 shadow-sm rounded-2xl font-bold text-xs outline-none text-[#0A111F] focus:border-[#C9A24B] transition-colors" value={nuevoEspecialista} onChange={(e) => setNuevoEspecialista(e.target.value)}>
                                              {profesionales.map(p => <option key={p.user_id} value={p.user_id}>Dr. {p.nombre} {p.apellido}</option>)}
                                            </select>
                                          </div>
                                          <div className="space-y-2 sm:w-32 shrink-0">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Asignar Box</label>
                                            <select className="w-full p-4 bg-white border border-slate-200 shadow-sm rounded-2xl font-bold text-xs outline-none focus:border-[#C9A24B] transition-colors text-slate-800" value={nuevoBox} onChange={(e) => setNuevoBox(Number(e.target.value))}>
                                              <option value={1}>BOX 1</option><option value={2}>BOX 2</option><option value={3}>BOX 3</option>
                                            </select>
                                          </div>
                                        </div>
                                        <div className="bg-emerald-50 px-5 py-4 rounded-2xl border border-emerald-100 self-end md:self-auto shadow-sm">
                                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Buscando bloques de {duracionCitaEdicion} min</span>
                                        </div>
                                      </div>

                                      <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-200 flex flex-col shadow-inner">
                                        
                                        <div className="flex items-center justify-between mb-5 bg-white p-2.5 rounded-2xl shadow-sm border border-slate-100">
                                          <button onClick={prevWeek} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-700 transition-all border border-transparent hover:border-slate-200"><ChevronLeft size={18}/></button>
                                          <span className="text-[10px] font-black text-[#0A111F] uppercase tracking-widest">
                                            Semana del {semanaInicio.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                                          </span>
                                          <button onClick={nextWeek} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-700 transition-all border border-transparent hover:border-slate-200"><ChevronRight size={18}/></button>
                                        </div>

                                        <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                                          {cargandoSlots ? (
                                            <div className="w-full py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                                              <Loader2 className="animate-spin text-[#C9A24B]" size={28} />
                                              <span className="text-[10px] font-black uppercase tracking-widest">Calculando disponibilidad...</span>
                                            </div>
                                          ) : (
                                            dispoSemana.map((dia, idx) => {
                                              const nombreDia = dia.dateObj.toLocaleDateString('es-CL', { weekday: 'short' });
                                              const numDia = dia.dateObj.getDate();
                                              const esHoy = dia.date === new Date().toISOString().split('T')[0];

                                              return (
                                                <div key={idx} className={`min-w-[120px] flex-1 bg-white border ${esHoy ? 'border-[#C9A24B] shadow-md' : 'border-slate-200 shadow-sm'} rounded-[1.5rem] p-4 flex flex-col items-center`}>
                                                  <div className="text-center mb-4 border-b border-slate-50 w-full pb-2">
                                                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{nombreDia}</span>
                                                    <span className={`block text-xl font-black ${esHoy ? 'text-[#C9A24B]' : 'text-[#0A111F]'}`}>{numDia}</span>
                                                  </div>

                                                  <div className="w-full flex-1 flex flex-col gap-2 overflow-y-auto max-h-48 pr-1 custom-scrollbar">
                                                    {dia.status === 'bloqueado' && <span className="text-[9px] font-bold text-red-400 text-center py-4 italic">Día Bloqueado</span>}
                                                    {dia.status === 'sin_horario' && <span className="text-[9px] font-bold text-slate-300 text-center py-4 italic">Sin Horario</span>}
                                                    {dia.status === 'lleno' && <span className="text-[9px] font-bold text-amber-500 text-center py-4 italic">Agenda Llena</span>}
                                                    
                                                    {dia.status === 'limpio' && dia.slots.map((slot: string, sIdx: number) => {
                                                      const isSelected = nuevaFecha === dia.date && nuevaHora === slot;
                                                      return (
                                                        <button
                                                          key={sIdx}
                                                          onClick={() => { setNuevaFecha(dia.date); setNuevaHora(slot); }}
                                                          className={`w-full py-2.5 rounded-xl text-[11px] font-black transition-all border tracking-widest ${isSelected ? 'bg-emerald-500 text-white border-emerald-600 shadow-md shadow-emerald-500/30' : 'bg-slate-50 text-emerald-600 border-emerald-100 hover:bg-emerald-50 hover:border-emerald-200'}`}
                                                        >
                                                          {slot}
                                                        </button>
                                                      )
                                                    })}
                                                  </div>
                                                </div>
                                              )
                                            })
                                          )}
                                        </div>
                                      </div>
                                      
                                      <div className="mt-2 flex flex-col md:flex-row items-center justify-between gap-5 border-t border-slate-200 pt-6">
                                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white px-5 py-3 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto text-center md:text-left">
                                          Turno Seleccionado: <span className={nuevaHora ? "text-emerald-600 ml-1" : "text-red-400 ml-1"}>
                                            {nuevaHora ? `${nuevaFecha} a las ${nuevaHora} hrs.` : "Ninguno"}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3 w-full md:w-auto">
                                          <button onClick={() => setCitaEnEdicion(null)} className="flex-1 md:flex-none px-6 py-4 bg-white border border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-[#0A111F] rounded-2xl transition-all shadow-sm">Cancelar</button>
                                          <button onClick={() => reagendarCitaDirecta(cita.id)} disabled={guardando || !nuevaHora} className={`flex-1 md:flex-none px-8 py-4 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all ${nuevaHora ? 'bg-[#0A111F] hover:bg-[#1a2538] active:scale-95' : 'bg-slate-300 cursor-not-allowed'}`}>
                                            {guardando ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Confirmar
                                          </button>
                                        </div>
                                      </div>

                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                <div className="p-8 bg-white border-t border-slate-100 shrink-0 flex flex-col md:flex-row gap-4 text-left">
                  {modoModal === 'bloquear' ? (
                    <>
                      <button onClick={() => setMostrarModalConflictos(false)} className="px-8 py-5 text-[11px] font-black text-slate-400 uppercase tracking-widest hover:text-[#0A111F] transition-colors border border-slate-200 rounded-[2rem] hover:bg-slate-50 w-full md:w-auto text-center">
                        Cancelar y Cerrar
                      </button>
                      <button onClick={ejecutarBloqueoFinal} disabled={guardando} className="flex-1 py-5 bg-[#0A111F] text-[#C9A24B] border-2 border-[#0A111F] font-black text-[11px] uppercase tracking-widest rounded-[2rem] shadow-xl hover:bg-[#1a2538] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
                        {guardando ? <Loader2 className="animate-spin" size={18}/> : <AlertCircle size={18}/>}
                        {citasConflictivas.length > 0 ? "Forzar Bloqueo del Día (Dejar Pendientes)" : "Confirmar Bloqueo de Agenda"}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setMostrarModalConflictos(false)} className="w-full py-5 bg-[#0A111F] text-[#C9A24B] font-black text-[11px] uppercase tracking-widest rounded-[2rem] shadow-xl hover:bg-[#1a2538] transition-all">
                      Finalizar Revisión y Cerrar Panel
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      ) : null}
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </main>
  )
}

export interface Profesional {
  id: string;
  user_id: string;
  nombre: string;
  apellido: string;
  [k: string]: any;
}

export interface HoraSeleccionada {
  fecha: string; // YYYY-MM-DD
  hora: string;  // HH:MM
  duracion: number;
}

// Cómo se abre el modal de agendar: nueva cita, reprogramación, control sugerido o desde "Buscar hora"
export interface AgendarConfig {
  id: number;                    // cambia en cada apertura para reiniciar el formulario
  citaReprogramar?: any;         // si viene, el modal reprograma esta cita
  profesionalId?: string;
  duracion?: number;
  semanaInicio?: string;         // YYYY-MM-DD de cualquier día de la semana a mostrar
  horas?: HoraSeleccionada[];
  diaSugerido?: string | null;   // se destaca en verde
  paciente?: any;
  motivo?: string;
}

export interface Hueco {
  fecha: string;
  hora: string;
  duracion: number;
  profesional_id: string;
  doctor: string;
}

export interface FinanzasPaciente {
  total: number;
  abonado: number;
  deuda: number;
  deuda_realizada: number;
}

// Continuidad del paciente: para que no se vaya sin su próxima hora
export interface Continuidad {
  futuras: { id: string; inicio: string }[]; // citas desde el primer día mostrado (sin anuladas ni inasistencias)
  pendientes: number;                         // prestaciones por hacer en presupuestos aprobados o con abono
  tratamiento: string | null;                 // tratamiento que tiene esas prestaciones
  proxima: string | null;                     // primera prestación pendiente (se sugiere como motivo)
  doctorId: string | null;                    // doctor (user_id) de esa prestación
  presupuestoPorDecidir: string | null;       // presupuesto reciente que aún no aprueba
}

// Lo que se muestra en la tarjeta cuando el paciente no tiene otra hora agendada
export interface SinProximaHora {
  motivo: 'pendientes' | 'presupuesto';
  texto: string;        // "3 prestaciones pendientes · Rehabilitación" / "Presupuesto por decidir · Implantes"
  sugerencia: string;   // motivo sugerido para la próxima cita
  doctorId: string | null;
}

// Paciente que faltó (última inasistencia del período) y qué pasó después
export interface Inasistencia {
  cita: any;                       // la última cita a la que faltó (con pacientes)
  veces: number;                   // cuántas veces faltó en el período
  siguiente: { inicio: string; estado: string; profesional_id: string | null } | null; // primera cita después de esa falta
  contacto: { resultado: string; created_at: string } | null;                          // último contacto registrado por la falta
}

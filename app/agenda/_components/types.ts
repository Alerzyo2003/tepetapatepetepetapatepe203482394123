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

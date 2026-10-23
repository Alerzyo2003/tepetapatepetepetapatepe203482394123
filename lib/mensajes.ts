// Mensajes de WhatsApp para hacer seguimiento a un presupuesto. No hablan de dinero: se centran en la salud
// y en retomar el tratamiento. Se usan en Desempeño, el Panel de Seguimiento, Presupuestos sin aprobar y
// Evaluaciones de implantes; si se quieren cambiar, se cambian aquí y quedan iguales en toda la app.

const FIRMA = 'te saludamos de Clínica Dignidad'
const hola = (nombre?: string | null) => {
  const primero = String(nombre || '').trim().split(/\s+/)[0]
  return primero ? `Hola ${primero}` : 'Hola'
}
const tuTratamiento = (tratamiento?: string | null) => {
  const t = String(tratamiento || '').trim().toLowerCase()
  return t && t !== 'tratamiento' && t !== 'presupuesto' ? `tu tratamiento de ${t}` : 'tu tratamiento'
}

// Hasta cuántos días un presupuesto se considera reciente (después se usa el mensaje para retomarlo)
export const DIAS_PRESUPUESTO_RECIENTE = 30

// Presupuesto reciente: seguimiento y cuidado de la salud oral
export const mensajePresupuestoReciente = (nombre: string | null | undefined, tratamiento?: string | null) =>
  `${hola(nombre)}, ${FIRMA}. Te escribimos para hacer seguimiento a ${tuTratamiento(tratamiento)}. Es importante no postergarlo para cuidar tu salud oral. ¿Te acomoda que te busquemos una hora?`

// Presupuesto antiguo: retomar, sin presión
export const mensajePresupuestoAntiguo = (nombre: string | null | undefined, tratamiento?: string | null) =>
  `${hola(nombre)}, ${FIRMA}. Hace un tiempo conversamos sobre ${tuTratamiento(tratamiento)} y queríamos saber cómo has estado. Si quieres retomarlo, aquí estamos para ayudarte.`

export const mensajePresupuesto = (nombre: string | null | undefined, tratamiento: string | null | undefined, dias: number | null) =>
  dias !== null && dias <= DIAS_PRESUPUESTO_RECIENTE ? mensajePresupuestoReciente(nombre, tratamiento) : mensajePresupuestoAntiguo(nombre, tratamiento)

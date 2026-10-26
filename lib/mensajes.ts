// Mensajes de WhatsApp para hacer seguimiento a un presupuesto. No hablan de dinero: se centran en la salud
// y en retomar el tratamiento. Se usan en Desempeño, el Panel de Seguimiento, Presupuestos sin aprobar y
// Evaluaciones de implantes; si se quieren cambiar, se cambian aquí y quedan iguales en toda la app.
//
// Para que WhatsApp no los tome como envío masivo, cada mensaje sale con una redacción distinta:
// se elige al azar el saludo, el cuerpo y la despedida (unas 60 combinaciones por tipo de mensaje).
// Todas las versiones dicen lo mismo con otras palabras.

const alAzar = <T,>(opciones: T[]): T => opciones[Math.floor(Math.random() * opciones.length)]

// Primer nombre con mayúscula inicial ("LUIS" → "Luis")
const primerNombre = (nombre?: string | null) => {
  const n = String(nombre || '').trim().split(/\s+/)[0] || ''
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : ''
}

// "Buenos días" / "Buenas tardes" / "Buenas noches" según la hora del computador
export const saludoSegunHora = (d: Date = new Date()) => {
  const h = d.getHours()
  return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}

// Primera frase: quién escribe. Ninguna versión usa "te escribimos" para no repetirlo en la frase siguiente.
// Con conPregunta = false no se usa "¿cómo estás?" (para mensajes que ya preguntan "cómo has estado").
const apertura = (nombre?: string | null, conPregunta = true) => {
  const n = primerNombre(nombre)
  const s = saludoSegunHora()
  return alAzar(n
    ? [
        `Hola ${n}, te saludamos de Clínica Dignidad.`,
        conPregunta ? `Hola ${n}, ¿cómo estás? Te saluda el equipo de Clínica Dignidad.` : `Hola ${n}, te saluda el equipo de Clínica Dignidad.`,
        `${s} ${n}, te saluda el equipo de Clínica Dignidad.`,
        `Hola ${n} 😊 Te saludamos desde Clínica Dignidad.`,
        `${n}, ${s.toLowerCase()}. Te saluda el equipo de Clínica Dignidad.`,
      ]
    : [
        'Hola, te saludamos de Clínica Dignidad.',
        `${s}, te saluda el equipo de Clínica Dignidad.`,
        'Hola 😊 Te saludamos desde Clínica Dignidad.',
      ])
}

const despedida = () => alAzar(['', '', ' ¡Saludos!', ' ¡Que estés muy bien!'])

const tuTratamiento = (tratamiento?: string | null) => {
  const t = String(tratamiento || '').trim().toLowerCase()
  return t && t !== 'tratamiento' && t !== 'presupuesto' ? `tu tratamiento de ${t}` : 'tu tratamiento'
}

// Hasta cuántos días un presupuesto se considera reciente (después se usa el mensaje para retomarlo)
export const DIAS_PRESUPUESTO_RECIENTE = 30

// Presupuesto reciente: seguimiento y cuidado de la salud oral
export const mensajePresupuestoReciente = (nombre: string | null | undefined, tratamiento?: string | null) => {
  const tt = tuTratamiento(tratamiento)
  const cuerpo = alAzar([
    `Te escribimos para hacer seguimiento a ${tt}. Es importante no postergarlo para cuidar tu salud oral. ¿Te acomoda que te busquemos una hora?`,
    `Queríamos saber cómo vas con ${tt}. Mientras antes lo retomes, mejor para tu salud oral. ¿Quieres que te busquemos una hora?`,
    `Te contactamos para darle seguimiento a ${tt}. No postergarlo ayuda a cuidar tu salud oral y a evitar molestias más adelante. ¿Te ayudamos a encontrar una hora que te acomode?`,
    `Hace unos días conversamos sobre ${tt} y queremos acompañarte en el siguiente paso. Cuidar tu salud oral a tiempo hace la diferencia. ¿Te buscamos una hora?`,
  ])
  return `${apertura(nombre)} ${cuerpo}${despedida()}`
}

// Presupuesto antiguo: retomar, sin presión
export const mensajePresupuestoAntiguo = (nombre: string | null | undefined, tratamiento?: string | null) => {
  const tt = tuTratamiento(tratamiento)
  const cuerpo = alAzar([
    `Hace un tiempo conversamos sobre ${tt} y queríamos saber cómo has estado. Si quieres retomarlo, aquí estamos para ayudarte.`,
    `Queríamos saber cómo has estado desde que conversamos sobre ${tt}. Cuando quieras retomarlo, aquí estaremos para ayudarte.`,
    `Hace un tiempo revisamos contigo ${tt} y queríamos saber cómo has estado. Si te gustaría retomarlo, con gusto te ayudamos.`,
    `Ha pasado un tiempo desde que conversamos sobre ${tt}. Esperamos que estés muy bien. Si quieres retomarlo, solo respóndenos este mensaje y te ayudamos.`,
  ])
  return `${apertura(nombre, false)} ${cuerpo}${despedida()}`
}

export const mensajePresupuesto = (nombre: string | null | undefined, tratamiento: string | null | undefined, dias: number | null) =>
  dias !== null && dias <= DIAS_PRESUPUESTO_RECIENTE ? mensajePresupuestoReciente(nombre, tratamiento) : mensajePresupuestoAntiguo(nombre, tratamiento)

// ─────────────────────────────────────────────────────────────────────────────
// Variar cualquier otro mensaje (controles, inasistencias, recordatorios, saldos…):
// cambia el saludo del comienzo y la pregunta final por otra que dice lo mismo.
// El resto del mensaje (fechas, horas, doctor, dirección, enlaces) queda igual.
// ─────────────────────────────────────────────────────────────────────────────
const PREGUNTAS: [string, string[]][] = [
  ['¿Te agendamos una hora?', ['¿Te agendamos una hora?', '¿Quieres que te agendemos una hora?', '¿Te buscamos una hora?', '¿Te reservamos una hora?']],
  ['¿Te agendamos tu próxima hora?', ['¿Te agendamos tu próxima hora?', '¿Quieres que te agendemos la próxima hora?', '¿Te buscamos tu próxima hora?']],
  ['¿Te ayudamos a buscar una nueva hora?', ['¿Te ayudamos a buscar una nueva hora?', '¿Quieres que te busquemos una nueva hora?', '¿Te ayudamos a reagendar?']],
  ['¿Te gustaría que te busquemos una nueva hora?', ['¿Te gustaría que te busquemos una nueva hora?', '¿Quieres que te ayudemos a buscar otra hora?', '¿Te buscamos una nueva hora?']],
  ['¿Te acomoda que lo conversemos?', ['¿Te acomoda que lo conversemos?', '¿Lo conversamos cuando te acomode?', '¿Te parece si lo conversamos?']],
]

export function variarMensaje(texto: string): string {
  if (!texto) return texto
  const s = saludoSegunHora()
  let m = texto

  // "Hola Juan, te escribimos de Clínica Dignidad para recordar…" (la frase sigue después de "para")
  const conPara = m.match(/^Hola ?([^,\n]*?), te escribimos de Clínica Dignidad para /)
  if (conPara) {
    const n = conPara[1].trim()
    const con = n ? ` ${n}` : ''
    m = alAzar([
      `Hola${con}, te escribimos de Clínica Dignidad para `,
      `${s}${con}, te escribimos de Clínica Dignidad para `,
      `Hola${con} 😊 Te escribimos desde Clínica Dignidad para `,
      `Hola${con}, ¿cómo estás? Te escribimos de Clínica Dignidad para `,
    ]) + m.slice(conPara[0].length)
  } else {
    // "Hola Juan, te saludamos de Clínica Dignidad." / "…te escribimos de Clínica Dignidad 😁."
    const simple = m.match(/^Hola ?([^,\n]*?), te (?:saludamos|escribimos) de Clínica Dignidad(?: [^\s.]{1,4})?\. /)
    if (simple) m = `${apertura(simple[1])} ${m.slice(simple[0].length)}`
  }

  for (const [original, opciones] of PREGUNTAS) {
    if (m.includes(original)) m = m.replace(original, alAzar(opciones))
  }
  return m
}

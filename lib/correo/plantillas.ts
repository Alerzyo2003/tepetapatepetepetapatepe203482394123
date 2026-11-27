// Plantillas de correo de la clínica. HTML simple con estilos en línea (así se ve bien en Gmail, Outlook y el celular).
export const CLINICA = {
  nombre: 'Clínica Dignidad',
  direccion: 'Av. Venancia Leiva 1871, La Pintana',
  whatsapp: '+56 9 6646 7641',
  whatsappLink: 'https://wa.me/56966467641',
  urlConfirmar: 'https://agendar.clinicadignidad.cl/confirmar',
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const clp = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`

export const fechaLargaES = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' })
export const horaHHMM = (ts: string) => String(ts).replace(' ', 'T').slice(11, 16)

function boton(texto: string, url: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0"><tr><td style="border-radius:10px;background:#0A111F">
    <a href="${esc(url)}" style="display:inline-block;padding:13px 26px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px">${esc(texto)}</a>
  </td></tr></table>`
}

function layout(titulo: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#F4F1EA">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F1EA;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#0A111F;padding:22px 28px">
          <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#ffffff">${CLINICA.nombre}</p>
          <p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C9A24B">${esc(titulo)}</p>
        </td></tr>
        <tr><td style="padding:28px;font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937">
          ${cuerpo}
        </td></tr>
        <tr><td style="padding:18px 28px;background:#FBF8F2;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#6b7280">
          ${CLINICA.nombre} · ${CLINICA.direccion}<br>
          WhatsApp: <a href="${CLINICA.whatsappLink}" style="color:#8A6D2F">${CLINICA.whatsapp}</a><br>
          Este es un correo automático. Si tienes dudas, escríbenos por WhatsApp o responde este correo.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export interface CitaCorreo { id: string; inicio: string; doctor: string }

function listaCitas(citas: CitaCorreo[]) {
  return citas.map(c => `<tr>
    <td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:bold;color:#0A111F;white-space:nowrap">${horaHHMM(c.inicio)} hrs</td>
    <td style="padding:10px 14px;border-bottom:1px solid #eee">${esc(c.doctor)}</td></tr>`).join('')
}

// Recordatorio del día anterior, con enlace para confirmar
export function plantillaRecordatorio(nombre: string, fechaISO: string, citas: CitaCorreo[]) {
  const dia = fechaLargaES(fechaISO)
  const asunto = `Recordatorio: tu cita en ${CLINICA.nombre} es mañana ${dia}`
  const enlaces = citas.length === 1
    ? boton('Confirmar mi asistencia', `${CLINICA.urlConfirmar}/${citas[0].id}`)
    : citas.map(c => boton(`Confirmar cita de las ${horaHHMM(c.inicio)}`, `${CLINICA.urlConfirmar}/${c.id}`)).join('')
  const html = layout('Recordatorio de cita', `
    <p style="margin:0 0 14px">Hola <b>${esc(nombre)}</b>,</p>
    <p style="margin:0 0 14px">Te recordamos que tienes ${citas.length === 1 ? 'una cita' : 'citas'} con nosotros <b>mañana ${esc(dia)}</b>:</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #eee;border-radius:10px;border-collapse:separate">${listaCitas(citas)}</table>
    <p style="margin:16px 0 0">📍 ${CLINICA.direccion}</p>
    <p style="margin:14px 0 0">Por la alta demanda de horas, <b>te pedimos confirmar tu asistencia</b>. Si no puedes venir, avísanos para darle la hora a otro paciente.</p>
    ${enlaces}`)
  const texto = `Hola ${nombre}, te recordamos tu cita en ${CLINICA.nombre} mañana ${dia}:\n` +
    citas.map(c => `- ${horaHHMM(c.inicio)} hrs con ${c.doctor}. Confirma aquí: ${CLINICA.urlConfirmar}/${c.id}`).join('\n') +
    `\n\nDirección: ${CLINICA.direccion}. WhatsApp: ${CLINICA.whatsapp}`
  return { asunto, html, texto }
}

// Confirmación al momento de agendar
export function plantillaConfirmacion(nombre: string, citas: CitaCorreo[]) {
  const asunto = citas.length === 1
    ? `Tu hora quedó agendada: ${fechaLargaES(citas[0].inicio)} a las ${horaHHMM(citas[0].inicio)} hrs`
    : `Tus horas quedaron agendadas en ${CLINICA.nombre}`
  const filas = citas.map(c => `<tr>
    <td style="padding:10px 14px;border-bottom:1px solid #eee;text-transform:capitalize">${esc(fechaLargaES(c.inicio))}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:bold;color:#0A111F;white-space:nowrap">${horaHHMM(c.inicio)} hrs</td>
    <td style="padding:10px 14px;border-bottom:1px solid #eee">${esc(c.doctor)}</td></tr>`).join('')
  const html = layout('Hora agendada', `
    <p style="margin:0 0 14px">Hola <b>${esc(nombre)}</b>,</p>
    <p style="margin:0 0 14px">Tu ${citas.length === 1 ? 'hora quedó agendada' : 'horas quedaron agendadas'}:</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #eee;border-radius:10px;border-collapse:separate">${filas}</table>
    <p style="margin:16px 0 0">📍 ${CLINICA.direccion}</p>
    <p style="margin:14px 0 0">Te enviaremos un recordatorio el día antes. Si necesitas cambiar la hora, escríbenos por WhatsApp.</p>`)
  const texto = `Hola ${nombre}, tu hora en ${CLINICA.nombre} quedó agendada:\n` +
    citas.map(c => `- ${fechaLargaES(c.inicio)} a las ${horaHHMM(c.inicio)} hrs con ${c.doctor}`).join('\n') +
    `\n\nDirección: ${CLINICA.direccion}. WhatsApp: ${CLINICA.whatsapp}`
  return { asunto, html, texto }
}

// Documentos con PDF adjunto
export function plantillaDocumento(tipo: 'presupuesto' | 'receta' | 'comprobante', nombre: string, detalle?: { titulo?: string; total?: number; doctor?: string }) {
  const cfg = {
    presupuesto: {
      titulo: 'Presupuesto',
      asunto: `Tu presupuesto de ${CLINICA.nombre}${detalle?.titulo ? `: ${detalle.titulo}` : ''}`,
      texto: `Te enviamos adjunto el presupuesto de tu tratamiento${detalle?.titulo ? ` <b>${esc(detalle.titulo)}</b>` : ''}${detalle?.total ? ` por un total de <b>${clp(detalle.total)}</b>` : ''}.`,
      cierre: 'Si tienes dudas sobre el tratamiento o las formas de pago, escríbenos y te ayudamos. ¡Podemos agendar tu próxima hora cuando quieras!',
    },
    receta: {
      titulo: 'Receta',
      asunto: `Tu receta de ${CLINICA.nombre}`,
      texto: `Te enviamos adjunta tu receta${detalle?.doctor ? `, emitida por ${esc(detalle.doctor)}` : ''}.`,
      cierre: 'Sigue las indicaciones tal como están escritas. Si tienes cualquier molestia o duda, escríbenos.',
    },
    comprobante: {
      titulo: 'Comprobante de pago',
      asunto: `Comprobante de pago · ${CLINICA.nombre}`,
      texto: `Te enviamos adjunto el comprobante de tu pago${detalle?.total ? ` por <b>${clp(detalle.total)}</b>` : ''}. ¡Gracias!`,
      cierre: 'Guárdalo como respaldo de tu pago.',
    },
  }[tipo]
  const html = layout(cfg.titulo, `
    <p style="margin:0 0 14px">Hola <b>${esc(nombre)}</b>,</p>
    <p style="margin:0 0 14px">${cfg.texto}</p>
    <p style="margin:0 0 14px">${cfg.cierre}</p>
    <p style="margin:18px 0 0;font-size:13px;color:#6b7280">📎 El documento va adjunto en PDF.</p>`)
  const plano = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  const texto = `Hola ${nombre}, ${plano(cfg.texto)} ${cfg.cierre}\n\n${CLINICA.nombre} · WhatsApp ${CLINICA.whatsapp}`
  return { asunto: cfg.asunto, html, texto }
}

export function plantillaPrueba() {
  return {
    asunto: `Prueba de correo · ${CLINICA.nombre}`,
    html: layout('Correo de prueba', `<p style="margin:0">¡Funciona! Este es un correo de prueba enviado desde la app de ${CLINICA.nombre}.</p>`),
    texto: `Funciona: correo de prueba de la app de ${CLINICA.nombre}.`,
  }
}

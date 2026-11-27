// Envío de correos por SMTP con la casilla de la clínica (Benzahosting / cPanel).
// SOLO servidor: usa las credenciales SMTP_* guardadas como variables de entorno en Vercel.
//   SMTP_HOST   ej: mail.clinicadignidad.cl
//   SMTP_PORT   465 (SSL) o 587 (STARTTLS). Por defecto 465
//   SMTP_USER   ej: citas@clinicadignidad.cl
//   SMTP_PASS   contraseña de la casilla
//   SMTP_FROM   opcional, ej: "Clínica Dignidad <citas@clinicadignidad.cl>"
//   SMTP_TLS_INSECURE  opcional, "1" solo si el certificado del servidor de correo da error
import nodemailer, { type Transporter } from 'nodemailer'

let transporte: Transporter | null = null

export const correoConfigurado = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)

function obtenerTransporte(): Transporter {
  if (!correoConfigurado()) throw new Error('El correo no está configurado: faltan las variables SMTP_HOST, SMTP_USER y SMTP_PASS en Vercel.')
  if (!transporte) {
    const port = Number(process.env.SMTP_PORT || 465)
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Solo si el certificado del servidor de correo no coincide con el dominio (pasa en algunos hosting compartidos)
      ...(process.env.SMTP_TLS_INSECURE === '1' ? { tls: { rejectUnauthorized: false } } : {}),
      // Los hosting compartidos a veces cortan conexiones lentas: tiempos acotados para no colgar la función
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    })
  }
  return transporte
}

export const remitente = () => process.env.SMTP_FROM || `Clínica Dignidad <${process.env.SMTP_USER}>`

export const emailValido = (e?: string | null) => !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim())

export interface Adjunto { filename: string; content: Buffer; contentType?: string }

export async function enviarCorreo(opts: { para: string; asunto: string; html: string; texto: string; adjuntos?: Adjunto[] }) {
  const t = obtenerTransporte()
  const info = await t.sendMail({
    from: remitente(),
    to: opts.para.trim(),
    replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_USER,
    subject: opts.asunto,
    html: opts.html,
    text: opts.texto,
    attachments: opts.adjuntos,
  })
  return info.messageId as string
}

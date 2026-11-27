'use server'
// Acciones de servidor para enviar correos desde la app (requieren una sesión del equipo de la clínica).
import { type CookieOptions, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/admin'
import { correoConfigurado, emailValido, enviarCorreo } from '@/lib/correo/enviar'
import { plantillaDocumento, plantillaPrueba } from '@/lib/correo/plantillas'
import { enviarConfirmacionCitas, registrarCorreo } from '@/lib/correo/citas'

const BUCKET = 'correos_adjuntos'
const ROLES_EQUIPO = ['ADMIN', 'ASISTENTE', 'DENTISTA', 'RECEPCIONISTA']

async function usuarioActual() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { try { cookieStore.set(name, value, options) } catch { /* solo lectura */ } },
      remove(name: string, options: CookieOptions) { try { cookieStore.set(name, '', options) } catch { /* solo lectura */ } },
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol, nombre_completo').eq('id', user.id).single()
  if (!perfil || !ROLES_EQUIPO.includes(perfil.rol)) throw new Error('Sin permisos')
  return { id: user.id, rol: perfil.rol as string, nombre: perfil.nombre_completo as string }
}

export async function estadoCorreo() {
  await usuarioActual()
  return { configurado: correoConfigurado(), casilla: process.env.SMTP_USER || null }
}

export async function enviarConfirmacionCita(citaIds: string[]) {
  try {
    const u = await usuarioActual()
    if (!correoConfigurado()) return { enviado: false, motivo: 'no_configurado' }
    return await enviarConfirmacionCitas(citaIds, u.id)
  } catch (e: any) {
    return { enviado: false, motivo: 'error', error: e?.message || String(e) }
  }
}

export async function enviarDocumentoPorCorreo(p: {
  tipo: 'presupuesto' | 'receta' | 'comprobante'
  pacienteId: string
  para: string
  ruta: string               // archivo PDF ya subido al bucket correos_adjuntos
  nombreArchivo: string
  referenciaId?: string | null
  titulo?: string | null
  total?: number | null
  doctor?: string | null
  guardarEnFicha?: boolean   // guarda el correo en la ficha si no tenía uno
}) {
  let u: Awaited<ReturnType<typeof usuarioActual>>
  try { u = await usuarioActual() } catch (e: any) { return { ok: false, error: e?.message || 'Sin permisos' } }
  const para = String(p.para || '').trim()
  const borrar = () => supabaseAdmin.storage.from(BUCKET).remove([p.ruta]).catch(() => {})
  try {
    if (!correoConfigurado()) return { ok: false, error: 'El correo de la clínica aún no está configurado.' }
    if (!emailValido(para)) return { ok: false, error: 'El correo del paciente no es válido.' }
    if (!['presupuesto', 'receta', 'comprobante'].includes(p.tipo)) return { ok: false, error: 'Tipo de documento no válido.' }
    if (!p.ruta.startsWith(`${p.pacienteId}/`)) return { ok: false, error: 'Archivo no válido.' }

    const { data: pac } = await supabaseAdmin.from('pacientes').select('id, nombre, apellido, email').eq('id', p.pacienteId).single()
    if (!pac) return { ok: false, error: 'Paciente no encontrado.' }

    const { data: archivo, error: errDesc } = await supabaseAdmin.storage.from(BUCKET).download(p.ruta)
    if (errDesc || !archivo) return { ok: false, error: 'No se pudo leer el PDF.' }
    const contenido = Buffer.from(await archivo.arrayBuffer())

    const nombre = String(pac.nombre || '').trim().split(/\s+/)[0] || 'paciente'
    const { asunto, html, texto } = plantillaDocumento(p.tipo, nombre, { titulo: p.titulo || undefined, total: p.total || undefined, doctor: p.doctor || undefined })
    const nombreArchivo = (p.nombreArchivo || `${p.tipo}.pdf`).replace(/[^\w.\-]+/g, '_')

    try {
      await enviarCorreo({ para, asunto, html, texto, adjuntos: [{ filename: nombreArchivo, content: contenido, contentType: 'application/pdf' }] })
    } catch (e: any) {
      await registrarCorreo({ tipo: p.tipo, paciente_id: pac.id, referencia_id: p.referenciaId || null, para, asunto, estado: 'error', error: String(e?.message || e).slice(0, 500), enviado_por: u.id })
      return { ok: false, error: `No se pudo enviar: ${e?.message || e}` }
    }
    await registrarCorreo({ tipo: p.tipo, paciente_id: pac.id, referencia_id: p.referenciaId || null, para, asunto, estado: 'enviado', enviado_por: u.id })

    if (p.guardarEnFicha && !emailValido(pac.email)) {
      await supabaseAdmin.from('pacientes').update({ email: para }).eq('id', pac.id)
    }
    await supabaseAdmin.from('auditoria_clinica').insert({
      accion: 'CORREO / ENVÍO', tabla: 'correos_enviados', paciente_id: pac.id, registro_afectado_id: p.referenciaId || null,
      nombre_usuario: u.nombre || null,
      detalles: `Envió por correo ${p.tipo === 'comprobante' ? 'el comprobante de pago' : `la ${p.tipo === 'receta' ? 'receta' : 'cotización/presupuesto'}`} a ${para} (${pac.nombre} ${pac.apellido}).`,
    })
    return { ok: true, para }
  } finally {
    await borrar()
  }
}

export async function enviarCorreoPrueba(para: string) {
  try {
    const u = await usuarioActual()
    if (u.rol !== 'ADMIN') return { ok: false, error: 'Solo administración puede enviar la prueba.' }
    if (!correoConfigurado()) return { ok: false, error: 'Faltan las variables SMTP en Vercel.' }
    if (!emailValido(para)) return { ok: false, error: 'Correo no válido.' }
    const { asunto, html, texto } = plantillaPrueba()
    try {
      await enviarCorreo({ para, asunto, html, texto })
    } catch (e: any) {
      await registrarCorreo({ tipo: 'prueba', para, asunto, estado: 'error', error: String(e?.message || e).slice(0, 500), enviado_por: u.id })
      return { ok: false, error: String(e?.message || e) }
    }
    await registrarCorreo({ tipo: 'prueba', para, asunto, estado: 'enviado', enviado_por: u.id })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

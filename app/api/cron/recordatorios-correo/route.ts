// Recordatorio automático por correo de las citas de mañana.
// Lo llama Vercel Cron una vez al día (ver vercel.json). Vercel envía "Authorization: Bearer <CRON_SECRET>".
import { NextResponse } from 'next/server'
import { correoConfigurado } from '@/lib/correo/enviar'
import { enviarRecordatoriosDelDia, fechaChile } from '@/lib/correo/citas'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!correoConfigurado()) return NextResponse.json({ ok: false, error: 'Correo no configurado' }, { status: 200 })
  try {
    const resumen = await enviarRecordatoriosDelDia(fechaChile(1))
    console.log('Recordatorios por correo', resumen)
    return NextResponse.json({ ok: true, ...resumen })
  } catch (e: any) {
    console.error('Error en recordatorios por correo', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

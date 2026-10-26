'use server'
import { type CookieOptions, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/admin'
import { ROLES_STAFF, limiteRol, type RolStaff } from '@/lib/planes'
import { leerSuscripcion, contarUsoPorRol, validarCupo, conectadaAlPortal, llamarPortal } from '@/lib/suscripcion'

const VIRTUAL_DOMAIN = '@dentapro.com' // Dominio virtual para correos de staff

async function verificarAdmin() {
  // 1. Add "await" here
  const cookieStore = await cookies() 
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          // 2. cookieStore is now properly resolved
          return cookieStore.get(name)?.value 
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set(name, value, options)
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set(name, '', options)
        },
      },
    }
  )
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'ADMIN') throw new Error('Sin permisos')
}

export async function crearCuentaProfesional(formData: any) {
  let authUserId: string | null = null;

  try {
    await verificarAdmin()
    const { nombre, apellido, username, password, especialidad_id, rol, rut } = formData;
    if (!ROLES_STAFF.includes(rol)) return { error: 'Rol no válido' };
    if (!password || String(password).length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres' };
    const sinCupo = await validarCupo(rol);
    if (sinCupo) return { error: sinCupo };
    const nombreCompleto = `${nombre} ${apellido}`;
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9.]/g, "");
    const virtualEmail = `${cleanUsername}${VIRTUAL_DOMAIN}`;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: virtualEmail,
      password: password,
      email_confirm: true,
      // El rol va en app_metadata (no editable por el usuario); el trigger de 'perfiles' lo mantiene al día
      app_metadata: { rol },
      user_metadata: { nombre_completo: nombreCompleto, username: cleanUsername, rut: rut }
    })
    if (authError) return { error: `Error Auth: ${authError.message}` };
    authUserId = authData.user.id;

    await supabaseAdmin.from('perfiles').upsert([{ 
      id: authUserId, nombre_completo: nombreCompleto, rol: rol, username: cleanUsername, rut: rut
    }]);
    
    if (rol === 'DENTISTA') {
      await supabaseAdmin.from('profesionales').upsert([{
        user_id: authUserId, nombre: nombre.toUpperCase(), apellido: apellido.toUpperCase(),
        especialidad_id: especialidad_id || null, activo: true
      }]);
    }
    
    return { success: true }
  } catch (error: any) {
    if (authUserId) await supabaseAdmin.auth.admin.deleteUser(authUserId);
    return { error: error.message }
  }
}

// --- FUNCIÓN PARA ACTUALIZAR ---
export async function actualizarCuentaProfesional(id: string, userId: string, formData: any) {
  try {
    await verificarAdmin()
    const { nombre, apellido, especialidad_id, rol, rut } = formData;
    if (!ROLES_STAFF.includes(rol)) return { error: 'Rol no válido' };
    // Cambiar a otro rol ocupa un cupo de ese rol en el plan
    const { data: actual } = await supabaseAdmin.from('perfiles').select('rol').eq('id', userId).maybeSingle()
    if (actual?.rol !== rol) {
      const sinCupo = await validarCupo(rol);
      if (sinCupo) return { error: sinCupo };
    }
    const nombreCompleto = `${nombre} ${apellido}`
    
    // El 'userId' es el ID de la tabla Auth de Supabase
    await supabaseAdmin.from('perfiles').update({ 
      nombre_completo: nombreCompleto, rol: rol, rut: rut
    }).eq('id', userId)
    
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { rol },
      user_metadata: { nombre_completo: nombreCompleto, rut: rut }
    });

    if (rol === 'DENTISTA') {
      const datosProf = {
        nombre: nombre.toUpperCase(), apellido: apellido.toUpperCase(),
        especialidad_id: especialidad_id || null
      }
      // Si antes tenía otro rol, no tiene ficha de profesional: se le crea (antes quedaba sin agenda)
      const { data: existente } = await supabaseAdmin.from('profesionales').select('id').eq('user_id', userId).maybeSingle()
      if (existente) {
        await supabaseAdmin.from('profesionales').update(datosProf).eq('user_id', userId)
      } else {
        await supabaseAdmin.from('profesionales').insert([{ user_id: userId, ...datosProf, activo: true }])
      }
    }
    
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

/**
 * --- FUNCIÓN PARA ELIMINAR ---
 * Modificada para aceptar 1 o 2 argumentos y evitar el error "Expected 1 arguments, but got 2"
 */
export async function eliminarCuentaProfesional(idOrUserId: string, secondaryId?: string) {
  try {
    await verificarAdmin()
    // Si recibimos dos IDs, el importante para Auth suele ser el segundo (user_id)
    // Si solo recibimos uno, usamos ese.
    const targetId = secondaryId || idOrUserId;

    if (!targetId) throw new Error("ID de usuario no proporcionado");

    // Si la persona ya tiene historial (citas, prestaciones, pagos o atenciones), NO se borra:
    // borrarla dejaba su historial huérfano o fallaba a medias (quedaba sin ficha de profesional pero con cuenta).
    // En ese caso se le quita el acceso y se desactiva como profesional; su historial se mantiene.
    const cuenta = async (tabla: string, columna: string) => {
      const { count } = await supabaseAdmin.from(tabla).select('*', { count: 'exact', head: true }).eq(columna, targetId)
      return count || 0
    }
    const historial = (await Promise.all([
      cuenta('citas', 'profesional_id'),
      cuenta('presupuesto_items', 'profesional_id'),
      cuenta('pagos', 'profesional_id'),
      cuenta('atenciones_realizadas', 'profesional_id'),
    ])).reduce((a, b) => a + b, 0)

    if (historial > 0) {
      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, { ban_duration: '876000h' })
      if (banErr) throw banErr
      await supabaseAdmin.from('profesionales').update({ activo: false }).eq('user_id', targetId)
      return { success: true, desactivado: true }
    }

    // Sin historial: se elimina por completo (primero la cuenta, para no dejar datos a medias)
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (authErr) throw authErr;
    await supabaseAdmin.from('profesionales').delete().eq('user_id', targetId);
    await supabaseAdmin.from('perfiles').delete().eq('id', targetId);

    return { success: true, desactivado: false }
  } catch (err: any) {
    console.error("Error en eliminarCuentaProfesional:", err.message);
    return { error: err.message }
  }
}

// --- SUSCRIPCIÓN: plan actual y cupos usados por rol (para la página de Suscripción y la de Personal) ---
export async function obtenerResumenSuscripcion() {
  try {
    await verificarAdmin()
    const [sus, uso] = await Promise.all([leerSuscripcion(), contarUsoPorRol()])
    const cupos = Object.fromEntries(ROLES_STAFF.map(rol => [rol, {
      usados: uso[rol],
      limite: sus ? limiteRol(sus.plan, rol, sus.cuposExtra) : null,
    }])) as Record<RolStaff, { usados: number, limite: number | null }>
    return {
      planId: sus?.plan.id ?? null,
      estado: sus?.estado ?? null,
      ciclo: sus?.ciclo ?? null,
      venceEl: sus?.venceEl ?? null,
      cuposExtra: sus?.cuposExtra ?? {},
      cobroAutomatico: sus?.cobroAutomatico ?? false,
      pagosEnLinea: conectadaAlPortal(),
      cupos,
    }
  } catch (err: any) {
    return { error: err.message as string }
  }
}

// Pide al portal central el link de pago de Mercado Pago para el plan elegido
export async function iniciarPagoPlan(planId: string, ciclo: 'MENSUAL' | 'ANUAL', email: string): Promise<{ url?: string, error?: string }> {
  try {
    await verificarAdmin()
    if (!conectadaAlPortal()) return { error: 'Esta clínica aún no tiene habilitado el pago en línea' }
    const res = await llamarPortal('/api/checkout', { method: 'POST', body: JSON.stringify({ plan: planId, ciclo, email }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.url) return { error: data.error || 'No se pudo iniciar el pago' }
    return { url: data.url }
  } catch (err: any) {
    return { error: err.message as string }
  }
}

// --- ALIAS DE COMPATIBILIDAD ---
export const crearCuentaStaff = crearCuentaProfesional;
export const actualizarCuentaStaff = actualizarCuentaProfesional;
export const eliminarCuentaStaff = eliminarCuentaProfesional;

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// El rol se guarda en la pestaña para no pedirlo a Supabase cada vez que se abre una página.
// Se vuelve a consultar al iniciar sesión de nuevo o al abrir otra pestaña.
const CLAVE_ROL = 'rol-usuario-v1'

function leerRolGuardado(userId: string): string | null {
  try {
    const raw = sessionStorage.getItem(CLAVE_ROL)
    if (!raw) return null
    const { id, rol } = JSON.parse(raw)
    return id === userId ? rol : null
  } catch { return null }
}
function guardarRol(userId: string, rol: string) {
  try { sessionStorage.setItem(CLAVE_ROL, JSON.stringify({ id: userId, rol })) } catch { /* sin espacio: se ignora */ }
}

export function useRole() {
  const [rol, setRol] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function getRole() {
      // 1. Usuario de la sesión guardada en el navegador (no llama al servidor; el proxy ya validó la sesión)
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user

      if (user) {
        setUser(user)
        const guardado = leerRolGuardado(user.id)
        if (guardado) {
          setRol(guardado)
        } else {
          // 2. Buscamos su rol en la tabla 'perfiles'
          const { data } = await supabase
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .maybeSingle()

          // Si no tiene perfil aún (pero está logueado), por defecto es RECEPCIONISTA
          const nuevoRol = data?.rol || 'RECEPCIONISTA'
          setRol(nuevoRol)
          if (data?.rol) guardarRol(user.id, data.rol)
        }
      }
      setCargando(false)
    }
    getRole()
  }, [])

  return {
    rol,
    user,
    isAdmin: rol === 'ADMIN',
    isDentista: rol === 'DENTISTA',
    isRecepcionista: rol === 'RECEPCIONISTA',
    cargando
  }
}

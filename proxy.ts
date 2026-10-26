import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Las precargas (prefetch) que Next.js hace de cada enlace visible del menú no necesitan revisar la sesión:
// las páginas no traen datos del servidor (los datos se piden desde el navegador y Supabase los protege con RLS).
// Antes, cada precarga llamaba a Supabase Auth: ~20 llamadas extra por cada página abierta.
function esPrecarga(request: NextRequest) {
  const h = request.headers
  return h.get('next-router-prefetch') === '1' || h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')
}

export async function proxy(request: NextRequest) {
  if (esPrecarga(request)) return NextResponse.next()

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.delete({ name, ...options })
        },
      },
    }
  )

  // getClaims() valida el token de la sesión (y lo renueva si venció). Con las llaves JWT asimétricas de Supabase
  // lo valida sin llamar al servidor de Auth; con la llave antigua hace lo mismo que getUser().
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const { pathname } = request.nextUrl

  // 1. Si no hay usuario y no es login/register -> Al Login
  if (!claims && pathname !== '/login' && pathname !== '/register') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 2. Si hay usuario y va a login/register -> Al Inicio
  if (claims && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // 3. Protección de administración (Solo ADMIN)
  // El rol se lee de app_metadata, que solo puede cambiar el servidor (lo sincroniza un trigger desde 'perfiles').
  // user_metadata NO sirve para esto: el propio usuario puede editarlo desde el navegador.
  if (claims && pathname.startsWith('/administracion')) {
    let userRol = (claims.app_metadata as any)?.rol;
    if (!userRol) {
      const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', claims.sub).maybeSingle()
      userRol = perfil?.rol
    }

    if (userRol !== 'ADMIN') {
      // Sin permiso: a la agenda (el layout muestra el aviso)
      const redirectUrl = new URL('/agenda?sin_permiso=1', request.url)
      const redirectResponse = NextResponse.redirect(redirectUrl)

      // Preservamos las cookies actualizadas de la sesión
      response.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
      })

      return redirectResponse
    }
  }

  return response
}

export const config = {
  // Fuera del proxy: API, archivos de Next.js y archivos estáticos (imágenes, sonidos, fuentes, etc.)
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|mp3|wav|css|js|map|txt|woff2?|ttf|pdf)$).*)'],
}

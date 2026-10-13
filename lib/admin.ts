import { createClient } from '@supabase/supabase-js'

// ¡PRECAUCIÓN! Este cliente tiene privilegios de administrador.
// NUNCA debe ser expuesto o utilizado en el lado del cliente (en un componente con 'use client').

// Asegúrate de que estas variables de entorno estén en tu archivo .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})
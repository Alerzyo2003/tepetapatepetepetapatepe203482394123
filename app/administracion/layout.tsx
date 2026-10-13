'use client'
import { useRole } from '@/app/hooks/useRole'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { RUTA_SIN_PERMISO } from '@/lib/permisos'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAdmin, cargando } = useRole()
  const router = useRouter()

  useEffect(() => {
    if (!cargando && !isAdmin) {
      router.replace(RUTA_SIN_PERMISO)
    }
  }, [isAdmin, cargando, router])

  if (cargando) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return <>{children}</>;
}
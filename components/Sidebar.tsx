'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import { useRole } from '@/app/hooks/useRole'
import Link from 'next/link'
import { 
  LayoutDashboard, Users, Calendar, 
  Tag, LogOut, ClipboardList, Loader2, BarChart3, Wallet,
  Receipt, // Importamos el icono de gastos
  User as UserIcon 
} from 'lucide-react'

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { isAdmin, isDentista, rol, cargando } = useRole()
  const [saliendo, setSaliendo] = useState(false)

  const handleLogout = async () => {
    setSaliendo(true)
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const menuItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Agenda', href: '/agenda', icon: Calendar },
    { name: 'Pacientes', href: '/pacientes', icon: Users },
  ]

  return (
    <nav className="w-64 bg-white h-screen border-r border-slate-100 flex flex-col fixed left-0 top-0 z-50">
      {/* LOGO */}
      <div className="p-8">
        <h2 className="text-2xl font-black text-blue-600 tracking-tighter flex items-center gap-2">
          <ClipboardList size={28} /> DentaPro
        </h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Clínica Rebolledo</p>
      </div>

      {/* MENÚ PRINCIPAL */}
      <div className="flex-1 px-4 space-y-2 overflow-y-auto">
        <p className="px-4 text-[9px] font-black text-slate-300 uppercase tracking-widest mb-2">Menú Principal</p>
        
        {menuItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all ${
                isActive 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              <item.icon size={20} />
              {item.name}
            </Link>
          )
        })}

        {/* SECCIÓN ADMINISTRATIVA: Solo para Daniel */}
        {isAdmin && (
          <div className="pt-6 space-y-2">
            <p className="px-4 text-[9px] font-black text-slate-300 uppercase tracking-widest mb-2">Administración</p>
            
            {/* NUEVO: GESTIÓN DE EGRESOS */}
            <Link 
              href="/egresos"
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all ${
                pathname === '/egresos' 
                ? 'bg-red-600 text-white shadow-lg shadow-red-100' 
                : 'text-slate-400 hover:bg-red-50 hover:text-red-600'
              }`}
            >
              <Receipt size={20} />
              Gastos Clínica
            </Link>

            <Link 
              href="/aranceles"
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all ${
                pathname === '/aranceles' 
                ? 'bg-slate-900 text-white shadow-xl' 
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Tag size={20} />
              Aranceles
            </Link>

            <Link 
              href="/reportes/productividad"
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all ${
                pathname === '/reportes/productividad' 
                ? 'bg-slate-900 text-white shadow-xl' 
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <BarChart3 size={20} />
              Productividad
            </Link>
          </div>
        )}

        {/* SECCIÓN DENTISTA */}
        {isDentista && !isAdmin && (
          <div className="pt-6">
            <p className="px-4 text-[9px] font-black text-slate-300 uppercase tracking-widest mb-2">Mis Datos</p>
            <Link 
              href="/reportes/productividad"
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all ${
                pathname === '/reportes/productividad' 
                ? 'bg-purple-600 text-white' 
                : 'text-slate-400 hover:bg-purple-50 hover:text-purple-600'
              }`}
            >
              <Wallet size={20} />
              Mis Honorarios
            </Link>
          </div>
        )}
      </div>

      {/* PERFIL */}
      {!cargando && (
        <div className="px-6 mb-2">
            <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-3 border border-slate-100 shadow-sm">
                <div className="bg-blue-100 text-blue-600 p-2 rounded-xl">
                    <UserIcon size={16} />
                </div>
                <div className="flex-1 overflow-hidden">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Sesión activa</p>
                    <p className="text-xs font-bold text-slate-700 truncate capitalize">{rol?.toLowerCase()}</p>
                </div>
            </div>
        </div>
      )}

      {/* SALIR */}
      <div className="p-6 border-t border-slate-50">
        <button 
          onClick={handleLogout}
          disabled={saliendo}
          className="flex items-center gap-3 px-4 py-3 w-full text-slate-400 font-bold hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all group disabled:opacity-50"
        >
          {saliendo ? (
            <Loader2 size={20} className="animate-spin text-blue-500" />
          ) : (
            <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
          )}
          <span className="text-sm font-black uppercase tracking-tight">
            {saliendo ? 'Saliendo...' : 'Salir'}
          </span>
        </button>
      </div>
    </nav>
  )
}